import assert from "node:assert";
import { readFileSync } from "node:fs";

// dictionary-popup.js は content script なので、SELECTION_PATTERN の定義行だけ切り出して評価する
const src = readFileSync(new URL("./dictionary-popup.js", import.meta.url), "utf8");
const line = src.match(/^const SELECTION_PATTERN = .*$/m);
assert.ok(line, "SELECTION_PATTERN が見つからない");
const SELECTION_PATTERN = new Function(`${line[0]}\nreturn SELECTION_PATTERN;`)();

const cases = [
  // 引ける
  ["apple", true],
  ["take off", true],
  ["don't worry, be happy", true],
  ['say "hello"', true],
  ["say “hello”", true],
  ["what's up?", true],
  ["it’s fine", true],
  ["well — maybe", true],
  ["(hello)", true],
  // 弾く
  ["こんにちは", false],
  ["英語 word", false],
  ["...", false],
  ["123", false],
  ["!?", false],
  ["hello・world", false],
];

for (const [text, expected] of cases) {
  assert.strictEqual(
    SELECTION_PATTERN.test(text),
    expected,
    `${JSON.stringify(text)} は ${expected ? "通す" : "弾く"} はず`
  );
}

console.log("OK");
