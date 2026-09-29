# 项目长期备忘

## 项目概况
自建婚礼请柬，**双前端共用一套 CloudBase 后端**。
- H5 版：`src/`（Vue 3 + Vite + TS）+ `dist/`，部署在 hosting
- 小程序版：`miniprogram/`（原生 WXML/WXSS/JS），2026-09-28 完工

云环境：`xiaofeiyang-d3gx5ou5k7fe078eb`（ap-shanghai，体验版，到期 2027-03-24）
小程序 AppID：`wx7f161d1665f60f8e`（个人主体，2026-09-28 填入 `project.config.json`）

## 🆕 多租户 SaaS 架构（2026-09-29 起，已取代"内容写死"）
- **一行 `sites` = 一对新人**，`owner_openid` 唯一标识，天然隔离
- 内容优先级：**云端 > 本地**。本地 `config.js` 仅作兜底（云端失败时仍能打开请柬）
- 🚨 **改婚礼内容的正确方式已变**：走小程序后台（`pages/admin`）改云端，
  不再改 `config.js`。`config.js` 只在"云端完全不可用"时兜底
- 七幕/配色/动效等**渲染逻辑不变**，只是数据来源改了
- **站点已发布**（2026-09-29）：share_code `5estew`，新人 许飞杨&盛小洋，
  婚期 2027-02-10，status=published（SQL 直改）。改回草稿 = UPDATE status='draft'
- **转发分享已实现**：index 页 `onShareAppMessage/onShareTimeline`，
  path/query 带 `?code=<share_code>`（好友打开直达该请柬，宾客可再转发裂变）；
  分享码随内容走（siteToConfig/getPublicSite 的 config 均含 share_code，
  缓存秒开后转发不掉码）；尾幕有 `open-type="share"` 按钮。
  分享卡标题 = 新人名，封面图 = 云端高清第一张
- ⚠️ 分享可用性前提：**必须上传体验版或正式发布小程序包**——
  开发版/旧包没有转发代码；体验版仅"体验成员"可打开（公众平台-成员管理添加）；
  全员可访问需提审发布。小程序码二维码（落地页）未做，转发卡片为主路径

### 云函数（`cloudbaserc.json` 中）
| 函数 | 职责 | 身份 |
|---|---|---|
| `siteManage` | 制作人读写（load/saveProfile/saveMusic/publish/addPhoto/removePhoto/movePhoto） | openid |
| `getPublicSite` | 宾客只读（按 share_code，只返回 published + approved） | 无（公开） |
| `claimSite` | 存量内容归位（长按尾幕触发） | openid |
| `aiProcessPhotos` | AI 看图生成文案/分章/动效（差量，未变不重算） | openid |
| `submitRsvp` / `getRsvpCount` / `submitGreeting` / `listGreetings` | 回执与祝福 | 无（公开） |
- `siteManage` / `claimSite` 各有一份 `_shared.js` + `seed.json` 副本
  （**云函数不能跨函数 require**，相对依赖每个目录都要放）
- 身份只信 `context.OPENID`；`event.__openid` 仅在 `ALLOW_DEBUG_OPENID=1` 时生效
  （联调开关，线上绝不设；`.st-admin/deploy.py --debug-openid` 控制）

### 新用户「自动开箱」
首次进入自动建号 + 铺默认模板（真实内容 阿哲&小满 + 20 张照片），
`ensureSite` 幂等：**已有内容一律不覆盖**，只补齐缺失照片。

### 小程序页面
- `pages/index` — 七幕请柬本体 + 尾幕「编辑我的请柬」（`isOwner` 才显示）
- `pages/admin` — 后台三 Tab：基本信息 / 相册 / 智能处理

### 跨页刷新信号
后台保存成功 → `getApp().globalData.profileDirty = true`
→ 首页 `onShow` 检测到就重新 `applyCloudContent()`

### 首屏秒开与加载壳（2026-09-29，防「先默认名后真名」闪变）
- 问题：`loading` 状态存在但 WXML 从未接线 → 页面先渲染本地默认模板，
  云端到了才覆盖，用户看到「先小哲后真名」。
- 修复双件套：
  1. **首屏加载壳** `boot-veil`（中性"囍"+转圈，不渲染任何默认内容）：
     云端就绪/失败/4s 超时 → `.hide` 淡出 → 500ms 后 JS 移除节点。
     `loading:false` 的三处（applyConfig / catch / 超时）都联动 `_reveal()`。
  2. **storage 缓存秒开**：`applyConfig` 统一写缓存（key 见 `_cacheKey()`：
     制作人 `site_cache_owner`、宾客 `site_cache_guest_<code>` 按码隔离）；
     onLoad 命中即 applyConfig(cached) 秒显真内容，云端到达后字符串比对
     （`_appliedCacheStr`）相同则跳过大补丁（防相册/倒计时被重置打断）。
