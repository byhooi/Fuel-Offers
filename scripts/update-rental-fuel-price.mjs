import { readFile, writeFile } from "node:fs/promises";

const OUTPUT_FILE = new URL("../rental-fuel-price.json", import.meta.url);
const DEFAULT_SOURCE = {
  name: "小熊油耗岳阳市油价页",
  url: "https://www.xiaoxiongyouhao.com/fprice/cityprice.php?city=%E5%B2%B3%E9%98%B3%E5%B8%82"
};
const source = {
  name: process.env.RENTAL_FUEL_PRICE_SOURCE_NAME || DEFAULT_SOURCE.name,
  url: process.env.RENTAL_FUEL_PRICE_SOURCE_URL || DEFAULT_SOURCE.url
};

async function main() {
  const previous = await readPrevious();

  try {
    const html = await fetchText(source.url);
    const result = parseYueyang92Price(html);
    if (!result) throw new Error("未在页面中解析到岳阳 92 号汽油价格");

    const now = new Date().toISOString();
    await writePrice({
      city: "岳阳",
      province: "湖南",
      fuel: "92号汽油",
      price: result.price,
      currency: "CNY",
      unit: "L",
      source: source.name,
      sourceUrl: source.url,
      updatedAt: now,
      lastAttemptAt: now,
      status: "ok",
      note: result.note,
      observedDiscountPrice: result.observedDiscountPrice,
      observedDiscountPerLiter: result.observedDiscountPrice
        ? Number((result.price - result.observedDiscountPrice).toFixed(2))
        : null
    });
    console.log(`已更新岳阳 92 号汽油价格：${result.price.toFixed(2)} 元/升`);
  } catch (error) {
    await writePrice({
      ...previous,
      lastAttemptAt: new Date().toISOString(),
      status: "stale",
      note: `自动抓取失败，保留上次价格。失败信息：${error.message}`
    });
    throw error;
  }
}

function parseYueyang92Price(html) {
  const text = normalize(stripTags(html));
  const matchedDate = text.match(/岳阳市油价\s+(\d{4}年\d{1,2}月\d{1,2}日)/);
  const pairPatterns = [
    /岳阳市?\s*92\s*#\s*汽油最高价[：:]\s*(\d+(?:\.\d+)?)[，,]\s*优惠价[：:]\s*(\d+(?:\.\d+)?)/i,
    /92\s*#\s*最高价[：:]\s*(\d+(?:\.\d+)?)[，,]\s*优惠价[：:]\s*(\d+(?:\.\d+)?)/i,
    /92\s*#\s*(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/i
  ];

  for (const pattern of pairPatterns) {
    const matched = text.match(pattern);
    if (!matched) continue;
    const highestPrice = toValidPrice(matched[1]);
    const discountPrice = toValidPrice(matched[2]);
    if (!highestPrice) continue;

    const noteParts = ["按小熊油耗岳阳市油价页解析，92# 最高价作为保守预算油价。"];
    if (matchedDate) noteParts.push(`页面日期：${matchedDate[1]}。`);
    if (discountPrice) noteParts.push(`页面优惠价：${discountPrice.toFixed(2)} 元/升。`);
    return {
      price: highestPrice,
      observedDiscountPrice: discountPrice,
      note: noteParts.join("")
    };
  }

  const titleMatch = text.match(/岳阳市油价[^。]{0,100}92\s*#\s*汽油\s*(\d+(?:\.\d+)?)\s*元\/升/i);
  const fallbackPrice = titleMatch ? toValidPrice(titleMatch[1]) : null;
  if (!fallbackPrice) return null;
  return {
    price: fallbackPrice,
    observedDiscountPrice: null,
    note: "按小熊油耗页面标题中的岳阳 92# 汽油价格解析。"
  };
}

async function readPrevious() {
  try {
    return JSON.parse(await readFile(OUTPUT_FILE, "utf8"));
  } catch {
    return {
      city: "岳阳",
      province: "湖南",
      fuel: "92号汽油",
      price: 7.13,
      currency: "CNY",
      unit: "L",
      source: source.name,
      sourceUrl: source.url,
      status: "manual",
      note: "手动初始值，请以当地加油站挂牌价为准。"
    };
  }
}

async function writePrice(data) {
  await writeFile(OUTPUT_FILE, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; FuelOffersBot/1.0; +https://github.com/)",
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    },
    signal: AbortSignal.timeout(15_000)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const buffer = await response.arrayBuffer();
  const contentType = response.headers.get("content-type") || "";
  const charset = contentType.match(/charset=([^;\s]+)/i)?.[1];
  return decodeBuffer(buffer, charset);
}

function decodeBuffer(buffer, charset) {
  for (const encoding of [charset, "utf-8", "gb18030"].filter(Boolean)) {
    try {
      const text = new TextDecoder(encoding).decode(buffer);
      if (!text.includes("�")) return text;
    } catch {
      // 继续尝试下一个编码。
    }
  }
  return new TextDecoder("utf-8").decode(buffer);
}

function stripTags(value) {
  return value
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

function normalize(value) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function toValidPrice(value) {
  const number = Number.parseFloat(value);
  if (!Number.isFinite(number) || number < 5 || number > 12) return null;
  return Number(number.toFixed(2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
