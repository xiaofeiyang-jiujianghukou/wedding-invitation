/**
 * claimSite —— 「归位」：把现有请柬内容登记到当前微信用户（openid）名下
 *
 * 背景：项目原有的婚礼内容写死在 miniprogram/config.js 里。
 * 这个函数做一次性迁移 —— 你进小程序点一下，内容就落到你自己 openid 名下，
 * 之后可以在后台随意修改，不用再改代码发版。
 *
 * 幂等设计：已经有站点了默认不覆盖（force=false），
 * 所以你多点几次也不会把改过的内容冲掉。
 *
 * 身份：只信 context.OPENID（微信注入）。
 */
const { ensureSite, resolveOpenid } = require('./_shared')

exports.main = async (event, context) => {
  const ctx = context || {}
  // 身份解析（原生注入 → 调试后门 → code2Session），详见 _shared.js
  const openid = await resolveOpenid(ctx, event)
  if (!openid) return { ok: false, msg: '无法识别身份，请在小程序内使用' }

  const force = Boolean(event.force)

  try {
    const result = await ensureSite(openid, force)
    return {
      ok: true,
      created: result.created,
      share_code: result.site.share_code,
      profile_keys: Object.keys(result.site.profile || {}),
      photos_added: result.photosAdded,
      photos_total: result.photosTotal,
      msg: result.created
        ? '已为你生成专属请柬，可直接预览和修改'
        : result.photosAdded > 0
          ? `已补齐 ${result.photosAdded} 张照片`
          : '你的请柬已就绪',
    }
  } catch (err) {
    console.error('[claimSite]', err)
    return { ok: false, msg: err.message }
  }
}

/**
 * 确保该 openid 拥有一份完整的请柬。
 *
 * 新人首次进入 → 自动「开箱」：开好账号、把默认模板（含 20 张照片）同步过去，
 * 让他一进来就能看到一份成型的请柬，再按自己心意去改。
 *
 * 幂等：已有站点且内容非空 → 不覆盖（除非 force）。照片按 storage_key 去重。
 * siteManage 的 load action 也会调用它，保证任何入口进来都有内容。
 */
