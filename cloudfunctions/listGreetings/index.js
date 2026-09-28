const cloudbase = require('@cloudbase/node-sdk')

const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV })
const db = app.rdb({ database: 'public' })

exports.main = async () => {
  const { data, error } = await db
    .from('greetings')
    .select('name, text, created_at')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return { items: [], msg: error.message }

  return {
    items: data.map((row) => ({
      name: row.name,
      text: row.text,
      createdAt: new Date(row.created_at).getTime(),
    })),
  }
}
