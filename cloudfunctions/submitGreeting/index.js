const cloudbase = require('@cloudbase/node-sdk')

const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV })
const db = app.rdb({ database: 'public' })

exports.main = async (event) => {
  const { name, text } = event

  if (typeof name !== 'string' || !name.trim()) {
    return { ok: false, msg: '姓名不能为空' }
  }
  if (typeof text !== 'string' || !text.trim()) {
    return { ok: false, msg: '祝福内容不能为空' }
  }

  const { error } = await db.from('greetings').insert({
    name: name.trim().slice(0, 20),
    text: text.trim().slice(0, 100),
  })

  if (error) return { ok: false, msg: error.message }
  return { ok: true }
}
