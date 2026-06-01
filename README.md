# 深圳 95 号汽油优惠计算器

这是一个可直接托管到 GitHub Pages 的静态网页，用于读取 `fuel-price.json` 中的深圳 95 号汽油价格，并根据每升优惠金额换算优惠前后的油费。

## 功能

- 显示深圳 95 号汽油今日挂牌价
- 设置每升优惠金额，例如 `0.40` 元/升
- 从优惠前油费推算实际支付金额
- 从实际支付金额反推优惠前油费
- 显示约加油量和节省金额
- 使用 GitHub Actions 定时更新 `fuel-price.json`

## 本地预览

直接用浏览器打开 `index.html` 即可。由于浏览器对本地 `fetch` 有限制，直接打开时可能读不到 `fuel-price.json`，页面会自动使用手动输入的油价。

如果要模拟 GitHub Pages 的读取方式，可以在目录中启动一个静态服务：

```bash
python -m http.server 8000
```

然后访问 `http://localhost:8000`。

## GitHub Pages 部署

1. 将本目录推送到 GitHub 仓库。
2. 在仓库设置中进入 `Settings` → `Pages`。
3. `Build and deployment` 选择 `Deploy from a branch`。
4. 分支选择 `main`，目录选择 `/root`。
5. 保存后等待 Pages 发布。

## 自动更新油价

`.github/workflows/update-fuel-price.yml` 会每天运行一次 `scripts/update-fuel-price.mjs`，抓取深圳 95 号汽油价格并提交更新 `fuel-price.json`。

如果默认数据源不可用，可以在 GitHub 仓库的 `Settings` → `Secrets and variables` → `Actions` → `Variables` 中配置：

- `FUEL_PRICE_SOURCE_URL`：自定义油价页面地址
- `FUEL_PRICE_SOURCE_NAME`：自定义来源名称

当前脚本优先使用自定义来源，再回退到内置公开页面。网页抓取受目标站点结构、访问限制和服务稳定性影响；如果抓取失败，会保留上一次价格并在 `note` 中记录失败原因。
