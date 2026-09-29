/**
 * 管理后台（仅制作人）
 *
 * 进入方式：长按主页面尾幕的「敬邀」那行 → 跳到这里。
 * 权限：靠 openid 判定 —— 只有你自己的微信能进，宾客打不开（云函数会拒绝）。
 *
 * 三个 Tab：
 *   基本信息  改新人/日期/地点/故事/日程/致谢 —— 差量保存，没改的不动
 *   相册      看照片、换图、看 AI 文案
 *   智能处理  一键 AI 看图生成文案/分章/动效（已处理的图会自动跳过，省钱）
 */
const api = require('../../lib/api.js')

/** 压缩目标：长边不超过这个值，约 85KB/张（与项目既有压缩参数一致） */
const MAX_EDGE = 720
/** 单张体积上限（字节）。超了继续降质量 */
const MAX_BYTES = 300 * 1024

Page({
  data: {
    tab: 'profile',          // profile | photos | ai
    loading: true,
    saving: false,
    error: '',

    site: null,
    shareCode: '',

    /** 婚期拆分（picker 用）：datePart 'YYYY-MM-DD'，timePart 'HH:mm' */
    datePart: '',
    timePart: '',

    // 表单字段（与 site.profile 对应）
    form: {
      groom: '', bride: '', coverLine: '', weddingDate: '',
      venueName: '', venueAddress: '', venueLat: 0, venueLng: 0,
      endingThanks: '',
    },
    story: [],
    schedule: [],

    photos: [],
    photoCount: 0,
    pendingCount: 0,

    aiRunning: false,
    aiResult: null,

    published: false,
  },

  onLoad(options) {
    // 支持从分享链接带码进来（方便以后做"预览他人请柬"）
    this._shareCode = (options && options.code) || ''
    this.load()
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh())
  },

  /* ---------- 加载 ---------- */

  async load() {
    this.setData({ loading: true, error: '' })
    try {
      const { site, photos } = await api.loadMySite()
      const p = site.profile || {}
      const wd = toLocalInput(p.weddingDate || '')      // 'YYYY-MM-DDTHH:mm' 或 ''
      const [datePart, timePart] = wd ? wd.split('T') : ['', '']

      this.setData({
        loading: false,
        site,
        shareCode: site.share_code || '',
        published: site.status === 'published',
        datePart: datePart || '',
        timePart: timePart || '',
        form: {
          groom: p.groom || '',
          bride: p.bride || '',
          coverLine: p.coverLine || '',
          weddingDate: wd,
          venueName: (p.venue && p.venue.name) || '',
          venueAddress: (p.venue && p.venue.address) || '',
          venueLat: (p.venue && p.venue.latitude) || 0,
          venueLng: (p.venue && p.venue.longitude) || 0,
          endingThanks: p.endingThanks || '',
        },
        story: (p.story || []).map((s) => ({ date: s.date || '', title: s.title || '', text: s.text || '' })),
        schedule: (p.schedule || []).map((s) => ({ time: s.time || '', event: s.event || '' })),
        photos: (photos || []).map(shapePhoto),
        photoCount: (photos || []).length,
        pendingCount: (photos || []).filter((x) => x.status && x.status !== 'approved').length,
      })
    } catch (err) {
      this.setData({ loading: false, error: (err && err.message) || '加载失败' })
    }
  },

  /* ---------- Tab ---------- */

  switchTab(e) {
    this.setData({ tab: e.currentTarget.dataset.tab })
  },

  /* ---------- 表单编辑 ---------- */

  onField(e) {
    const key = e.currentTarget.dataset.key
    this.setData({ [`form.${key}`]: e.detail.value })
  },

  onStoryField(e) {
    const { index, key } = e.currentTarget.dataset
    this.setData({ [`story[${index}].${key}`]: e.detail.value })
  },

  /** 婚期日期/时间选择器 */
  onDatePart(e) {
    this.setData({ datePart: e.detail.value })
  },

  onTimePart(e) {
    this.setData({ timePart: e.detail.value })
  },

  /** 地图选点：选中后自动回填场地名称与地址（含经纬度） */
  chooseOnMap() {
    wx.chooseLocation({
      success: (r) => {
        this.setData({
          'form.venueName': r.name || this.data.form.venueName,
          'form.venueAddress': r.address || r.name || this.data.form.venueAddress,
          'form.venueLat': r.latitude || 0,
          'form.venueLng': r.longitude || 0,
        })
        wx.showToast({ title: '已填入选点', icon: 'success' })
      },
      fail: (err) => {
        const msg = (err && err.errMsg) || ''
        if (/cancel/i.test(msg)) return
        // 兼容说明：老版开发者工具不支持 requiredPrivateInfos 声明（已从 app.json
        // 移除），新基础库上 chooseLocation 会因缺声明而 fail —— 此时引导手动输入。
        // 将来工具升级后，把 "requiredPrivateInfos": ["chooseLocation"] 加回 app.json 即可。
        wx.showModal({
          title: '地图选点不可用',
          content: /requirePrivate|declared|privacy|fail/i.test(msg)
            ? '当前基础库需要在 app.json 声明 chooseLocation 后才能调起地图（开发者工具版本较旧暂不支持）。请直接在下方输入框手动填写地址。'
            : /auth|denied/i.test(msg)
              ? '需要位置权限。请到小程序设置里开启「位置信息」后重试。'
              : String(msg),
          showCancel: false,
        })
      },
    })
  },

  onScheduleField(e) {
    const { index, key } = e.currentTarget.dataset
    this.setData({ [`schedule[${index}].${key}`]: e.detail.value })
  },

  addStory() {
    if (this.data.story.length >= 6) return
    this.setData({ story: this.data.story.concat([{ date: '', title: '', text: '' }]) })
  },

  removeStory(e) {
    const i = e.currentTarget.dataset.index
    const list = this.data.story.slice()
    list.splice(i, 1)
    this.setData({ story: list })
  },

  addSchedule() {
    if (this.data.schedule.length >= 10) return
    this.setData({ schedule: this.data.schedule.concat([{ time: '', event: '' }]) })
  },

  removeSchedule(e) {
    const i = e.currentTarget.dataset.index
    const list = this.data.schedule.slice()
    list.splice(i, 1)
    this.setData({ schedule: list })
  },

  /* ---------- 保存（差量） ---------- */

  async save() {
    if (this.data.saving) return
    const f = this.data.form
    if (!f.groom.trim() || !f.bride.trim()) {
      wx.showToast({ title: '新人姓名不能为空', icon: 'none' })
      return
    }
    // 婚期：两项都选了才写入（保持 'YYYY-MM-DDTHH:mm'，parseWeddingDate 可解析）
    const weddingDate = this.data.datePart && this.data.timePart
      ? `${this.data.datePart}T${this.data.timePart}`
      : ''

    const venue = { name: f.venueName.trim(), address: f.venueAddress.trim() }
    if (Number(f.venueLat)) venue.latitude = Number(f.venueLat)
    if (Number(f.venueLng)) venue.longitude = Number(f.venueLng)

    const profile = {
      groom: f.groom.trim(),
      bride: f.bride.trim(),
      coverLine: f.coverLine.trim(),
      weddingDate,
      venue,
      story: this.data.story.filter((s) => s.title || s.text),
      schedule: this.data.schedule.filter((s) => s.time || s.event),
      endingThanks: f.endingThanks,
    }

    this.setData({ saving: true })
    try {
      const res = await api.saveProfile(profile)
      if (res && res.ok) {
        wx.showToast({
          title: res.skipped ? '内容没变，已跳过' : '已保存',
          icon: res.skipped ? 'none' : 'success',
        })
        if (!res.skipped) {
          // 标记首页需要刷新，返回时重新拉一次云端内容
          getApp().globalData.profileDirty = true
        }
      } else {
        wx.showToast({ title: (res && res.msg) || '保存失败', icon: 'none' })
      }
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' })
    } finally {
      this.setData({ saving: false })
    }
  },

  /* ---------- 发布 ---------- */

  async togglePublish() {
    const next = !this.data.published
    const label = next ? '发布' : '下线'
    const r = await new Promise((resolve) => {
      wx.showModal({
        title: `确认${label}`,
        content: next
          ? '发布后，拿到分享链接的人就能看到你的请柬。'
          : '下线后，宾客打开会提示"尚未发布"。',
        success: (m) => resolve(m.confirm),
        fail: () => resolve(false),
      })
    })
    if (!r) return

    try {
      const res = await api.setPublished(next)
      if (res && res.ok) {
        this.setData({ published: next })
        wx.showToast({ title: `已${label}`, icon: 'success' })
      } else {
        wx.showToast({ title: (res && res.msg) || '操作失败', icon: 'none' })
      }
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' })
    }
  },

  copyShare() {
    if (!this.data.shareCode) return
    wx.setClipboardData({
      data: this.data.shareCode,
      success: () => wx.showToast({ title: '分享码已复制', icon: 'success' }),
    })
  },

  /* ---------- 照片 ---------- */

  /** 选图 → 压缩 → 上传 → 落库（差量：算指纹，AI 才知道要不要重算） */
  async addPhotos() {
    const remain = 40 - this.data.photoCount
    if (remain <= 0) {
      wx.showToast({ title: '最多 40 张', icon: 'none' })
      return
    }

    let res
    try {
      res = await new Promise((resolve, reject) => {
        wx.chooseMedia({
          count: remain,
          mediaType: ['image'],
          sizeType: ['compressed'],
          success: resolve,
          fail: reject,
        })
      })
    } catch (e) {
      return // 用户取消
    }

    const files = (res.tempFiles || []).slice(0, remain)
    if (!files.length) return

    wx.showLoading({ title: `处理中 0/${files.length}`, mask: true })
    let ok = 0
    let fail = 0

    for (let i = 0; i < files.length; i++) {
      wx.showLoading({ title: `处理中 ${i + 1}/${files.length}`, mask: true })
      try {
        const compressed = await compressImage(files[i].tempFilePath)
        const key = `sites/${this.data.shareCode || 'me'}/p${Date.now()}_${i}.jpg`
        const up = await wx.cloud.uploadFile({ cloudPath: key, filePath: compressed.path })
        await api.addPhoto({
          storageKey: up.fileID || key,
          publicUrl: up.fileID || '',
          bytes: compressed.size,
          width: compressed.width,
          height: compressed.height,
        })
        ok++
      } catch (err) {
        console.error('[admin] 上传失败', err)
        fail++
      }
    }

    wx.hideLoading()
    wx.showToast({
      title: fail ? `成功 ${ok} 张，失败 ${fail} 张` : `已上传 ${ok} 张`,
      icon: fail ? 'none' : 'success',
    })
    this.load()
  },

  /** 删除照片 */
  async deletePhoto(e) {
    const id = e.currentTarget.dataset.id
    const r = await new Promise((resolve) => {
      wx.showModal({
        title: '删除这张照片？',
        content: '删除后不可恢复。',
        success: (m) => resolve(m.confirm),
        fail: () => resolve(false),
      })
    })
    if (!r) return

    try {
      const res = await api.removePhoto(id)
      if (res && res.ok) {
        wx.showToast({ title: '已删除', icon: 'success' })
        this.load()
      } else {
        wx.showToast({ title: (res && res.msg) || '删除失败', icon: 'none' })
      }
    } catch (err) {
      wx.showToast({ title: '删除失败', icon: 'none' })
    }
  },

  /** 拖动排序：上移 / 下移 */
  async movePhoto(e) {
    const { id, dir } = e.currentTarget.dataset
    try {
      await api.movePhoto(id, Number(dir))
      this.load()
    } catch (err) {
      wx.showToast({ title: '移动失败', icon: 'none' })
    }
  },

  /* ---------- AI ---------- */

  async runAi() {
    if (this.data.aiRunning) return
    const r = await new Promise((resolve) => {
      wx.showModal({
        title: 'AI 智能处理',
        content: '让 AI 看每张照片，自动写文案、分章节、配动效。\n\n已经处理过且没换图的照片会自动跳过，不重复消耗额度。',
        confirmText: '开始',
        success: (m) => resolve(m.confirm),
        fail: () => resolve(false),
      })
    })
    if (!r) return

    this.setData({ aiRunning: true, aiResult: null })
    try {
      const res = await api.aiProcessAll()
      if (res && res.ok) {
        this.setData({ aiRunning: false, aiResult: res })
        wx.showToast({ title: `处理 ${res.processed} 张`, icon: 'success' })
        this.load()
      } else {
        this.setData({ aiRunning: false })
        wx.showModal({ title: 'AI 处理失败', content: (res && res.msg) || '未知错误', showCancel: false })
      }
    } catch (err) {
      this.setData({ aiRunning: false })
      wx.showModal({ title: 'AI 调用失败', content: (err && err.message) || '', showCancel: false })
    }
  },

  previewPhoto(e) {
    const i = e.currentTarget.dataset.index
    const urls = this.data.photos.map((p) => p.url).filter(Boolean)
    wx.previewImage({ current: this.data.photos[i].url, urls })
  },

  backToInvitation() {
    wx.navigateBack({ fail: () => wx.reLaunch({ url: '/pages/index/index' }) })
  },
})

