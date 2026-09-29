/**
 * getWeddingConfig —— 宾客端读取已发布的请柬配置
 *
 * 公开可调（无需鉴权）：只返回 payload（已发布内容）+ 已审阅通过的照片，
 * 绝不返回 draft（草稿）、session（会话）等后台私有字段。
 */
const cloudbase = require('@cloudbase/node-sdk')

const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV })
const db = app.rdb({ database: 'public' })

exports.main = async () => {
  // ① 已发布配置
  const { data: cfgRow, error: cfgErr } = await db
    .from('wedding_config')
    .select('payload, updated_at')
    .eq('id', 1)
    .single()

  if (cfgErr) return { ok: false, msg: cfgErr.message }

  // ② 已审阅通过的照片（按后台排序）
  const { data: photos, error: photoErr } = await db
    .from('wedding_photos')
    .select('storage_key, public_url, sort_order, reviewed, ai')
    .eq('status', 'approved')
    .order('sort_order', { ascending: true })

  if (photoErr) return { ok: false, msg: photoErr.message }

  // ③ 组装：reviewed 优先于 ai（人工审阅结果覆盖 AI）
  const gallery = (photos || []).map((p) => {
    const meta = p.reviewed || p.ai || {}
    return {
      src: p.public_url || p.storage_key,
      caption: meta.caption || '',
      chapter: meta.chapter || '',
      dir: meta.dir || 'left',
      fx: meta.fx || 'zoom',
      kaleido: Boolean(meta.kaleido),
    }
  })

  const payload = cfgRow.payload || {}
  const hasConfig = Object.keys(payload).length > 0

  return {
    ok: true,
    // 后台是否已配置过（前端据此决定用云端还是本地默认）
    published: hasConfig,
    updatedAt: cfgRow.updated_at,
    config: hasConfig ? Object.assign({}, payload, { gallery: gallery.length ? gallery : payload.gallery }) : null,
    photoCount: gallery.length,
  }
}
