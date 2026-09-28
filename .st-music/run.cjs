/**
 * BGM 功能行为测试：
 *   MUSIC_ON=1 node run.cjs  → 测已配置 fileID 的完整生命周期
 *   MUSIC_ON=0 node run.cjs  → 测未配置时不创建音频、按钮不出现
 */
const path = require('path')

const MINI = path.resolve(__dirname, 'mp')
const MUSIC_ON = process.env.MUSIC_ON === '1'
const FILE_ID = 'cloud://xiaofeiyang-d3gx5ou5k7fe078eb.xxxx/audio/bgm.mp3'

/* ---- wx stub ---- */
const audioInstances = []
const toasts = []
function makeAudio() {
  const h = {}
  const a = {
    src: '', loop: false, volume: 1, obeyMuteSwitch: true, autoplay: false,
    onPlay(fn) { h.play = fn },
    onPause(fn) { h.pause = fn },
    onStop(fn) { h.stop = fn },
    onError(fn) { h.error = fn },
    play() { a._plays++; h.play && h.play() },
    pause() { a._pauses++; h.pause && h.pause() },
    destroy() { a._destroyed = true },
    _plays: 0, _pauses: 0, _destroyed: false, _h: h,
  }
  return a
}
global.wx = {
  createInnerAudioContext: () => { const a = makeAudio(); audioInstances.push(a); return a },
  showToast: (o) => toasts.push(o),
}

/* ---- Page stub：捕获定义，稍后手工实例化 ---- */
let pageDef = null
global.Page = (def) => { pageDef = def }

/* 计时器 stub（防止测试进程挂住，也方便断言） */
const ivCount = { on: 0 }
const realSetInterval = global.setInterval
global.setInterval = () => { ivCount.on++; return 123 }
global.clearInterval = () => {}

/* ---- 先载入 config 并按需注入音乐，再载入页面 ---- */
const config = require(path.join(MINI, 'config.js'))
if (MUSIC_ON && !config.music) config.music = FILE_ID
if (!MUSIC_ON) config.music = '' // 强制模拟未配置
require(path.join(MINI, 'pages', 'index', 'index.js'))

/* 实例化 page */
const page = Object.create(pageDef)
page.data = JSON.parse(JSON.stringify(pageDef.data))
page.setData = function (patch) { Object.assign(this.data, patch) }

let pass = 0, fail = 0
function t(name, cond) {
  if (cond) { pass++; console.log('  OK ', name) }
  else { fail++; console.log('  FAIL', name) }
}

if (!MUSIC_ON) {
  console.log('— 音乐未配置（config.music = ""）—')
  t('data.music 为空 → WXML 条件不成立，按钮不渲染', page.data.music === '')
  page.initMusic()
  t('initMusic 不创建音频实例', audioInstances.length === 0)
  t('playing 保持 false', page.data.playing === false)
  page.toggleMusic()
  t('toggleMusic 空实现不崩溃', true)
} else {
  console.log('— 音乐已配置（cloud:// fileID）—')
  t("data.music 透传 → WXML 条件成立", page.data.music === config.music && !!page.data.music)

  page.initMusic()
  t('创建 1 个 InnerAudioContext', audioInstances.length === 1)
  const a = audioInstances[0]
  t("src = config.music（云地址直接可播）", a.src === config.music)
  t('loop 循环播放', a.loop === true)
  t('volume 0.55（不吵）', a.volume === 0.55)
  t('obeyMuteSwitch=false（iOS 静音键也出声）', a.obeyMuteSwitch === false)
  t('autoplay=true（尝试自动播放）', a.autoplay === true)

  console.log('— 自动播放成功路径 —')
  a.play()
  t('onPlay 回调 → playing=true（按钮转起来）', page.data.playing === true)

  console.log('— 手动暂停 / 续播 —')
  page.toggleMusic()
  t('播放中点按钮 → 调 pause', a._pauses === 1)
  a.pause() // 模拟回调到达
  t('onPause 回调 → playing=false', page.data.playing === false)
  page.toggleMusic()
  t('再点 → 调 play（累计 2 次）', a._plays === 2)

  console.log('— 播放失败提示 —')
  toasts.length = 0
  page._musicTapAt = Date.now()
  a._h.error && a._h.error(new Error('x'))
  t('点击后 3s 内报错 → 弹 toast', toasts.length === 1)
  toasts.length = 0
  page._musicTapAt = Date.now() - 60000
  a._h.error && a._h.error(new Error('x'))
  t('非点击期报错（如自动播放被拦）→ 不打扰用户', toasts.length === 0)

  console.log('— 切后台 / 回前台 —')
  a.play() // onError 已把 playing 置回 false，先恢复播放态
  t('恢复播放态', page.data.playing === true)
  page.onHide()
  t(' onHide：音乐暂停且记住待续播', a._pauses === 3 && page._resumeMusic === true)
  page.onShow()
  t('onShow：自动续播（play 累计 4 次）', a._plays === 4 && page._resumeMusic === false)

  console.log('— 页面卸载 —')
  page.onUnload()
  t('onUnload：destroy 音频不泄漏', a._destroyed === true)
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`)
process.exit(fail ? 1 : 0)
