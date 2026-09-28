// app.js
const ENV_ID = 'xiaofeiyang-d3gx5ou5k7fe078eb'

App({
  onLaunch() {
    console.log('[app] onLaunch 启动, 目标环境 =', ENV_ID)
    if (!wx.cloud) {
      console.error('[app] 基础库版本过低，没有 wx.cloud')
      return
    }
    try {
      wx.cloud.init({
        env: ENV_ID,
        traceUser: true,
      })
      console.log('[app] wx.cloud.init 完成')
    } catch (err) {
      console.error('[app] 云开发初始化失败:', err)
    }
  },
  globalData: {
    envId: ENV_ID,
  },
})
