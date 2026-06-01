import { readFile, writeFile } from "node:fs/promises";

const OUTPUT_FILE = new URL("../fuel-price.json", import.meta.url);
const PRICE_MIN = 5;
const PRICE_MAX = 12;

const defaultSources = [
  {
    name: "全国油价网广东页",
    url: "https://www.qiyoujiage.com/guangdong.shtml"
  },
  {
    name: "15天气深圳油价页",
    url: "https://youjia.15tianqi.com/shenzhen/"
  }
];

const envSource = process.env.FUEL_PRICE_SOURCE_URL
  ? [{ name: process.env.FUEL_PRICE_SOURCE_NAME || "自定义油价来源", url: process.env.FUEL_PRICE_SOURCE_URL }]
  : [];

const sources = [...envSource, ...defaultSources];

async function main() {
  const previous = await readPrevious();
  const errors = [];

  for (const source of sources) {
    try {
      const html = await fetchText(source.url);
      const result = parsePrice(html);
      if (result) {
        await writePrice({
          city: "深圳",
          province: "广东",
          fuel: "95号汽油",
          price: result.price,
          currency: "CNY",
          unit: "L",
          source: source.name,
          sourceUrl: source.url,
          updatedAt: new Date().toISOString(),
          status: "ok",
          note: result.note
        });
        console.log(`已更新深圳 95 号汽油价格：${result.price.toFixed(2)} 元/升，来源：${source.name}`);
        return;
      }
      errors.push(`${source.name}: 未在页面中解析到深圳 95 号汽油价格`);
    } catch (error) {
      errors.push(`${source.name}: ${error.message}`);
    }
  }

  await writePrice({
    ...previous,
    updatedAt: new Date().toISOString(),
    status: "stale",
    note: `自动抓取失败，保留上次价格。失败信息：${errors.join("；")}`
  });
  throw new Error(errors.join("\n"));
}

async function readPrevious() {
  try {
    const raw = await readFile(OUTPUT_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return {
      city: "深圳",
      province: "广东",
      fuel: "95号汽油",
      price: 8.3,
      currency: "CNY",
      unit: "L",
      source: "手动初始值",
      sourceUrl: "",
      status: "manual",
      note: "尚无可用抓取结果。"
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
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  const contentType = response.headers.get("content-type") || "";
  const charset = contentType.match(/charset=([^;\s]+)/i)?.[1];
  return decodeBuffer(buffer, charset);
}

function decodeBuffer(buffer, charset) {
  const candidates = [charset, "utf-8", "gb18030"].filter(Boolean);
  for (const encoding of candidates) {
    try {
      const text = new TextDecoder(encoding).decode(buffer);
      if (!text.includes("�")) return text;
    } catch {
      // 继续尝试下一个编码。
    }
  }
  return new TextDecoder("utf-8").decode(buffer);
}

function parsePrice(html) {
  const rows = extractRows(html);
  const fromRows = parseTableRows(rows);
  if (fromRows) return fromRows;

  const text = normalize(stripTags(html));
  return parseFlatText(text);
}

function parseTableRows(rows) {
  let headers = [];

  for (const cells of rows) {
    if (!cells.length) continue;

    const rowText = cells.join(" ");
    if (hasFuel95(rowText) && !hasShenzhen(rowText)) {
      headers = cells;
      continue;
    }

    if (!hasShenzhen(rowText)) continue;

    const labelIndex = headers.findIndex((cell) => hasFuel95(cell));
    if (labelIndex >= 0 && cells[labelIndex]) {
      const price = extractPrice(cells[labelIndex]);
      if (price) {
        return { price, note: "按表头中的 95 号汽油列解析。" };
      }
    }

    const labeled = cells.find((cell) => hasFuel95(cell) && extractPrice(cell));
    if (labeled) {
      return { price: extractPrice(labeled), note: "按同一单元格中的 95 号汽油标签解析。" };
    }

    const numericCells = cells
      .map((cell, index) => ({ cell, index, price: extractPrice(cell) }))
      .filter((item) => item.price);

    if (numericCells.length >= 5) {
      return { price: numericCells[2].price, note: "按常见列序 89/92/95/98/0 解析。" };
    }
    if (numericCells.length >= 4) {
      return { price: numericCells[1].price, note: "按常见列序 92/95/98/0 解析。" };
    }
  }

  return null;
}

function parseFlatText(text) {
  const cityWindow = windowAround(text, /深圳/);
  if (cityWindow) {
    const labeled = cityWindow.match(/95\s*(?:号|#)?\s*(?:汽油)?[^\d]{0,16}(\d+(?:\.\d+)?)/i);
    if (labeled) {
      const value = toValidPrice(labeled[1]);
      if (value) return { price: value, note: "按深圳附近的 95 号汽油文本解析。" };
    }
  }

  const fuelWindow = windowAround(text, /95\s*(?:号|#)?\s*(?:汽油)?/i);
  if (fuelWindow && hasShenzhen(fuelWindow)) {
    const prices = [...fuelWindow.matchAll(/\d+(?:\.\d+)?/g)]
      .map((match) => toValidPrice(match[0]))
      .filter(Boolean);
    if (prices.length) {
      return { price: prices[0], note: "按页面中同时包含深圳和 95 号汽油的文本片段解析。" };
    }
  }

  return null;
}

function extractRows(html) {
  return [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((rowMatch) => {
      return [...rowMatch[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)]
        .map((cellMatch) => normalize(stripTags(cellMatch[1])))
        .filter(Boolean);
    })
    .filter((cells) => cells.length);
}

function stripTags(value) {
  return value
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

function normalize(value) {
  return decodeEntities(value)
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(value) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([a-f0-9]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function extractPrice(value) {
  const prices = [...value.matchAll(/\d+(?:\.\d+)?/g)]
    .map((match) => toValidPrice(match[0]))
    .filter(Boolean);
  return prices[0] || null;
}

function toValidPrice(value) {
  const number = Number.parseFloat(value);
  if (!Number.isFinite(number)) return null;
  if (number < PRICE_MIN || number > PRICE_MAX) return null;
  return Number(number.toFixed(2));
}

function hasShenzhen(value) {
  return /深圳|Shenzhen/i.test(value);
}

function hasFuel95(value) {
  return /95\s*(?:号|#)?\s*(?:汽油)?|95\s*#/i.test(value);
}

function windowAround(text, pattern) {
  const match = text.match(pattern);
  if (!match || match.index === undefined) return "";
  const start = Math.max(0, match.index - 220);
  const end = Math.min(text.length, match.index + 420);
  return text.slice(start, end);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
