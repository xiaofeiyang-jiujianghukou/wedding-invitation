/**
 * aiProcessPhotos —— AI 统一处理照片（云函数）
 *
 * 职责（对应需求「AI 统一处理：占位符/照片/动效/合适的音乐，压缩一键搞定」）：
 *   1. 逐张照片交给豆包视觉模型看图
 *   2. 模型输出：文案 caption、章节 chapter、运镜方向 dir、动效 fx、是否满版
 *   3. **差量**：source_hash 没变就跳过这张，不重复花 AI 钱（用户最看重的「没改的保持原样」）
 *   4. 全局汇总：把 20 张的章节归类结果整理成相册结构
 *
 * 身份：只信 context.OPENID（微信注入，前端伪造不了），和 siteManage 同一套。
 *
 * 模型服务：火山方舟 Agent Plan
 *   ⚠️ 必须用套餐专属地址 /api/plan/v3，用常规 /api/v3 一定 401。
 *   实测可用视觉模型（2026-09-29）：doubao-seed-2.1-pro / -lite / -turbo、
 *   doubao-seed-evolving、doubao-seed-2.0-mini
 */
const crypto = require('crypto')

const ENV_ID = process.env.TCB_ENV || 'xiaofeiyang-d3gx5ou5k7fe078eb'
const API_KEY = process.env.CLOUDBASE_APIKEY            // 数据库 service_role
const ARK_KEY = process.env.ARK_API_KEY                 // 火山方舟
const ARK_BASE = process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/plan/v3'
const ARK_MODEL = process.env.ARK_MODEL || 'doubao-seed-2.1-pro'

const RDB_BASE = `https://${ENV_ID}.api.tcloudbasegateway.com/v1/rdb/rest`

/** 相册章节（对应小程序 config.gallery 的 5 章） */
const CHAPTERS = ['初见', '相恋', '同行', '约定', '此刻']
/** 8 种运镜，对应前端 fx 字段 */
const FX_POOL = ['zoom', 'pull', 'pan-l', 'pan-r', 'tilt', 'rise', 'bloom', 'sink']

function md5(s) {
  return crypto.createHash('md5').update(String(s)).digest('hex')
}

/** 以 service_role 读写 PG（绕过 RLS） */
async function admin(table, { method = 'GET', query = '', body, prefer } = {}) {
  const headers = {
    apikey: API_KEY,
    Authorization: `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
  }
  if (prefer) headers.Prefer = prefer
  const res = await fetch(`${RDB_BASE}/${table}${query}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  if (!res.ok) {
    throw new Error(`PG ${res.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`)
  }
  return data
}

/** 调豆包视觉模型：给图 + 提示词，拿回结构化结果 */
async function vision(imageUrl, prompt, { retries = 2 } = {}) {
  const body = {
    model: ARK_MODEL,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: imageUrl } },
      ],
    }],
    max_tokens: 400,
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${ARK_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ARK_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      const text = await res.text()
      if (!res.ok) {
        // 限流则退避重试
        if (res.status === 429 && attempt < retries) {
          await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)))
          continue
        }
        throw new Error(`Ark ${res.status}: ${text.slice(0, 300)}`)
      }
      const data = JSON.parse(text)
      const content = ((data.choices || [{}])[0].message || {}).content || ''
      return { ok: true, content, usage: data.usage || {} }
    } catch (err) {
      if (attempt === retries) return { ok: false, error: err.message }
      await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)))
    }
  }
  return { ok: false, error: 'unreachable' }
}

