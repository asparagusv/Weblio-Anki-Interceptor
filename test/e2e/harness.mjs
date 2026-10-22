// 実拡張を本物のChromeで動かすE2Eの共通部品。
// Weblioへの通信は --host-resolver-rules でローカルのHTTPSサーバへ向け、
// 辞書のHTML/失敗/遅延を決定的に再現する。content scriptのfetchはservice worker
// から出るため、CDPでページ側をモックする方法では捕まえられない。
import { createServer as createHttpServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, "../..");
export const fixturesDir = path.join(here, "fixtures");

// Chrome 137以降、配布版のGoogle Chromeは --load-extension を受け付けない。
// Chrome for Testing か Chromium が必要なので、手元のPlaywright/Puppeteerの
// キャッシュから探し、CHROME環境変数で上書きできるようにする
function findChromeForTesting() {
  if (process.env.CHROME) return process.env.CHROME;
  const bases = [
    path.join(homedir(), "Library/Caches/ms-playwright"),
    path.join(homedir(), ".cache/ms-playwright"),
    path.join(homedir(), "Library/Caches/puppeteer"),
    path.join(homedir(), ".cache/puppeteer"),
  ];
  const suffixes = [
    "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
    "chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
    "chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
    "chrome-linux64/chrome",
    "chrome-linux/chrome",
    "chrome-win64/chrome.exe",
  ];
  const found = [];
  for (const base of bases) {
    if (!existsSync(base)) continue;
    for (const dir of readdirSync(base)) {
      const version = Number((dir.match(/\d+/) || ["0"])[0]);
      for (const suffix of suffixes) {
        const candidate = path.join(base, dir, suffix);
        if (existsSync(candidate)) found.push({ candidate, version });
      }
    }
  }
  found.sort((a, b) => a.version - b.version);
  return found.pop()?.candidate || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
}

export const CHROME = findChromeForTesting();
export const IS_BRANDED_CHROME = CHROME.startsWith("/Applications/Google Chrome.app");

const WEBLIO_HOSTS = ["api.weblio.jp", "ejje.weblio.jp"];

function generateCert() {
  const dir = mkdtempSync(path.join(tmpdir(), "weblio-e2e-cert-"));
  execFileSync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "2",
    "-keyout", path.join(dir, "key.pem"),
    "-out", path.join(dir, "cert.pem"),
    "-subj", "/CN=api.weblio.jp",
    "-addext", `subjectAltName=${WEBLIO_HOSTS.map((h) => `DNS:${h}`).join(",")}`,
  ], { stdio: "ignore" });
  return {
    key: readFileSync(path.join(dir, "key.pem")),
    cert: readFileSync(path.join(dir, "cert.pem")),
  };
}

// WeblioのポップアップAPIが返すHTMLの骨格。parseWeblioHit が
// 「見出しリンク + 日本語の意味 + (研究社)」をヒットと判定できる形にしてある
const HIT = (head) =>
  '<div id="baseMcr"><div id="contentSml"><div id="eBodyMcr">' +
  '<div class="eBarSml"><a class="barL title">' + head + "</a>" +
  '<p class="barR dctCr">(研究社)</p></div>' +
  '<div class="contentMcr">テスト用の意味</div>' +
  "</div></div></div>";

// 見出しリンクが無い=辞書に無い語。HTML自体は返るので「通信失敗」とは区別される
const NOT_FOUND =
  '<div id="baseMcr"><div id="eBodyMcr"><div class="contentMcr">' +
  "英和・和英辞典で一致する英語は見つかりませんでした。" +
  "</div></div></div>";

