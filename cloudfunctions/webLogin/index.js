/**
 * webLogin —— PC 端（浏览器）扫码登录
 *
 * 为什么不用"微信开放平台网站应用扫码"：那是需要企业主体 + 认证费 + 网站备案的路，
 * 个人主体走不通。这里复用小程序自身能力做等价的事：
 *
 *   网页 create  → 云函数生成 scene + 小程序码（指向小程序登录页）
 *   用户扫码    → 打开 pages/webLogin，点「确认登录」
 *   小程序 confirm → 校验 openid 是某站点 owner → 签发 token 存进 web_sessions
 *   网页 poll   → 用 scene + secret 取回 token → 后续请求带 token
 *
 * 安全：
 *   · scene 只写在小程序码里、secret 只在网页内存里，两者一起才能换 token
 *   · token 仅服务端可见（RLS 关死 anon），12 小时过期
 *   · 扫码窗口 5 分钟；确认必须由「站点 owner 本人」的微信完成
 *
 * actions：create / poll / confirm
 */
const crypto = require('crypto')
const { admin, resolveOpenid, WX_APPID, WX_SECRET } = require('./_shared')

const SCENE_TTL = 5 * 60 * 1000            // 扫码窗口：5 分钟
const TOKEN_TTL = 12 * 60 * 60 * 1000      // 登录有效期：12 小时
const LOGIN_PAGE = 'pages/webLogin/webLogin'
// 开发阶段小程序还没正式发布 → 扫体验版；发布后把 WX_ENV_VERSION 改成 release
const ENV_VERSION = process.env.WX_ENV_VERSION || 'trial'

const ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz'      // 去掉易混字符
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex')

function rand(n, alphabet) {
  const bytes = crypto.randomBytes(n)
  let s = ''
  for (let i = 0; i < n; i++) s += alphabet[bytes[i] % alphabet.length]
  return s
}

/* ---------- 微信 access_token（实例内缓存，避免撞日调用上限） ---------- */
let atCache = { token: '', exp: 0 }

async function getAccessToken() {
  if (atCache.token && Date.now() < atCache.exp) return atCache.token
  if (!WX_SECRET) throw new Error('缺少 WX_SECRET，无法调用微信接口')
  const url = 'https://api.weixin.qq.com/cgi-bin/token'
    + `?grant_type=client_credential&appid=${WX_APPID}&secret=${WX_SECRET}`
  const d = await (await fetch(url)).json()
  if (!d.access_token) throw new Error(`获取 access_token 失败 ${d.errcode}: ${d.errmsg}`)
  atCache = { token: d.access_token, exp: Date.now() + ((d.expires_in || 7200) - 300) * 1000 }
  return atCache.token
}

/* ---------- 生成小程序码（返回 data URL，网页直接塞进 img） ---------- */
async function makeQrcode(scene) {
  const at = await getAccessToken()
  const res = await fetch(`https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${at}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      scene,
      page: LOGIN_PAGE,
      check_path: false,        // 页面尚未随正式版发布也不报错
      env_version: ENV_VERSION, // trial=体验版 / release=正式版
      width: 300,
    }),
  })
  const buf = Buffer.from(await res.arrayBuffer())
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('json')) {
    let msg = buf.toString('utf8')
    try { const e = JSON.parse(msg); msg = `${e.errcode}: ${e.errmsg}` } catch (e) { /* 保留原文 */ }
    throw new Error(`生成小程序码失败 ${msg}`)
  }
  // 微信实测返回的是 JPEG（不是文档里说的 PNG），按实际 content-type 标注
  const mime = /jpe?g/i.test(ct) ? 'image/jpeg' : 'image/png'
  return `data:${mime};base64,` + buf.toString('base64')
}

exports.main = async (event, context) => {
  const action = (event && event.action) || ''
  try {
    /* ============ 1. 网页：创建会话，拿小程序码 ============ */
    if (action === 'create') {
      const scene = rand(16, ALPHABET)
      const secret = crypto.randomBytes(24).toString('hex')
      await admin('web_sessions', {
        method: 'POST',
        prefer: 'return=minimal',
        body: {
          scene,
          secret_hash: sha256(secret),
          status: 'pending',
          expires_at: new Date(Date.now() + SCENE_TTL).toISOString(),
        },
      })
      const qrcode = await makeQrcode(scene)
      return { ok: true, scene, secret, qrcode, ttl: SCENE_TTL }
    }

    /* ============ 2. 网页：轮询扫码结果 ============ */
    if (action === 'poll') {
      const scene = String((event && event.scene) || '')
      const secret = String((event && event.secret) || '')
      if (!scene || !secret) return { ok: false, msg: '参数缺失' }

      const rows = await admin('web_sessions', {
        query: `?scene=eq.${encodeURIComponent(scene)}&select=*&limit=1`,
      })
      const row = rows && rows[0]
      if (!row) return { ok: false, msg: '会话不存在', expired: true }
      if (row.secret_hash !== sha256(secret)) return { ok: false, msg: '凭证不匹配' }
      if (new Date(row.expires_at).getTime() < Date.now()) {
        return { ok: false, msg: '二维码已过期', expired: true }
      }
      if (row.status === 'confirmed') {
        const sites = await admin('sites', {
          query: `?id=eq.${row.site_id}&select=id,share_code,status&limit=1`,
        })
        return { ok: true, status: 'confirmed', token: row.token, site: (sites && sites[0]) || null }
      }
      return { ok: true, status: 'pending' }
    }

    /* ============ 3. 小程序：扫码后点确认 ============ */
    if (action === 'confirm') {
      const openid = await resolveOpenid(context || {}, event)
      if (!openid) return { ok: false, msg: '请在小程序内操作' }
      const scene = String((event && event.scene) || '')
      if (!scene) return { ok: false, msg: '缺少 scene 参数' }

      const rows = await admin('web_sessions', {
        query: `?scene=eq.${encodeURIComponent(scene)}&select=*&limit=1`,
      })
      const row = rows && rows[0]
      if (!row) return { ok: false, msg: '二维码无效，请在电脑上刷新重试' }
      if (row.status === 'confirmed') return { ok: true, repeat: true, msg: '已确认' }
      if (new Date(row.expires_at).getTime() < Date.now()) {
        return { ok: false, msg: '二维码已过期，请在电脑上刷新重试' }
      }

      // 只允许「自己名下有站点」的人确认，避免任意访客换到登录态
      const sites = await admin('sites', {
        query: `?owner_openid=eq.${encodeURIComponent(openid)}&select=id,share_code&order=id.asc&limit=1`,
      })
      const site = sites && sites[0]
      if (!site) return { ok: false, msg: '你名下还没有请柬，无法登录数据后台' }

      const token = crypto.randomBytes(32).toString('hex')
      const updated = await admin('web_sessions', {
        method: 'PATCH',
        query: `?scene=eq.${encodeURIComponent(scene)}&status=eq.pending`,
        prefer: 'return=representation',
        body: {
          status: 'confirmed',
          token,
          site_id: site.id,
          openid,
          expires_at: new Date(Date.now() + TOKEN_TTL).toISOString(),
        },
      })
      if (!updated || !updated.length) return { ok: false, msg: '确认失败，请重试' }
      return { ok: true, site: { id: site.id, share_code: site.share_code } }
    }

    return { ok: false, msg: '未知操作: ' + action }
  } catch (err) {
    console.error('[webLogin]', action, err)
    return { ok: false, msg: err.message }
  }
}