/** 组装单张照片的提示词：要求返回严格 JSON */
function buildPrompt({ index, total }) {
  return [
    '你在为一对新人制作婚礼电子相册，需要为这张照片配一句文案并指定呈现方式。',
    `这是整套相册的第 ${index + 1} / ${total} 张。`,
    '',
    '请仔细观察画面内容（人物、场景、氛围、情绪），然后严格按以下 JSON 格式回答，',
    '不要输出任何解释、不要用 markdown 代码块，只输出 JSON 本身：',
    '',
    '{',
    '  "caption": "一句中文文案，12-22 字，温柔含蓄，像婚礼相册的注脚，不要出现第一人称",',
    `  "chapter": "从这五个词里选最贴切的一个：${CHAPTERS.join('、')}",`,
    '  "mood": "两三个字的氛围词，如 温柔/雀跃/静谧/笃定",',
    '  "dir": "left 或 right，表示文案更适合放在左边还是右边",',
    '  "kaleido": true 或 false，画面若是特写/细节/静物选 true（适合满版铺陈）',
    '}',
  ].join('\n')
}

/** 从模型回复里稳健地抠出 JSON（模型可能带多余文字或代码块） */
function extractJson(text) {
  if (!text) return null
  let s = String(text).trim()
  s = s.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  try {
    return JSON.parse(s.slice(start, end + 1))
  } catch {
    return null
  }
}

/** 校验并规整模型输出，防止脏数据进库 */
function normalize(parsed, index) {
  if (!parsed) return null
  const caption = String(parsed.caption || '').trim().slice(0, 40)
  const chapter = CHAPTERS.includes(parsed.chapter) ? parsed.chapter : CHAPTERS[0]
  const dir = parsed.dir === 'right' ? 'right' : 'left'
  // 运镜按顺序轮转分配，保证相邻两张不重样
  const fx = FX_POOL[index % FX_POOL.length]
  return {
    caption,
    chapter,
    mood: String(parsed.mood || '').trim().slice(0, 6),
    dir,
    fx,
    kaleido: Boolean(parsed.kaleido),
  }
}

