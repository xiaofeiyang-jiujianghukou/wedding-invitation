# 项目长期备忘

## 概况
自建婚礼请柬，双前端共用一套 CloudBase 后端：H5 `src/`+`dist/`（Vue3+Vite）；小程序 `miniprogram/`（原生）。
云环境 `xiaofeiyang-d3gx5ou5k7fe078eb`（ap-shanghai，体验版，到期 2027-03-24）；AppID `wx7f161d1665f60f8e`（个人主体）。

## 环境坑（必读）
- **沙箱无 git/ssh**，用宿主链路推送：`GIT_EXEC_PATH=/host/usr/lib/git-core GIT_SSH_COMMAND="/host/usr/bin/ssh -i /home/xiaofeiyang/.ssh/id_ed25519 -o UserKnownHostsFile=/home/xiaofeiyang/.ssh/known_hosts -o StrictHostKeyChecking=accept-new" /host/usr/bin/git push origin main`（HOME 会漂到 /root，key 必须绝对路径）。remote `git@github.com:xiaofeiyang-jiujianghukou/wedding-invitation.git`；`_assets/` 与 `.st-admin/` 已 gitignore。
- 根 `package.json` 的 `"type":"module"` 会**污染子目录** → 本地 require 小程序文件需在临时目录放 `{"type":"commonjs"}`（小程序运行时不受影响）。
- CLI 在 `node_modules/.bin/cloudbase`；**`/tmp` 只有 10MB 且会被清空**（装包先 `TMPDIR=<工作区>`，脚本放工作区内）。
- 别跑 `cloudbase config init fn`（往 cloudbaserc.json 塞垃圾）。

## 多租户 SaaS
- 一行 `sites` = 一对新人，`owner_openid` 天然隔离；内容优先级 **云端 > 本地**（`config.js` 仅兜底）。
- 🚨 **改婚礼内容走小程序后台 `pages/admin` 改云端**，不再改 `config.js`。七幕/配色/动效逻辑不变，只换数据源。
- 已发布：share_code `5estew`（许飞杨&盛小洋，婚期 2027-02-10，status=published 由 SQL 直改；转草稿 = `UPDATE status='draft'`）。
- 转发：index `onShareAppMessage/onShareTimeline`，path `?code=<share_code>&from=<vid>`（可裂变）；分享码随 config 走；尾幕 `open-type="share"`。
- ⚠️ 转发仅体验版/正式版可用，体验版限「体验成员」（公众平台-成员管理添加）；小程序码落地页未做。
- 新用户「自动开箱」：`ensureSite` 幂等建号 + 铺默认模板（阿哲&小满 20 图），**已有内容一律不覆盖**。

## 云函数
| 函数 | 职责 | 身份 |
|---|---|---|
| `siteManage` | 制作人读写（load/saveProfile/saveMusic/publish/照片增删移） | openid |
| `getPublicSite` | 宾客只读（按 share_code，仅 published+approved） | 公开 |
| `claimSite` | 存量内容归位 | openid |
| `aiProcessPhotos` | AI 看图出文案/分章/动效（差量，未变不重算） | openid |
| `submitRsvp`/`getRsvpCount`/`submitGreeting`/`listGreetings` | 回执与祝福 | 公开 |
| `reportVisit` | 访客上报（vid/from/stage，5 分钟窗口合并） | 公开 |
| `adminManage` | 后台（stats/listGreetings/deleteGreeting/listRsvps/export*） | openid **或网页 token** |
| `webLogin` | PC 扫码登录（create/poll/confirm） | 网页 create+poll；小程序 confirm |

- **云函数不能跨函数 require** → `_shared.js`+`seed.json` 每目录各放一份（siteManage/claimSite/reportVisit/adminManage/webLogin）。
- 🚨 **网页端（Web SDK）调云函数默认 403 `EXCEED_AUTHORITY`**：云函数默认安全规则
  `{"*":{"invoke":"auth != null && auth.loginType != 'ANONYMOUS'"}}` 排除匿名用户。
  `webLogin`/`adminManage` 已显式 `invoke:true`（**鉴权在函数内部自己做死**）；今后新增"网页可调"的
  函数必须同步改规则，否则**网页挂、小程序却一切正常** —— 极难查。
- 🚨 **新增云函数必须同步 `deploy.py` 的 `need_wx`/`need_key` 名单**，漏了照样"部署成功"，
  但运行时拿不到 `WX_SECRET`（→ 一律「请在小程序内使用」）或 API Key（→ 读库全空）。
  **判据：写进去了、读不出来 → 先查读侧函数的部署配置，别先怀疑库。**（2026-10-10 实际踩过：adminManage 漏配，
  宾客端 reportVisit 正常落库，只有后台看板全空，被误判成"没落库"）。selftest T63 跨文件比对防复发。
