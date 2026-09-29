const localConfig = require('../../config.js')
const api = require('../../lib/api.js')
const { parseWeddingDate, breakdown, pad2 } = require('../../lib/date.js')

/**
 * 把云端调用失败翻译成人能看懂的一句话。
 *
 * 为什么需要：云端拉取失败时页面会静默回退到本地 config.js，
 * 此时「编辑入口不显示」看起来像是功能没做，实际是链路断了。
 * 把原因显性化，排查时一眼能定位。
 */
function describeCloudError(err) {
  if (!err) return '未知错误'
  const msg = String(err.errMsg || err.message || err)
  if (/cloud.*not.*init|未初始化|init/i.test(msg)) {
    return '云开发未初始化（检查 app.js 的 wx.cloud.init 是否执行）'
  }
  if (/FunctionName|not found|不存在/i.test(msg)) {
    return '云函数不存在或未部署'
  }
  if (/timeout|超时/i.test(msg)) {
    return '云函数调用超时'
  }
  if (/PERMISSION|权限|EXCEED/i.test(msg)) {
    return '权限不足（云环境或函数权限配置）'
  }
  if (/network|域名|request:fail/i.test(msg)) {
    return '网络不可达'
  }
  if (/无法识别身份/.test(msg)) {
    return '云函数没拿到你的微信身份'
  }
  return msg
}

/**
 * 内容来源策略：
 *   本地 config.js 作为「兜底」—— 云端还没配好、或网络失败时仍能正常展示；
 *   云端数据一到，就用云端覆盖（这样改内容不用改代码、不用重新发版）。
 *
 * 因此 config 是**可变**的运行时状态，不再是常量。
 */
let config = Object.assign({}, localConfig)

/** 相册自动轮播周期（ms）：飞入 1800 + 驻留 3600，与 CSS 动效时长对齐 */
const GALLERY_INTERVAL = 5400
/** 横向滑动判定阈值（px） */
const SWIPE_MIN = 40

let timer = null
let galleryTimer = null

/** 把婚期字符串解析成展示所需的各字段 */
function buildDateParts(dateStr) {
  const w = parseWeddingDate(dateStr)
  if (!w) return null
  return {
    text: w.text,
    month: w.month,
    day: w.day,
    weekday: w.weekday,
    hour: w.hour,
    minute: w.minute,
  }
}

const initialDate = buildDateParts(config.weddingDate)
if (!initialDate) {
  console.error('[page] 婚期解析失败！config.weddingDate =', config.weddingDate)
}
console.log('[page] 模块加载完成: 新人 =', config.groom, '&', config.bride)

