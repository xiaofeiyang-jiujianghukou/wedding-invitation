const crypto = require('crypto')

const ENV_ID = process.env.TCB_ENV || 'xiaofeiyang-d3gx5ou5k7fe078eb'
const API_KEY = process.env.CLOUDBASE_APIKEY
const RDB_BASE = `https://${ENV_ID}.api.tcloudbasegateway.com/v1/rdb/rest`

// 现有内容种子（由 .st-admin/build_seed.py 从 config.js 提取）
const SEED = require('./seed.json')

function md5(obj) {
  return crypto.createHash('md5').update(JSON.stringify(obj)).digest('hex')
}

/* ---------- 身份解析 ---------- */

const WX_APPID = process.env.WX_APPID || 'wx7f161d1665f60f8e'
const WX_SECRET = process.env.WX_SECRET || ''

/**
 * 用 wx.login 的 code 换 openid（微信官方 code2Session 接口）。
 *
 * 为什么需要：本环境是「腾讯云侧环境 + 授权给小程序」——wx.cloud.callFunction
 * 的调用通路是通的，但微信身份（context.OPENID）只在微信侧环境中注入。
 * 授权环境下云函数拿不到 OPENID，必须由前端 wx.login 拿 code、
 * 服务端用 AppSecret 换 openid（标准微信登录流程，code 一次性、防重放）。
 */
async function code2Session(code) {
  if (!WX_SECRET || !code) return ''
  const url = 'https://api.weixin.qq.com/sns/jscode2session'
    + `?appid=${WX_APPID}&secret=${WX_SECRET}`
    + `&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`
  const res = await fetch(url)
  const d = await res.json()
  if (!d.openid) {
    console.error('[code2Session] 失败', d.errcode, d.errmsg)
    return ''
  }
  return d.openid
}

/**
 * 统一身份解析。优先级：
 *   1. context.OPENID —— 微信侧环境原生注入（将来环境绑定后自动恢复）
 *   2. __openid 调试后门 —— 仅 ALLOW_DEBUG_OPENID=1 时生效（本地联调）
 *   3. code2Session —— 前端传 wx.login 的 _code（授权环境的正路）
 */
async function resolveOpenid(ctx, event) {
  let openid = (ctx && ctx.OPENID) || (ctx && ctx.userInfo && ctx.userInfo.openId) || ''
  if (!openid && process.env.ALLOW_DEBUG_OPENID === '1' && event && event.__openid) {
    openid = event.__openid
  }
  if (!openid && event && event._code) {
    openid = await code2Session(event._code)
  }
  return openid
}

function genShareCode() {
  const alphabet = '23456789abcdefghjkmnpqrstuvwxyz'
  const bytes = crypto.randomBytes(6)
  let s = ''
  for (let i = 0; i < 6; i++) s += alphabet[bytes[i] % alphabet.length]
  return s
}

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

async function ensureSite(openid, force = false) {
  /* ---------- 1. 站点主体 ---------- */
  let rows = await admin('sites', { query: `?owner_openid=eq.${openid}&select=*` })
  let site
  let created = false

  if (!rows || !rows.length) {
    const inserted = await admin('sites', {
      method: 'POST',
      query: '?select=*',
      body: {
        owner_openid: openid,
        share_code: genShareCode(),
        profile: SEED.profile,
        music: SEED.music,
        hashes: { profile: md5(SEED.profile), music: md5(SEED.music) },
        status: 'draft',
      },
      prefer: 'return=representation',
    })
    site = inserted[0]
    created = true
  } else {
    site = rows[0]
    const hasContent = site.profile && Object.keys(site.profile).length > 0
    if (!hasContent || force) {
      const updated = await admin('sites', {
        method: 'PATCH',
        query: `?owner_openid=eq.${openid}&select=*`,
        body: {
          profile: SEED.profile,
          music: SEED.music,
          hashes: { profile: md5(SEED.profile), music: md5(SEED.music) },
          updated_at: new Date().toISOString(),
        },
        prefer: 'return=representation',
      })
      site = updated[0]
    }
  }

  /* ---------- 2. 照片（差量：按 storage_key 去重，不重复插） ---------- */
  const existing = await admin('photos', {
    query: `?owner_openid=eq.${openid}&select=id,storage_key,sort_order&order=sort_order.asc`,
  })
  const knownKeys = new Set((existing || []).map((p) => p.storage_key))

  let added = 0
  for (let i = 0; i < SEED.gallery.length; i++) {
    const g = SEED.gallery[i]
    const name = (g.src || '').split('/').pop()
    const storageKey = `photos/${name}`
    if (knownKeys.has(storageKey)) continue

    await admin('photos', {
      method: 'POST',
      body: {
        owner_openid: openid,
        storage_key: storageKey,
        public_url: g.src,
        fallback_url: `/images/${name}`,   // 包内 720px 兜底（默认模板 20 张均有副本）
        source_hash: md5(g.src),          // 以图片地址为初始指纹
        ai_hash: '',
        sort_order: i,
        status: 'approved',                // 现有内容视为已确认
        ai: {                              // 已有的人工文案当作 AI 结果写入
          caption: g.caption,
          chapter: g.chapter,
          dir: g.dir,
          fx: g.fx,
          kaleido: !!g.kaleido,
          source: 'migrated',
        },
      },
    })
    added++
  }

  const photos = await admin('photos', {
  query: `?owner_openid=eq.${openid}&select=*&order=sort_order.asc,id.asc`,
  })

  return {
  created,
  site,
  photosAdded: added,
  photosTotal: (photos || []).length,
  }
}


module.exports = { ensureSite, admin, md5, genShareCode, SEED, resolveOpenid, code2Session }
