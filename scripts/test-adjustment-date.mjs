import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { parsePrice, parseXiaoxiongAdjustmentDate } from "./update-fuel-price.mjs";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
const fixture = {
  nextAdjustmentAt: "2026-10-16T00:00:00+08:00",
  price: 9.35,
  updatedAt: "2026-10-09T00:00:00Z",
  status: "ok"
};
const windowTime = Date.parse(fixture.nextAdjustmentAt);

function xiaoxiongHtml(visibleDate = "10-16", fullDate = "2026-10-16") {
  return `<h1>深圳市油价</h1><div>2026年10月9日</div>
    <div class="price-adj-progress"><span>上次调价：<b>09-25</b></span>
    <span>还有<b>7</b>天</span><span>下次调价：<b>${visibleDate}</b></span></div>
    <div>95#</div><div>9.35</div><div>9.09</div>
    <script>var shareDesc = "预计下次调价日期：${fullDate}";</script>`;
}

function makeElement(value = "") {
  const classes = new Set();
  return {
    value,
    textContent: "",
    hidden: false,
    style: {},
    dataset: {},
    attributes: {},
    listeners: {},
    children: [],
    classList: {
      toggle(name, enabled) {
        if (enabled) classes.add(name);
        else classes.delete(name);
      },
      remove(name) { classes.delete(name); },
      contains(name) { return classes.has(name); }
    },
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(name, callback) { this.listeners[name] = callback; },
    appendChild(child) { this.children.push(child); },
    querySelector() { return this.children[0] ??= makeElement(); }
  };
}

async function createPage(options = {}) {
  const now = options.now ?? Date.parse("2026-10-09T08:00:00+08:00");
  const elements = new Map([...html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)].map(([tag, id]) => {
    const element = makeElement(tag.match(/\bvalue="([^"]*)"/)?.[1] ?? "");
    element.hidden = /\bhidden\b/.test(tag);
    return [`#${id}`, element];
  }));
  const modes = [...html.matchAll(/data-mode="([^"]+)"/g)].map(([, mode]) => {
    const element = makeElement();
    element.dataset.mode = mode;
    return element;
  });
  const storage = new Map(Object.entries(options.storage ?? {}));
  const responses = {
    "config.json": { defaultDiscountPerLiter: 0.4, defaultTankCapacity: 57 },
    "fuel-price.json": options.data === undefined ? fixture : options.data
  };
  const context = vm.createContext({
    console,
    URL,
    Intl,
    AbortSignal,
    Date: class extends Date {
      constructor(...args) { super(...(args.length ? args : [now])); }
      static now() { return now; }
    },
    document: {
      hidden: false,
      querySelector: (selector) => elements.get(selector),
      querySelectorAll: () => modes,
      createElement: (tagName) => ({ ...makeElement(), tagName })
    },
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key)
    },
    fetch: async (url) => {
      assert.ok(url in responses, `不应额外请求 ${url}`);
      if (options.failFetch === url) throw new Error("网络不可用");
      return {
        ok: options.httpError !== url,
        status: options.httpError === url ? 404 : 200,
        json: async () => {
          if (options.badJson === url) throw new SyntaxError("JSON 无效");
          return responses[url];
        }
      };
    }
  });
  // 直接执行页面的完整脚本，以免测试中的计算副本与真实页面脱节。
  vm.runInContext(script, context, { filename: "index.html" });
  await new Promise((resolve) => setImmediate(resolve));
  return {
    context,
    element: (id) => elements.get(`#${id}`),
    run: (source) => vm.runInContext(source, context)
  };
}

test("小熊页面的油价和调价日一起解析，不多加一天", () => {
  const result = parsePrice(xiaoxiongHtml());
  assert.equal(result.price, 9.35);
  assert.equal(result.observedDiscountPrice, 9.09);
  assert.equal(result.nextAdjustmentAt, fixture.nextAdjustmentAt);
});