- 云端迟到（超时后才到）会正常 applyConfig 覆盖视图——内容正确性优先。

## 关键约定
- **改婚礼内容只动 `miniprogram/config.js` 和 `src/config.ts`**，不要碰页面代码
- 配色（米金/仿宋）：`--ivory #faf6ef` / `--paper #fffdf8` / `--gold #b8935e`
  / `--gold-deep #9a7743` / `--ink #3a332a` / `--ink-soft #6f6557` / `--rose #c98a7d`
- 七幕顺序：封面 → 故事 → 相册 → 信息 → RSVP → 祝福 → 尾幕
- 交互形态：**顶层竖向整屏 swiper**（非长滚动），每幕 `100vh`，
  幕内元素 `.rise` + `.d1~.d4` 错峰入场
- 相册：**全屏出血**，照片铺满整屏、UI 浮在照片上。
  20 张分 5 章（初见/相恋/同行/约定/此刻），章节名由 `config.js` 每张的 `chapter` 字段驱动。
  层级：照片 swiper(z0) → `.gallery-scrim` 渐隐遮罩(z1, `pointer-events:none`) → `.gallery-head`/`.gallery-foot`(z2)。
  **文案浮层只有一份**，绑 `config.gallery[galleryIndex].caption`，不放在 swiper-item 里。
  动效：**8 种运镜**（`fx` 字段逐张指定：zoom/pull/pan-l/pan-r/tilt/rise/bloom/sink），
  节奏（2026-09-29 用户定稿）：每张 5400ms = 飞入 1800 + 驻留 3600（`GALLERY_INTERVAL=5400`）；
  运镜 delay 1800ms / duration 5100ms（未播完被盖住，both 无跳变）；
  文案入场方向跟图的运镜走（`fx-cap-*`，260ms 独立小节奏）。
- 🚨 **小程序 swiper 陷阱（必读）**：`<swiper>` 会给自己 `swiper-item` 设 `transform`
  做滑动，会**覆盖**写在 `swiper-item` 或**其直接子元素**上的 transform 动画
  （CSS 里自身 transform 与 @keyframes transform 是同一套机制）→ 现象是「动画无效，只剩平移」。
  **修法：多包一层 `.shot-anim`，动画只打内层。** `opacity`/`filter` 不受影响，可写外层。
- 相册动画必须绑「当前张」：`class="... {{galleryIndex === index ? 'live' : ''}}"`，
  否则 animation 只在首次播一次。文案重播靠单元素循环重建节点
  （`<block wx:for="{{ [config.gallery[galleryIndex]] }}" wx:key="*this">`）。
- 🚨 **切图瞬间抖动根因（2026-09-29 用户指认）：飞出/飞入同帧重叠**——
  旧图 flyOut 与新图 flyIn 两段大位移+旋转+渐隐动画同帧跑 1100ms，真机上视觉发抖。
  修复：**旧图不再飞出，move 层挂 `hold` 静驻原地被新图盖住**（anim 层 live 保持，
  避免动画移除回跳）；8 条 flyOut 规则已删。原则：**任意时刻只让一张图做大位移动画**。
  galleryPrev 机制保留（最多两层渲染）。别再给旧图加回飞出。
- 🚨 **云端图转场空档与预取（2026-09-29 实测）**：公读网关无 CDN，TTFB 0.4-0.7s，
  不预取时每次切图 200-400ms「空白→突然清晰」波动（慢网 1s+）；FPS 满帧，
  动画本身不卡。修复：`preloadGallery(i)`（wx.getImageInfo 预热当前+下一张，
  Set 去重、仅 https、本地路径跳过），触发点 = goGallery 切图后 + 进相册幕。
  实测预取后空档 0ms。
- **转场实验室** `_assets/transition_lab/`：浏览器复刻相册转场（同 CSS/时序/真实云端图），
  HUD 输出每次切图「就绪时刻/空档上限」+ FPS。以后调动画先在实验室测，
  别在真机上盲调。agent-browser 装在
  `/home/xiaofeiyang/.workbuddy/binaries/node/workspace`（npm 全局无权限）。
- 🚨 **swiper 程序化跳转必须绑 `current="{{current}}"`（v3 真根因，踩了三轮）**：
  stage swiper 原来只挂了 `bindchange`，`data.current` 是单向镜像——swiper 报值给我们记录，
  但所有 `setData({current})`（回到封面按钮 / 尾幕手势 / 三幕回传）全是空操作、视图纹丝不动，
  表现为「下滑没效果/没什么变化」。修复 = swiper 标签加 `current="{{current}}"`。
  教训：做程序化控制类交互，先验证「命令真的送达组件」，别只验证逻辑分支。
  自测 T21 已把该绑定列为静态断言。
