/**
 * 环境自检页 —— 排查「云端内容读不到」
 *
 * 用法：把它设为启动页（app.json 里 pages 的第一项），
 *      或者从后台/首页临时 navigateTo 过来。
 *
 * 它会把「哪一环断了」直接打在屏幕上，不用去翻 Console。
 */
const api = require('../../lib/api')

Page({
  data: {
    steps: [],
    done: false,
  },

  onLoad() {
    this.run()
  },

  async run() {
    const steps = []
    const push = (name, ok, detail) => {
      steps.push({ name, ok, detail: detail || '' })
      this.setData({ steps: steps.slice() })
    }

    /* ---------- 0. 工具当前选中的环境（仅工具里可读，真机为空） ---------- */
    // 用来诊断「工具面板选的环境」和「代码里写死的 env」是否一致
    let toolEnv = ''
    try {
      // 开发者工具专有：读取当前云开发面板选中的环境
      if (wx.getAccountInfoSync) {
        const acct = wx.getAccountInfoSync()
        toolEnv = (acct && acct.miniProgram && acct.miniProgram.appId) || ''
      }
    } catch (e) { /* 忽略 */ }
    push('小程序 AppID', Boolean(toolEnv), toolEnv || '读取失败')

    /* ---------- 1. 基础库与 wx.cloud ---------- */
    const sdk = wx.getSystemInfoSync ? wx.getSystemInfoSync().SDKVersion : '未知'
    if (!wx.cloud) {
      push('wx.cloud 可用', false, `基础库 ${sdk} 无云能力（需 >= 2.2.3）`)
      this.setData({ done: true })
      return
    }
    push('wx.cloud 可用', true, `基础库 ${sdk}`)

    /* ---------- 2. 云开发是否已初始化 ---------- */
    const app = getApp()
    const envId = (app && app.globalData && app.globalData.envId) || ''
    push('云开发已初始化', Boolean(envId), envId ? `目标环境 ${envId}` : 'app.js 未设 envId')

    /* ---------- 3. 云函数 siteManage 是否可达 ---------- */
    // 走 api.loadMySite：自动带 wx.login code（授权环境靠 code2Session 认人）
    try {
      const { site, photos } = await api.loadMySite()
      push('siteManage 调用成功', true,
        `分享码 ${site && site.share_code} / 照片 ${(photos || []).length} 张` +
        (site && site.profile ? '' : ''))
    } catch (err) {
      const msg = (err && err.message) || String(err)
      push(/无法识别身份/.test(msg) ? '身份未通过（服务端拒绝）' : 'siteManage 调用失败',
        false, msg)
    }

    /* ---------- 4. 云存储是否可写（照片上传依赖） ---------- */
    try {
      await new Promise((resolve, reject) => {
        wx.cloud.getTempFileURL({
          fileList: ['cloud://probe-not-exist'],
          success: resolve,
          fail: reject,
        })
      })
      push('云存储接口可达', true, 'getTempFileURL 正常')
    } catch (err) {
      // 拿不到文件是正常的，接口本身报错才是问题
      const msg = (err && err.errMsg) || String(err)
      const apiOk = /not exist|does not exist|找不到|invalid/i.test(msg)
      push('云存储接口可达', apiOk, apiOk ? '接口正常（探测文件不存在属预期）' : msg)
    }

    this.setData({ done: true })
  },

  back() {
    wx.navigateBack({ fail: () => wx.reLaunch({ url: '/pages/index/index' }) })
  },
})
