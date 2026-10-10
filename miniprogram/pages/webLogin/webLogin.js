/**
 * 电脑端扫码登录 —— 手机侧确认页
 *
 * 用户在电脑上打开数据后台 → 点「微信扫码登录」→ 用微信扫屏幕上的小程序码
 * → 就打开了本页。这里只做一件事：确认「是我本人在登录」，然后把
 * scene 交给云函数换一个一次性 token，电脑那边轮询到就会自动进入后台。
 */
const api = require('../../lib/api')

Page({
  data: {
    scene: '',
    state: 'idle', // idle | busy | done | error
    msg: '',
  },

  onLoad(query) {
    const scene = decodeURIComponent((query && query.scene) || '')
    this.setData({ scene })
    if (!scene) {
      this.setData({ state: 'error', msg: '没有识别到登录请求，请回到电脑上重新扫码' })
    }
  },

  async onConfirm() {
    if (this.data.state === 'busy') return
    this.setData({ state: 'busy', msg: '' })
    try {
      const res = await api.webConfirm(this.data.scene)
      if (res && res.ok) {
        this.setData({
          state: 'done',
          msg: res.repeat ? '这个二维码已经确认过了，回到电脑上即可' : '确认成功，电脑上会自动进入后台',
        })
        wx.showToast({ title: '已确认', icon: 'success' })
      } else {
        this.setData({ state: 'error', msg: (res && res.msg) || '确认失败，请回到电脑上重新扫码' })
      }
    } catch (e) {
      this.setData({ state: 'error', msg: (e && e.message) || '网络异常，请稍后重试' })
    }
  },

  goHome() {
    wx.reLaunch({ url: '/pages/index/index' })
  },
})