- 尾幕下滑回封面（v2，三重保险，任何事件时序都收敛到封面）：
  1. 尾幕 `catchtouchmove` 禁 swiper 原生拖拽（部分基础库生效）；
  2. touchstart 记「起手幕」+ touchend 判下滑 60px+ 跳封面（用起手幕判定，
     原生 change 先到把 current 改成 5 也能纠正回来）；
  3. onStageChange 竞态窗口：跳转后 800ms 内的 change(5) 直接忽略。
  ⚠️ 教训：v1 只靠 catchtouchmove + touchend，用户实测仍失效——
  catchtouchmove 不保证能拦住 swiper 原生拖拽，必须按 change 结果兜底。
- scroll-view 吞竖滑（平台行为）：故事/回执/祝福墙三幕版心都在 scroll-view 里，
  往下滑回上一幕在这些区域完全失灵（从尾幕滑回封面会被故事幕卡死）。
  已修：三个 scroll-view 挂 `onBackTouchStart/End + onBackScrolled` +
  `data-back`（0/3/4），自判「本轮触摸没滚动过 + 下滑 60px+ 纵向为主 → 回指定幕」；
  回执幕输入控件加 `data-noswipe` 防误触。自测脚本 `.st-admin/selftest/run.cjs`（21 项）。
- handler 断线（WXML 绑了 JS 没写）真机无报错，用 `.st-admin/check_wxml_handlers.py`
  + selftest T20 双重静态回归兜底。

## 照片双源架构（2026-09-29 上线：云端 1024 高清 + 包内 720 兜底）
- **宾客实际看的是云端图**：photos 表 `public_url` 是正源字段，
  现指向 `wedding/photos/pNN.jpg` = 原图 1024×1536 直压 q85 4:4:4 + 轻锐化
  （平均 ~330KB/张，20 张 6.5MB，母本在 `_assets/cloud_1024/`）。
  旧 `sites/_staging/` 里的 720px q6 版就是"宾客嫌模糊"的根源，已被替换（云端文件未删）。
- **兜底链**：单张云端图加载失败 → WXML `binderror="onPhotoError" data-gi` →
  JS 把 `config.gallery[i].src` 切到 `fallback_url`（= `/images/pNN.jpg` 包内 720px q70 版）。
  幂等设计：src 已是 fallback 就不再 setData。自测 T22–T26 覆盖。
- photos 表新增 `fallback_url text` 列（ALTER TABLE）；新用户照片无包内副本 → fallback 留空，
  binderror 分支自动跳过 → 机制对所有租户通用。
- `siteToConfig` / `getPublicSite` 的 gallery 条目均已透传 `fallback` 字段。
- **本地兜底图不再追求高画质**：q70 双代版 1.26MB 即可（云端正常时根本不显示它），
  主包恒定 **1.37MB**。换兜底图 = 重跑 `_assets/recompress.py` 类流程；
  换云端高清图 = 重新生成 1024 版上传 `wedding/photos/` 即可（**无需动包**）。
- 原图↔pNN 映射表：`_assets/orig_mapping.json`（RMS 指纹匹配建立，pNN 恰按原图时间戳序）。
- 🚨 **改 photos.storage_key 必须同步 ensureSite 判重前缀**（2026-09-29 踩坑）：
  `siteManage/_shared.js` + `claimSite/_shared.js` 补照片时按 seed 的 src 推导
  `storage_key` 判重——曾把存量 key 改成 `photos/` 而代码仍硬编码 `sites/_staging/`，
  判重失配 → 每张补一条、相册 40 张（用户报"每张照片出现两次"）。
  现已四处统一为 `photos/` 前缀（_shared.js ×2 + seed.json ×2），且 insert 带 fallback_url。
  以后改 key/换桶/换目录，**这四个文件 + 存量数据必须一起动**。

## 体积红线（改图片前必看）
- 小程序主包上限 **2MB**。当前 **1.37MB**（兜底照片 1.26MB + 代码 ~0.11MB），余量 ~0.63MB。
- **720px+JPEG 本地压缩已到物理天花板**（2026-09-29 实测数据）：
  原图直压 q84 ≈ 165KB/张 → 20 张 3.2MB 爆包；q64+锐化也要 1.75MB（总包 1.86MB）。
  「真清晰」只有云端 1024px 一条路（见上节）。**不要再尝试本地压出高清**。
- 🚨 **`project.config.json` 的 `uploadWithSourceMap` 必须保持 false**（2026-09-29 已关）：
  开着会把 JS sourcemap 打进预览/上传包（约 +300KB）——
  表现为「主包大小未通过 / 代码包 2 项未通过」。加代码后预览报超限，先查这个开关。
