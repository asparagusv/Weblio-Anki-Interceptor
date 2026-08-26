import assert from "node:assert";
import { readFileSync } from "node:fs";

// dictionary-popup.js は content script なので、positionPopup 部分だけ切り出して評価する
const src = readFileSync("/Users/grannet/code/Weblio-Anki-Interceptor/dictionary-popup.js", "utf8");
const start = src.indexOf("const POPUP_GAP");
const end = src.indexOf("// ポップアップを表示。");
const fn = new Function("window", src.slice(start, end) + "\nreturn positionPopup;")({ innerWidth: 1000, innerHeight: 800 });

function run(anchor, popupH, popupW = 400) {
  const style = {};
  const content = { style: {} };
  const el = {
    style,
    getBoundingClientRect: () => ({
      height: content.style.maxHeight ? Math.min(popupH, parseInt(content.style.maxHeight)) : popupH,
      width: popupW,
    }),
  };
  fn(el, content, anchor);
  return { top: parseFloat(style.top), left: parseFloat(style.left), max: content.style.maxHeight };
}

const line = (top, h = 20) => ({ top, bottom: top + h, left: 100 });

// 下に余裕あり → 行の下
assert.strictEqual(run(line(100), 300).top, 128);
// 下が足りず上に余裕あり → 行の上、下端が行の上に来る
const above = run(line(600), 300);
assert.strictEqual(above.top, 600 - 8 - 300);
// どちらも足りない → 広い側に置いて高さを詰め、行に食い込まない
const squeezed = run(line(400), 700);
assert.ok(squeezed.max, "maxHeight should be set");
const squeezedH = parseInt(squeezed.max);
assert.ok(
  squeezed.top >= 428 || squeezed.top + squeezedH <= 392,
  `should not overlap the line: top=${squeezed.top} h=${squeezedH}`
);
// 右端はみ出しはクランプ
assert.strictEqual(run({ top: 100, bottom: 120, left: 900 }, 200).left, 1000 - 400 - 8);

console.log("OK");
