// Tests the real daily-rotation script from index.html. Run with: node --test
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const script = fs.readFileSync(path.join(ROOT, "index.html"), "utf8").match(/<script>([\s\S]*)<\/script>/)[1];

// Runs index.html's script against a stand-in page, with the clock under test control.
function load(startAt) {
  let now = startAt;
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const timers = [];
  const listeners = {};
  const frame = { src: "", contentWindow: { focus() {} } };
  const context = vm.createContext({
    Date: FakeDate,
    Math,
    setInterval: (fn) => { timers.push(fn); return timers.length; },
    document: {
      getElementById: () => frame,
      addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
    },
    window: { addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); } },
  });
  vm.runInContext(script, context);
  return {
    frame,
    tick: (to) => { now = to; timers.forEach((fn) => fn()); },
    fire: (to, type) => { now = to; listeners[type].forEach((fn) => fn()); },
    pages: vm.runInContext("[...pages]", context),
    flowerForDay: (day) => vm.runInContext(`flowerForDay(${day})`, context),
    dayNumber: (date) => vm.runInContext(`dayNumber(new Date(${date.getTime()}))`, context),
  };
}

const page = load(Date.UTC(2026, 10, 9, 12));
const { pages, flowerForDay } = page;
const n = pages.length;
const firstDay = Math.floor(Date.UTC(2026, 0, 1) / 86400000);

function withTimeZone(zone, fn) {
  const saved = process.env.TZ;
  process.env.TZ = zone;
  try { fn(); } finally {
    if (saved === undefined) delete process.env.TZ; else process.env.TZ = saved;
  }
}

test("every flower file is registered, and every registered flower has a file", () => {
  const files = fs.readdirSync(path.join(ROOT, "flowers")).filter((f) => f.endsWith(".html")).map((f) => f.slice(0, -5));
  assert.deepEqual([...pages].sort(), files.sort());
  assert.equal(new Set(pages).size, n, "pages list has a duplicate");
});

test("the same date always gives the same flower", () => {
  const again = load(Date.UTC(2026, 10, 9, 12));
  for (let i = 0; i < 2000; i++) assert.equal(flowerForDay(firstDay + i), again.flowerForDay(firstDay + i));
});

test("every flower appears once in each round, with no early repeats", () => {
  const start = Math.ceil(firstDay / n) * n;
  for (let round = 0; round < 2000; round++) {
    const shown = new Set();
    for (let i = 0; i < n; i++) shown.add(flowerForDay(start + round * n + i));
    assert.equal(shown.size, n, `round ${round}`);
  }
});

test("the same flower never shows two days running, over 100 years", () => {
  for (let i = 0; i < 36525; i++) {
    assert.notEqual(flowerForDay(firstDay + i), flowerForDay(firstDay + i + 1), `day ${firstDay + i}`);
  }
});

test("the last flower of a round never opens the next round", () => {
  const start = Math.ceil(firstDay / n) * n;
  for (let round = 1; round < 2000; round++) {
    assert.notEqual(flowerForDay(start + round * n - 1), flowerForDay(start + round * n));
  }
});

test("the order is shuffled, and doesn't favour any flower", () => {
  const start = Math.ceil(firstDay / n) * n;
  const openers = Object.fromEntries(pages.map((p) => [p, 0]));
  const rounds = 4800;
  for (let round = 0; round < rounds; round++) openers[flowerForDay(start + round * n)]++;
  const expected = rounds / n;
  for (const p of pages) {
    assert.ok(openers[p] > expected * 0.6 && openers[p] < expected * 1.4, `${p} opened ${openers[p]} rounds, expected about ${expected}`);
  }
  const first = [...Array(n)].map((_, i) => flowerForDay(start + i));
  const second = [...Array(n)].map((_, i) => flowerForDay(start + n + i));
  assert.notDeepEqual(first, second);
});

test("day numbers step by exactly one across month and year ends and leap days", () => {
  const boundaries = [[2026, 0, 31], [2026, 11, 31], [2028, 1, 28], [2028, 1, 29], [2027, 1, 28]];
  for (const [y, m, d] of boundaries) {
    assert.equal(page.dayNumber(new Date(y, m, d + 1, 0, 0)) - page.dayNumber(new Date(y, m, d, 23, 59)), 1, `${y}-${m + 1}-${d}`);
  }
});

test("each calendar date maps to one day number in every time zone, through daylight saving", () => {
  const expected = Math.floor(Date.UTC(2026, 2, 8) / 86400000);
  for (const zone of ["UTC", "Asia/Kolkata", "America/New_York", "Pacific/Auckland", "Pacific/Kiritimati", "Pacific/Pago_Pago"]) {
    withTimeZone(zone, () => {
      assert.equal(page.dayNumber(new Date(2026, 2, 8, 0, 0, 0)), expected, `${zone} start of day`);
      assert.equal(page.dayNumber(new Date(2026, 2, 8, 23, 59, 59)), expected, `${zone} end of day`);
    });
  }
  // New York's clocks go forward on 2026-03-08, London's back on 2026-10-25.
  withTimeZone("America/New_York", () => {
    let last = page.dayNumber(new Date(2026, 2, 1, 12));
    for (let d = 2; d <= 31; d++) {
      const next = page.dayNumber(new Date(2026, 2, d, 12));
      assert.equal(next - last, 1);
      last = next;
    }
  });
  withTimeZone("Europe/London", () => {
    assert.equal(page.dayNumber(new Date(2026, 9, 26, 0, 0)) - page.dayNumber(new Date(2026, 9, 25, 23, 59)), 1);
  });
});

test("viewers in different time zones get the flower for their own local date", () => {
  // 2026-11-09 20:00 UTC is already the 10th in Auckland, and still the 9th in New York.
  const instant = new Date(Date.UTC(2026, 10, 9, 20)).getTime();
  const day9 = Math.floor(Date.UTC(2026, 10, 9) / 86400000);
  withTimeZone("Pacific/Auckland", () => assert.equal(page.dayNumber(new Date(instant)), day9 + 1));
  withTimeZone("America/New_York", () => assert.equal(page.dayNumber(new Date(instant)), day9));
});

test("an open page moves to the next flower at local midnight, and not before", () => {
  const midnight = new Date(2026, 10, 10, 0, 0, 0).getTime();
  const open = load(midnight - 60000);
  const before = open.frame.src;
  assert.match(before, /^flowers\/.+\.html$/);
  open.tick(midnight - 1000);
  assert.equal(open.frame.src, before, "changed before midnight");
  open.tick(midnight);
  assert.notEqual(open.frame.src, before, "did not change at midnight");
  assert.equal(open.frame.src, `flowers/${open.flowerForDay(open.dayNumber(new Date(midnight)))}.html`);
  const after = open.frame.src;
  open.tick(midnight + 3600000);
  assert.equal(open.frame.src, after, "reloaded during the same day");
});

test("a page that slept through midnight catches up as soon as it's visible again", () => {
  const midnight = new Date(2026, 10, 10, 0, 0, 0).getTime();
  for (const event of ["visibilitychange", "pageshow"]) {
    const open = load(midnight - 60000);
    const before = open.frame.src;
    open.fire(midnight + 8 * 3600000, event);
    assert.notEqual(open.frame.src, before, event);
  }
});
