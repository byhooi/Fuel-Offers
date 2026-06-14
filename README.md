# 深圳 95 号汽油优惠计算器

这是一个部署在 Cloudflare Pages 上的静态网页，用于读取 `fuel-price.json` 中的深圳 95 号汽油价格，并根据每升优惠金额换算优惠前后的油费。

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

## 本地预览

直接用浏览器打开 `index.html` 即可。由于浏览器对本地 `fetch` 有限制，直接打开时可能读不到 `fuel-price.json`，页面会自动使用手动输入的油价。

如果要模拟线上静态托管的读取方式，可以在目录中启动一个静态服务：

```bash
python -m http.server 8000
```

然后访问 `http://localhost:8000`。

## Cloudflare Pages 部署

1. 将本目录推送到 GitHub 仓库。
2. 在 Cloudflare Pages 中连接该 GitHub 仓库。
3. 构建设置保持静态站点配置：不需要构建命令，输出目录使用仓库根目录 `/`。
4. 保存后等待 Cloudflare Pages 部署完成。
5. 自定义域名在 Cloudflare Pages 的 `Custom domains` 中配置；仓库中的 `CNAME` 仅作为当前域名备忘，不参与 Cloudflare Pages 域名绑定。

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

用户在网页中手动输入过优惠金额后，浏览器会优先使用用户自己的本地设置；点击“恢复默认优惠”会恢复到 `config.json` 中的默认值。

## 自动更新油价

`.github/workflows/update-fuel-price.yml` 会每天运行一次 `scripts/update-fuel-price.mjs`，抓取深圳 95 号汽油价格并提交更新 `fuel-price.json`。

Cloudflare Pages 连接 GitHub 仓库后，`fuel-price.json` 的自动提交会触发一次新的 Pages 部署，让线上页面读取到最新数据。

当前默认数据源优先级：

1. 小熊油耗深圳市油价页：`https://www.xiaoxiongyouhao.com/fprice/cityprice.php?city=%E6%B7%B1%E5%9C%B3%E5%B8%82`
2. 全国油价网广东页
3. 15 天气深圳油价页

小熊油耗页面中，`95#` 的 `最高价` 会写入 `price`，作为页面里的优惠前挂牌价；`车友实测优惠价` 会写入 `observedDiscountPrice`，并在 `note` 中记录。

如果默认数据源不可用，可以在 GitHub 仓库的 `Settings` → `Secrets and variables` → `Actions` → `Variables` 中配置：

- `FUEL_PRICE_SOURCE_URL`：自定义油价页面地址
- `FUEL_PRICE_SOURCE_NAME`：自定义来源名称

如果配置了自定义来源，脚本会优先使用自定义来源，再回退到内置公开页面。网页抓取受目标站点结构、访问限制和服务稳定性影响；如果抓取失败，会保留上一次价格并在 `note` 中记录失败原因。