export async function startMockWeblio() {
  const mock = {
    mode: "ok",
    word: "",
    hitWords: new Set(["quick", "brown", "fox", "jumps", "lazy", "dog", "apple",
      "shadow", "transform", "dialog", "editable", "selection", "unselectable", "frame", "none"]),
    failedOnce: new Set(),
    failedWord: false,
    failedCandidate: false,
    delayMs: 0,
    requests: [],
    reset(word = "") {
      this.mode = "ok";
      this.word = word;
      this.failedOnce = new Set();
      this.failedWord = false;
      this.failedCandidate = false;
      this.delayMs = 0;
      this.requests = [];
    },
  };

  const https = createHttpsServer(generateCert(), (req, res) => {
    const url = new URL(req.url, "https://api.weblio.jp");
    const host = req.headers.host || "";
    const q = url.searchParams.get("q") || "";
    mock.requests.push({ host, q, path: url.pathname });
    // ChromeのHTTPキャッシュがテスト間でレスポンスを使い回し、
    // 失敗注入(fail-word-once等)をすり抜けるのを防ぐ
    res.setHeader("cache-control", "no-store, no-cache, must-revalidate");
    res.setHeader("pragma", "no-cache");

    // 辞書本文ではなくWiktionaryの裏取り用ページ
    if (host.startsWith("ejje.weblio.jp")) {
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end("<html><body>Wiktionary英語版</body></html>");
      return;
    }

    const send = () => {
      res.setHeader("content-type", "text/html; charset=utf-8");
      if (mock.mode === "fail-429" && !mock.failedOnce.has(q)) {
        mock.failedOnce.add(q);
        res.statusCode = 429;
        res.end("rate limited");
        return;
      }
      if (mock.mode === "flaky-idiom" && q !== mock.word && !mock.failedCandidate) {
        mock.failedCandidate = true;
        res.statusCode = 502;
        res.end("bad gateway");
        return;
      }
      const hit = mock.hitWords.has(q);
      res.end(hit ? HIT(q) : NOT_FOUND);
    };

    // ソケットを切るとChromeがGETを自動で1回リトライしてしまい、失敗を
    // 注入できない(サーバ側には2回目が届いて200を返す)。HTTPエラーで返す
    const failOnce = () => {
      res.statusCode = 502;
      res.end("bad gateway");
    };
    if (mock.mode === "fail-transport") {
      failOnce();
      return;
    }
    if (mock.mode === "fail-once" && !mock.failedOnce.has(q)) {
      mock.failedOnce.add(q);
      failOnce();
      return;
    }
    // 単語そのものの取得だけを1回失敗させる(自動再試行の検証用)
    if (mock.mode === "fail-word-once" && q === mock.word && !mock.failedWord) {
      mock.failedWord = true;
      failOnce();
      return;
    }
    if (mock.delayMs) {
      setTimeout(send, mock.delayMs);
      return;
    }
    send();
  });

  const http = createHttpServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const name = url.pathname === "/" ? "basic.html" : path.basename(url.pathname);
    const file = path.join(fixturesDir, name);
    try {
      const body = readFileSync(file);
      res.setHeader("cache-control", "no-store");
      res.setHeader(
        "content-type",
        name.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream"
      );
      res.end(body);
    } catch {
      res.statusCode = 404;
      res.end("not found");
    }
  });

  await Promise.all([
    new Promise((resolve) => https.listen(0, "127.0.0.1", resolve)),
    new Promise((resolve) => http.listen(0, "127.0.0.1", resolve)),
  ]);

  return {
    httpsPort: https.address().port,
    httpPort: http.address().port,
    fixturesUrl: `http://127.0.0.1:${http.address().port}`,
    mock,
    close: () =>
      Promise.all([
        new Promise((resolve) => https.close(resolve)),
        new Promise((resolve) => http.close(resolve)),
      ]),
  };
}

// content scriptはservice worker経由でapi.weblio.jpを叩く。ホスト名をローカルへ
// 向けることで、拡張側にテスト用の分岐を一切入れずに通信を差し替える
// live: Weblioへ実際に通信する(モックへ向けるhost-resolver-rulesを付けない)
export async function launchBrowser({ httpsPort, headless = true, live = false }) {
  const userDataDir = mkdtempSync(path.join(tmpdir(), "weblio-e2e-profile-"));
  const hostRules = WEBLIO_HOSTS.map((h) => `MAP ${h} 127.0.0.1:${httpsPort}`).join(", ");
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless,
    userDataDir,
    defaultViewport: { width: 1000, height: 800 },
    args: [
      `--disable-extensions-except=${repoRoot}`,
      `--load-extension=${repoRoot}`,
      ...(live
        ? []
        : [`--host-resolver-rules=${hostRules}`, "--ignore-certificate-errors",
           "--disable-background-networking"]),
      "--no-first-run",
      "--no-default-browser-check",
    ],
  });
  return { browser, userDataDir };
}

// 拡張のservice workerターゲット。存在すればロードされている証拠になる
export async function waitForExtension(browser, timeout = 15000) {
  return browser.waitForTarget(
    (target) =>
      target.type() === "service_worker" && target.url().startsWith("chrome-extension://"),
    { timeout }
  );
}

const TRACE_NODE = "__weblio_hover_trace";

export async function waitForContentScript(scope, timeout = 5000) {
  await scope.waitForFunction(
    (id) => !!document.getElementById(id),
    { timeout },
    TRACE_NODE
  );
}

export async function readTrace(scope) {
  return scope.evaluate((id) => {
    const el = document.getElementById(id);
    if (!el) return null;
    try {
      return JSON.parse(el.textContent || "[]");
    } catch {
      return null;
    }
  }, TRACE_NODE);
}

// 指定した語の中心座標を、その語を含むテキストノードから求める
export async function wordPoint(scope, word, { shadowHost = null } = {}) {
  return scope.evaluate(
    (target, hostId) => {
      const root = hostId
        ? document.getElementById(hostId)?.shadowRoot
        : document.getElementById("target") || document.body;
      if (!root) throw new Error("root not found");
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const index = node.data.indexOf(target);
        if (index === -1) continue;
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + target.length);
        const rect = range.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      }
      throw new Error(`word not found: ${target}`);
    },
    word,
    shadowHost
  );
}

export async function hasPopup(scope) {
  return scope.evaluate(() => !!document.getElementById("weblio-dictionary-popup"));
}

export async function waitForPopup(scope, timeout = 4000) {
  try {
    await scope.waitForFunction(
      () => !!document.getElementById("weblio-dictionary-popup"),
      { timeout, polling: 50 }
    );
    return true;
  } catch {
    return false;
  }
}

export function lastStage(trace) {
  return trace?.length ? trace[trace.length - 1] : null;
}

export function summarizeTrace(trace) {
  return (trace || [])
    .filter((e) => e.stage !== "env")
    .slice(-12)
    .map((e) => {
      const { t, stage, ...rest } = e;
      const detail = Object.entries(rest)
        .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : v}`)
        .join(" ");
      return `+${t}ms ${stage} ${detail}`;
    })
    .join("\n");
}
