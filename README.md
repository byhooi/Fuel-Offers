# 深圳 95 号汽油优惠计算器

这是一个部署在 GitHub Pages 上的静态网页，用于读取 `fuel-price.json` 中的深圳 95 号汽油价格，并根据每升优惠金额换算优惠前后的油费。

线上地址：[汽油优惠计算器](https://jy.468024.xyz/) · [租车还车补油](https://jy.468024.xyz/rental-fuel.html)。当前自定义域名以仓库根目录的 `CNAME` 为准。

项目同时提供 `rental-fuel.html`，用于计算湖南岳阳租车还车前需要补加的 92 号汽油量和费用。该页面根据租车 App 油量传感器显示的取车与当前剩余升数直接相减得到缺口，按加油站实际枪价折算建议加油金额（向上取整到 10 元），并显示相比挂牌价省了多少。

## 功能

- 显示深圳 95 号汽油今日挂牌价
- 设置每升优惠金额，例如 `0.40` 元/升
- 通过 `config.json` 配置默认每升优惠金额
- 从优惠前油费推算实际支付金额
- 从实际支付金额反推优惠前油费
- 从加油量推算优惠前油费、实际支付金额和节省金额
- 显示约加油量和节省金额
- 使用 GitHub Actions 定时更新 `fuel-price.json`
- 默认从小熊油耗深圳市油价页抓取 `95#` 的最高价和车友实测优惠价
- 从小熊油耗岳阳市油价页抓取 `92#` 最高价和优惠价，写入独立的 `rental-fuel-price.json`
- 按租车 App 显示的取车/当前剩余升数相减计算还车补油量与建议加油金额
- 显示实际枪价相比挂牌价的每升优惠和本次补油节省金额

## 本地预览

直接用浏览器打开 `index.html` 即可。由于浏览器对本地 `fetch` 有限制，直接打开时可能读不到 `fuel-price.json`，页面会自动使用手动输入的油价。

如果要模拟线上静态托管的读取方式，可以在目录中启动一个静态服务：

```bash
python -m http.server 8000
```

然后访问 `http://localhost:8000`。

租车还车补油页面地址为 `http://localhost:8000/rental-fuel.html`。

## GitHub Pages 部署

本项目无需构建，可从仓库根目录直接发布。分支发布方式的配置如下，实际发布来源以仓库设置为准：

1. 将本目录推送到 GitHub 仓库的 `main` 分支。
2. 打开仓库 `Settings` → `Pages`，将 `Source` 设为 `Deploy from a branch`。
3. 发布分支选择 `main`，目录选择 `/ (root)`，保存后等待部署完成。
4. 在 `Custom domain` 中配置 `jy.468024.xyz`，并确保根目录 `CNAME` 保持相同域名；文件只包含域名，不带协议或路径。
5. 在 DNS 服务商处将子域名 `jy` 的 CNAME 记录指向 `byhooi.github.io`。等待 DNS 校验和证书签发完成后，在 Pages 设置中启用 `Enforce HTTPS`。

按分支发布时，仓库中的 `CNAME` 用于自定义域名配置，不再只是备忘文件；如果使用自定义 GitHub Actions 发布，GitHub 会忽略该文件，应在 Pages 设置中配置域名。参见 [GitHub Pages 自定义域名说明](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)。

## 默认优惠配置

默认每升优惠金额写在 `config.json`：

```json
{
  "defaultDiscountPerLiter": 0.4
}
```

例如想把默认优惠改成每升 `0.7` 元，只需要改成：

```json
{
  "defaultDiscountPerLiter": 0.7
}
```

用户在网页中手动输入过优惠金额后，浏览器会优先使用用户自己的本地设置；点击“恢复默认优惠”会清除本地记忆，恢复并重新跟随 `config.json` 中的默认值。

## 自动更新油价

`.github/workflows/update-fuel-price.yml` 会每天运行两次 `scripts/update-fuel-price.mjs`（北京时间约 6:30 和 12:30，后者作为失败重试），抓取深圳 95 号汽油价格并提交更新 `fuel-price.json`。

同一工作流还会运行 `scripts/update-rental-fuel-price.mjs`，从小熊油耗岳阳市油价页抓取 92 号汽油最高价和优惠价，并更新 `rental-fuel-price.json`。租车页面把最高价作为默认枪价和优惠对比基准，可一键改用页面提供的车友实测优惠价，也可手动填入常去油站的实际枪价（会被浏览器记住）。

两个脚本采用相同的更新策略：每次抓取成功都会写入对应 JSON，并刷新 `updatedAt` 和 `lastAttemptAt`，即使价格没有变化；手动运行与定时运行行为一致。项目迁移到 GitHub Pages 后，已移除原先为减少 Cloudflare Pages 部署次数设置的深圳油价 28 小时跳过写入逻辑。抓取失败时仍保留上次价格和 `updatedAt`，更新 `lastAttemptAt`、`status` 和失败说明。

**发布验证：** 油价数据提交和网站部署是两个环节。检查自动更新时，应在 GitHub Actions 中确认油价提交对应的 `pages build and deployment` 已成功，再核对线上 `fuel-price.json` 与 `rental-fuel-price.json`。分支发布使用 GitHub 管理的 Pages 流程，仓库没有独立的部署 YAML 不代表缺少部署。2026-10-08 的实际记录显示，自动油价提交 `34ae475` 已完成 [Pages 构建与部署](https://github.com/byhooi/Fuel-Offers/actions/runs/37770829007)，不应将当前流程描述为发布中断。

当前默认数据源优先级：

1. 小熊油耗深圳市油价页：`https://www.xiaoxiongyouhao.com/fprice/cityprice.php?city=%E6%B7%B1%E5%9C%B3%E5%B8%82`
2. 全国油价网广东页
3. 15 天气深圳油价页

小熊油耗页面中，`95#` 的 `最高价` 会写入 `price`，作为页面里的优惠前挂牌价；`车友实测优惠价` 会写入 `observedDiscountPrice`，并在 `note` 中记录。

如果默认数据源不可用，可以在 GitHub 仓库的 `Settings` → `Secrets and variables` → `Actions` → `Variables` 中配置：

- `FUEL_PRICE_SOURCE_URL`：自定义油价页面地址
- `FUEL_PRICE_SOURCE_NAME`：自定义来源名称

如果配置了自定义来源，脚本会优先使用自定义来源，再回退到内置公开页面。网页抓取受目标站点结构、访问限制和服务稳定性影响；如果抓取失败，会保留上一次价格，将 `status` 置为 `stale` 并在 `note` 中记录失败原因，页面检测到 `stale` 状态或数据超过 48 小时未更新时会显示提醒。
