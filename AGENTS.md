# Repository Guidelines

## 项目结构与模块组织

这是一个部署到 Cloudflare Pages 的静态页面项目。`index.html` 包含页面结构、样式和前端脚本，是主要业务入口。`config.json` 保存默认每升优惠金额，`fuel-price.json` 保存深圳 95 号汽油当前价格、来源和更新时间。`scripts/update-fuel-price.mjs` 负责抓取并更新油价数据。`.github/workflows/update-fuel-price.yml` 定时运行抓取脚本并自动提交 `fuel-price.json`。目前没有独立的 `src/`、`tests/` 或资产目录。

## 构建、测试与本地开发命令

- `python -m http.server 8000`：在仓库根目录启动静态服务，用 `http://localhost:8000` 预览页面，并避免本地 `file://` 下 `fetch` 受限。
- `node scripts/update-fuel-price.mjs`：手动抓取油价并写入 `fuel-price.json`。需要 Node 18+，工作流中使用 Node 22。
- `node -e "JSON.parse(require('fs').readFileSync('config.json','utf8')); JSON.parse(require('fs').readFileSync('fuel-price.json','utf8'))"`：快速校验 JSON 文件格式。

本项目没有构建步骤；提交前重点检查页面能加载数据、计算结果正确、JSON 仍可解析。

## 编码风格与命名约定

HTML、CSS、JavaScript 保持在 `index.html` 内，除非功能明显扩大。缩进使用 2 个空格；JSON 使用 2 空格格式化。CSS class 使用 kebab-case，例如 `price-board`；JavaScript 变量和函数使用 camelCase，例如 `updateFuelPrice`。脚本文件使用 ESM `.mjs`，优先使用标准 Web API 和 Node 内置模块，避免为小功能引入依赖。

## 测试指南

当前没有自动化测试框架。修改 UI 或计算逻辑后，应通过本地静态服务手动验证三种换算模式、默认优惠恢复、异常油价输入和 `fuel-price.json` 加载失败场景。修改抓取脚本后，运行脚本并确认 `fuel-price.json` 中 `price`、`status`、`updatedAt`、`note` 字段合理；如网络不可用，至少校验 JSON 和脚本语法。

## 提交与 Pull Request 规范

提交历史使用简短英文祈使句或说明句，例如 `Add fuel volume conversion`、`Update Shenzhen 95 fuel price`。建议保持同样风格：一句话说明用户可见变化或数据更新。PR 应包含变更摘要、手动验证步骤；涉及页面外观时附截图，涉及油价来源时说明来源 URL 或环境变量配置。

## 安全与配置提示

不要把私密来源、凭据或临时调试数据写入仓库。抓取来源可通过 GitHub Actions Variables 配置 `FUEL_PRICE_SOURCE_URL` 和 `FUEL_PRICE_SOURCE_NAME`。修改自动提交工作流时，保留最小权限 `contents: write`，避免扩大权限范围。
