const cloudbase = require('@cloudbase/node-sdk')

const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV })
const db = app.rdb({ database: 'public' })

/**
 * 把分享码解析成站点 id。
 * 宾客提交时带 share_code（前端从请柬配置里取），多租户下各归各站；
 * 兼容不带分享码的旧客户端：归到最早创建的站点。
 */
async function resolveSiteId(shareCode) {
  const code = String(shareCode || '').trim().slice(0, 16)
  if (code) {
    const { data } = await db.from('sites').select('id').eq('share_code', code).limit(1)
    if (data && data[0]) return data[0].id
  }
  const { data: all } = await db.from('sites').select('id').order('id', { ascending: true }).limit(1)
  return all && all[0] ? all[0].id : null
}

exports.main = async (event) => {
  const { name, phone = '', attending = true, count = 1, note = '', share_code = '', vid = '' } = event

  if (typeof name !== 'string' || !name.trim()) {
    return { ok: false, msg: '姓名不能为空' }
  }

  const siteId = await resolveSiteId(share_code)

  const { error } = await db.from('rsvps').insert({
    site_id: siteId,
    // 访客标识：让后台传播链能把「谁转发的」对上姓名
    vid: String(vid || '').slice(0, 24),
    name: name.trim().slice(0, 20),
    phone: String(phone).slice(0, 20),
    attending: Boolean(attending),
    guest_count: Math.min(10, Math.max(1, Number(count) || 1)),
    note: String(note).slice(0, 100),
  })

  if (error) return { ok: false, msg: error.message }
  return { ok: true }
}
