/**
 * reportVisit / adminManage 共用的基础设施（云函数不能跨函数 require，
 * 每个目录各带一份）。与 siteManage/_shared.js 的区别：
 *   · 不含 ensureSite / SEED（访客侧不需要铺内容，也就不依赖 seed.json）
 *   · 增加 genVid（访客稳定标识，用于分享来源与去重）
 * 两处如有协议变更（如身份解析优先级）需同步修改。
 */
const crypto = require('crypto')

const ENV_ID = process.env.TCB_ENV || 'xiaofeiyang-d3gx5ou5k7fe078eb'
const API_KEY = process.env.CLOUDBASE_APIKEY
const RDB_BASE = `https://${ENV_ID}.api.tcloudbasegateway.com/v1/rdb/rest`

const WX_APPID = process.env.WX_APPID || 'wx7f161d1665f60f8e'
const WX_SECRET = process.env.WX_SECRET || ''

/** wx.login 的 code 换 openid（授权环境拿不到 context.OPENID，这是正路） */
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
 *   1. context.OPENID —— 微信侧环境原生注入
 *   2. __openid 调试后门 —— 仅 ALLOW_DEBUG_OPENID=1 时生效
 *   3. code2Session —— 前端 wx.login 的 _code
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

/** service_role 直连 PG REST（绕过 RLS；宾客端拿不到这个 key） */
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

/** 访客稳定标识：12 位小写字母数字（不含易混字符），无隐私含义 */
function genVid() {
  const alphabet = '23456789abcdefghjkmnpqrstuvwxyz'
  const bytes = crypto.randomBytes(12)
  let s = ''
  for (let i = 0; i < 12; i++) s += alphabet[bytes[i] % alphabet.length]
  return s
}

module.exports = { admin, resolveOpenid, code2Session, genVid, WX_APPID, WX_SECRET }
