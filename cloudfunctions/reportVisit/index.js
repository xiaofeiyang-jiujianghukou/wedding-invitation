/**
 * reportVisit —— 访客上报（宾客端专用，公开可调）
 *
 * 采集三类数据：
 *   · PV：每次进入请柬记一条（同人 5 分钟内重复进站合并，避免误刷）
 *   · UV：按 openid 去重（身份解析失败时退化为 vid 口径，仍算一个独立访客）
 *   · 浏览深度：切幕时上报 stage，只记录最大值（最快的人看到第几幕）
 *   · 裂变来源：分享路径带 from=<分享者 vid>，记录 from_vid 形成传播链
 *
 * 隐私：只存 openid 与随机 vid，不采集昵称/头像/位置。制作人侧展示时脱敏。
 */
const { admin, resolveOpenid, genVid } = require('./_shared')

/** 同一访客多久算「同一次访问」（此窗口内重复进站只更新，不新增 PV） */
const DEDUP_MS = 5 * 60 * 1000
const MAX_STAGE = 6

exports.main = async (event, context) => {
  try {
    const shareCode = String((event && event.share_code) || '').trim()
    if (!shareCode) return { ok: false, msg: '缺少 share_code' }

    const sites = await admin('sites', {
      query: `?share_code=eq.${encodeURIComponent(shareCode)}&select=id,status&limit=1`,
    })
    if (!sites || !sites.length) return { ok: false, msg: '请柬不存在' }
    const siteId = sites[0].id

    const openid = (await resolveOpenid(context || {}, event)) || ''
    const vid = String((event && event.vid) || '').trim().slice(0, 24) || genVid()
    const fromVid = String((event && event.from) || '').trim().slice(0, 24)
    const stage = Math.max(0, Math.min(MAX_STAGE, Number(event && event.stage) || 0))

    /* ---------- 找这次访问对应的记录（5 分钟窗口内复用） ---------- */
    const key = openid
      ? `openid=eq.${encodeURIComponent(openid)}`
      : `vid=eq.${encodeURIComponent(vid)}`
    const recent = await admin('visits', {
      query: `?site_id=eq.${siteId}&${key}&order=created_at.desc&limit=1`,
    })
    const last = recent && recent[0]

    if (last && Date.now() - new Date(last.created_at).getTime() < DEDUP_MS) {
      /* 同一次访问：只推进浏览深度（且只前进不后退） */
      const nextStage = Math.max(Number(last.max_stage) || 0, stage)
      if (nextStage !== Number(last.max_stage) || last.vid !== vid) {
        await admin('visits', {
          method: 'PATCH',
          query: `?id=eq.${last.id}`,
          body: { max_stage: nextStage, vid, updated_at: new Date().toISOString() },
        })
      }
      return { ok: true, vid, dedup: true, stage: nextStage }
    }

    /* ---------- 新访问：记一条 ---------- */
    await admin('visits', {
      method: 'POST',
      body: {
        site_id: siteId,
        openid,
        vid,
        from_vid: fromVid,
        via_share_code: shareCode,
        max_stage: stage,
      },
    })
    return { ok: true, vid, dedup: false, stage }
  } catch (err) {
    console.error('[reportVisit]', err)
    // 上报失败不打扰宾客：前端静默处理
    return { ok: false, msg: err.message }
  }
}