test("小熊完整年份直接用于跨年、跨月和闰日", () => {
  assert.equal(parseXiaoxiongAdjustmentDate(xiaoxiongHtml("01-01", "2027-01-01")), "2027-01-01T00:00:00+08:00");
  assert.equal(parseXiaoxiongAdjustmentDate(xiaoxiongHtml("11-01", "2026-11-01")), "2026-11-01T00:00:00+08:00");
  assert.equal(parseXiaoxiongAdjustmentDate(xiaoxiongHtml("02-29", "2028-02-29")), "2028-02-29T00:00:00+08:00");
});

test("缺少、冲突或无效的小熊日期不影响油价解析，也不从剩余天数猜测日期", () => {
  for (const source of [
    xiaoxiongHtml("10-16", "2026-10-15"),
    xiaoxiongHtml("02-30", "2026-02-30"),
    xiaoxiongHtml("02-29", "2026-02-29"),
    xiaoxiongHtml("13-01", "2026-13-01"),
    xiaoxiongHtml("10-16", ""),
    xiaoxiongHtml("", "2026-10-16"),
    xiaoxiongHtml().replace(/<script>[\s\S]*?<\/script>/, "")
  ]) {
    const result = parsePrice(source);
    assert.equal(result.price, 9.35);
    assert.equal(result.nextAdjustmentAt, null);
  }
  assert.equal(parsePrice("深圳 95 号汽油价格为 9.35 元").nextAdjustmentAt, undefined);
});

test("调价时间位于挂牌价区域内，没有倒计时或计时器", () => {
  const priceBoard = html.match(/<aside class="price-board"[\s\S]*?<\/aside>/)?.[0];
  assert.match(priceBoard, /id="priceAdjustment"/);
  assert.match(priceBoard, /id="adjustmentDate"/);
  assert.doesNotMatch(html, /fuel-adjustment\.json|adjustmentCountdown|setInterval|clearInterval|visibilitychange|倒计时/);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(ids.length, new Set(ids).size);
});

test("只显示下次调价时间，与小熊日期一致", async () => {
  const page = await createPage();
  assert.equal(page.element("adjustmentHeading").textContent, "下次调价：");
  assert.equal(page.element("adjustmentDate").textContent, "2026年10月16日 0时");
  assert.equal(page.element("adjustmentDate").dateTime, fixture.nextAdjustmentAt);
  assert.equal(page.element("adjustmentStatus").textContent, "（预计）");
  assert.equal(page.element("priceAdjustment").hidden, false);
});

test("加载时检测窗口边界，过期后不把旧日期标为下次", async () => {
  const before = await createPage({ now: windowTime - 1 });
  assert.equal(before.element("adjustmentHeading").textContent, "下次调价：");
  assert.equal(before.element("adjustmentDate").textContent, "2026年10月16日 0时");
  for (const now of [windowTime, windowTime + 86_400_000]) {
    const page = await createPage({ now });
    assert.equal(page.element("adjustmentHeading").textContent, "下次调价：待更新");
    assert.equal(page.element("adjustmentDate").textContent, "");
    assert.equal(page.element("adjustmentStatus").textContent, "");
  }
});

test("跨年零点保持小熊来源日期", async () => {
  const yearEnd = await createPage({ data: { ...fixture, nextAdjustmentAt: "2027-01-01T00:00:00+08:00" } });
  assert.equal(yearEnd.element("adjustmentDate").textContent, "2027年1月1日 0时");
});

test("拒绝缺失、不存在、未带北京时间和直接使用 24 时的日期", async () => {
  const { context } = await createPage();
  for (const nextAdjustmentAt of [null, 123, "", "invalid", "2026-02-30T00:00:00+08:00",
    "2026-10-16T00:00:00", "2026-10-16T00:00:00Z", "2026-10-15T24:00:00+08:00"]) {
    assert.throws(() => context.parseAdjustmentSchedule({ ...fixture, nextAdjustmentAt }));
  }
  assert.throws(() => context.parseAdjustmentSchedule(null));
});