exports.main = async (event, context) => {
  const action = event.action || 'processAll'
  const ctx = context || {}

  // 诊断接口：不需要身份，仅确认模型连通（不回任何用户数据）
  // 测试图 32x32 纯蓝（方舟要求图片最小边 >= 14px）
  const PING_IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAKklEQVR4nGOw6TlBU8QwasGoBaMWjFowasGoBaMWjFowasGoBaMWDBULABR8QFtm2BSuAAAAAElFTkSuQmCC'
  if (action === 'ping') {
    if (!ARK_KEY) return { ok: false, msg: '缺少 ARK_API_KEY 环境变量' }
    const r = await vision(PING_IMG, '这张图是什么颜色？只回答颜色两个字。')
    return { ok: r.ok, model: ARK_MODEL, base: ARK_BASE, reply: r.content, error: r.error }
  }

  /* ---------- 身份解析（与 siteManage/_shared.js 同一套逻辑） ----------
   * 授权环境下 context.OPENID 不注入，靠前端 wx.login 的 _code 走 code2Session */
  let openid = ctx.OPENID || (ctx.userInfo && ctx.userInfo.openId)
  if (!openid && process.env.ALLOW_DEBUG_OPENID === '1' && event.__openid) {
    openid = event.__openid
  }
  if (!openid && event._code) {
    const WX_APPID = process.env.WX_APPID || 'wx7f161d1665f60f8e'
    const WX_SECRET = process.env.WX_SECRET || ''
    if (WX_SECRET) {
      try {
        const url = 'https://api.weixin.qq.com/sns/jscode2session'
          + `?appid=${WX_APPID}&secret=${WX_SECRET}`
          + `&js_code=${encodeURIComponent(event._code)}&grant_type=authorization_code`
        const d = await (await fetch(url)).json()
        if (d.openid) openid = d.openid
        else console.error('[code2Session] 失败', d.errcode, d.errmsg)
      } catch (e) {
        console.error('[code2Session] 异常', e && e.message)
      }
    }
  }
  if (!openid) return { ok: false, msg: '无法识别身份，请在小程序内使用' }
  if (!ARK_KEY) return { ok: false, msg: 'AI 服务未配置（缺少 ARK_API_KEY）' }

  try {
    /* ---------- 处理我的全部照片（差量） ---------- */
    if (action === 'processAll') {
      const photos = await admin('photos', {
        query: `?owner_openid=eq.${openid}&select=*&order=sort_order.asc,id.asc`,
      })
      if (!photos || !photos.length) return { ok: true, processed: 0, skipped: 0, msg: '没有照片' }

      const total = photos.length
      const results = []
      let processed = 0
      let skipped = 0
      let failed = 0

      for (let i = 0; i < photos.length; i++) {
        const p = photos[i]

        // === 差量核心：指纹未变 且 已有 AI 结果 → 跳过，不花钱不写库 ===
        const already = p.ai && p.ai.caption
        if (p.source_hash && p.ai_hash === p.source_hash && already) {
          skipped++
          results.push({ id: p.id, skipped: true, ai: p.ai })
          continue
        }

        // 换图场景：图变了 → 重算。没图地址也跳过
        if (!p.public_url) {
          skipped++
          results.push({ id: p.id, skipped: true, reason: '缺少图片地址' })
          continue
        }

        const r = await vision(p.public_url, buildPrompt({ index: i, total }))
        if (!r.ok) {
          failed++
          results.push({ id: p.id, ok: false, error: r.error })
          continue
        }

        const ai = normalize(extractJson(r.content), i)
        if (!ai) {
          failed++
          results.push({ id: p.id, ok: false, error: '模型返回无法解析', raw: r.content.slice(0, 200) })
          continue
        }

        ai.model = ARK_MODEL
        ai.at = new Date().toISOString()

        await admin('photos', {
          method: 'PATCH',
          query: `?id=eq.${p.id}&owner_openid=eq.${openid}`,
          body: {
            ai,
            ai_hash: p.source_hash,
            status: 'pending_review',
            updated_at: new Date().toISOString(),
          },
        })

        processed++
        results.push({ id: p.id, ok: true, ai })
      }

      // 章节汇总：按模型判定结果归类，供前端分章展示
      const chapters = {}
      for (const r of results) {
        const ai = r.ai
        if (!ai || !ai.chapter) continue
        ;(chapters[ai.chapter] = chapters[ai.chapter] || []).push(r.id)
      }

      return {
        ok: true,
        total,
        processed,
        skipped,
        failed,
        model: ARK_MODEL,
        chapters,
        results,
      }
    }

    /* ---------- 单张重算（换图后只处理这一张） ---------- */
    if (action === 'processOne') {
      const id = event.id
      if (!id) return { ok: false, msg: '缺少照片 id' }
      const rows = await admin('photos', {
        query: `?id=eq.${id}&owner_openid=eq.${openid}&select=*`,
      })
      const p = rows && rows[0]
      if (!p) return { ok: false, msg: '照片不存在或无权限' }
      if (!p.public_url) return { ok: false, msg: '照片缺少图片地址' }

      const all = await admin('photos', {
        query: `?owner_openid=eq.${openid}&select=id&order=sort_order.asc,id.asc`,
      })
      const index = (all || []).findIndex((x) => String(x.id) === String(id))
      const r = await vision(p.public_url, buildPrompt({ index: index < 0 ? 0 : index, total: (all || []).length }))
      if (!r.ok) return { ok: false, msg: r.error }

      const ai = normalize(extractJson(r.content), index < 0 ? 0 : index)
      if (!ai) return { ok: false, msg: '模型返回无法解析', raw: r.content.slice(0, 300) }

      ai.model = ARK_MODEL
      ai.at = new Date().toISOString()

      await admin('photos', {
        method: 'PATCH',
        query: `?id=eq.${id}&owner_openid=eq.${openid}`,
        body: { ai, ai_hash: p.source_hash, status: 'pending_review', updated_at: new Date().toISOString() },
      })
      return { ok: true, id, ai }
    }

    return { ok: false, msg: '未知操作: ' + action }
  } catch (err) {
    console.error('[aiProcessPhotos]', action, err)
    return { ok: false, msg: err.message }
  }
}
