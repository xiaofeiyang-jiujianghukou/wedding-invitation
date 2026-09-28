/**
 * 所有婚礼相关内容只改这里，不用动页面代码。
 * 与 H5 版 src/config.ts 保持一致。
 *
 * 相册图片：miniprogram/images/p01.jpg ~ p20.jpg
 * 想换成自己的照片：用同样文件名覆盖即可，代码不用改。
 */
module.exports = {
  groom: '阿哲',
  bride: '小满',
  coverLine: '从心动，到古稀',
  // 占位日期，改这里即可
  weddingDate: '2027-05-01T11:00:00+08:00',
  venue: {
    name: '示例酒店·宴会厅',
    address: '北京市朝阳区示例路 1 号',
    longitude: 116.4074,
    latitude: 39.9042,
  },
  /**
   * 背景音乐：云存储公读地址或 fileID。留空 '' 则不显示音乐按钮。
   *
   * 已内置一首 AI 合成的轻柔音乐盒圆舞曲《轻轻的约定》（76s 无缝循环）：
   *   cloud bucket 「wedding」（public）→ audio/bgm_loop.mp3
   *
   * 想换成你们自己的歌：
   *   1. 上传：tcb storage objects upload 你的歌.mp3 audio/bgm.mp3 -b wedding
   *      （或微信开发者工具 → 云开发 → 存储 → wedding 桶 → 上传）
   *   2. 地址 = https://{envId}.api.tcloudbasegateway.com/v1/storages/object/public/wedding/你的对象名
   *   3. 把下面的 URL 换掉即可
   * ⚠️ 不要把 mp3 放进 miniprogram/（一首歌 3~5MB，必超 2MB 包体上限）
   */
  music: 'https://xiaofeiyang-d3gx5ou5k7fe078eb.api.tcloudbasegateway.com/v1/storages/object/public/wedding/audio/bgm_loop.mp3',
  story: [
    { date: '2021 年春', title: '初见', text: 'placeholder——在这里写下你们第一次见面的故事。' },
    { date: '2022 年夏', title: '在一起', text: 'placeholder——告白那天的细节，当时的心情。' },
    { date: '2026 年秋', title: '求婚', text: 'placeholder——单膝跪地的那一刻。' },
  ],
  /**
   * 相册：20 张，分 5 段叙事。
   * 连续几张 chapter 相同即归为同一章节，相册顶部显示章节名。
   * ⚠️ caption 与画面一一对应（已逐张核对），换图时记得同步改文案。
   *
   * 每张两个动效字段，按画面气质自由搭配：
   *
   * dir = 该张退场的方向（飞出），入场自动取反方向：
   *   left   往左飞出（被风带走）      right  往右飞出
   *   up     向上升起（升华、仰望）    down   向下沉落（沉淀、安静）
   *   lu     左上飞出（轻盈）          ru     右上飞出
   *   ld     左下飞出                  rd     右下飞出
   *
   * fx = 驻留期间的运镜（飞入停稳后开始，缓缓呼吸）：
   *   zoom 推近  pull 拉远  pan-l/pan-r 横摇  tilt 旋正
   *   rise 上摇  sink 俯冲  bloom 柔光绽放
   *
   * kaleido = true 开启万花筒（四镜像旋转绽放），适合对称构图。
   */
  gallery: [
    // —— 第一章 · 初见：相遇的那些瞬间 ——
    { src: '/images/p01.jpg', caption: '街角的第一眼', chapter: '初见', dir: 'left', fx: 'zoom' },
    { src: '/images/p02.jpg', caption: '咖啡凉了也没发觉', chapter: '初见', dir: 'down', fx: 'pull' },
    { src: '/images/p03.jpg', caption: '你笑起来的样子', chapter: '初见', dir: 'lu', fx: 'bloom', kaleido: true },
    { src: '/images/p06.jpg', caption: '话没说完，手先牵上了', chapter: '初见', dir: 'right', fx: 'tilt' },

    // —— 第二章 · 相恋：一起走过的四季 ——
    { src: '/images/p05.jpg', caption: '海边的黄昏', chapter: '相恋', dir: 'right', fx: 'pan-l' },
    { src: '/images/p07.jpg', caption: '靠在你肩上睡着了', chapter: '相恋', dir: 'left', fx: 'sink' },
    { src: '/images/p08.jpg', caption: '落叶下的野餐', chapter: '相恋', dir: 'up', fx: 'rise' },
    { src: '/images/p18.jpg', caption: '那晚雨很大，伞很小', chapter: '相恋', dir: 'down', fx: 'bloom' },

    // —— 第三章 · 同行：把日子过成诗 ——
    { src: '/images/p09.jpg', caption: '天台的晚风', chapter: '同行', dir: 'ru', fx: 'pan-r' },
    { src: '/images/p19.jpg', caption: '一起做的第一顿饭', chapter: '同行', dir: 'left', fx: 'zoom' },
    { src: '/images/p10.jpg', caption: '初雪的那条小路', chapter: '同行', dir: 'ld', fx: 'pan-l' },
    { src: '/images/p12.jpg', caption: '落雪那天，靠得很近', chapter: '同行', dir: 'down', fx: 'pull' },

    // —— 第四章 · 约定：从求婚到点头 ——
    { src: '/images/p11.jpg', caption: '单膝落地的那一秒', chapter: '约定', dir: 'up', fx: 'rise' },
    { src: '/images/p13.jpg', caption: '这枚戒指等了很久', chapter: '约定', dir: 'rd', fx: 'pull' },
    { src: '/images/p20.jpg', caption: '星空下的约定', chapter: '约定', dir: 'up', fx: 'bloom' },
    { src: '/images/p14.jpg', caption: '答案是，我愿意', chapter: '约定', dir: 'right', fx: 'tilt' },

    // —— 第五章 · 此刻：婚礼与往后 ——
    { src: '/images/p15.jpg', caption: '成为你的新娘', chapter: '此刻', dir: 'left', fx: 'zoom' },
    { src: '/images/p16.jpg', caption: '第一支舞', chapter: '此刻', dir: 'ru', fx: 'bloom', kaleido: true },
    { src: '/images/p04.jpg', caption: '走向礼堂的那条路', chapter: '此刻', dir: 'right', fx: 'sink' },
    { src: '/images/p17.jpg', caption: '走向很远的以后', chapter: '此刻', dir: 'lu', fx: 'pan-r' },
  ],
  schedule: [
    { time: '10:30', event: '宾客签到' },
    { time: '11:00', event: '婚礼仪式' },
    { time: '12:00', event: '婚宴开始' },
    { time: '14:00', event: '送宾' },
  ],
  endingThanks: '感谢每一位远道而来的你，\n见证我们人生最重要的这一天。',
}