- ⚠️ **踩过的坑**：原图备份曾放在 `miniprogram/images_src/`，
  导致上传报 `代码包大小为 46199 kb，上限为 2048 kb`。
  **原始大图绝不能放在 `miniprogram/` 下。**
- 原图备份位置：**工作区外层 `_assets/originals/`**（44MB，不参与打包）；
  重压前版本备份在 `_assets/images_q6_backup/`（1.69MB 版，回退直接覆盖回去即可）。
- **重压用 Pillow，不要用 ffmpeg 二次编码**（2026-09-29 实测）：
  对已有损 jpg 再用 ffmpeg `-q:v 9` 重编，1.48MB→1.46MB 几乎不缩，白损画质；
  Pillow `quality=70 + optimize + progressive` 从 720px 原件一次编码 → 合计 1.26MB。
  脚本 `_assets/recompress.py`（阶梯 80→55 自动选达标档）。
  Pillow 已装入 venv：`/home/xiaofeiyang/.workbuddy/binaries/python/envs/default`。
- `project.config.json` 的 `packOptions.ignore` 已配兜底规则：
  忽略 `images_src` 目录 + `.png`/`.psd`/`.mp3`/`.wav`/`.md` 后缀。
  （注意：若要本地放音乐，需先删掉 `.mp3` 那条忽略规则）

## 技术要点
- **小程序端不需要匿名登录**：`wx.cloud.callFunction` 直接携带微信身份，
  绕开了 H5 版遇到的「权限控制被禁用 → 403」问题。**不需要升级套餐。**
- 云函数一律 `app.rdb({ database: 'public' })` 访问 PG
- PG 安全边界靠 GRANT + RLS：
  匿名角色 `anon` 可 INSERT `rsvps`、SELECT `rsvp_stats` 视图、INSERT/SELECT `greetings`；
  `rsvps` 行数据（含手机号）对外不可读，总数经视图暴露
- `cloudbaserc.json` 有 4 个函数条目（submitRsvp / submitGreeting / listGreetings / getRsvpCount）

## PG 环境对象存储（BGM 已上线）
- 环境**原本无任何 bucket**，已用 SQL 建桶：
  `db execute --sql "INSERT INTO storage.buckets (id,name,public) VALUES ('wedding','wedding',true)"`
- 上传：`storage objects upload <file> <key> -b wedding`（旧版 storage upload 对 PG 报 FLAT_CMD_NOT_AVAILABLE）
- **公读 URL 模板**：`https://{envId}.api.tcloudbasegateway.com/v1/storages/object/public/{bucket}/{key}`
  （bucket public=true 时免签名、永不过期；签名 URL 会过期不要写死）
- BGM《轻轻的约定》（AI 合成音乐盒圆舞曲 76s 循环）已在
  `wedding/audio/bgm_loop.mp3`，config.music 指向公读 URL
- 换歌 = 上传新 mp3 到同桶 + 改 config.music 的 URL

## 环境坑（必读）
- 根 `package.json` 有 `"type": "module"`，会**污染子目录**。
  用 Node 直接 `require()` 小程序文件会报 `require is not defined in ES module scope`。
  本地验证要在临时目录放 `{"type":"commonjs"}` 的 package.json。
  这是 Node 行为，**小程序运行时不受影响**（有自己的 CommonJS loader）。
- CLI 不在 PATH：`node_modules/.bin/cloudbase`
- **/tmp 只有 10MB（tmpfs）**：pip 下载必爆。装包先 `TMPDIR=<工作区路径>`；
  numpy 在 `/home/xiaofeiyang/.workbuddy/binaries/python/envs/default`
- ⚠️ 不要跑 `cloudbase config init fn`：会往 `cloudbaserc.json` 塞垃圾条目
- 沙箱会清空 `/tmp`，临时脚本放工作区内

## 已排除路线（不要重走）
- OPA 策略 `tcb policy set`：对 callFunction 链不生效
- 旧版 JSON 安全规则 / ModifyResourcePermission：API 拒绝 PG 环境
- HTTP 路由 `tcb routes add`：默认域名系统托管，禁止手动加路由
- PG HTTP API `/v1/rdb/rest`：需账号级 AccessToken，不能下发到浏览器
- web-view 套 H5：个人主体小程序不支持

## 📌 封板快照（2026-09-29 节前，节后再调）
封板版：相册旧图 hold 静驻不飞出；飞入 1800ms；每张 5400ms（GALLERY_INTERVAL）；万花筒带 blur 垫底；预取+分享+秒开全在；自测 39 过、主包 1.44MB。
⚠️ 节后先确认最新版已传体验版（手机删小程序重进防缓存）。
节后待办：真机复验节奏 → 故事三段仍是模板文案待写真事 → 后台保存/AI处理/照片审阅/音乐上传 UI → 清理 wedding/sites/_staging/*.jpg → 小程序码落地页。详见 2026-09-29.md 日志。
