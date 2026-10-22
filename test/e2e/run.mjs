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

// 「下に gap 0px」か「上に gap 8px」に置けているか。transform された body の
// 影響で座標系がずれるとここが崩れる
function isAdjacentToAnchor(event) {
  if (!event?.anchor || !event?.rect) return false;
  const [ax, ay, aw, ah] = event.anchor;
  const [, ry, , rh] = event.rect;
  const below = Math.abs(ry - (ay + ah));
  const above = Math.abs(ry + rh - (ay - 8));
  return Math.min(below, above) <= 3;
}

// #target 内の英単語と矩形。折り返し行の開始位置を求めるのに使う
function wordsInTarget(scope) {
  return scope.evaluate(() => {
    const node = document.getElementById("target").firstChild;
    return [...node.data.matchAll(/[A-Za-z]+/g)].map((match) => {
      const range = document.createRange();
      range.setStart(node, match.index);
      range.setEnd(node, match.index + match[0].length);
      const rect = range.getBoundingClientRect();
      return {
        text: match[0],
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
      };
    });
  });
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
  popupWait = null,
  at = null,
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

  const point = at ? await at(scope) : await wordPoint(scope, word, { shadowHost });
  await page.mouse.move(5, 5);
  await page.mouse.move(offset.x + point.x, offset.y + point.y, { steps: 4 });

  const shown = await waitForPopup(scope, popupWait ?? (mode === "ok" ? 4000 : 6000));
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

// 2. 単語の外(余白)では反応しない。以前は caretRangeFromPoint が返す
// 「最寄りの文字位置」をそのまま使っていたため、余白に置いただけで先頭語が引かれていた
const hoverMiss = (name, fixture, at) =>
  hoverCase({ name, fixture, expectPopup: false, popupWait: 1200, at });

await hoverMiss("余白: 先頭語の左横では出ない", "basic.html", (scope) =>
  scope.evaluate(() => {
    const range = document.createRange();
    range.setStart(document.getElementById("target").firstChild, 0);
    range.setEnd(document.getElementById("target").firstChild, 3);
    const rect = range.getBoundingClientRect();
    return { x: rect.left - 6, y: rect.top + rect.height / 2 };
  })
);

// 3. 段落の上(行の外)をなぞっても先頭語は引かれない
await hoverMiss("余白(上): 先頭語の上では出ない", "basic.html", (scope) =>
  scope.evaluate(() => {
    const range = document.createRange();
    range.setStart(document.getElementById("target").firstChild, 0);
    range.setEnd(document.getElementById("target").firstChild, 3);
    const rect = range.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top - 8 };
  })
);

// 4. 単語と単語の間の空白では、どちらの単語も引かれない
await hoverMiss("余白: 単語間の空白では出ない", "basic.html", (scope) =>
  scope.evaluate(() => {
    const node = document.getElementById("target").firstChild;
    const rectAt = (index, length) => {
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + length);
      return range.getBoundingClientRect();
    };
    const quick = rectAt(node.data.indexOf("quick"), 5);
    const brown = rectAt(node.data.indexOf("brown"), 5);
    return { x: (quick.right + brown.left) / 2, y: quick.top + quick.height / 2 };
  })
);

// 5. 折り返し行の左余白でも、その行の先頭語は引かれない
const secondLine = async (scope) => {
  const words = await wordsInTarget(scope);
  const firstTop = words[0].top;
  return words.find((w) => w.top > firstTop + 1);
};
const secondLineMiddle = async (scope) => {
  const word = await secondLine(scope);
  return { x: word.left - 6, y: word.top + (word.bottom - word.top) / 2 };
};

await hoverMiss("余白: 折り返し行の左横では出ない", "wrapped.html", secondLineMiddle);

// 6. 折り返し行の先頭語そのものは引ける
await hoverCase({
  name: "折り返し行: 先頭語のホバーで出る",
  fixture: "wrapped.html",
  at: async (scope) => {
    const word = await secondLine(scope);
    return { x: (word.left + word.right) / 2, y: word.top + (word.bottom - word.top) / 2 };
  },
});

// 7. pointer-events:none のインライン要素に乗っている文字も引ける
await hoverCase({
  name: "pointer-events:none: ホバーで出る",
  fixture: "pointer-none.html",
  word: "none",
});

// 8. open shadow DOM
await hoverCase({ name: "shadow DOM: ホバーで出る", fixture: "shadow.html", word: "shadow", shadowHost: "host" });

// 9. transformされたbody
{
  const r = await hoverCase({
    name: "transform: ホバーで出る", fixture: "transform.html", word: "transform",
  });
  check("transform: popupが単語の近くに配置される", isAdjacentToAnchor(r?.event), JSON.stringify(r?.event || null));
}

// 10. モーダルダイアログ(top layer)
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

// 11. 選択中のテキストがある間はホバーで出ない
await hoverCase({
  name: "選択中: ホバーで出ない",
  fixture: "selection.html",
  word: "selection",
  expectPopup: false,
  popupWait: 1200,
});

// 11b. 複数行の選択を下から上へドラッグしたとき、カーソル(終端)の行のすぐ下に出す。
// 選択全体の外接矩形を使うと最終行の下に出てしまい、カーソルから遠くなる
{
  await loadFixture("selection-multiline.html");
  await waitForContentScript(page, 4000);
  const points = await page.evaluate(() => {
    const node = document.getElementById("target").firstChild;
    const pointFor = (word) => {
      const index = node.data.indexOf(word);
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + word.length);
      const rect = range.getBoundingClientRect();
      return { x: rect.left + 2, y: rect.top + rect.height / 2 };
    };
    return { from: pointFor("lima"), to: pointFor("alpha") };
  });
  await page.mouse.move(points.from.x, points.from.y);
  await page.mouse.down();
  await page.mouse.move(points.to.x, points.to.y, { steps: 8 });
  await page.mouse.up();

  const shown = await waitForPopup(page, 4000);
  check("複数行選択(下→上): ポップアップが出る", shown);
  if (shown) {
    const geom = await page.evaluate(() => {
      const range = window.getSelection().getRangeAt(0);
      const rects = [...range.getClientRects()].filter((r) => r.width > 0 || r.height > 0);
      const popup = document.getElementById("weblio-dictionary-popup").getBoundingClientRect();
      return {
        lines: rects.length,
        firstBottom: rects[0]?.bottom ?? null,
        lastBottom: rects[rects.length - 1]?.bottom ?? null,
        popupTop: popup.top,
      };
    });
    check("複数行選択(下→上): 複数行にまたがっている", geom.lines >= 3, JSON.stringify(geom));
    check("複数行選択(下→上): カーソル行のすぐ下に出る",
      Math.abs(geom.popupTop - geom.firstBottom) <= 2, JSON.stringify(geom));
    check("複数行選択(下→上): 最終行の下には出ない",
      geom.popupTop < geom.lastBottom - 10, JSON.stringify(geom));
  }
}

// 12. contenteditable
await hoverCase({ name: "contenteditable: ホバーで出る", fixture: "contenteditable.html", word: "editable" });

// 13. user-select:none
await hoverCase({ name: "user-select:none: ホバーで出る", fixture: "user-select.html", word: "unselectable" });

// 14. iframe
await hoverCase({
  name: "iframe: ホバーで出る",
  fixture: "frame.html",
  frameSelector: "#f",
  word: "frame",
});

// 15. 通信が全滅 → 自動再試行で復帰する
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

// 16. HTTP 429 → 自動再試行で復帰する
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

// 17. イディオム候補50件のうち1件が落ちても単語の結果で表示する
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
