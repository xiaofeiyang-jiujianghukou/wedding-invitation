const cloudbase = require('@cloudbase/node-sdk')

const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV })
const db = app.rdb({ database: 'public' })

exports.main = async (event) => {
  const { name, phone = '', attending = true, count = 1, note = '' } = event

  if (typeof name !== 'string' || !name.trim()) {
    return { ok: false, msg: '姓名不能为空' }
  }

  const { error } = await db.from('rsvps').insert({
    name: name.trim().slice(0, 20),
    phone: String(phone).slice(0, 20),
    attending: Boolean(attending),
    guest_count: Math.min(10, Math.max(1, Number(count) || 1)),
    note: String(note).slice(0, 100),
  })

  if (error) return { ok: false, msg: error.message }
  return { ok: true }
}
