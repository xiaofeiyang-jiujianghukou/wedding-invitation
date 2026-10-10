const cloudbase = require('@cloudbase/node-sdk')

const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV })
const db = app.rdb({ database: 'public' })

/** 分享码 → 站点 id（同 submitRsvp，兼容旧客户端归到最早站点） */
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
  const { name, text, share_code = '', vid = '' } = event

  if (typeof name !== 'string' || !name.trim()) {
    return { ok: false, msg: '姓名不能为空' }
  }
  if (typeof text !== 'string' || !text.trim()) {
    return { ok: false, msg: '祝福内容不能为空' }
  }

  const siteId = await resolveSiteId(share_code)

  const { error } = await db.from('greetings').insert({
    site_id: siteId,
    vid: String(vid || '').slice(0, 24),
    name: name.trim().slice(0, 20),
    text: text.trim().slice(0, 100),
  })

  if (error) return { ok: false, msg: error.message }
  return { ok: true }
}
