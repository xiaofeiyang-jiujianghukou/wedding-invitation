const cloudbase = require('@cloudbase/node-sdk')

const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV })
const db = app.rdb({ database: 'public' })

exports.main = async () => {
  const { data, error } = await db.from('rsvp_stats').select('total').limit(1)
  if (error) return { count: 0, msg: error.message }
  return { count: data?.[0]?.total ?? 0 }
}
