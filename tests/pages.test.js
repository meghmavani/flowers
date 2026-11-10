// Static checks on every flower page. Run with: node --test
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const DIR = path.join(ROOT, "flowers");
const read = (name) => fs.readFileSync(path.join(DIR, `${name}.html`), "utf8");
const names = fs.readdirSync(DIR).filter((f) => f.endsWith(".html")).map((f) => f.slice(0, -5));
const ORIGINAL = ["tulips", "rose", "sunflower", "lilies"];
const NEW = names.filter((n) => !ORIGINAL.includes(n));

const inlineScript = (html) => html.match(/<script>\n([\s\S]*)<\/script>/)[1];
const paletteOf = (html) => {
  const block = html.match(/const PALETTE = \[([\s\S]*?)\n\s*\];/);
  return block ? [...block[1].matchAll(/\[0x([0-9a-f]{6}), 0x([0-9a-f]{6}), 0x([0-9a-f]{6})\]/g)].map((m) => m.slice(1, 4)) : [];
};

test("the original flowers still exist at their original URLs", () => {
  for (const name of ORIGINAL) assert.ok(names.includes(name), name);
});

for (const name of names) {
  test(`${name}: page follows the collection's conventions`, () => {
    const html = read(name);
    assert.doesNotThrow(() => new Function(inlineScript(html)), "script does not parse");
    assert.match(html, /<title>ASCII .+<\/title>/);
    assert.match(html, /name="viewport"/);
    assert.match(html, /id="hint"/);
    // the same renderer and no other external files
    const sources = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(sources, ["https://cdn.jsdelivr.net/npm/pixi.js@8.6.6/dist/pixi.min.js"]);
    for (const hook of ['const RAMP = ".,:;-~=+*#%@"', "function drawAscii(t)", "function buildScene()", "function updateScene(t)",
      "const STEM_TIME = 2.2, BLOOM_DELAY = 1.9, BLOOM_TIME = 2.6", 'key.toLowerCase() === "r"', '"pointerdown", replay']) {
      assert.ok(html.includes(hook), `missing: ${hook}`);
    }
  });
}

for (const name of NEW) {
  test(`${name}: colour change is present and starts after the flower has opened`, () => {
    const html = read(name);
    const palette = paletteOf(html);
    assert.ok(palette.length >= 3, `only ${palette.length} colours`);
    assert.equal(new Set(palette.map((c) => c[0])).size, palette.length, "repeated colour");
    assert.match(html, /const FIRST_CHANGE = Math\.max\(\.\.\.DEFS\.map\(\(d\) => d\.d\)\) \+ BLOOM_DELAY \+ BLOOM_TIME/);
    assert.match(html, /updateColors\(t\);\n\s*updateScene\(t\);/);
    assert.match(html, /id="magic"/);
    const fade = Number(html.match(/const FADE_TIME = ([\d.]+)/)[1]);
    assert.ok(fade >= 1, `fade of ${fade}s would look abrupt`);
  });

  test(`${name}: colour fades are continuous, and no faster than the rose's`, () => {
    const html = read(name);
    // the page's own easing and colour-mixing step, run frame by frame
    const easeInOut = new Function(`return ${html.match(/const easeInOut = (\(t\) => .*);/)[1]}`)();
    assert.ok(html.includes("const local = clamp01(m * (1 + WAVE) - part.wave * WAVE);"), "colour mixing has changed; update this test");
    const fade = Number(html.match(/const FADE_TIME = ([\d.]+)/)[1]);
    const wave = Number(html.match(/WAVE = ([\d.]+)/)[1]);
    const clamp01 = (v) => Math.max(0, Math.min(1, v));
    const share = (sec, w, F, W) => clamp01(easeInOut(clamp01(sec / F)) * (1 + W) - w * W);
    const fastest = (F, W) => {
      let most = 0;
      for (let w = 0; w <= 1; w += 0.05) {
        assert.equal(share(0, w, F, W), 0, "a change must start from the colour already showing");
        assert.equal(share(F, w, F, W), 1, "a change must finish exactly on the new colour");
        for (let s = 0; s < F; s += 1 / 60) most = Math.max(most, share(s + 1 / 60, w, F, W) - share(s, w, F, W));
      }
      return most;
    };
    // the rose's fade (1.2s, no wave) is the reference for "smooth"
    const limit = fastest(1.2, 0) * 1.001;
    const step = fastest(fade, wave);
    assert.ok(step <= limit, `parts change ${(step * 100).toFixed(1)}% of the way per frame; the rose's limit is ${(limit * 100).toFixed(1)}%`);
  });
}

test("new flowers don't reuse one another's palettes or petal code", () => {
  const seenPalette = new Map();
  const seenShapes = new Map();
  for (const name of NEW) {
    const html = read(name);
    const pal = JSON.stringify(paletteOf(html));
    assert.ok(!seenPalette.has(pal), `${name} has the same palette as ${seenPalette.get(pal)}`);
    seenPalette.set(pal, name);
    const shapes = html.slice(html.indexOf("petal / leaf shapes"), html.indexOf("function makeLeaf"));
    assert.ok(!seenShapes.has(shapes), `${name} has the same shapes as ${seenShapes.get(shapes)}`);
    seenShapes.set(shapes, name);
  }
});

test("lilies: each lily has its own palette that opens in its original colour", () => {
  const html = read("lilies");
  const colours = Object.fromEntries([...html.matchAll(/const (\w+) = \[(0x\w+), (0x\w+), (0x\w+)\];/g)].map((m) => [m[1], m.slice(2, 5)]));
  const defs = [...html.matchAll(/\{ x: (\d+), y: (\d+), L: (\d+), c: \[(\w+), (\w+), (\w+)\], d: ([\d.]+), tilt: ([\d.]+) \}/g)];
  assert.equal(defs.length, 10);
  // from the page before colour change was added
  const originals = ["0xd8232a", "0xd94fb5", "0xf1e2cc", "0xe8c93a", "0x9c1632", "0xe6a07a", "0xe8c93a", "0xb0307f", "0xe8c93a", "0xf1e2cc"];
  defs.forEach((d, i) => {
    assert.equal(colours[d[4]][0], originals[i], `lily ${i} no longer opens in its original colour`);
  });
  assert.equal(new Set(defs.map((d) => d.slice(4, 7).join())).size, 10, "two lilies share a palette");
  // and the shared colour logic can't flatten the bouquet
  assert.match(html, /const options = f\.def\.c\.filter/);
  assert.match(html, /const FIRST_CHANGE = /);
});

test("lilies: the original artwork and animation are unchanged", () => {
  const html = read("lilies");
  for (const piece of [
    "bezierCurveTo(w * 0.95, -L * 0.25, w * 0.7, -L * 0.75, 0, -L)", // petal outline
    "const stamens = new PIXI.Graphics();",
    "pt.rotation = lerp(pt.closedAngle, pt.openAngle, oc);",
    "{ x: 395, y: 500, L: 165,", "{ x: 165, y: 720, L: 100,", // bouquet layout
    "for (let i = 0; i < 16; i++)", // grass
  ]) assert.ok(html.includes(piece), piece);
});

test("README lists every flower and links to a real page", () => {
  const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
  for (const name of names) assert.ok(readme.includes(`flowers/${name}.html`), name);
  const linked = [...readme.matchAll(/flowers\/([a-z-]+)\.html/g)].map((m) => m[1]);
  for (const name of linked) assert.ok(names.includes(name), `README links to missing page ${name}`);
});
