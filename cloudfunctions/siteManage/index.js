/**
 * siteManage —— 多租户后台管理（唯一写入口）
 *
 * 身份：小程序调用云函数时，微信自动注入 OPENID（可信、无需授权弹窗）。
 *      云函数用它认人，每个 openid 自动成为独立租户，互不可见。
 *
 * 权限：以 service_role（API Key）访问 PG，绕过 RLS 做管理写操作。
 *      宾客端拿不到这个 key，因此只能通过下面的 getPublic 只读接口看请柬。
 *
 * 差量更新：profile / music 各有指纹（hash），内容没变就不重算、不重存，
 *          保证「没改的地方每次打开都一模一样」。
 */
const { ensureSite, admin, md5, resolveOpenid } = require('./_shared')

exports.main = async (event, context) => {
  const ctx = context || {}

  // 身份解析（原生注入 → 调试后门 → code2Session），详见 _shared.js
  const openid = await resolveOpenid(ctx, event)
  if (!openid) return { ok: false, msg: '无法识别身份，请在小程序内使用' }

  const action = event.action || 'load'

  try {
    /* ---------- 读取我的站点（没有就自动建） ---------- */
    if (action === 'load') {
      // 新人首次进入 → 自动「开箱」：开号 + 同步默认模板（含 20 张照片），
      // 让他一进来就看到一份成型的请柬，再按自己心意去改。
      // 已有内容的用户：ensureSite 不会覆盖，只补齐缺失的照片。
      const seeded = await ensureSite(openid, Boolean(event.reseed))
      const site = seeded.site
      const photos = await admin('photos', {
        query: `?owner_openid=eq.${openid}&select=*&order=sort_order.asc,id.asc`,
      })
      return {
        ok: true,
        site,
        photos: photos || [],
        created: seeded.created,
        photos_added: seeded.photosAdded,
      }
    }

    /* ---------- 保存资料（差量：内容没变则跳过写库） ---------- */
    if (action === 'saveProfile') {
      const profile = event.profile || {}
      const h = md5(profile)
      const cur = await admin('sites', { query: `?owner_openid=eq.${openid}&select=hashes` })
      const hashes = (cur[0] && cur[0].hashes) || {}
      if (hashes.profile === h) {
        return { ok: true, skipped: true, msg: '内容未变化，已跳过' }
      }
      const updated = await admin('sites', {
        method: 'PATCH',
        query: `?owner_openid=eq.${openid}&select=*`,
        body: { profile, hashes: Object.assign({}, hashes, { profile: h }), updated_at: new Date().toISOString() },
        prefer: 'return=representation',
      })
      return { ok: true, skipped: false, site: updated[0] }
    }

    /* ---------- 保存配乐（同样差量） ---------- */
    if (action === 'saveMusic') {
      const music = event.music || {}
      const h = md5(music)
      const cur = await admin('sites', { query: `?owner_openid=eq.${openid}&select=hashes` })
      const hashes = (cur[0] && cur[0].hashes) || {}
      if (hashes.music === h) return { ok: true, skipped: true, msg: '音乐未变化，已跳过' }
      const updated = await admin('sites', {
        method: 'PATCH',
        query: `?owner_openid=eq.${openid}&select=*`,
        body: { music, hashes: Object.assign({}, hashes, { music: h }), updated_at: new Date().toISOString() },
        prefer: 'return=representation',
      })
      return { ok: true, skipped: false, site: updated[0] }
    }

    /* ---------- 发布 / 下线 ---------- */
    if (action === 'publish' || action === 'unpublish') {
      const status = action === 'publish' ? 'published' : 'draft'
      const updated = await admin('sites', {
        method: 'PATCH',
        query: `?owner_openid=eq.${openid}&select=*`,
        body: { status, updated_at: new Date().toISOString() },
        prefer: 'return=representation',
      })
      return { ok: true, site: updated[0] }
    }

    /* ---------- 我的照片列表 ---------- */
    if (action === 'listPhotos') {
      const photos = await admin('photos', {
        query: `?owner_openid=eq.${openid}&select=*&order=sort_order.asc,id.asc`,
      })
      return { ok: true, photos: photos || [] }
    }

    /* ---------- 新增照片（后台选图上传后落库） ---------- */
    if (action === 'addPhoto') {
      const storageKey = String(event.storage_key || '').trim()
      if (!storageKey) return { ok: false, msg: '缺少 storage_key' }
      // 该用户已有的一条同 key 记录 → 幂等，不重复插
      const dup = await admin('photos', {
        query: `?owner_openid=eq.${openid}&storage_key=eq.${encodeURIComponent(storageKey)}&select=id`,
      })
      if (dup && dup.length) return { ok: true, skipped: true, id: dup[0].id }

      // sort_order 接在现有最大值之后
      const tail = await admin('photos', {
        query: `?owner_openid=eq.${openid}&select=sort_order&order=sort_order.desc&limit=1`,
      })
      const nextOrder = tail && tail.length ? Number(tail[0].sort_order || 0) + 1 : 0

      const inserted = await admin('photos', {
        method: 'POST',
        query: '?select=*',
        body: {
          owner_openid: openid,
          storage_key: storageKey,
          public_url: event.public_url || '',
          // 指纹以 storage_key + 体积为准：换图（同名重传）体积会变，AI 就会重算
          source_hash: md5({ k: storageKey, b: event.bytes || 0 }),
          ai_hash: '',
          width: Number(event.width) || 0,
          height: Number(event.height) || 0,
          bytes: Number(event.bytes) || 0,
          sort_order: nextOrder,
          status: 'pending_review',   // 新图默认待审：AI 处理过才对外展示
        },
        prefer: 'return=representation',
      })
      return { ok: true, skipped: false, photo: inserted[0] }
    }

    /* ---------- 删除照片 ---------- */
    if (action === 'removePhoto') {
      const id = event.id
      if (id === undefined || id === null || id === '') return { ok: false, msg: '缺少照片 id' }
      // 带上 owner_openid 条件，杜绝删到别人的照片
      await admin('photos', {
        method: 'DELETE',
        query: `?id=eq.${encodeURIComponent(id)}&owner_openid=eq.${encodeURIComponent(openid)}`,
      })
      return { ok: true }
    }

    /* ---------- 调整顺序（上移 / 下移，与相邻一张换位） ---------- */
    if (action === 'movePhoto') {
      const id = event.id
      const dir = Number(event.dir) < 0 ? -1 : 1
      const mine = await admin('photos', {
        query: `?owner_openid=eq.${openid}&select=id,sort_order&order=sort_order.asc,id.asc`,
      })
      const list = mine || []
      const i = list.findIndex((p) => String(p.id) === String(id))
      if (i < 0) return { ok: false, msg: '照片不存在' }
      const j = i + dir
      if (j < 0 || j >= list.length) return { ok: true, skipped: true, msg: '已在边界' }

      // 两张换 order；若 order 相同则按索引重排，保证稳定
      const a = list[i]
      const b = list[j]
      const oa = a.sort_order
      const ob = b.sort_order
      const patchA = oa === ob ? j : ob
      const patchB = oa === ob ? i : oa

      await admin('photos', {
        method: 'PATCH',
        query: `?id=eq.${encodeURIComponent(a.id)}&owner_openid=eq.${encodeURIComponent(openid)}`,
        body: { sort_order: patchA },
      })
      await admin('photos', {
        method: 'PATCH',
        query: `?id=eq.${encodeURIComponent(b.id)}&owner_openid=eq.${encodeURIComponent(openid)}`,
        body: { sort_order: patchB },
      })
      return { ok: true, moved: true }
    }

    return { ok: false, msg: '未知操作: ' + action }
  } catch (err) {
    console.error('[siteManage]', action, err)
    return { ok: false, msg: err.message }
  }
}
