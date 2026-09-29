/**
 * adminAuth —— 后台登录鉴权
 *
 * 密码存在云函数环境变量 ADMIN_PASSWORD；未配置时用内置默认值（首次能用，但请尽快改）。
 * 校验通过后签发一次性 token 存进 wedding_config 表，前端后续请求带上它。
 * token 只存哈希，表里拿不到明文。
 */
const cloudbase = require('@cloudbase/node-sdk')
const crypto = require('crypto')

const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV })
const db = app.rdb({ database: 'public' })

/** 内置默认密码：可用云函数环境变量 ADMIN_PASSWORD 覆盖 */
const DEFAULT_PASSWORD = 'wedding-admin'
/** token 有效期（毫秒）：12 小时 */
const TOKEN_TTL = 12 * 60 * 60 * 1000

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex')
}

exports.main = async (event) => {
  const action = event.action || 'login'

  /* ---------- 登录 ---------- */
  if (action === 'login') {
    const password = String(event.password || '')
    if (!password) return { ok: false, msg: '请输入密码' }

    const expected = process.env.ADMIN_PASSWORD || DEFAULT_PASSWORD
    const usingDefault = !process.env.ADMIN_PASSWORD

    // 恒定时间比较，避免时序侧信道
    const a = Buffer.from(sha256(password), 'hex')
    const b = Buffer.from(sha256(expected), 'hex')
    if (!crypto.timingSafeEqual(a, b)) {
      return { ok: false, msg: '密码不正确' }
    }

    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = Date.now() + TOKEN_TTL

    // token 哈希写入独立的 session 字段（与 draft 草稿互不干扰）
    const { error } = await db
      .from('wedding_config')
      .update({
        session: { tokenHash: sha256(token), expiresAt },
      })
      .eq('id', 1)

    if (error) return { ok: false, msg: error.message }

    return {
      ok: true,
      token,
      expiresAt,
      usingDefaultPassword: usingDefault,
      msg: usingDefault ? '已登录（当前使用默认密码，建议尽快修改）' : '已登录',
    }
  }

  /* ---------- 校验 token ---------- */
  if (action === 'verify') {
    const token = String(event.token || '')
    if (!token) return { ok: false, msg: '未登录' }

    const { data, error } = await db
      .from('wedding_config')
      .select('session')
      .eq('id', 1)
      .single()

    if (error || !data) return { ok: false, msg: '配置读取失败' }

    const session = data.session
    if (!session) return { ok: false, msg: '请先登录' }
    if (Date.now() > session.expiresAt) return { ok: false, msg: '登录已过期，请重新登录' }
    if (session.tokenHash !== sha256(token)) return { ok: false, msg: '登录凭证无效' }

    return { ok: true }
  }

  /* ---------- 退出 ---------- */
  if (action === 'logout') {
    const { error } = await db
      .from('wedding_config')
      .update({ session: null })
      .eq('id', 1)
    if (error) return { ok: false, msg: error.message }
    return { ok: true }
  }

  return { ok: false, msg: '未知操作' }
}
