/** 把 Date 格式化成小程序可用的展示字段 */
function parseWeddingDate(iso) {
  // 小程序 iOS 对 'YYYY-MM-DDTHH:mm:ss+08:00' 解析不稳，手动拆
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  if (!m) return null
  const [, y, mo, d, h, mi] = m
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
  const date = new Date(`${y}/${mo}/${d} ${h}:${mi}:00`)
  return {
    year: +y,
    month: +mo,
    day: +d,
    hour: h,
    minute: mi,
    weekday: weekdays[date.getDay()],
    /** 用于倒计时的毫秒时间戳 */
    timestamp: date.getTime(),
    /** 例：2027年5月1日 星期六 11:00 */
    text: `${y}年${+mo}月${+d}日 ${weekdays[date.getDay()]} ${h}:${mi}`,
  }
}

/** 倒计时拆成天/时/分/秒 */
function breakdown(diff) {
  const d = Math.max(0, diff)
  return {
    d: Math.floor(d / 86400000),
    h: Math.floor((d % 86400000) / 3600000),
    m: Math.floor((d % 3600000) / 60000),
    s: Math.floor((d % 60000) / 1000),
  }
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

module.exports = { parseWeddingDate, breakdown, pad2 }
