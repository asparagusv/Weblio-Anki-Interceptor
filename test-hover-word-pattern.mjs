import assert from "node:assert";
import { readFileSync } from "node:fs";

// dictionary-popup.js は content script なので、HOVER_WORD_PATTERN の定義行だけ切り出して評価する
const src = readFileSync(new URL("./dictionary-popup.js", import.meta.url), "utf8");
const line = src.match(/^const HOVER_WORD_PATTERN = .*$/m);
assert.ok(line, "HOVER_WORD_PATTERN が見つからない");
const HOVER_WORD_PATTERN = new Function(`${line[0]}\nreturn HOVER_WORD_PATTERN;`)();

const cases = [
  // 引ける
  ["apple", true],
  ["rear-ended", true],
  ["well-known", true],
  ["up-to-date", true],
  // 弾く
  ["", false],
  ["-rear", false],
  ["rear-", false],
  ["rear--ended", false],
  ["don't", false],
  ["123", false],
  ["foo_bar", false],
];

for (const [text, expected] of cases) {
  assert.strictEqual(
    HOVER_WORD_PATTERN.test(text),
    expected,
    `${JSON.stringify(text)} は ${expected ? "通す" : "弾く"} はず`
  );
}

console.log("OK");
