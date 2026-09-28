/**
 * 云函数调用层。
 *
 * 小程序端与云函数同环境，wx.cloud.callFunction 直接携带微信身份，
 * 不需要匿名登录，也不受浏览器端 403 EXCEED_AUTHORITY 的限制。
 */

function call(name, data) {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name,
      data: data || {},
      success: (res) => resolve(res.result),
      fail: (err) => reject(err),
    })
  })
}

/** 提交回执 */
async function submitRsvp(rsvp) {
  return call('submitRsvp', {
    name: rsvp.name,
    phone: rsvp.phone,
    attending: rsvp.attending,
    count: rsvp.count,
    note: rsvp.note,
  })
}

/** 回执总数 */
async function rsvpCount() {
  const res = await call('getRsvpCount')
  return (res && res.count) || 0
}

/** 提交祝福 */
async function submitWish(wish) {
  return call('submitGreeting', { name: wish.name, text: wish.text })
}

/** 祝福列表 */
async function listWishes() {
  const res = await call('listGreetings')
  return (res && res.items) || []
}

module.exports = { submitRsvp, rsvpCount, submitWish, listWishes }
