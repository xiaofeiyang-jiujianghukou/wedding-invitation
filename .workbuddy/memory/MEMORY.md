# 项目长期备忘

## 项目概况
自建婚礼请柬，**双前端共用一套 CloudBase 后端**。
- H5 版：`src/`（Vue 3 + Vite + TS）+ `dist/`，部署在 hosting
- 小程序版：`miniprogram/`（原生 WXML/WXSS/JS），2026-09-28 完工

云环境：`xiaofeiyang-d3gx5ou5k7fe078eb`（ap-shanghai，体验版，到期 2027-03-24）
小程序 AppID：`wx7f161d1665f60f8e`（个人主体，2026-09-28 填入 `project.config.json`）

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
  时长统一 6200ms = `interval 5200 + duration 1100`；
  文案入场方向跟图的运镜走（`fx-cap-*`）。
- 🚨 **小程序 swiper 陷阱（必读）**：`<swiper>` 会给自己 `swiper-item` 设 `transform`
  做滑动，会**覆盖**写在 `swiper-item` 或**其直接子元素**上的 transform 动画
  （CSS 里自身 transform 与 @keyframes transform 是同一套机制）→ 现象是「动画无效，只剩平移」。
  **修法：多包一层 `.shot-anim`，动画只打内层。** `opacity`/`filter` 不受影响，可写外层。
- 相册动画必须绑「当前张」：`class="... {{galleryIndex === index ? 'live' : ''}}"`，
  否则 animation 只在首次播一次。文案重播靠单元素循环重建节点
  （`<block wx:for="{{ [config.gallery[galleryIndex]] }}" wx:key="*this">`）。

## 体积红线（改图片前必看）
- 小程序主包上限 **2MB**。当前打包后 **1.65MB**，余量仅 **0.35MB**。
- **只有 `miniprogram/` 会被打包**，该目录内每个文件都算体积。
- ⚠️ **踩过的坑**：原图备份曾放在 `miniprogram/images_src/`，
  导致上传报 `代码包大小为 46199 kb，上限为 2048 kb`。
  **原始大图绝不能放在 `miniprogram/` 下。**
- 原图备份位置：**工作区外层 `_assets/originals/`**（44MB，不参与打包）。
- 压缩参数：`ffmpeg -i in -vf scale=720:-2 -q:v 6 out.jpg`（约 85KB/张）
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