- 访客口径：**排除制作人自己的浏览**（视图 `v.openid is distinct from s.owner_openid`），
  但**保留他那一行**——他的 vid 要给分享路径当 `from_vid`，否则他直接分享来的人无法归因；
  UV 用 `count(distinct coalesce(nullif(openid,''), vid))`，否则取不到身份的宾客会塌成一个人。
- 身份只信 `context.OPENID`；`event.__openid` 仅 `ALLOW_DEBUG_OPENID=1` 时生效（线上绝不设）。
- 本环境**不注入 `context.OPENID`** → 前端 `wx.login` 取 code，服务端 `code2Session` 换（api.js `AUTHED_FNS`）。
- 后台保存成功 → `getApp().globalData.profileDirty = true` → 首页 `onShow` 重新 `applyCloudContent()`。

## 关键约定与踩坑
- 配色：`--ivory #faf6ef` / `--paper #fffdf8` / `--gold #b8935e` / `--gold-deep #9a7743` / `--ink #3a332a` / `--ink-soft #6f6557` / `--rose #c98a7d`
- 七幕：封面→故事→相册→信息→RSVP→祝福→尾幕；**顶层竖向整屏 swiper**（非长滚动），每幕 100vh，幕内 `.rise`+`.d1~.d4` 错峰。
- 相册全屏出血；20 张分 5 章（`chapter` 驱动）；文案浮层**只一份**绑 `config.gallery[galleryIndex].caption`；
  8 种运镜 `fx`（zoom/pull/pan-l/pan-r/tilt/rise/bloom/sink）；**每张 5400ms = 飞入 1800 + 驻留 3600**（`GALLERY_INTERVAL`），运镜 delay 1800 / duration 5100。
- 🚨 **swiper 陷阱**：swiper 给自己 swiper-item 设 transform，**覆盖**写在 swiper-item 或其直接子元素上的 transform 动画（现象＝动画无效只剩平移）。
  **修法：多包一层 `.shot-anim`，动画只打内层**；opacity/filter 不受影响。
- 🚨 相册动画必须绑「当前张」`{{galleryIndex === index ? 'live' : ''}}`，否则只播一次；文案重播靠单元素循环重建节点。
- 🚨 **切图抖动根因＝飞出/飞入同帧重叠** → **旧图 `hold` 静驻不飞出**（flyOut 规则已删）。原则：任意时刻只让一张图做大位移动画。
- 🚨 **swiper 程序化跳转必须绑 `current="{{current}}"`**（踩三轮：只挂 bindchange 则所有 `setData({current})` 是空操作）。自测 T21 兜底。
- 尾幕下滑回封面＝三重保险：catchtouchmove 禁原生拖拽 + touchstart 记起手幕/touchend 判 60px 下滑 + onStageChange 800ms 竞态窗口。**仅 catchtouchmove 不可靠**。
- scroll-view 吞竖滑：故事/回执/祝福三幕挂 `onBackTouchStart/End + onBackScrolled + data-back`（0/3/4）自判回幕；输入控件加 `data-noswipe`。
- handler 断线（WXML 绑了 JS 没写，真机无报错）→ `.st-admin/check_wxml_handlers.py` + selftest T20/T62 静态回归。

## 照片双源
- **云端 1024 高清为正源**：`photos.public_url` → `wedding/photos/pNN.jpg`（q85 4:4:4，~330KB/张，母本 `_assets/cloud_1024/`）。旧 720px 版已替换（云端文件未删）。
- **兜底链**：`binderror="onPhotoError" data-gi` → 切 `fallback_url`（=`/images/pNN.jpg` 包内 720 q70）；幂等；无包内副本则留空自动跳过。
- 预取 `preloadGallery(i)`（当前+下一张，Set 去重、仅 https）：公读网关无 CDN、TTFB 0.4-0.7s，实测预取后转场空档 0ms。
- **转场实验室** `_assets/transition_lab/`：浏览器复刻转场（同 CSS/时序/真实云端图）+ HUD 输出空档/FPS —— 调动画先在这测，别真机盲调。
- 🚨 改 `photos.storage_key` 必须同步 ensureSite 判重前缀：`siteManage/_shared.js` + `claimSite/_shared.js` + `seed.json`×2 **四处一起动**（曾致相册 40 张重复）。

## 首屏秒开
`boot-veil` 中性加载壳（就绪/失败/4s 超时 → `_reveal()` 淡出，不渲染任何默认内容）+ storage 缓存秒开
（`_cacheKey()`：制作人 `site_cache_owner`、宾客 `site_cache_guest_<code>`）；云端到达后比对 `_appliedCacheStr`，相同则跳过大补丁。

