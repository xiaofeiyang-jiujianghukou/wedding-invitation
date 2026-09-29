/**
 * getPublicSite —— 宾客端只读接口（公开可调）
 *
 * 宾客没有 openid 上下文，靠 share_code 定位是哪对新人的请柬。
 * 只返回 status=published 的站点 + approved 的照片，绝不返回草稿或他人数据。
 */
const ENV_ID = process.env.TCB_ENV || 'xiaofeiyang-d3gx5ou5k7fe078eb'
const API_KEY = process.env.CLOUDBASE_APIKEY
const RDB_BASE = `https://${ENV_ID}.api.tcloudbasegateway.com/v1/rdb/rest`

async function admin(table, { method = 'GET', query = '', body, prefer } = {}) {
  const headers = {
    apikey: API_KEY,
    Authorization: `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
  }
  if (prefer) headers.Prefer = prefer
  const res = await fetch(`${RDB_BASE}/${table}${query}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  if (!res.ok) throw new Error(`PG ${res.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`)
  return data
}

exports.main = async (event) => {
  const shareCode = String(event.shareCode || '').trim()
  if (!shareCode) return { ok: false, msg: '缺少分享码' }

  try {
    const sites = await admin('sites', {
      query: `?share_code=eq.${encodeURIComponent(shareCode)}&status=eq.published&select=profile,music,share_code,updated_at`,
    })
    if (!sites || !sites.length) {
      return { ok: false, msg: '请柬不存在或尚未发布' }
    }
    const site = sites[0]

    // 取该租户已审阅通过的照片
    const ownerRows = await admin('sites', {
      query: `?share_code=eq.${encodeURIComponent(shareCode)}&select=owner_openid`,
    })
    const owner = ownerRows[0].owner_openid
    const photos = await admin('photos', {
      query: `?owner_openid=eq.${owner}&status=eq.approved&select=public_url,fallback_url,sort_order,reviewed,ai&order=sort_order.asc,id.asc`,
    })

    const gallery = (photos || []).map((p) => {
      const meta = p.reviewed || p.ai || {}
      return {
        src: p.public_url,
        // 云端图加载失败时回退的包内小图（仅存量种子站点有；新用户照片无包内副本则留空）
        fallback: p.fallback_url || '',
        caption: meta.caption || '',
        chapter: meta.chapter || '',
        dir: meta.dir || 'left',
        fx: meta.fx || 'zoom',
        kaleido: Boolean(meta.kaleido),
      }
    })

    return {
      ok: true,
      config: Object.assign({}, site.profile, {
        music: (site.music && site.music.public_url) || '',
        share_code: site.share_code,
        gallery,
      }),
      updatedAt: site.updated_at,
    }
  } catch (err) {
    console.error('[getPublicSite]', err)
    return { ok: false, msg: err.message }
  }
}
