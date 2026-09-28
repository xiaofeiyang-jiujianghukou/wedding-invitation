const config = require('../../config.js')
const api = require('../../lib/api.js')
const { parseWeddingDate, breakdown, pad2 } = require('../../lib/date.js')

const wedding = parseWeddingDate(config.weddingDate)

if (!wedding) {
  console.error('[page] 婚期解析失败！config.weddingDate =', config.weddingDate)
}
console.log('[page] 模块加载完成: 新人 =', config.groom, '&', config.bride)

/** 相册共 20 张，分 5 章；章节名由每张上的 chapter 字段决定 */
const gallery = config.gallery

/** 相册自动轮播周期（ms）：飞入 1100 + 驻留 4900，与 CSS 动效时长对齐 */
const GALLERY_INTERVAL = 6000
/** 横向滑动判定阈值（px） */
const SWIPE_MIN = 40

let timer = null
let galleryTimer = null

Page({
  data: {
    config: Object.assign({}, config, { gallery }),
    music: config.music,
    playing: false,

    /** 当前幕索引，用于触发每幕的入场动画 */
    current: 0,
    /** 相册当前张索引（新图，播 flyIn） */
    galleryIndex: 0,
    /** 相册上一张索引（旧图，播 flyOut；-1 表示无） */
    galleryPrev: -1,
    /** 相册当前章节名（初见 / 相恋 / 同行 / 约定 / 此刻） */
    galleryChapter: gallery.length ? gallery[0].chapter : '',

    dateText: wedding.text,
    remain: { d: 0, h: 0, m: 0, s: 0 },

    info: {
      month: wedding.month,
      day: wedding.day,
      weekday: wedding.weekday,
      time: `${wedding.hour}:${wedding.minute}`,
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
    this.tick()
    timer = setInterval(() => this.tick(), 1000)
    this.loadRsvpCount()
    this.loadWishes()
    this.initMusic()
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
  },

  /* ---------- 翻幕 ---------- */

  onStageChange(e) {
    const current = e.detail.current
    this.setData({ current })
    // 相册幕：进入才轮播，离开即停（省电，也避免后台跳图）
    if (current === 2) {
      this.startGalleryTimer()
    } else {
      this.stopGalleryTimer()
    }
  },

  /** 尾幕点「回到封面」 */
  backToTop() {
    this.setData({ current: 0 })
  },

  /* ---------- 倒计时 ---------- */

  tick() {
    const r = breakdown(wedding.timestamp - Date.now())
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
   * 旧图记入 galleryPrev 播 flyOut（方向 = 它的 config.dir），
   * 新图播 flyIn（反方向进场），wx:if 重建节点保证动画必播。
   */
  goGallery(step) {
    const n = gallery.length
    if (!n) return
    const prev = this.data.galleryIndex
    const next = (prev + step + n) % n
    const item = gallery[next]
    this.setData({
      galleryPrev: prev,
      galleryIndex: next,
      galleryChapter: item ? item.chapter : '',
    })
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

  /* ---------- 背景音乐 ---------- */

  /**
   * 云存储 fileID 可直接作为 src（基础库 ≥ 2.2.3 自动换临时链接）。
   * 尝试自动播放；被系统拦截（省电模式等）时唱片按钮仍在，点一下即播。
   */
  initMusic() {
    if (!config.music || this.audio) return
    const audio = wx.createInnerAudioContext()
    audio.src = config.music
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
