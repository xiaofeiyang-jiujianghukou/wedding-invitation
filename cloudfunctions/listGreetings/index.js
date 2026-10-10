const cloudbase = require('@cloudbase/node-sdk')

const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV })
const db = app.rdb({ database: 'public' })

/** 分享码 → 站点 id（宾客看祝福墙时只应看到本请柬的祝福） */
async function resolveSiteId(shareCode) {
  const code = String(shareCode || '').trim().slice(0, 16)
  if (code) {
    const { data } = await db.from('sites').select('id').eq('share_code', code).limit(1)
    if (data && data[0]) return data[0].id
  }
  return null
}

exports.main = async (event) => {
  const shareCode = String((event && event.share_code) || '').trim()
  const siteId = await resolveSiteId(shareCode)

  let q = db.from('greetings').select('name, text, created_at')
  if (siteId !== null) q = q.eq('site_id', siteId)
  const { data, error } = await q
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return { items: [], msg: error.message }

  return {
    items: (data || []).map((row) => ({
      name: row.name,
      text: row.text,
      createdAt: new Date(row.created_at).getTime(),
    })),
  }
}
