// 実Weblioに通信するライブスモークテスト。モックを通さないので、
// Weblio側のHTML構造・レート制限・service workerからのfetchまで含めて確認できる。
//
//   npm run test:e2e:live
//   HEADFUL=1 npm run test:e2e:live
//
import {
  startMockWeblio,
  launchBrowser,
  waitForExtension,
  waitForContentScript,
  readTrace,
  wordPoint,
  waitForPopup,
  summarizeTrace,
} from "./harness.mjs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// モックのHTTPSサーバは使わないが、フィクスチャ用のHTTPサーバを立てるのに流用する
const server = await startMockWeblio();
const launched = await launchBrowser({
  httpsPort: server.httpsPort,
  headless: !process.env.HEADFUL,
  live: true,
});
const { browser } = launched;

let ok = false;
let reason = "";
let trace = [];
let event = null;

try {
  await waitForExtension(browser, 15000);
  const page = await browser.newPage();
  await page.goto(`${server.fixturesUrl}/basic.html`, { waitUntil: "load" });
  await waitForContentScript(page, 5000);

  const point = await wordPoint(page, "quick");
  await page.mouse.move(5, 5);
  await page.mouse.move(point.x, point.y, { steps: 4 });

  // 実回線は遅いことがあるので長めに待つ
  ok = await waitForPopup(page, 20000);
  await sleep(300);
  trace = await readTrace(page);
  event = (trace || []).filter((e) => e.stage === "popup-shown").pop() || null;

  if (!ok) {
    reason = "ポップアップが出なかった";
  } else if (!event) {
    reason = "popup-shownトレースが無い";
  } else if (event.covered) {
    reason = `popupが${event.topElement}に隠れている`;
  } else if (!event.headword) {
    reason = "見出し語が空";
  } else {
    // タイムアウト→自動再試行で復帰したケースも成功扱い。件数だけ注意として出す
    const errors = (trace || []).filter((e) => e.stage === "fetch-error");
    if (errors.length) {
      console.log(`WARN live: fetch-error ${errors.length}件 (自動再試行で復帰)`);
    }
    ok = true;
  }

  if (ok) {
    const ms = (trace || []).filter((e) => e.stage === "lookup-done").pop()?.ms ?? "?";
    console.log(`PASS live: 実Weblioで出る headword=${event.headword} lookup=${ms}ms`);
  } else {
    console.log(`FAIL live: ${reason}\n${summarizeTrace(trace)}`);
  }
} catch (error) {
  reason = error?.message || String(error);
  console.log(`FAIL live: ${reason}\n${summarizeTrace(trace)}`);
} finally {
  await browser.close().catch(() => {});
  await server.close().catch(() => {});
}

if (!ok) process.exitCode = 1;
