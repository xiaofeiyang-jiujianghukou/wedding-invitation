export interface StoryItem {
  date: string
  title: string
  text: string
}

export interface GalleryItem {
  /** 照片路径，如 /photos/p1.jpg；留空则显示占位色块 */
  src: string
  caption: string
}

export interface ScheduleItem {
  time: string
  event: string
}

/** 所有婚礼相关内容只改这里，不用动组件代码 */
export const config = {
  groom: '阿哲',
  bride: '小满',
  coverLine: '从心动，到古稀',
  weddingDate: '2027-05-01T11:00:00+08:00',
  venue: {
    name: '示例酒店·宴会厅',
    address: '北京市朝阳区示例路 1 号',
    longitude: 116.4074,
    latitude: 39.9042,
  },
  /** 背景音乐路径，如 /music/bgm.mp3；留空则不显示音乐按钮 */
  music: '',
  story: [
    { date: '2021 年春', title: '初见', text: 'placeholder——在这里写下你们第一次见面的故事。' },
    { date: '2022 年夏', title: '在一起', text: 'placeholder——告白那天的细节，当时的心情。' },
    { date: '2026 年秋', title: '求婚', text: 'placeholder——单膝跪地的那一刻。' },
  ] as StoryItem[],
  gallery: [
    { src: '', caption: '第一张照片' },
    { src: '', caption: '一起旅行' },
    { src: '', caption: '日常碎片' },
    { src: '', caption: '订婚照' },
    { src: '', caption: '领证那天' },
    { src: '', caption: '婚纱照' },
  ] as GalleryItem[],
  schedule: [
    { time: '10:30', event: '宾客签到' },
    { time: '11:00', event: '婚礼仪式' },
    { time: '12:00', event: '婚宴开始' },
    { time: '14:00', event: '送宾' },
  ] as ScheduleItem[],
  endingThanks: '感谢每一位远道而来的你，\n见证我们人生最重要的这一天。',
}