/* ---------- 工具 ---------- */

/** 把照片记录整理成页面用的形状 */
function shapePhoto(p) {
  const meta = p.reviewed || p.ai || {}
  return {
    id: p.id,
    url: p.public_url || '',
    caption: meta.caption || '',
    chapter: meta.chapter || '',
    fx: meta.fx || '',
    hasAi: !!(p.ai && p.ai.caption),
    statusText: p.status === 'approved' ? '已展示' : p.status === 'pending_review' ? '待审阅' : '草稿',
  }
}

/** ISO → <input type="datetime-local"> 用的本地格式 */
function toLocalInput(iso) {
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  if (!m) return ''
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}`
}

/**
 * 压缩并返回尺寸/体积信息。
 * 优先用 wx.compressImage（质量压缩），再用 canvas 兜底限制长边。
 * 目标：~85KB/张，与项目既有的 ffmpeg 参数（scale=720:-2, q=6）等效。
 */
function compressImage(path) {
  return new Promise((resolve, reject) => {
    wx.getImageInfo({
      src: path,
      success: (info) => {
        const scale = Math.min(1, MAX_EDGE / Math.max(info.width, info.height))
        const tw = Math.round(info.width * scale)
        const th = Math.round(info.height * scale)

        // 无需缩放，直接质量压缩
        if (scale >= 1) {
          wx.compressImage({
            src: path,
            quality: 80,
            success: (r) => resolveSize(r.tempFilePath, tw, th, resolve, reject),
            fail: () => resolveSize(path, tw, th, resolve, reject),
          })
          return
        }

        // 需要缩边：用 canvas 重绘
        const canvas = wx.createOffscreenCanvas({ type: '2d', width: tw, height: th })
        const ctx = canvas.getContext('2d')
        const img = canvas.createImage()
        img.onload = () => {
          ctx.drawImage(img, 0, 0, tw, th)
          wx.canvasToTempFilePath({
            canvas,
            fileType: 'jpg',
            quality: 0.82,
            success: (r) => resolveSize(r.tempFilePath, tw, th, resolve, reject),
            fail: () => resolveSize(path, tw, th, resolve, reject),
          })
        }
        img.onerror = () => resolveSize(path, tw, th, resolve, reject)
        img.src = path
      },
      fail: () => reject(new Error('读取图片失败')),
    })
  })
}

/** 取压缩产物的真实体积 */
function resolveSize(path, width, height, resolve, reject) {
  wx.getFileSystemManager().stat({
    path,
    success: (st) => resolve({ path, width, height, size: st.stats.size }),
    fail: () => {
      // 拿不到体积就别拦，让上传继续
      resolve({ path, width, height, size: 0 })
    },
  })
}
