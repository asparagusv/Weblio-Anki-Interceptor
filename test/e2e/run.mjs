// 実拡張を本物のChromeで動かすE2E。ページ側のDOM・イベント・Shadow DOM・iframe、
// service workerからの通信まで含めてホバー表示を検証する。
//
//   npm run test:e2e
//   HEADFUL=1 npm run test:e2e   # 画面を見ながら
//
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  repoRoot,
  startMockWeblio,
  launchBrowser,
  waitForExtension,
  waitForContentScript,
  readTrace,
  wordPoint,
  waitForPopup,
  summarizeTrace,
  lastStage,
} from "./harness.mjs";

const artifactsDir = path.join(repoRoot, "test/e2e/artifacts");
mkdirSync(artifactsDir, { recursive: true });

const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${pass ? "" : `\n     ${detail}`}`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function popupShownEvent(trace) {
  return (trace || []).filter((e) => e.stage === "popup-shown").pop() || null;
}

// 「下に gap 8px」か「上に gap 8px」に置けているか。transform された body の
// 影響で座標系がずれるとここが崩れる
function isAdjacentToAnchor(event) {
  if (!event?.anchor || !event?.rect) return false;
  const [ax, ay, aw, ah] = event.anchor;
  const [, ry, , rh] = event.rect;
  const below = Math.abs(ry - (ay + ah + 8));
  const above = Math.abs(ry + rh - (ay - 8));
  return Math.min(below, above) <= 3;
}

const server = await startMockWeblio();
let launched = await launchBrowser({ httpsPort: server.httpsPort, headless: !process.env.HEADFUL });
let browser = launched.browser;

// 新headlessで拡張が読めない環境では headed にフォールバックする
try {
  await waitForExtension(browser, 12000);
} catch {
  console.log("headlessで拡張のservice workerが見つからないため headed で再試行します");
  await browser.close();
  launched = await launchBrowser({ httpsPort: server.httpsPort, headless: false });
  browser = launched.browser;
  await waitForExtension(browser, 15000);
}

const page = await browser.newPage();
const consoleLogs = [];
page.on("console", (msg) => consoleLogs.push(`${msg.type()}: ${msg.text()}`));
page.on("pageerror", (error) => consoleLogs.push(`pageerror: ${error.message}`));

async function loadFixture(name) {
  await page.goto(`${server.fixturesUrl}/${name}`, { waitUntil: "load" });
  await page.evaluate(() => document.fonts?.ready);
  await sleep(80);
}

async function hoverCase({
  name,
  fixture,
  word,
  shadowHost = null,
  frameSelector = null,
  mode = "ok",
  expectPopup = true,
  setup = () => {},
}) {
  server.mock.reset(word);
  server.mock.mode = mode;
  setup(server.mock);
  await loadFixture(fixture);

  let scope = page;
  if (frameSelector) {
    await sleep(150);
    scope = page.frames().find((f) => f.url().endsWith("/frame-inner.html"));
    if (!scope) {
      check(name, false, "iframeが見つからない");
      return null;
    }
  }

  try {
    await waitForContentScript(scope, 4000);
  } catch {
    check(name, false, "content scriptがiframeに注入されていない (all_frames未設定)");
    return null;
  }

  let offset = { x: 0, y: 0 };
  if (frameSelector) {
    offset = await page.evaluate((selector) => {
      const rect = document.querySelector(selector).getBoundingClientRect();
      return { x: rect.left, y: rect.top };
    }, frameSelector);
  }

  const point = await wordPoint(scope, word, { shadowHost });
  await page.mouse.move(5, 5);
  await page.mouse.move(offset.x + point.x, offset.y + point.y, { steps: 4 });

  const shown = await waitForPopup(scope, mode === "ok" ? 4000 : 6000);
  await sleep(200);
  const trace = await readTrace(scope);

  const event = popupShownEvent(trace);
  const mockState = () => JSON.stringify({
    mode: server.mock.mode,
    word: server.mock.word,
    failedWord: server.mock.failedWord,
    failedCandidate: server.mock.failedCandidate,
    failures: server.mock.failedOnce.size,
    requests: server.mock.requests.slice(-4),
  });
  const detail = () =>
    `popup=${shown}\n     mock=${mockState()}\n     last=${JSON.stringify(lastStage(trace))}\n     ${summarizeTrace(trace)}`;

  if (expectPopup) {
    check(name, shown, detail());
  } else {
    check(name, !shown, detail());
  }
  if (shown && !event) {
    check(`${name}: popup-shownトレース`, false, detail());
  }
  return { shown, trace, event, scope, mock: mockState() };
}

// 1. 通常の段落
{
  const r = await hoverCase({ name: "basic: ホバーで出る", fixture: "basic.html", word: "quick" });
  check("basic: popupが画面内で他要素に隠れていない",
    !!r?.event?.onScreen && !r?.event?.covered, JSON.stringify(r?.event || null));
}

// 2. open shadow DOM
await hoverCase({ name: "shadow DOM: ホバーで出る", fixture: "shadow.html", word: "shadow", shadowHost: "host" });

// 3. transformされたbody
{
  const r = await hoverCase({
    name: "transform: ホバーで出る", fixture: "transform.html", word: "transform",
  });
  check("transform: popupが単語の近くに配置される", isAdjacentToAnchor(r?.event), JSON.stringify(r?.event || null));
}

// 4. モーダルダイアログ(top layer)
{
  const r = await hoverCase({ name: "dialog: ホバーで出る", fixture: "dialog.html", word: "dialog" });
  check("dialog: popupがtop layerより手前に見えている",
    r?.event?.onScreen && !r?.event?.covered, JSON.stringify(r?.event || null));
  const bottomHit = await page.evaluate(() => {
    const el = document.getElementById("weblio-dictionary-popup");
    if (!el) return null;
    const box = el.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.bottom - 4);
    return hit?.id || hit?.nodeName || null;
  });
  check("dialog: popupの下端がダイアログにクリップされていない",
    bottomHit === "weblio-dictionary-popup", `hit=${bottomHit}`);
}

// 5. 選択が別の場所に残っている
await hoverCase({ name: "選択残り: ホバーで出る", fixture: "selection.html", word: "selection" });

// 6. contenteditable
await hoverCase({ name: "contenteditable: ホバーで出る", fixture: "contenteditable.html", word: "editable" });

// 7. user-select:none
await hoverCase({ name: "user-select:none: ホバーで出る", fixture: "user-select.html", word: "unselectable" });

// 8. iframe
await hoverCase({
  name: "iframe: ホバーで出る",
  fixture: "frame.html",
  frameSelector: "#f",
  word: "frame",
});

// 9. 通信が全滅 → 自動再試行で復帰する
{
  const r = await hoverCase({
    name: "通信失敗→自動再試行で出る",
    fixture: "basic.html",
    word: "fox",
    mode: "fail-word-once",
  });
  const retried = (r?.trace || []).some((e) => e.stage === "lookup-retry");
  const done = (r?.trace || []).some((e) => e.stage === "lookup-done" && e.attempt >= 1);
  check("通信失敗→再試行: lookup-retry が記録される", retried || !r?.shown,
    `mock=${r?.mock}\n     ${summarizeTrace(r?.trace)}`);
  check("通信失敗→再試行: 2回目で表示される", done || !r?.shown,
    `mock=${r?.mock}\n     ${summarizeTrace(r?.trace)}`);
}

// 10. HTTP 429 → 自動再試行で復帰する
{
  const r = await hoverCase({
    name: "HTTP429→自動再試行で出る",
    fixture: "basic.html",
    word: "brown",
    mode: "fail-429",
  });
  const retried = (r?.trace || []).some((e) => e.stage === "lookup-retry");
  check("HTTP429→再試行: lookup-retry が記録される", retried || !r?.shown, summarizeTrace(r?.trace));
}

// 11. イディオム候補50件のうち1件が落ちても単語の結果で表示する
{
  const r = await hoverCase({
    name: "候補1件失敗でも出る",
    fixture: "basic.html",
    word: "jumps",
    mode: "flaky-idiom",
  });
  const idiom = (r?.trace || []).find((e) => e.stage === "idiom-lookup");
  check("候補1件失敗: 失敗件数が記録される", !r?.shown || (idiom?.failed || 0) >= 1,
    `mock=${r?.mock}\n     ${JSON.stringify(idiom || null)}`);
}

const failed = results.filter((r) => !r.pass);
if (failed.length) {
  try {
    await page.screenshot({ path: path.join(artifactsDir, "last-failure.png") });
  } catch {
    // スクリーンショットは補助情報なので失敗してもよい
  }
}

await browser.close();
await server.close();

if (failed.length) {
  writeFileSync(
    path.join(artifactsDir, "last-failure.json"),
    JSON.stringify({ results, consoleLogs }, null, 2)
  );
  console.log(`\n${failed.length} FAILED (詳細: test/e2e/artifacts/last-failure.json)`);
  for (const log of consoleLogs.slice(-20)) console.log(`  console ${log}`);
  process.exit(1);
}
console.log(`\nALL PASS (${results.length} checks)`);