## 体积红线
- 主包上限 **2MB**，当前约 1.4MB。**720px 本地压缩已到物理天花板**，高清只有云端一条路。
- 🚨 `project.config.json` 的 **`uploadWithSourceMap` 必须 false**（+300KB 会「代码包 2 项未通过」）；`packOptions.ignore` 忽略 `images_src` 与 .png/.psd/.mp3/.wav/.md（放本地音乐前先删 .mp3 那条）。
- **原始大图绝不能放 `miniprogram/` 下**（曾致 46MB 爆包）；备份 `_assets/originals/`，回退版 `_assets/images_q6_backup/`。
- 重压用 **Pillow**（`_assets/recompress.py`），**不要用 ffmpeg 二次编码**。venv：`/home/xiaofeiyang/.workbuddy/binaries/python/envs/default`。

## 存储
- bucket `wedding`（public=true）；公读 URL `https://{envId}.api.tcloudbasegateway.com/v1/storages/object/public/{bucket}/{key}`（免签永不过期，**别写死签名 URL**）。
- 上传：`storage objects upload <file> <key> -b wedding`（旧版 `storage upload` 对 PG 报 FLAT_CMD_NOT_AVAILABLE）。BGM `wedding/audio/bgm_loop.mp3`。

## PG 权限模型
- 云函数一律 `app.rdb({ database: 'public' })`。
- `anon`：INSERT `rsvps`、INSERT/SELECT `greetings`、`sites` 只读 (id, share_code)（policy `sites_code_read`，仅 published）、SELECT `rsvp_summary`；`rsvps` 行数据（含手机号）对外不可读。
- 统计视图 `visit_daily`/`visit_sources`/`visit_depth`/`rsvp_summary`/`greeting_stats`/`site_stats`（service_role 读、anon revoke）；旧 `rsvp_stats` 已退役。

## 已排除路线（不要重走）
OPA `tcb policy set`、**`ModifyResourcePermission`（PG 环境直接拒绝：does not support PostgreSQL type environments）**、
`tcb routes add`（默认域名属"系统内部域名"不让建路由，自定义域名要买+备案 → PC 端因此改走 **Web SDK 网关**：
静态托管域名已在 CORS 白名单，SDK 用 UMD CDN `static.cloudbase.net/cloudbase-js-sdk/3.10.2/cloudbase.full.js`）、
PG HTTP API `/v1/rdb/rest`（需账号级 AccessToken）、web-view 套 H5（个人主体不支持）。
**云函数安全规则**只能用 `cloudbase api tcb DescribeSecurityRule / ModifySecurityRule`（`Rule` 为字符串化 JSON，已落盘 `.st-admin/security_rule.json`）。

## 工具（.st-admin/）
`deploy.py`（部署云函数，`--debug-openid` 控联调开关）、`exec_sql.py`（按 `;` 逐句跑 SQL）、`check_wxml_handlers.py`、`selftest/run.cjs`（Node 打桩跑页面逻辑 + WXML/部署配置静态断言，74 项）、
`probe_page.cjs`（真 Chromium 打开网页逐步看状态栏/网络/控制台）、`e2e_web.cjs`（网页端扫码登录全链路 E2E）。
🚨 沙箱跑 Chromium：`TMPDIR` 用**短路径**大目录（`/tmp`/`/dev/shm` 仅 10MB，路径过长会 `SingletonSocket` 崩）。

## 进度（2026-10-10）
已上线：多租户 + 转发分享 + 首屏秒开 + 相册抖动修复（旧图 hold）+ 节奏定稿 + 照片双源 + 数据后台全链路（DDL/`reportVisit`/`adminManage`/前端埋点/admin 数据页）。
2026-10-10 真机联调修掉后台看板空白（adminManage 漏配 WX_SECRET）+ 统计口径排除制作人自己的浏览，已复验通过。
2026-10-10 新增 **PC 端数据后台（微信扫码登录）**：`web_sessions` 表 + `webLogin` 云函数 +
小程序 `pages/webLogin` 确认页 + 网页 `web-admin/index.html`（已部署静态托管 `/admin/`）+
`adminManage` 双通道鉴权 + 云函数安全规则放开；端到端脚本 7 步全通，自测 70 项全绿。
**待用户重新上传小程序体验版**（含 webLogin 页）后真机扫码验收。
2026-10-10 深夜修掉「网页卡在准备二维码」：SDK 改**自托管**（页面绝不写 `<script src>` 外链，
外链被拖住会阻塞内联脚本→整页僵死）+ 关键异步全部 `withTimeout` 并把错误写进状态栏；
网页令牌通道必须**补回 openid**、传播链用「我名下所有 vid 的集合」认自己（删小程序换 vid）。
⚠️ CloudBase 测试域名对**浏览器**（curl 不触发）先回 404+「风险提醒」页，点「确定访问」才放行。
节后待办：故事三段真实文案、后台保存闭环、清理 `wedding/sites/_staging/*.jpg`、小程序码落地页。细节见同目录 `2026-09-29.md` / `2026-10-10.md`。
