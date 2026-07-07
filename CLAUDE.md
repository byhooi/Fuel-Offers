# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概览

深圳 95 号汽油优惠计算器:一个部署在 Cloudflare Pages 上的纯静态单页应用,无构建步骤、无依赖、无测试框架。所有文档、注释和 UI 文案均使用中文;提交信息使用简短英文(如 `Add fuel volume conversion`)。

## 常用命令

```bash
# 本地预览(必须用静态服务,file:// 下 fetch 读不到 JSON)
python -m http.server 8000

# 手动抓取油价并写入 fuel-price.json(Node 18+,CI 用 Node 22)
node scripts/update-fuel-price.mjs

# 校验 JSON 文件格式
node -e "JSON.parse(require('fs').readFileSync('config.json','utf8')); JSON.parse(require('fs').readFileSync('fuel-price.json','utf8'))"
```

没有构建、lint 或自动化测试;修改后依靠手动验证(见下文"验证")。

## 架构与数据流

整条数据管道:

1. `.github/workflows/update-fuel-price.yml` 每天两班(22:30 与 4:30 UTC,北京时间约 6:30 和 12:30,前者配合国内 24 时调价生效,后者作为失败重试)运行抓取脚本;
2. `scripts/update-fuel-price.mjs` 按优先级尝试数据源(环境变量自定义源 → 小熊油耗 → 全国油价网 → 15 天气),解析出价格后写入 `fuel-price.json`;全部失败时保留上次价格和 `updatedAt`,写入 `status: "stale"` 与 `lastAttemptAt`,然后抛错使 workflow 标红(提交 step 带 `if: ${{ !cancelled() }}`,失败时 stale 状态仍会被提交);
3. `git-auto-commit-action` 提交 `fuel-price.json`,该提交触发 Cloudflare Pages 重新部署;
4. `index.html` 前端 fetch 读取 `fuel-price.json` 和 `config.json` 完成展示与计算。

### 抓取脚本(scripts/update-fuel-price.mjs)

- 解析采用三级回退链:`parseXiaoxiongPrice`(小熊油耗专用,同时提取车友实测优惠价 `observedDiscountPrice`)→ `parseTableRows`(通用表格解析)→ `parseFlatText`(纯文本兜底)。
- 价格护栏:仅接受 5–12 元/升(`PRICE_MIN`/`PRICE_MAX`),范围外一律视为解析失败。
- 编码处理:按 Content-Type charset → utf-8 → gb18030 依次尝试解码(国内油价站常用 GBK 系编码)。
- 自定义数据源通过 GitHub Actions Variables 配置:`FUEL_PRICE_SOURCE_URL` 和 `FUEL_PRICE_SOURCE_NAME`,优先于内置源。

### 前端(index.html)

HTML、CSS、JavaScript 全部保持在 `index.html` 单文件内,除非功能明显扩大——这是项目的明确约定,不要主动拆分。

- 三种换算模式:`before-to-after`(优惠前→实付)、`after-to-before`(实付→优惠前)、`liters-to-cost`(加油量→油费)。
- localStorage 键:`fuel-mode`(当前模式)、`fuel-discount`(每升优惠)、`fuel-base-price`(挂牌价)、`fuel-input-<mode>`(各模式独立记忆输入金额)。除 `fuel-mode` 外,只在用户主动输入时写入——不要在 `calculate()` 里无条件持久化,否则首次打开页面就会把默认值固化,导致站长后续修改 `config.json` 对老访客失效。
- `config.json` 的 `defaultDiscountPerLiter` 仅在 localStorage 无 `fuel-discount` 时生效;"恢复默认优惠"按钮会清除 `fuel-discount` 并恢复到该值(重新跟随 config)。
- 自动油价加载成功时会覆盖挂牌价输入框;加载失败时回退到 localStorage/手动输入值。
- 数据新鲜度:`status === "stale"` 或 `updatedAt` 距今超过 48 小时,价格板会显示琥珀色警告。

### fuel-price.json 字段契约

脚本与前端之间的接口:`price`(挂牌价)、`status`(`ok`/`stale`/`manual`)、`updatedAt`(价格最后成功确认时间,ISO 格式,前端按 Asia/Shanghai 格式化,抓取失败时不刷新)、`lastAttemptAt`(最后一次抓取尝试时间)、`observedDiscountPrice`/`observedDiscountPerLiter`(车友实测优惠,可为 null,前端据此渲染"应用实测优惠"按钮)、`source`/`sourceUrl`/`note`。修改任一端时保持字段兼容。

## 编码约定

- 缩进 2 空格;CSS class 用 kebab-case(如 `price-board`);JS 用 camelCase;JSON 用 2 空格格式化。
- 脚本使用 ESM `.mjs`,只用标准 Web API 和 Node 内置模块,不为小功能引入依赖。
- 修改 workflow 时保持最小权限 `contents: write`。

## 验证

- 改 UI 或计算逻辑:本地起静态服务,手动验证三种换算模式、"恢复默认优惠"、异常输入(挂牌价为 0、优惠大于挂牌价)以及 `fuel-price.json` 加载失败的降级表现。
- 改抓取脚本:运行脚本并确认 `fuel-price.json` 的 `price`、`status`、`updatedAt`、`note` 合理;网络不可用时至少校验 JSON 和脚本语法。
