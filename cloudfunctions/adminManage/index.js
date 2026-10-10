/**
 * adminManage —— 后台数据看板 + 留言 / 回执管理（仅站点制作人可调）
 *
 * 身份（两条通道，任一通过即可）：
 *   A. 小程序内调用：openid 必须是某个站点的 owner_openid
 *   B. PC 网页调用  ：携带 webLogin 扫码签发的一次性 token（12 小时有效）
 * 数据：以 service_role 直连 PG（绕过 RLS）读取统计视图与原始表。
 *
 * 本函数在云函数安全规则里被显式放开（invoke=true），所以鉴权必须在这里做死。
 *
 * actions：
 *   stats          概览四数 + 近 14 天趋势 + 传播链 Top + 浏览深度分布
 *   listGreetings  留言列表（分页，含 id 供删除）
 *   deleteGreeting 删除一条留言（带 site_id 条件防越权）
 *   listRsvps      回执名单 + 汇总
 *   exportRsvps    回执导出 CSV 文本
 *   exportGreetings 留言导出 CSV 文本
 */
const { admin, resolveOpenid } = require('./_shared')

const PAGE_SIZE = 20
const TREND_DAYS = 14

/* ---------- 小工具 ---------- */

/** 时区已按东八区切天视图给好；这里把 ISO 时间格式化成「MM-DD HH:mm」 */
function fmtTime(iso) {
  if (!iso) return ''
  const d = new Date(new Date(iso).getTime() + 8 * 3600 * 1000)
  return d.toISOString().slice(0, 16).replace('T', ' ')
}