Page({
  data: {
    config: Object.assign({}, config),
    music: config.music,
    playing: false,

    /** 内容是否来自云端（用于详情页显示"已同步"之类） */
    fromCloud: false,
    /** 是否是制作人本人（决定是否显示"编辑"入口） */
    isOwner: false,
    /** 首次加载中（避免闪烁）：true 时全屏加载壳盖住默认模板内容 */
    loading: true,
    /** 加载壳是否还挂在 DOM（loading=false 后延迟几百毫秒移除，做淡出过渡） */
    bootVeilGone: false,
    /** 云端拉取失败的原因（非空时尾幕显示诊断条，方便排查） */
    cloudError: '',

    /** 当前幕索引，用于触发每幕的入场动画 */
    current: 0,
    /** 相册当前张索引（新图，播 flyIn） */
    galleryIndex: 0,
    /** 相册上一张索引（旧图静驻垫底 hold，不播飞出；-1 表示无） */
    galleryPrev: -1,
    /** 相册当前章节名（初见 / 相恋 / 同行 / 约定 / 此刻） */
    galleryChapter: (config.gallery && config.gallery.length) ? config.gallery[0].chapter : '',

    dateText: initialDate ? initialDate.text : '',
    remain: { d: 0, h: 0, m: 0, s: 0 },

    info: {
      month: initialDate ? initialDate.month : '',
      day: initialDate ? initialDate.day : '',
      weekday: initialDate ? initialDate.weekday : '',
      time: initialDate ? `${initialDate.hour}:${initialDate.minute}` : '',
    },

    copied: false,

    form: { name: '', phone: '', attending: true, count: 1, note: '' },
    valid: false,
    submitting: false,
    done: false,
    rsvpTotal: 0,

    wishForm: { name: '', text: '' },
    wishValid: false,
    wishing: false,
    wishDone: false,
    wishes: [],
  },

  onLoad() {
    console.log('[page] onLoad 执行, 初始 dateText =', this.data.dateText)

    // 先用本地内容把页面点亮，云端数据到了再覆盖 —— 避免白屏等待
    this._weddingTs = (parseWeddingDate(config.weddingDate) || {}).timestamp || 0
    this.tick()
    timer = setInterval(() => this.tick(), 1000)
    this.loadRsvpCount()
    this.loadWishes()
    this.initMusic()

    // 秒开：若上次云端内容已缓存，直接以它渲染（真名/真照片），无默认内容闪变；
    // 云端随后照常校验刷新，内容没变就不再大补丁重置视图
    const cached = wx.getStorageSync(this._cacheKey())
    if (cached && cached.gallery) {
      this._appliedCacheStr = JSON.stringify(cached)
      this.applyConfig(cached, !((this.options && this.options.code) || this._pendingShareCode))
      console.log('[page] 缓存秒开（', this._cacheKey(), '）')
    }

    this.applyCloudContent()
  },

  /** 内容缓存 key：制作人（无分享码）与宾客（按码隔离）分开存，互不串台 */
  _cacheKey() {
    const shareCode = (this.options && this.options.code) || this._pendingShareCode || ''
    return shareCode ? `site_cache_guest_${shareCode}` : 'site_cache_owner'
  },

  /** 放开首屏加载壳：先淡出（hide 类），过渡结束后移除节点 */
  _reveal() {
    if (this._revealed) return
    this._revealed = true
    setTimeout(() => this.setData({ bootVeilGone: true }), 500)
  },

  /**
   * 拉取云端请柬内容并覆盖本地配置。
   *
   * 两条路径：
   *   - 带了分享码（?code=xxx）→ 宾客视角，走 getPublicSite，只读已发布内容
   *   - 没带码 → 制作人视角，走 siteManage.load（服务端会自动开箱）
   *
   * 任何失败都静默回退到本地 config.js，保证请柬永远能打开。
   */
  async applyCloudContent() {
    const shareCode = (this.options && this.options.code) || this._pendingShareCode || ''
    // 超时保护：云端迟迟不回就先放开加载壳（降级展示本地内容），迟到内容照常替换
    const bootTimeout = setTimeout(() => {
      if (this.data.loading) {
        this.setData({ loading: false, cloudError: '云端响应慢，先展示本地内容' })
        this._reveal()
      }
    }, 4000)
    try {
      const payload = shareCode
        ? await api.loadSiteByCode(shareCode)
        : await api.loadMySite()

      const incoming = shareCode
        ? payload.config
        : this.siteToConfig(payload.site, payload.photos)

      if (!incoming) throw new Error('云端暂无内容')

      // 缓存秒开过的页面：内容没变就不再 applyConfig（避免相册/倒计时被重置打断）
      const incomingStr = JSON.stringify(incoming)
      if (this._appliedCacheStr && this._appliedCacheStr === incomingStr) {
        this.setData({ loading: false, fromCloud: true, isOwner: !shareCode })
        this._reveal()
      } else {
        this.applyConfig(incoming, !shareCode)
      }
      this._appliedCacheStr = ''
      console.log('[page] 已应用云端内容', shareCode ? '(宾客)' : '(制作人)')
    } catch (err) {
      // 回退到本地 config.js，保证请柬永远能打开。
      // 但必须把「为什么失败」留痕 —— 否则会静默降级到只读模式，
      // 用户看不到编辑入口却完全不知道为什么（踩过这个坑）。
      const reason = describeCloudError(err)
      console.error('[page] ❌ 云端内容不可用，已回退本地 config.js。原因:', reason, err)
      this.setData({ loading: false, cloudError: reason })
      this._reveal()
    } finally {
      clearTimeout(bootTimeout)
    }
  },

  /** 把站点 + 照片记录组装成页面用的 config 结构 */
  siteToConfig(site, photos) {
    if (!site) return null
    const profile = site.profile || {}
    const gallery = (photos || [])
      .map((p) => {
        const meta = p.reviewed || p.ai || {}
        return {
          src: (p.reviewed && p.reviewed.src) || p.public_url || '',
          fallback: p.fallback_url || '',
          caption: meta.caption || '',
          chapter: meta.chapter || '',
          dir: meta.dir || 'left',
          fx: meta.fx || 'zoom',
          kaleido: Boolean(meta.kaleido),
        }
      })
      .filter((g) => g.src)

    return Object.assign({}, profile, {
      music: (site.music && site.music.public_url) || '',
      share_code: site.share_code || '',
      gallery,
    })
  },

  /** 用一份完整配置替换页面状态（相册、音乐、日期、文案一起换） */
  applyConfig(incoming, isOwner) {
    config = Object.assign({}, localConfig, incoming)
    // 分享码随内容走：缓存秒开时也能拿到正确分享码（转发 path 不掉码）
    if (incoming.share_code) this._shareCode = incoming.share_code

    const d = buildDateParts(config.weddingDate)
    this._weddingTs = d ? (parseWeddingDate(config.weddingDate) || {}).timestamp || 0 : 0

    const galleryList = config.gallery || []
    const patch = {
      config: Object.assign({}, config),
      music: config.music || '',
      fromCloud: true,
      loading: false,
      galleryIndex: 0,
      galleryPrev: -1,
      galleryChapter: galleryList.length ? galleryList[0].chapter : '',
      isOwner: Boolean(isOwner),
    }
    if (d) {
      patch.dateText = d.text
      patch.info = { month: d.month, day: d.day, weekday: d.weekday, time: `${d.hour}:${d.minute}` }
    }
      this.setData(patch)
      this._reveal()
      // 凡应用的配置即缓存：下次打开秒显真实内容（无默认模板闪变）
      try { wx.setStorageSync(this._cacheKey(), incoming) } catch (e) { /* 存储满不影响浏览 */ }

    // 歌换了要重挂音频；没歌就不显示按钮
    if (this.audio) {
      this.audio.destroy()
      this.audio = null
    }
    this.setData({ playing: false })
    this.initMusic()
    this.tick()
  },

  /**
   * 「归位」：长按尾幕的「敬邀」那一行触发。
   *
   * 用途：把你现有的请柬内容（新人/日期/20 张照片/文案）登记到你自己
   * 微信身份（openid）名下。只在首次搭后台时用一次，之后内容就能在云端改了。
   *
   * 为什么藏成长按：宾客点不到，避免误触。
   */
  claimSite() {
    wx.showModal({
      title: '登记到我的名下',
      content: '将把当前请柬内容（新人信息、相册、文案）载入你本人的微信账号，之后可在后台修改。\n\n已有内容不会被覆盖。确认继续？',
      confirmText: '确认',
      cancelText: '取消',
      success: (m) => {
        if (!m.confirm) return
        wx.showLoading({ title: '正在登记…', mask: true })
        api.claimSite()
          .then((r) => {
            wx.hideLoading()
            const rr = r || {}
            if (rr.ok) {
              wx.showModal({
                title: '登记成功',
                content: `分享码：${rr.share_code}\n相册：${rr.photos_total} 张\n\n${rr.msg}`,
                showCancel: false,
              })
            } else {
              wx.showModal({ title: '登记失败', content: rr.msg || '未知错误', showCancel: false })
            }
          })
          .catch((err) => {
            wx.hideLoading()
            wx.showModal({ title: '调用失败', content: String(err && err.errMsg || err), showCancel: false })
          })
      },
    })
  },

  onUnload() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
    this.stopGalleryTimer()
    if (this.audio) {
      this.audio.destroy()
      this.audio = null
    }
  },

  /** 小程序切后台时暂停所有计时，避免回来后连跳好几张 */
  onHide() {
    this.stopGalleryTimer()
    // 音乐跟着切后台暂停，回前台自动续播
    if (this.audio && this.data.playing) {
      this._resumeMusic = true
      this.audio.pause()
    }
  },

  onShow() {
    if (this.data.current === 2) this.startGalleryTimer()
    if (this._resumeMusic && this.audio) {
      this._resumeMusic = false
      this.audio.play()
    }
    // 从后台改完内容回来 → 重新拉一次云端，立即看到改动
    if (getApp().globalData.profileDirty) {
      getApp().globalData.profileDirty = false
      this.applyCloudContent()
    }
  },

  /** 尾幕的「编辑我的请柬」→ 后台（仅制作人可见） */
  goAdmin() {
    wx.navigateTo({
      url: '/pages/admin/admin',
      fail: (err) => {
        console.error('[page] 打开后台失败', err)
        wx.showToast({ title: '打开后台失败', icon: 'none' })
      },
    })
  },

  /* ---------- 翻幕 ---------- */

  onStageChange(e) {
    const current = e.detail.current
    // 尾幕下滑跳封面后 800ms 内，swiper 原生拖拽可能滞后派发一次
    // change(5)（手势与自定义跳转赛跑）。跳转已经完成，忽略这次事件，
    // 否则会被覆盖回「祝福幕」。正常使用中 800ms 内不可能出现 5。
    if (this._jumpedAt && Date.now() - this._jumpedAt < 800 && current === 5) {
      return
    }
    this.setData({ current })
    // 相册幕：进入才轮播，离开即停（省电，也避免后台跳图）
    if (current === 2) {
      this.startGalleryTimer()
      this.preloadGallery(this.data.galleryIndex)
    } else {
      this.stopGalleryTimer()
    }
  },

  /**
   * 预取相册云端图（消除转场空档）。
   * 实测（_assets/transition_lab 浏览器复刻）：公读网关无 CDN、TTFB 0.4-0.7s，
   * 不预取时每次切图有 200-400ms（慢网 1s+）「空白→突然清晰」的波动；
   * 提前预热下一张后空档为 0。
   */
  preloadGallery(i) {
    if (!this._preloaded) this._preloaded = new Set()
    const list = (this.data.config && this.data.config.gallery) || []
    if (!list.length) return
    ;[i % list.length, (i + 1) % list.length].forEach((k) => {
      const src = list[k] && list[k].src
      if (!src || !/^https:/.test(src) || this._preloaded.has(src)) return
      this._preloaded.add(src)
      wx.getImageInfo({ src, success() {}, fail() {} })
    })
  },

  /** 尾幕点「回到封面」 */
  backToTop() {
    this.setData({ current: 0 })
  },

  /* ---------- 尾幕手势：下滑一步回封面 ---------- */

  /**
   * 三重保险，保证「尾幕下滑 = 一步回封面」在所有机型上成立：
   *   1. catchtouchmove 禁掉 swiper 原生拖拽（部分基础库生效）；
   *   2. touchstart 记下「当时在哪一幕」，touchend 判定下滑 60px+ → 跳封面
   *      （用起点幕判定而非当前幕：若原生 change 先到把 current 改成了 5，
   *      触摸结束时仍能纠正回封面）；
   *   3. onStageChange 里的竞态窗口（见上）：跳转后滞后的 change(5) 直接忽略。
   */
  onEndingTouchMove() {
    // catchtouchmove 只为阻断冒泡，无需任何逻辑
  },

  onEndingTouchStart(e) {
    const t = (e.touches && e.touches[0]) || {}
    this._endingFrom = { x: t.clientX, y: t.clientY, stage: this.data.current }
  },

  onEndingTouchEnd(e) {
    const from = this._endingFrom
    this._endingFrom = null
    if (!from || from.stage !== 6) return
    const t = (e.changedTouches && e.changedTouches[0]) || {}
    const dy = (t.clientY || 0) - from.y
    const dx = (t.clientX || 0) - from.x
    // 下滑 60px 以上、且以纵向为主 → 一步回封面（横向滑动不响应）
    if (dy > 60 && Math.abs(dy) > Math.abs(dx)) {
      this._jumpedAt = Date.now()
      this.setData({ current: 0 })
    }
  },

  /* ---------- 幕内 scroll-view：顶部下滑回传上一幕 ---------- */

  /**
   * scroll-view 会拦截同方向的竖滑（平台行为）。故事 / 回执 / 祝福墙
   * 三幕的版心都铺在 scroll-view 里，导致「往下滑回上一幕」在这些区域
   * 完全失灵——从尾幕一路滑回封面会被故事幕卡死。
   * 这里在 scroll-view 上自判手势：本轮触摸期间列表没有滚动、下滑
   * 超过 60px 且以纵向为主 → 退回 data-back 指定的那一幕。
   */
  onBackTouchStart(e) {
    // 起点在输入框 / 多行文本上：那是在操作文字，不是翻页手势
    if (e.target && e.target.dataset && e.target.dataset.noswipe) {
      this._backFrom = null
      return
    }
    const t = (e.touches && e.touches[0]) || {}
    this._backFrom = {
      x: t.clientX,
      y: t.clientY,
      to: Number(e.currentTarget.dataset.back),
      stage: this.data.current,
    }
    this._backScrolled = false
  },

  onBackScrolled() {
    // 列表真的滚动了就别当翻页手势（例如从列表中部滚回顶部）
    this._backScrolled = true
  },

  onBackTouchEnd(e) {
    const from = this._backFrom
    this._backFrom = null
    const scrolled = this._backScrolled
    this._backScrolled = false
    if (!from || scrolled) return
    const t = (e.changedTouches && e.changedTouches[0]) || {}
    const dy = (t.clientY || 0) - from.y
    const dx = (t.clientX || 0) - from.x
    if (dy > 60 && Math.abs(dy) > Math.abs(dx) && from.to < from.stage) {
      this.setData({ current: from.to })
    }
  },

  /* ---------- 倒计时 ---------- */

  tick() {
    const ts = this._weddingTs
    if (!ts) return
    const r = breakdown(ts - Date.now())
    this.setData({
      remain: { d: pad2(r.d), h: pad2(r.h), m: pad2(r.m), s: pad2(r.s) },
    })
  },

  /* ---------- 相册轮播（叠层自驱，弃用 swiper 自动切换） ---------- */

  startGalleryTimer() {
    if (galleryTimer) return
    galleryTimer = setInterval(() => this.goGallery(1), GALLERY_INTERVAL)
  },

  stopGalleryTimer() {
    if (galleryTimer) {
      clearInterval(galleryTimer)
      galleryTimer = null
    }
  },

  /** 重启计时：手动切换后从新周期起算，避免刚切完又被自动跳走 */
  restartGalleryTimer() {
    this.stopGalleryTimer()
    this.startGalleryTimer()
  },

  /**
   * 切换到下一张 / 上一张。
   * 旧图记入 galleryPrev 静驻原地（hold，不播飞出——飞出与飞入
   * 同帧重叠两段大位移动画会抖），新图播 flyIn（反方向进场）盖住它，
   * wx:if 重建节点保证动画必播。
   */
  goGallery(step) {
    const list = (this.data.config && this.data.config.gallery) || []
    const n = list.length
    if (!n) return
    const prev = this.data.galleryIndex
    const next = (prev + step + n) % n
    const item = list[next]
    this.setData({
      galleryPrev: prev,
      galleryIndex: next,
      galleryChapter: item ? item.chapter : '',
    })
    // 切图后立刻预热下一张：距下次轮播还有 ~4s，足够进图片缓存
    this.preloadGallery(next)
  },

  /** 横向滑切图；竖向不拦，交给外层整屏翻幕 */
  galleryTouchStart(e) {
    this._touch = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  },

  galleryTouchEnd(e) {
    if (!this._touch) return
    const dx = e.changedTouches[0].clientX - this._touch.x
    const dy = e.changedTouches[0].clientY - this._touch.y
    this._touch = null
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > SWIPE_MIN) {
      this.goGallery(dx < 0 ? 1 : -1)
      this.restartGalleryTimer()
    }
  },

  /**
   * 云端照片加载失败（弱网/存储抖动）→ 回退包内 720px 小图，相册不黑屏。
   * 幂等：src 已是 fallback（fallback 也失败）时不再 setData，避免循环报错。
   */
  onPhotoError(e) {
    const i = Number(e.currentTarget.dataset.gi)
    const item = ((this.data.config && this.data.config.gallery) || [])[i]
    if (!item || !item.fallback || item.src === item.fallback) return
    this.setData({ [`config.gallery[${i}].src`]: item.fallback })
  },

  /** 分享码兜底：options.code（宾客）> 内容自带（制作人/缓存） */
  _currentShareCode() {
    return this._shareCode || (this.options && this.options.code) || ''
  },

  /** 转发给好友：卡片路径带分享码，好友打开即是这份请柬（宾客可再转发） */
  onShareAppMessage() {
    const code = this._currentShareCode()
    const c = this.data.config || {}
    const img = (c.gallery && c.gallery[0] && c.gallery[0].src) || ''
    return {
      title: `${c.groom || ''} & ${c.bride || ''} · 邀你见证我们的婚礼`,
      path: `/pages/index/index${code ? `?code=${code}` : ''}`,
      imageUrl: /^https:/.test(img) ? img : '',
    }
  },

  /** 分享到朋友圈：单页模式打开，query 带分享码 */
  onShareTimeline() {
    const code = this._currentShareCode()
    const c = this.data.config || {}
    const img = (c.gallery && c.gallery[0] && c.gallery[0].src) || ''
    return {
      title: `${c.groom || ''} & ${c.bride || ''} · 邀你见证我们的婚礼`,
      query: code ? `code=${code}` : '',
      imageUrl: /^https:/.test(img) ? img : '',
    }
  },

  /* ---------- 背景音乐 ---------- */

  /**
   * 云存储 fileID 可直接作为 src（基础库 ≥ 2.2.3 自动换临时链接）。
   * 尝试自动播放；被系统拦截（省电模式等）时唱片按钮仍在，点一下即播。
   */
  initMusic() {
    const musicUrl = this.data.music || config.music
    if (!musicUrl || this.audio) return
    const audio = wx.createInnerAudioContext()
    audio.src = musicUrl
    audio.loop = true
    audio.volume = 0.55
    audio.obeyMuteSwitch = false // iOS 静音键下也出声；有按钮随时可关
    audio.autoplay = true
    // 播放状态一律以真实回调为准，避免「按钮显示在播其实没声」
    audio.onPlay(() => this.setData({ playing: true }))
    audio.onPause(() => this.setData({ playing: false }))
    audio.onStop(() => this.setData({ playing: false }))
    audio.onError((err) => {
      console.error('[page] 音乐播放失败:', err)
      this.setData({ playing: false })
      // 仅用户主动点击后短时间内报错才弹提示；自动播放被拦时不打扰
      if (Date.now() - (this._musicTapAt || 0) < 3000) {
        wx.showToast({ title: '音乐加载失败，请检查网络或 fileID', icon: 'none' })
      }
    })
    this.audio = audio
  },

  toggleMusic() {
    if (!this.audio) return
    this._musicTapAt = Date.now()
    if (this.data.playing) {
      this.audio.pause()
    } else {
      this.audio.play()
    }
  },

  /* ---------- 婚礼信息：导航 / 复制 ---------- */

  openLocation() {
    const { venue } = config
    wx.openLocation({
      latitude: venue.latitude,
      longitude: venue.longitude,
      name: venue.name,
      address: venue.address,
      scale: 16,
      fail: () => {
        wx.showToast({ title: '打开地图失败', icon: 'none' })
      },
    })
  },

  copyAddress() {
    const { venue } = config
    wx.setClipboardData({
      data: `${venue.name} ${venue.address}`,
      success: () => {
        this.setData({ copied: true })
        setTimeout(() => this.setData({ copied: false }), 2000)
      },
    })
  },

  /* ---------- RSVP 表单 ---------- */

  onNameInput(e) {
    this.updateForm('name', e.detail.value)
  },

  onPhoneInput(e) {
    this.updateForm('phone', e.detail.value)
  },

  onNoteInput(e) {
    this.updateForm('note', e.detail.value)
  },

  updateForm(key, value) {
    const form = Object.assign({}, this.data.form, { [key]: value })
    this.setData({ form, valid: form.name.trim().length > 0 && form.count >= 1 })
  },

  setAttending(e) {
    const attending = e.currentTarget.dataset.val === true || e.currentTarget.dataset.val === 'true'
    const form = Object.assign({}, this.data.form, { attending })
    this.setData({ form, valid: form.name.trim().length > 0 && form.count >= 1 })
  },

  incCount() {
    const next = Math.min(10, this.data.form.count + 1)
    this.updateForm('count', next)
  },

  decCount() {
    const next = Math.max(1, this.data.form.count - 1)
    this.updateForm('count', next)
  },

  async loadRsvpCount() {
    try {
      const total = await api.rsvpCount()
      console.log('[page] 云端回执总数 =', total)
      this.setData({ rsvpTotal: total })
    } catch (err) {
      console.error('[page] 读取回执总数失败:', err)
    }
  },

  async submitRsvp() {
    const { form, valid, submitting } = this.data
    if (!valid || submitting) return

    this.setData({ submitting: true })
    try {
      const res = await api.submitRsvp({
        name: form.name.trim().slice(0, 20),
        phone: form.phone.trim().slice(0, 20),
        attending: form.attending,
        count: Math.min(10, Math.max(1, form.count)),
        note: form.note.trim().slice(0, 100),
      })

      if (res && res.ok === false) {
        wx.showToast({ title: res.msg || '提交失败', icon: 'none' })
        return
      }

      wx.showToast({ title: '提交成功', icon: 'success' })
      this.setData({
        done: true,
        form: { name: '', phone: '', attending: true, count: 1, note: '' },
        valid: false,
      })
      setTimeout(() => this.setData({ done: false }), 3000)
      await this.loadRsvpCount()
    } catch (err) {
      console.error('提交回执失败', err)
      wx.showToast({ title: '网络异常，请重试', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },

  /* ---------- 祝福墙 ---------- */

  onWishNameInput(e) {
    this.updateWish('name', e.detail.value)
  },

  onWishTextInput(e) {
    this.updateWish('text', e.detail.value)
  },

  updateWish(key, value) {
    const wishForm = Object.assign({}, this.data.wishForm, { [key]: value })
    this.setData({
      wishForm,
      wishValid: wishForm.name.trim().length > 0 && wishForm.text.trim().length > 0,
    })
  },

  async loadWishes() {
    try {
      const wishes = await api.listWishes()
      this.setData({ wishes })
    } catch (err) {
      console.error('读取祝福失败', err)
    }
  },

  async submitWish() {
    const { wishForm, wishValid, wishing } = this.data
    if (!wishValid || wishing) return

    this.setData({ wishing: true })
    try {
      const res = await api.submitWish({
        name: wishForm.name.trim().slice(0, 20),
        text: wishForm.text.trim().slice(0, 100),
      })

      if (res && res.ok === false) {
        wx.showToast({ title: res.msg || '发送失败', icon: 'none' })
        return
      }

      wx.showToast({ title: '祝福已上墙', icon: 'success' })
      this.setData({
        wishDone: true,
        wishForm: { name: '', text: '' },
        wishValid: false,
      })
      setTimeout(() => this.setData({ wishDone: false }), 3000)
      await this.loadWishes()
    } catch (err) {
      console.error('发送祝福失败', err)
      wx.showToast({ title: '网络异常，请重试', icon: 'none' })
    } finally {
      this.setData({ wishing: false })
    }
  },
})
