# 婚礼请柬 · 微信小程序版

原生小程序重写版，与仓库中的 H5 版（`src/`）共用同一套云开发后端。

## 架构

```
miniprogram/          小程序前端（原生 WXML/WXSS/JS）
├── app.js            云开发初始化（env: xiaofeiyang-d3gx5ou5k7fe078eb）
├── app.json          页面注册与全局导航栏
├── app.wxss          全局主题变量与通用样式
├── config.js         ★ 所有婚礼内容集中在这里，只改这一个文件
├── lib/
│   ├── api.js        云函数调用封装（wx.cloud.callFunction）
│   └── date.js       日期解析与倒计时
└── pages/index/      单页 7 幕（封面/故事/相册/信息/RSVP/祝福/尾幕）

cloudfunctions/       云函数（与 H5 版共用，无需改动）
├── submitRsvp        写入回执
├── getRsvpCount      回执总数（走 rsvp_stats 视图）
├── submitGreeting    写入祝福
└── listGreetings     读取祝福列表
```

## 七幕结构

竖向整屏翻页（swiper `vertical`），一屏一幕，滑动时上一幕上移飞出、下一幕从下方推入，
每幕内容带错峰入场动画（淡入 + 上浮）。

| # | 幕 | 说明 |
|---|---|---|
| ① | 封面 | 姓名、日期、实时倒计时、背景音乐按钮 |
| ② | 我们的故事 | 竖向时间轴（幕内可滚动） |
| ③ | 相册 | **全屏出血 · 20 张 · 5 章叙事**，照片铺满整屏，章节名与进度浮在图上 |
| ④ | 婚礼信息 | 日期卡、酒店、导航前往、复制地址、流程表 |
| ⑤ | 赴约登记 | RSVP 表单，带人数步进器 |
| ⑥ | 祝福墙 | 提交祝福 + 列表（列表区可滚动） |
| ⑦ | 尾幕 | 致谢与落款，可点「回到封面」 |

> 各幕内容超出屏幕时，该幕内部可独立滚动，不影响翻页。

## 上手步骤

### 1. AppID 已填好

`project.config.json` 里已填入 `wx7f161d1665f60f8e`，无需再改。

> 个人主体小程序，本项目不依赖 web-view、不需要域名备案。

### 2. 导入微信开发者工具

用微信开发者工具「导入项目」，目录选**仓库根目录**（不是 `miniprogram/`），工具会依据
`project.config.json` 里的 `miniprogramRoot` / `cloudfunctionRoot` 自动定位。
登录开发者工具时，**用注册该小程序时绑定的微信号扫码**。

### 3. 确认云环境

`miniprogram/app.js` 里的 `ENV_ID` 已填好，无需改动。

如果云函数还没部署（例如换了新环境），在开发者工具里右键 `cloudfunctions/` 下每个函数 →
「上传并部署：云端安装依赖」。或在仓库根目录执行：

```bash
CB=./node_modules/.bin/cloudbase
$CB fn deploy submitRsvp     -e xiaofeiyang-d3gx5ou5k7fe078eb
$CB fn deploy submitGreeting -e xiaofeiyang-d3gx5ou5k7fe078eb
$CB fn deploy listGreetings  -e xiaofeiyang-d3gx5ou5k7fe078eb
$CB fn deploy getRsvpCount   -e xiaofeiyang-d3gx5ou5k7fe078eb
```

### 4. 初始化数据库（仅首次）

把 `cloudfunctions/schema.sql` 整段粘到控制台「SQL 型数据库 → SQL 编辑器」执行。

### 5. 真机预览

点开发者工具的「预览」，扫码即可在手机上查看。分享给宾客用右上角「···」→ 转发。

## 为什么小程序这条路能绕开 H5 的 403

H5 版走的是**浏览器匿名登录 + 云函数**，体验版 PG 环境禁用了「身份认证 → 权限控制」，
匿名用户拿不到云函数调用权限，所以报 `403 EXCEED_AUTHORITY`。

小程序走的是 `wx.cloud.callFunction`，**直接携带微信身份，不经过匿名登录那一环**，
因此不受该限制影响。已实测四个云函数读写全部正常。

## 改内容只动 config.js

```js
module.exports = {
  groom: '阿哲',                                  // 新郎
  bride: '小满',                                  // 新娘
  coverLine: '从心动，到古稀',                     // 封面标语
  weddingDate: '2027-05-01T11:00:00+08:00',       // 婚期（倒计时依据）
  venue: {
    name: '示例酒店·宴会厅',
    address: '北京市朝阳区示例路 1 号',
    longitude: 116.4074,                          // 用于「导航前往」
    latitude: 39.9042,
  },
  music: '',                                      // 留空则不显示音乐按钮
  story: [...],                                   // 故事时间轴
  gallery: [...],                                 // 相册（20 张，每张带 chapter）
  schedule: [...],                                // 当日流程
  endingThanks: '...',                            // 尾幕致谢
}
```

### 换照片

相册共 **20 张，分 5 章**（初见 / 相恋 / 同行 / 约定 / 此刻），每张长这样：

```js
{ src: '/images/p01.jpg', caption: '街角的第一眼', chapter: '初见' },
```

换照片有两种做法：

- **省事**：直接用同样文件名覆盖 `miniprogram/images/p01.jpg ~ p20.jpg`，代码一行都不用改。
- **重新组织**：把新照片放进去，再改 `config.gallery` 的 `src` / `caption` / `chapter`。
  连续几张写同样的 `chapter` 即归为同一章，相册顶部会显示章节名和 `n/20` 进度。

> **⚠️ 体积红线（这个坑踩过，务必看清）**
>
> 小程序主包上限 **2MB**。当前打包后 **1.65MB**，余量只有 0.35MB。
>
> **只有 `miniprogram/` 目录会被打包上传**，这个目录里每个文件都算体积。
> 曾经因为把 44MB 的原图备份放在 `miniprogram/images_src/`，导致上传报
> `代码包大小为 46199 kb，上限为 2048 kb`。**原始大图绝对不能放在 `miniprogram/` 里。**
>
> 原图备份现在放在工作区外层 `_assets/originals/`（44MB），不参与打包，可安全保留。
>
> 压缩参数：`ffmpeg -i 原图.png -vf "scale=720:-2" -q:v 6 输出.jpg`（约 85KB/张）
>
> `project.config.json` 的 `packOptions.ignore` 已配置兜底忽略规则
> （`images_src` 目录、`.png` / `.psd` / `.mp3` / `.wav` / `.md` 后缀），
> 即使误把原图放回 `miniprogram/` 也不会被打包。

### 加背景音乐

1. 把 mp3 放进 `miniprogram/audio/`（如 `bgm.mp3`）
2. 在 `config.js` 里设 `music: '/audio/bgm.mp3'`

> 主包余量只剩 0.35MB，塞不下一首 mp3。音频**建议放云存储**，用 `cloud://` 地址引用。
> （`packOptions.ignore` 目前会忽略 `.mp3`，如果真要在本地放音乐，记得把这条规则删掉。）

## H5 版与小程序版的关系

两边共用同一套云函数和数据库，数据互通。H5 版仍在 `src/` + `dist/`，用
`npm run build` 构建后 `cloudbase hosting deploy dist` 部署。