function csvCell(v) {
  const s = String(v === null || v === undefined ? '' : v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function toCsv(headers, rows) {
  // BOM：让 Excel 正确识别 UTF-8 中文
  return '\ufeff' + [headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')
}

/** 上海时区的今天（YYYY-MM-DD），用于趋势过滤 */
function todaySh() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10)
}

exports.main = async (event, context) => {
  try {
    /* ---------- 身份 + 站点归属校验（两条通道） ---------- */
    let openid = await resolveOpenid(context || {}, event)
    let site = null

    if (openid) {
      /* 通道 A：小程序内调用（wx.login → code2Session） */
      const sites = await admin('sites', {
        query: `?owner_openid=eq.${encodeURIComponent(openid)}&select=id,share_code,status&limit=1`,
      })
      if (!sites || !sites.length) return { ok: false, msg: '还没有属于你的请柬' }
      site = sites[0]
    } else if (event && event.token) {
      /* 通道 B：PC 网页 —— webLogin 扫码确认后签发的一次性 token */
      const rows = await admin('web_sessions', {
        query: `?token=eq.${encodeURIComponent(event.token)}&status=eq.confirmed`
          + '&select=site_id,expires_at,openid&limit=1',
      })
      const row = rows && rows[0]
      if (!row) return { ok: false, needLogin: true, msg: '登录已失效，请重新扫码' }
      if (new Date(row.expires_at).getTime() < Date.now()) {
        return { ok: false, needLogin: true, msg: '登录已过期，请重新扫码' }
      }
      const sites = await admin('sites', {
        query: `?id=eq.${row.site_id}&select=id,share_code,status&limit=1`,
      })
      if (!sites || !sites.length) return { ok: false, msg: '站点不存在' }
      site = sites[0]
      // 网页通道也要补回 openid：传播链要据此把"我自己的 vid"标出来
      if (row.openid) openid = row.openid
    } else {
      return { ok: false, msg: '请在小程序内使用' }
    }

    const siteId = site.id

    const action = (event && event.action) || 'stats'
    const sid = `site_id=eq.${siteId}`

    /* ================= 数据概览 ================= */
    if (action === 'stats') {
      const [overview, daily, sources, depth] = await Promise.all([
        admin('site_stats', { query: `?${sid}&select=pv,uv,greetings,rsvps&limit=1` }),
        admin('visit_daily', { query: `?${sid}&select=day,pv,uv&order=day.asc` }),
        admin('visit_sources', { query: `?${sid}&select=from_vid,visitors&order=visitors.desc&limit=10` }),
        admin('visit_depth', { query: `?${sid}&select=max_stage,visitors&order=max_stage.asc` }),
      ])

      // 趋势只看最近 TREND_DAYS 天（缺失的日期补 0，前端画柱状更整齐）
      const since = new Date(Date.now() + 8 * 3600 * 1000 - (TREND_DAYS - 1) * 86400000)
        .toISOString().slice(0, 10)
      const byDay = new Map((daily || []).map((d) => [String(d.day).slice(0, 10), d]))
      const trend = []
      for (let i = TREND_DAYS - 1; i >= 0; i--) {
        const day = new Date(Date.now() + 8 * 3600 * 1000 - i * 86400000).toISOString().slice(0, 10)
        const row = byDay.get(day)
        trend.push({ day, pv: row ? row.pv : 0, uv: row ? row.uv : 0 })
      }

      // 传播链：把分享者 vid 关联到姓名（该访客留过言或交过回执就能认出）
      const list = sources || []
      let nameByVid = {}
      if (list.length) {
        const vids = list.map((s) => s.from_vid).filter(Boolean)
        const inClause = `in.(${vids.map((v) => `"${v}"`).join(',')})`
        const [g, r] = await Promise.all([
          admin('greetings', { query: `?${sid}&vid=${encodeURIComponent(inClause)}&select=vid,name&limit=200` }),
          admin('rsvps', { query: `?${sid}&vid=${encodeURIComponent(inClause)}&select=vid,name&limit=200` }),
        ])
        ;[...(g || []), ...(r || [])].forEach((row) => {
          if (row.vid && row.name && !nameByVid[row.vid]) nameByVid[row.vid] = row.name
        })
      }
      // 制作人自己的 vid：传播链里那一条其实是"我自己转发出去的"，
      // 不能显示成"未留名"，否则自己都认不出谁带来的访客。
      // 注意：删掉小程序重进会清空本地 storage → 生成新 vid，
      // 所以必须把「我名下出现过的所有 vid」都算自己，不能只取最新一条。
      const myVids = new Set()
      try {
        const mine = await admin('visits', {
          query: `?${sid}&openid=eq.${encodeURIComponent(openid)}&select=vid&limit=50`,
        })
        ;(mine || []).forEach((r) => { if (r.vid) myVids.add(r.vid) })
      } catch (e) { /* 拿不到就不标注，不影响主流程 */ }

      const spread = list.map((s) => ({
        vid: s.from_vid,
        name: s.from_vid && myVids.has(s.from_vid) ? '我（我转发出去的）' : (nameByVid[s.from_vid] || ''),
        self: !!(s.from_vid && myVids.has(s.from_vid)),
        visitors: s.visitors,
      }))

      // 浏览深度：补全 0..6
      const depthMap = new Map((depth || []).map((d) => [Number(d.max_stage), d.visitors]))
      const stages = []
      for (let i = 0; i <= 6; i++) {
        stages.push({ stage: i, visitors: depthMap.get(i) || 0 })
      }

      return {
        ok: true,
        site: { id: site.id, share_code: site.share_code, status: site.status },
        overview: (overview && overview[0]) || { pv: 0, uv: 0, greetings: 0, rsvps: 0 },
        today: trend[trend.length - 1] || { day: todaySh(), pv: 0, uv: 0 },
        trend,
        spread,
        depth: stages,
      }
    }

    /* ================= 留言 ================= */
    if (action === 'listGreetings') {
      const offset = Math.max(0, Number(event.offset) || 0)
      // 多取一条判断还有没有下一页
      const rows = await admin('greetings', {
        query: `?${sid}&select=id,name,text,vid,created_at&order=created_at.desc&offset=${offset}&limit=${PAGE_SIZE + 1}`,
      })
      const list = rows || []
      const hasMore = list.length > PAGE_SIZE
      const items = list.slice(0, PAGE_SIZE).map((r) => ({
        id: r.id, name: r.name, text: r.text, vid: r.vid || '', time: fmtTime(r.created_at),
      }))
      const stat = await admin('greeting_stats', { query: `?${sid}&select=total&limit=1` })
      return { ok: true, items, hasMore, total: (stat && stat[0] && stat[0].total) || 0 }
    }

    if (action === 'deleteGreeting') {
      const id = event.id
      if (id === undefined || id === null || id === '') return { ok: false, msg: '缺少留言 id' }
      await admin('greetings', {
        method: 'DELETE',
        query: `?id=eq.${encodeURIComponent(id)}&${sid}`,
      })
      return { ok: true }
    }

    /* ================= 回执 ================= */
    if (action === 'listRsvps') {
      const [rows, sum] = await Promise.all([
        admin('rsvps', {
          query: `?${sid}&select=id,name,phone,attending,guest_count,note,created_at&order=created_at.desc&limit=200`,
        }),
        admin('rsvp_summary', { query: `?${sid}&select=total,attending,absent,guests&limit=1` }),
      ])
      const items = (rows || []).map((r) => ({
        id: r.id,
        name: r.name,
        phone: r.phone,
        attending: r.attending,
        count: r.guest_count,
        note: r.note,
        time: fmtTime(r.created_at),
      }))
      return {
        ok: true,
        items,
        summary: (sum && sum[0]) || { total: 0, attending: 0, absent: 0, guests: 0 },
      }
    }

    if (action === 'exportRsvps') {
      const rows = await admin('rsvps', {
        query: `?${sid}&select=name,phone,attending,guest_count,note,created_at&order=created_at.asc&limit=1000`,
      })
      const csv = toCsv(
        ['姓名', '手机', '是否到场', '同行人数', '留言', '提交时间'],
        (rows || []).map((r) => [
          r.name, r.phone, r.attending ? '准时到场' : '遗憾缺席',
          r.guest_count, r.note, fmtTime(r.created_at),
        ]),
      )
      return { ok: true, csv, filename: '回执名单.csv' }
    }

    if (action === 'exportGreetings') {
      const rows = await admin('greetings', {
        query: `?${sid}&select=name,text,created_at&order=created_at.asc&limit=1000`,
      })
      const csv = toCsv(
        ['姓名', '祝福内容', '时间'],
        (rows || []).map((r) => [r.name, r.text, fmtTime(r.created_at)]),
      )
      return { ok: true, csv, filename: '祝福留言.csv' }
    }

    return { ok: false, msg: '未知操作: ' + action }
  } catch (err) {
    console.error('[adminManage]', event && event.action, err)
    return { ok: false, msg: err.message }
  }
}
