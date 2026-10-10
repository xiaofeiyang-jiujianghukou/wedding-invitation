const cloudbase = require('@cloudbase/node-sdk')

const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV })
const db = app.rdb({ database: 'public' })

exports.main = async (event) => {
  const shareCode = String((event && event.share_code) || '').trim()
  let siteId = null
  if (shareCode) {
    const { data } = await db.from('sites').select('id').eq('share_code', shareCode.slice(0, 16)).limit(1)
    siteId = data && data[0] ? data[0].id : null
  }

  // 改用带站点维度的 rsvp_summary（旧 rsvp_stats 已退役）
  let q = db.from('rsvp_summary').select('total')
  if (siteId !== null) q = q.eq('site_id', siteId)
  const { data, error } = await q
  if (error) return { count: 0, msg: error.message }

  const count = (data || []).reduce((s, r) => s + (Number(r.total) || 0), 0)
  return { count }
}