test("旧数据、备用来源及无效日期隐藏调价时间，不影响油价和计算", async () => {
  for (const nextAdjustmentAt of [undefined, null, "", "invalid", "2026-02-30T00:00:00+08:00"]) {
    const page = await createPage({ data: { ...fixture, nextAdjustmentAt } });
    assert.equal(page.element("priceAdjustment").hidden, true);
    assert.equal(page.element("todayPrice").textContent, "9.35");
    assert.equal(page.element("primaryResult").textContent, "¥313.41");
  }
});

test("油价请求失败、HTTP 错误或坏 JSON 时隐藏调价时间，保留手动计算", async () => {
  for (const options of [
    { failFetch: "fuel-price.json" },
    { httpError: "fuel-price.json" },
    { badJson: "fuel-price.json" }
  ]) {
    const page = await createPage(options);
    assert.equal(page.element("priceAdjustment").hidden, true);
    assert.match(page.element("priceMeta").textContent, /手动输入/);
    assert.notEqual(page.element("primaryResult").textContent, "--");
  }
});

test("抓取失败或超过 48 小时的数据沿用上次日期并提醒", async () => {
  for (const data of [
    { ...fixture, status: "stale" },
    { ...fixture, updatedAt: "2026-10-06T00:00:00Z" }
  ]) {
    const page = await createPage({ data });
    assert.equal(page.element("priceAdjustment").hidden, false);
    assert.equal(page.element("adjustmentStatus").textContent, "（待核实）");
    assert.equal(page.element("adjustmentDate").textContent, "2026年10月16日 0时");
  }
});

test("重新应用数据时清理旧日期与提示", async () => {
  const page = await createPage();
  page.context.renderAdjustmentSchedule({ ...fixture, nextAdjustmentAt: null });
  assert.equal(page.element("priceAdjustment").hidden, true);
  assert.equal(page.element("adjustmentDate").textContent, "");
  assert.equal(page.element("adjustmentStatus").textContent, "");
  page.context.renderAdjustmentSchedule(fixture);
  assert.equal(page.element("priceAdjustment").hidden, false);
  assert.equal(page.element("adjustmentDate").textContent, "2026年10月16日 0时");
});

test("实测价格只作参考，不生成应用按钮或覆盖已有优惠", async () => {
  const page = await createPage({
    data: {
      ...fixture,
      observedDiscountPrice: 9.09,
      observedDiscountPerLiter: 0.26,
      sourceUrl: "https://www.xiaoxiongyouhao.com/"
    },
    storage: { "fuel-discount": "0.60" }
  });
  const children = page.element("sourceLink").children;
  assert.ok(children.some((child) => child.textContent === "车友实测优惠价：9.09 元/升"));
  assert.ok(children.some((child) => child.tagName === "a" && child.textContent === "查看数据来源"));
  assert.ok(children.every((child) => child.tagName !== "button"));
  assert.equal(page.element("discount").value, "0.60");
  assert.equal(page.run('localStorage.getItem("fuel-discount")'), "0.60");
  assert.doesNotMatch(html, /apply-observed|应用实测优惠/);
});

test("回归三种换算、恢复默认优惠与异常油价", async () => {
  const page = await createPage();
  page.run('setMode("before-to-after")');
  assert.equal(page.element("primaryResult").textContent, "¥287.17");
  page.run('setMode("after-to-before")');
  assert.equal(page.element("primaryResult").textContent, "¥313.41");
  page.run('setMode("liters-to-cost")');
  assert.equal(page.element("primaryResult").textContent, "¥268.50");
  assert.equal(page.element("tertiaryResult").textContent, "¥280.50");
  page.element("discount").value = "0.80";
  page.element("discount").listeners.input();
  page.element("resetDefaults").listeners.click();
  assert.equal(page.element("discount").value, "0.40");
  assert.equal(page.run('localStorage.getItem("fuel-discount")'), null);
  page.element("basePrice").value = "0";
  page.element("basePrice").listeners.input();
  assert.equal(page.element("primaryResult").textContent, "--");
  assert.equal(page.element("statusPill").classList.contains("error"), true);
});
