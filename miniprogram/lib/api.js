/**
 * 云函数调用层。
 *
 * 小程序端与云函数同环境，wx.cloud.callFunction 直接携带微信身份，
 * 不需要匿名登录，也不受浏览器端 403 EXCEED_AUTHORITY 的限制。
 */

/**
 * 需要微信身份的云函数：调用前先 wx.login 拿 code，服务端 code2Session 换 openid。
 *
 * 为什么：本环境是「腾讯云侧环境 + 授权给小程序」，wx.cloud.callFunction
 * 能调通，但云函数拿不到原生注入的 context.OPENID（那是微信侧环境的
 * 专属能力）。标准解法就是 code2Session —— code 一次性、5 分钟有效、防重放。
 */
const AUTHED_FNS = ['siteManage', 'aiProcessPhotos', 'claimSite', 'reportVisit', 'adminManage', 'webLogin']

/** wx.login 的 Promise 化（code 是一次性临时凭证，本地生成，很快） */
function getLoginCode() {
  return new Promise((resolve) => {
    wx.login({
      success: (r) => resolve((r && r.code) || ''),
      fail: () => resolve(''),
    })
  })
}

function call(name, data) {
  return new Promise(async (resolve, reject) => {
    if (!wx.cloud || !wx.cloud.callFunction) {
      reject(new Error(`云开发未初始化，无法调用 ${name}`))
      return
    }
    const payload = Object.assign({}, data || {})
    if (AUTHED_FNS.indexOf(name) >= 0) {
      const code = await getLoginCode()
      if (code) payload._code = code
    }
    wx.cloud.callFunction({
      name,
      data: payload,
      success: (res) => resolve(res.result),
      fail: (err) => {
        // 保留原始 errMsg，便于上层翻译成人话
        const e = new Error((err && err.errMsg) || `调用 ${name} 失败`)
        e.errMsg = (err && err.errMsg) || ''
        e.raw = err
        reject(e)
      },
    })
  })
}

/** 提交回执（带分享码归属站点 + 访客 vid 供后台关联姓名） */
async function submitRsvp(rsvp, shareCode, vid) {
  return call('submitRsvp', {
    name: rsvp.name,
    phone: rsvp.phone,
    attending: rsvp.attending,
    count: rsvp.count,
    note: rsvp.note,
    share_code: shareCode || '',
    vid: vid || '',
  })
}

/** 回执总数（按请柬） */
async function rsvpCount(shareCode) {
  const res = await call('getRsvpCount', { share_code: shareCode || '' })
  return (res && res.count) || 0
}

/** 提交祝福 */
async function submitWish(wish, shareCode, vid) {
  return call('submitGreeting', {
    name: wish.name,
    text: wish.text,
    share_code: shareCode || '',
    vid: vid || '',
  })
}

/** 祝福列表（按请柬） */
async function listWishes(shareCode) {
  const res = await call('listGreetings', { share_code: shareCode || '' })
  return (res && res.items) || []
}

/* ---------- 访客上报（静默，失败不影响宾客） ---------- */

/**
 * 上报一次访问 / 推进浏览深度。
 * 返回 { ok, vid }：vid 是访客稳定标识，前端存下来，分享时带上形成传播链。
 */
async function reportVisit(info) {
  return call('reportVisit', {
    share_code: (info && info.shareCode) || '',
    from: (info && info.from) || '',
    stage: (info && info.stage) || 0,
    vid: (info && info.vid) || '',
  })
}

/* ---------- 后台数据（仅制作人；服务端二次校验 openid 归属） ---------- */

/** 概览：PV/UV/留言/回执 + 趋势 + 传播链 + 浏览深度 */
async function adminStats() {
  return call('adminManage', { action: 'stats' })
}

/** 留言列表（分页） */
async function adminGreetings(offset) {
  return call('adminManage', { action: 'listGreetings', offset: offset || 0 })
}

/** 删除一条留言 */
async function adminDeleteGreeting(id) {
  return call('adminManage', { action: 'deleteGreeting', id })
}

/** 回执名单 + 汇总 */
async function adminRsvps() {
  return call('adminManage', { action: 'listRsvps' })
}

/** 导出（kind: 'rsvp' | 'greeting'）→ { ok, csv, filename } */
async function adminExport(kind) {
  return call('adminManage', {
    action: kind === 'greeting' ? 'exportGreetings' : 'exportRsvps',
  })
}

/* ---------- 云端请柬内容 ---------- */

/**
 * 读取我自己的站点（制作人视角）。
 *
 * 服务端会自动在首次进入时「开箱」—— 建号并铺一份默认模板，
 * 所以这里总能拿到内容。返回 { site, photos }。
 */
async function loadMySite() {
  const res = await call('siteManage', { action: 'load' })
  if (!res || !res.ok) throw new Error((res && res.msg) || '加载失败')
  return { site: res.site, photos: res.photos || [] }
}

/**
 * 按分享码读取请柬（宾客视角）。只返回已发布的内容。
 * 返回 { config, updatedAt }，读不到则抛错。
 */
async function loadSiteByCode(shareCode) {
  const res = await call('getPublicSite', { shareCode })
  if (!res || !res.ok) throw new Error((res && res.msg) || '请柬不存在或尚未发布')
  return { config: res.config, updatedAt: res.updatedAt }
}

/** 保存资料（服务端差量：内容没变会返回 skipped） */
async function saveProfile(profile) {
  return call('siteManage', { action: 'saveProfile', profile })
}

/** 保存配乐 */
async function saveMusic(music) {
  return call('siteManage', { action: 'saveMusic', music })
}

/** 发布 / 下线 */
async function setPublished(published) {
  return call('siteManage', { action: published ? 'publish' : 'unpublish' })
}

/** AI 统一处理照片（首次会花 AI 额度；未变的图会自动跳过） */
async function aiProcessAll() {
  return call('aiProcessPhotos', { action: 'processAll' })
}

/* ---------- 照片管理（后台页用；统一走 call 自动带身份） ---------- */

/** 新增照片记录（服务端按 storage_key 去重、算指纹、排到队尾） */
async function addPhoto(info) {
  return call('siteManage', {
    action: 'addPhoto',
    storage_key: info.storageKey,
    public_url: info.publicUrl,
    bytes: info.bytes,
    width: info.width,
    height: info.height,
  })
}

/** 删除照片 */
async function removePhoto(id) {
  return call('siteManage', { action: 'removePhoto', id })
}

/** 调整顺序（dir: -1 上移 / 1 下移） */
async function movePhoto(id, dir) {
  return call('siteManage', { action: 'movePhoto', id, dir })
}

/** 「归位」：把当前请柬内容登记到自己 openid 名下（幂等） */
async function claimSite() {
  return call('claimSite', {})
}

/* ---------- PC 端扫码登录 ---------- */

/**
 * 在电脑上点「微信扫码登录」后，手机端扫到码会打开本页，
 * 用户点确认时调用。scene 是二维码里的随机串。
 */
async function webConfirm(scene) {
  return call('webLogin', { action: 'confirm', scene: scene || '' })
}

module.exports = {
  submitRsvp, rsvpCount, submitWish, listWishes,
  reportVisit,
  adminStats, adminGreetings, adminDeleteGreeting, adminRsvps, adminExport,
  loadMySite, loadSiteByCode, saveProfile, saveMusic, setPublished, aiProcessAll,
  addPhoto, removePhoto, movePhoto, claimSite,
  webConfirm,
}
