# 婚礼请柬项目交接（2026-09-28 更新）

## 背景

自建婚礼请柬。**两条前端战线共用同一套云开发后端**：

- **H5 版**：`src/`（Vue 3 + Vite + TS 单页，7 幕，GSAP/Swiper），构建产物 `dist/`，部署在 hosting
- **小程序版**：`miniprogram/`（原生 WXML/WXSS/JS，同样 7 幕），**本次新增，已完工**

后端：CloudBase PG 环境 `xiaofeiyang-d3gx5ou5k7fe078eb`（ap-shanghai，体验版，到期 2027-03-24）

## 本次完成（小程序版）

### 结论：小程序路线绕开了 H5 的 403 卡点

H5 版的遗留阻塞是 RSVP/祝福报 `403 EXCEED_AUTHORITY`，根因是体验版 PG 环境整个禁用了
「身份认证 → 权限控制」，匿名用户拿不到云函数调用权限。

**小程序不需要匿名登录** —— `wx.cloud.callFunction` 直接携带微信身份，不经过权限控制那一环。
已实测四个云函数全部正常，**无需升级套餐**。

### 已完成事项

1. **验证后端链路**：四个云函数（submitRsvp / submitGreeting / listGreetings / getRsvpCount）
   全部部署完成且可调用。数据库 rsvps / greetings / rsvp_stats 就绪。
2. **端到端读写实测通过**：模拟小程序提交 1 条回执 + 1 条祝福 → 落库确认 → 读回确认
   （测试数据已清理，现各剩 1 条「云端自测」数据）。
3. **重写 7 幕为原生小程序**：单页结构 `pages/index/`，保留 H5 的米金配色与排版。
4. **逻辑单测通过**（18 项）：倒计时、表单校验、人数步进器上下限、提交后清空、
   云端数据加载、复制地址、导航调用。
5. **工程清理**：删除空白模板的 `getOpenId` 云函数、`components/`、`images/`、
   本地 `whoami/` 残留；`cloudbaserc.json` 同步为 4 个函数条目。

## 遗留事项（需用户操作）

### 已解决：AppID 已填入

`project.config.json` 的 `appid` = `wx7f161d1665f60f8e`（2026-09-28 由用户提供）。

### 待办

- **填真实婚礼信息**：`miniprogram/config.js`（以及 H5 的 `src/config.ts`）里
  `2027-05-01T11:00:00+08:00`、`阿哲/小满`、`示例酒店` 均为占位
- **放照片**：`miniprogram/images/` + `config.gallery[].src`
- **放音乐**：`miniprogram/audio/` + `config.music`
- **下一步：导入微信开发者工具并真机预览**，验证 `wx.cloud.callFunction`
  在真机环境下的实际表现（本地已验证云函数可调用，但真机链路需实机确认）
- **H5 版 403 仍未解决**：若还想让 H5 链接可用，需按旧方案升级套餐解锁权限控制
  （手动支付变配价 ¥116.55）。**但小程序版不需要这一步。**

## 常用命令与路径

- CLI 不在 PATH：`CB=/home/xiaofeiyang/QoderWorkSpace/wedding-invitation/node_modules/.bin/cloudbase`
- 部署小程序云函数：`$CB fn deploy <name> -e xiaofeiyang-d3gx5ou5k7fe078eb`
- 调用云函数（免控制台）：`$CB fn invoke <name> -e xiaofeiyang-d3gx5ou5k7fe078eb --params '{}'`
- 查 PG：`$CB api tcb ExecutePGSql --api-version 2018-06-08 --body '{"EnvId":"xiaofeiyang-d3gx5ou5k7fe078eb","Sql":"..."}'`
- 部署 H5：`npm run build` 后 `$CB hosting deploy dist -e xiaofeiyang-d3gx5ou5k7fe078eb`
- ⚠️ 不要跑 `$CB config init fn`：会往 `cloudbaserc.json` 塞垃圾 `my-function` 条目

## 项目结构要点

- `miniprogram/config.js`：婚礼内容唯一配置入口（纯 CommonJS）
- `miniprogram/lib/api.js`：`wx.cloud.callFunction` 封装，无 localStorage 降级（小程序环境无需）
- `miniprogram/lib/date.js`：手动解析 ISO 日期（避开 iOS `new Date()` 兼容坑）
- `cloudbaserc.json`：envId + functionRoot + 4 个函数条目
- PG `anon` 角色权限（GRANT+RLS 已验证）：INSERT `rsvps`、SELECT `rsvp_stats` 视图、
  INSERT/SELECT `greetings`；匿名 JWT claims：`is_anonymous:true, scope:"anonymous", role:"anon"`
- H5 版 `src/lib/store.ts`：云端失败降级 localStorage（`wedding:rsvps` / `wedding:wishes`）

## 已排除的路线（不要重走）

- **OPA 策略**（`tcb policy set`）：对 callFunction 链不生效
- **旧版 JSON 安全规则 / ModifyResourcePermission**：API 明确拒绝 PG 环境
- **HTTP 路由**（`tcb routes add`）：默认 HTTP 域名系统托管，禁止手动加路由
- **PG HTTP API**（`/v1/rdb/rest`）：鉴权要账号级 AccessToken，不能下发到浏览器
- **web-view 套 H5**：个人主体小程序不支持 web-view
