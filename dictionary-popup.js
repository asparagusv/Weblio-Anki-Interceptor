// dictionary-popup.js - 単語をホバー/選択するとWeblioのポップアップ辞書を表示するcontent script
// +ボタン押下時、ホバー/選択で掴んだRangeをmark.jsのextractMarkedTextに渡し、
// 周辺のブロック要素だけを例文として自動登録する(選択操作なしでも例文登録が動くようにするため)

let popupElement = null;
let currentWord = null;
// ポップアップ内を操作したら、後から届いたイディオムで再描画しない
// (翻訳を押した直後に差し替わって翻訳が消えるのを防ぐ)
let popupLocked = false;
let hoverTimer = null;
let lastHoveredWord = null;
let hoveredRange = null;
// ホバーした単語を含むテキストと、その中での単語の開始位置。イディオム候補を組むのに使う
let hoveredContext = null;
let autoCloseTimer = null;
// mousemoveのたびに同じログを積まないための直近ヒット状態
let lastHitKey = null;

// ホバー診断ログ。ホバーが出ないときに「どの段階で落ちたか」を後から追えるようにする。
// ページ側のコンソール/E2Eからも読めるよう、直近のログを隠し要素に書き出す
// (content scriptはアイソレーテッドワールドなのでwindowを共有できない)
const HOVER_TRACE_LIMIT = 200;
const hoverTrace = [];
let traceNode = null;
let traceSyncScheduled = false;

function traceEnv() {
  const body = document.body;
  const style = body ? getComputedStyle(body) : null;
  return {
    href: location.href,
    top: window === window.top,
    bodyTransform: style?.transform || null,
    bodyPosition: style?.position || null,
  };
}

function syncTraceNode() {
  traceSyncScheduled = false;
  if (!document.documentElement) return;
  if (!traceNode || !traceNode.isConnected) {
    traceNode = document.createElement("pre");
    traceNode.id = "__weblio_hover_trace";
    traceNode.hidden = true;
    traceNode.style.cssText = "display:none !important";
    document.documentElement.appendChild(traceNode);
  }
  traceNode.textContent = JSON.stringify(hoverTrace.slice(-50));
}

function trace(stage, detail = {}) {
  const entry = { t: Math.round(performance.now()), stage, ...detail };
  hoverTrace.push(entry);
  if (hoverTrace.length > HOVER_TRACE_LIMIT) hoverTrace.shift();
  if (!traceSyncScheduled) {
    traceSyncScheduled = true;
    queueMicrotask(syncTraceNode);
  }
  return entry;
}

// ポインタ位置にある要素を、Shadow DOM の内側から手前→奥の順に返す。
// document.elementsFromPoint は shadow root の中を列挙しないので、
// 最前面の host の shadowRoot で引き直して内側を先に足す
function elementsFromPointInRoot(root, clientX, clientY) {
  if (typeof root.elementsFromPoint === "function") {
    return root.elementsFromPoint(clientX, clientY);
  }
  // 古いブラウザ向け。最前面の要素から祖先を辿れば、ポインタ上の文字を含む
  // 要素はすべて揃う
  const elements = [];
  let element = root.elementFromPoint?.(clientX, clientY);
  while (element) {
    elements.push(element);
    element = element.parentElement;
  }
  return elements;
}

function elementsFromPointDeep(clientX, clientY) {
  const layers = [];
  let root = document;
  for (let depth = 0; root && depth < 10; depth += 1) {
    const list = elementsFromPointInRoot(root, clientX, clientY);
    if (!list.length) break;
    layers.push(list);
    const top = list[0];
    if (!top?.shadowRoot) break;
    root = top.shadowRoot;
  }
  const elements = [];
  const seen = new Set();
  // 内側(shadow root)の要素ほど後に積まれるので、逆順にすれば手前から列挙できる
  for (const list of layers.reverse()) {
    for (const element of list) {
      if (seen.has(element)) continue;
      seen.add(element);
      elements.push(element);
    }
  }
  return elements;
}

function deepElementFromPoint(clientX, clientY) {
  return elementsFromPointDeep(clientX, clientY)[0] || null;
}

// ポインタが単語の矩形に乗っているかの許容幅。行の左余白や段落の上でも
// 「最寄りの文字位置」を返してしまう API に頼らず、矩形で判定する
const WORD_POINT_SLOP = 2;
const POINT_TEXT_NODE_LIMIT = 2000;
const WORD_PATTERN = /[0-9A-Za-z._-]+/g;

function rangeHitsPoint(range, clientX, clientY) {
  for (const rect of range.getClientRects()) {
    if (
      clientX >= rect.left - WORD_POINT_SLOP && clientX <= rect.right + WORD_POINT_SLOP &&
      clientY >= rect.top - WORD_POINT_SLOP && clientY <= rect.bottom + WORD_POINT_SLOP
    ) {
      return true;
    }
  }
  return false;
}

function wordRangeInTextNode(node, clientX, clientY) {
  WORD_PATTERN.lastIndex = 0;
  let match;
  while ((match = WORD_PATTERN.exec(node.data))) {
    const range = document.createRange();
    range.setStart(node, match.index);
    range.setEnd(node, match.index + match[0].length);
    if (rangeHitsPoint(range, clientX, clientY)) return { range, node };
  }
  return null;
}

// ポインタ位置の要素から単語を探す。テキストノードごとに、ポインタが乗っている
// 行だけを単語単位で走査する(巨大なコンテナでも全文字を舐めない)
function findWordAtPoint(clientX, clientY) {
  const seenNodes = new Set();
  let checked = 0;
  for (const root of elementsFromPointDeep(clientX, clientY)) {
    if (!root.isConnected) continue;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let textNode;
    while ((textNode = walker.nextNode())) {
      if (seenNodes.has(textNode)) continue;
      seenNodes.add(textNode);
      if (checked >= POINT_TEXT_NODE_LIMIT) return null;
      checked += 1;
      if (!textNode.data.trim()) continue;

      const lineRange = document.createRange();
      lineRange.selectNodeContents(textNode);
      if (!rangeHitsPoint(lineRange, clientX, clientY)) continue;

      const hit = wordRangeInTextNode(textNode, clientX, clientY);
      if (hit) return hit;
    }
  }
  return null;
}

// マウスポインターの位置から英単語とそのRangeを抽出。
// 失敗時も reason を返す(なぜホバーが反応しないかをトレースに出すため)
function getWordUnderCursor(clientX, clientY) {
  try {
    const hit = findWordAtPoint(clientX, clientY);
    if (!hit) return { reason: "no-word" };

    const { node } = hit;
    const raw = node.data || "";
    const matched = raw.slice(hit.range.startOffset, hit.range.endOffset);
    // 単語パターンは小数点・アンダースコア・ハイフンも含むため、
    // "accuracy." のように文末のピリオドまで入ってくる。前後の記号だけ落とし、
    // well-known / 3.14 のような語中の記号は残す
    const leadingPunct = (matched.match(/^[._-]+/) || [""])[0].length;
    const word = matched.slice(leadingPunct).replace(/[._-]+$/, "");
    if (!word) return { reason: "empty-word" };

    const wordStart = hit.range.startOffset + leadingPunct;
    const range = document.createRange();
    range.setStart(node, wordStart);
    range.setEnd(node, wordStart + word.length);

    // text/start はイディオム候補を組むための周辺文脈。テキストノード1つぶんだけだと
    // <b>keep</b> stress at bay のようにインライン要素で分断された文や、
    // Language Reactorの字幕のように単語ごとに別々の<span>に分かれているページで
    // 前後の単語が見えない。mark.jsのcollectVisibleTextでブロック要素全体から
    // 組み立て直す(findBlockAncestor/collectVisibleTextはmark.jsで定義、同じワールドを共有)
    let text = raw;
    let start = wordStart;
    const block = findBlockAncestor(range);
    if (block) {
      const collected = collectVisibleText(block, { node, offset: wordStart });
      if (collected.targetIndex >= 0) {
        text = collected.text;
        start = collected.targetIndex;
      }
    }
    return {
      word,
      range,
      text,
      start,
      nodeTag: node.parentElement?.nodeName,
      inShadow: node.getRootNode() instanceof ShadowRoot,
    };
  } catch (error) {
    return { reason: "exception", error: error?.message || String(error) };
  }
}

// WeblioのHTMLを取得(CORSにかかるためbackground側に代行させる)
async function fetchWeblioUrl(url) {
  const started = performance.now();
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type: "fetchWeblio", url }, (res) => {
        const ms = Math.round(performance.now() - started);
        if (chrome.runtime.lastError) {
          trace("fetch-error", {
            url, ms, error: chrome.runtime.lastError.message,
          });
          console.error("[weblio] Dictionary fetch error:", chrome.runtime.lastError.message);
          resolve(null);
          return;
        }
        if (!res || !res.ok) {
          trace("fetch-error", { url, ms, status: res?.status, error: res?.error || "unknown" });
          console.error("[weblio] Dictionary fetch error:", res?.status || "", res?.error || "unknown");
          resolve(null);
          return;
        }
        // 50件並列で投げるので、成功は遅いものだけ残す(全部残すとトレースが埋まる)
        if (ms > 1500) trace("fetch-slow", { url, ms });
        resolve(res.text);
      });
    } catch (error) {
      // 拡張を再読み込み/更新すると、古いcontent scriptからのsendMessageは
      // "Extension context invalidated." で同期的にthrowする。握らないと
      // Promise.allごと落ちて、そのページでは二度とポップアップが出なくなる
      trace("fetch-error", {
        url, ms: Math.round(performance.now() - started), error: error?.message || String(error),
      });
      console.error("[weblio] Dictionary fetch error:", error?.message || error);
      resolve(null);
    }
  });
}

// ポップアップ辞書の1件ぶんのHTML
function fetchDictionaryHTML(word) {
  return fetchWeblioUrl(
    `https://api.weblio.jp/act/quote/v_1_0/e/?q=${encodeURIComponent(word)}&type=emicro&opul=chrome-extension%3A%2F%2F`
  );
}

// Weblioは見出しが見つからないとき見出しリンク(a.barL.title)を返さないので、その有無でヒット判定する。
// (Tatoeba)は例文コーパスで he opened the door→彼はドアをあけた。が丸ごと当たるので常に捨てる
const EXAMPLE_CORPUS_SOURCE = "(Tatoeba)";
// (Weblio)は辞書ではなく自動生成の層。本物のイディオム(go the extra mile→更に努力する)と
// ただの直訳(open the door→とびら開けて)が混ざっていて、出典でも定義文でも見分けられない。
// 実測では普通の「動詞+the+名詞」25件のうち15件がこの層にヒットするので、
// 採用する前に isIdiomEntry() で裏を取る
const AUTO_GENERATED_SOURCE = "(Weblio)";
// 定義文に日本語が無いヒットは英英の記述しか無いので捨てる。
// Wiktionaryの語源ページ(steal one's thunder→Based on a 1704 quote from John Dennis)、
// 文法注記(change someone's mind→third-person singular…)、
// 活用形ページ(opened the door→simple past and past participle of…)がこれに当たる。
// 実測: イディオム18件は全部日本語あり、落ちるのは上の3件だけ
const JAPANESE = /[぀-ヿ㐀-鿿]/;

function parseWeblioHit(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const title = doc.querySelector("a.barL.title");
  if (!title) return null;
  const source = doc.querySelector(".dctCr")?.textContent.trim() || "";
  if (source === EXAMPLE_CORPUS_SOURCE) return null;
  const headword = title.textContent.trim();
  const body = doc.querySelector(".contentMcr")?.textContent.trim() || "";
  if (!JAPANESE.test(body)) return null;
  // Wiktionaryの文法注記ページは定義文が見出しの繰り返しで始まる
  // (lose his temper → "lose his temper (三人称単数 現在形 …")。意味は書かれていない
  if (body.startsWith(headword)) return null;
  return { headword, needsVerify: source === AUTO_GENERATED_SOURCE };
}

// 同じ文の別の単語にホバーすると候補が大きく重なるので、問い合わせをPromiseごと使い回す
const idiomCache = new Map();
function cached(key, fetcher) {
  if (idiomCache.has(key)) return idiomCache.get(key);
  const promise = Promise.resolve()
    .then(fetcher)
    .then((value) => {
      // 通信失敗(null)は覚えない。一度失敗しただけの単語/候補が以降ずっと
      // 引けなくなるうえ、同じ文脈の別の単語のPromise.allまで巻き添えで落ちる
      if (value == null) idiomCache.delete(key);
      return value;
    })
    .catch((error) => {
      // sendMessageの同期throwや予期しない例外。1件の失敗でホバー全体を
      // 落とさないようnull(=ヒットなし)に丸める
      trace("lookup-error", { key, error: error?.message || String(error) });
      console.error("[weblio] lookup error:", key, error?.message || error);
      idiomCache.delete(key);
      return null;
    });
  idiomCache.set(key, promise);
  return promise;
}

// 見出しページに Wiktionary英語版 の節があるかでイディオムか直訳かを分ける。
// 実測: イディオム16件中15件に有り、直訳17件中1件のみ(open the door)。
// ページは150〜300KBと重いので、順位1位が自動生成層だったときの1回だけに限る
function isIdiomEntry(query) {
  return cached(`wiktionary:${query}`, async () => {
    const html = await fetchWeblioUrl(`https://ejje.weblio.jp/content/${encodeURIComponent(query)}`);
    return !!html && html.includes("Wiktionary英語版");
  });
}

// ホバーした単語の周りのn-gramを一斉に引いて、ヒットしたうち一番長いものを返す。
// 直列だと語数ぶん待つので必ず並列。Weblioは1件130〜280msなので全部で300ms前後に収まる
async function lookupIdiom(text, wordStart) {
  // buildIdiomCandidates は idiom-candidates.js で定義(同じcontent scriptワールドを共有)
  const candidates = buildIdiomCandidates(text, wordStart);
  const hits = [];
  const started = performance.now();
  // 通信失敗(null)の件数。0でなければポップアップが出ない原因が通信側にあると分かる
  let failed = 0;
  await Promise.all(
    candidates.map(async (candidate) => {
      const html = await cached(candidate.query, () => fetchDictionaryHTML(candidate.query));
      if (!html) {
        failed += 1;
        return;
      }
      const hit = parseWeblioHit(html);
      if (hit) hits.push({ ...candidate, ...hit, html });
    })
  );
  // 長い候補ほど具体的。同じ語数なら辞書のヒットを自動生成層より先に
  // (cutting corners→ごまかし, 手抜き より cut corners→最も安易な方法をとる の方が良い)、
  // 次に原形。自動生成層には活用形の項目もあって、そちらは意味が薄い
  // (changed one's mind→気が変わった より change one's mind→気を変える, 心変わりする…)。
  // それも同じなら本文にそのまま出ている並びを優先する
  hits.sort(
    (a, b) =>
      b.size - a.size ||
      a.needsVerify - b.needsVerify ||
      b.lemma - a.lemma ||
      a.derived - b.derived
  );
  // 裏取りは重いので上位2件まで。落ちるのはその候補だけで、下位の自動生成層は生かす
  // (the elephant in the room は裏取りに落ちるが、1つ短い elephant in the room は通る)。
  // 2件とも投機的に並列で引く。直列だと落ちたときに1ページぶん待たされる
  const verifying = hits.filter((hit) => hit.needsVerify).slice(0, 2);
  const verified = new Map(
    await Promise.all(
      verifying.map(async (hit) => [hit.query, await isIdiomEntry(hit.query)])
    )
  );
  const chosen = hits.find((hit) => !hit.needsVerify || verified.get(hit.query)) || null;
  trace("idiom-lookup", {
    word: text.slice(wordStart, wordStart + 24),
    candidates: candidates.length,
    hits: hits.length,
    failed,
    chosen: chosen?.query || null,
    ms: Math.round(performance.now() - started),
  });
  return chosen;
}

// Google翻訳(service worker側のwebpackバンドル)に翻訳を代行させる
async function fetchTranslation(text) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "translateText", text }, (res) => {
      if (chrome.runtime.lastError) {
        console.error("[weblio] Translate error:", chrome.runtime.lastError.message);
        resolve(null);
        return;
      }
      if (!res || !res.ok) {
        console.error("[weblio] Translate error:", res?.error || "unknown");
        resolve(null);
        return;
      }
      resolve(res.text);
    });
  });
}

// ポップアップと単語の行の間に空けるマージン
const POPUP_GAP = 8;

// 単語の下に出すときは間を空けない。空けると、カーソルをポップアップへ動かす
// 途中で隙間から下の行の文字に乗ってしまい、別の単語を引いてしまう
const POPUP_ATTACH_GAP = 0;

// 引いた単語の行(anchorRect)に被らないよう、行の下か上の空いている側に置く
function positionPopup(el, content, anchorRect) {
  // 翻訳を足して置き直すとき、前回詰めた高さが残っていると計算がずれるのでリセットする
  content.style.maxHeight = "";
  const spaceBelow = window.innerHeight - anchorRect.bottom - POPUP_GAP - POPUP_ATTACH_GAP;
  const spaceAbove = anchorRect.top - POPUP_GAP * 2;
  const height = el.getBoundingClientRect().height;

  // 入る側を優先。どちらにも入らなければ広い側に置いて、行に食い込まないよう高さを詰める
  let below = height <= spaceBelow;
  if (!below && height > spaceAbove) {
    below = spaceBelow >= spaceAbove;
  }
  const available = below ? spaceBelow : spaceAbove;
  if (height > available) {
    content.style.maxHeight = `${Math.max(available, 100)}px`;
  }

  const finalHeight = el.getBoundingClientRect().height;
  const top = below
    ? anchorRect.bottom + POPUP_ATTACH_GAP
    : Math.max(POPUP_GAP, anchorRect.top - POPUP_GAP - finalHeight);

  const width = el.getBoundingClientRect().width;
  const left = Math.max(POPUP_GAP, Math.min(anchorRect.left, window.innerWidth - width - POPUP_GAP));

  el.style.top = `${top}px`;
  el.style.left = `${left}px`;
}

// 無操作でポップアップが自動で消えるまでの時間
const AUTO_CLOSE_MS = 10000;

// 翻訳ボタン押下中は止めて、翻訳が出た瞬間に0秒から測り直すので関数にしておく
function startAutoCloseTimer() {
  if (autoCloseTimer) clearTimeout(autoCloseTimer);
  autoCloseTimer = setTimeout(() => closePopup({ releaseHover: true }), AUTO_CLOSE_MS);
}

function stopAutoCloseTimer() {
  if (autoCloseTimer) {
    clearTimeout(autoCloseTimer);
    autoCloseTimer = null;
  }
}

// Material Symbols の translate / add アイコン。CDN画像に頼らずShadow DOM内で完結させる
const TRANSLATE_ICON_SVG = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/></svg>`;
const ADD_ICON_SVG = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>`;

function createIconButton(className, title, svg) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `weblio-popup-btn ${className}`;
  button.title = title;
  button.innerHTML = svg;
  return button;
}

// 翻訳結果をWeblioの意味の下に区切り線付きで出し、伸びたぶん位置を取り直す。
// Weblioの白枠(#baseMcr)の中身である #eBodyMcr に入れることで、枠が下に伸びて翻訳を包む
function renderTranslation(content, text, anchorRect) {
  let box = content.querySelector(".weblio-translation");
  if (!box) {
    box = document.createElement("div");
    box.className = "weblio-translation";
    (content.querySelector("#eBodyMcr") || content).appendChild(box);
  }
  box.textContent = text;
  positionPopup(popupElement, content, anchorRect);
}

// Weblioの+ボタンの隣に [翻訳][翻訳カード追加] の順で並べる。
// sourceText は翻訳にかける、かつ翻訳カードの表面になる元の文字列
function appendPopupButtons(content, addButton, sourceText, range, anchorRect) {
  const translateButton = createIconButton("weblio-translate-btn", "翻訳", TRANSLATE_ICON_SVG);
  const addTranslatedButton = createIconButton(
    "weblio-add-translated-btn", "翻訳してAnkiに追加", ADD_ICON_SVG);

  // Weblioは31文字以上の問い合わせに+ボタンを返さないので、
  // その場合は見出しバー(.eBarSml)に+ボタンと同じ形の<p class=barL>を足してそこへ置く
  const slot = addButton?.closest("a") || addButton;
  const bar = content.querySelector(".eBarSml");
  if (slot) {
    slot.after(translateButton, addTranslatedButton);
  } else if (bar) {
    const cell = document.createElement("p");
    cell.className = "barL";
    cell.append(translateButton, addTranslatedButton);
    bar.appendChild(cell);
  } else {
    content.prepend(translateButton, addTranslatedButton);
  }

  // 翻訳ボタンで出した訳文。カード追加でも使い回して、表示とカード裏面をずらさない
  let translation = null;

  translateButton.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (translateButton.disabled) return;

    // 翻訳を待っている間にオートクローズで消えないよう止める
    stopAutoCloseTimer();
    translateButton.disabled = true;

    const translated = await fetchTranslation(sourceText);
    // 待っている間に閉じた/別の単語で開き直された場合は捨てる
    if (!translateButton.isConnected) return;

    translation = translated;
    translateButton.disabled = false;
    renderTranslation(content, translated ?? "翻訳できませんでした", anchorRect);
    startAutoCloseTimer();
  });

  addTranslatedButton.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    addTranslatedNoteToAnki(sourceText, translation, range);
    closePopup({ releaseHover: true });
  });
}

// モーダル<dialog>が開いている間、その外側はinertになり、外側に置いた
// popoverもダイアログより下に描画される(クリックも届かない)。ダイアログ内の
// テキストにホバーしたときはダイアログの中に置く
function isNodeInside(node, ancestor) {
  while (node) {
    if (node === ancestor) return true;
    node = node.getRootNode?.().host || node.parentNode;
  }
  return false;
}

function popupMountFor(anchorRect) {
  if (!anchorRect) return document.documentElement;
  let dialogs;
  try {
    // :modal非対応の古いChromeではセレクタが例外になるので、通常配置に落とす
    dialogs = document.querySelectorAll(":modal");
  } catch {
    return document.documentElement;
  }
  if (!dialogs.length) return document.documentElement;
  const dialog = dialogs[dialogs.length - 1];
  const x = anchorRect.left + anchorRect.width / 2;
  const y = anchorRect.top + anchorRect.height / 2;
  const hit = deepElementFromPoint(x, y);
  return hit && isNodeInside(hit, dialog) ? dialog : document.documentElement;
}

// ポップアップを表示。rawWord/rangeは周辺文章を例文登録するために保持しておく
// anchorRect: 引いた単語の位置(viewport座標)。ここに被らない位置へ出す
function showPopup(html, word, rawWord, range, anchorRect) {
  closePopup();
  popupLocked = false;

  popupElement = document.createElement("div");
  popupElement.id = "weblio-dictionary-popup";
  // top layer に出す。ページ側のz-index・overflow:hidden・transformの影響を
  // 受けず、position:fixedの基準をビューポートに保てる。モーダル<dialog>が
  // 開いている間は外側がinertになるため、popupMountForで中へ入れる
  popupElement.setAttribute("popover", "manual");
  // 位置は実サイズを測ってから決めるので、まずは画面外に置いてちらつきを防ぐ。
  // popoverのUAスタイル(inset/margin/border等)を打ち消してから自前で配置する
  popupElement.style.cssText = `
    position: fixed;
    inset: auto;
    left: -9999px;
    top: 0;
    margin: 0;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    overflow: visible;
    z-index: 2147483647;
  `;

  // Weblio側HTMLに<style>タグが含まれるとlight DOMではページ全体に漏れてUIが崩れるため、Shadow DOMで隔離する
  const shadow = popupElement.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      /* Weblio側HTMLが既に枠・影を持つので、こちらは大きさ制限だけにして二重枠を防ぐ */
      .weblio-popup-content {
        max-width: 400px;
        max-height: 500px;
        overflow: auto;
        font-family: 'Helvetica Neue', Arial, sans-serif;
        font-size: 14px;
        line-height: 1.5;
        color: #222;
      }
      .weblio-popup-btn {
        margin-left: 6px;
        padding: 0;
        border: none;
        background: none;
        line-height: 0;
        vertical-align: middle;
        cursor: pointer;
      }
      .weblio-popup-btn[disabled] {
        opacity: 0.4;
        cursor: default;
      }
      .weblio-translate-btn { color: #4285f4; }
      /* Weblioの+ボタン(#42b14c)と同じ緑にして、同じ「追加」だと分かるようにする */
      .weblio-add-translated-btn { color: #42b14c; }
      /* Weblio側は #eBodyMcr を height:48px で固定していて中身を足しても枠が伸びない。
         翻訳を入れたぶん白枠(#baseMcr)ごと下に広がるよう高さ固定を外す */
      #eBodyMcr {
        height: auto !important;
      }
      /* 左右のマージンはWeblioの意味(.contentMcr の margin:0 5px)に合わせる */
      .weblio-translation {
        margin: 6px 5px 5px;
        padding-top: 6px;
        border-top: 1px solid #ddd;
        font-size: 13px;
        line-height: 1.4;
        text-align: left;
        white-space: pre-wrap;
      }
    </style>
    <div class="weblio-popup-content">${html}</div>
  `;

  const content = shadow.querySelector(".weblio-popup-content");
  content.addEventListener("pointerdown", () => { popupLocked = true; }, { once: true });

  const addButton = shadow.querySelector(".wlaBtnTtlTng");
  if (addButton) {
    addButton.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      addWordToAnki(word, rawWord, range);
      closePopup({ releaseHover: true });
    });
  }
  appendPopupButtons(content, addButton, rawWord, range, anchorRect);

  // 通常はbodyではなくdocumentElementに置く。bodyにtransformが掛かっていると
  // position:fixedの基準がbodyになってしまうため
  const mount = popupMountFor(anchorRect);
  mount.appendChild(popupElement);
  // popover非対応のブラウザでは単なるposition:fixedのdivとして動く
  try {
    popupElement.showPopover?.();
  } catch {
    // すでに開いている等。位置決めは続行する
  }
  positionPopup(popupElement, content, anchorRect);
  // closePopup()でクリアされるので、表示後に貼り直す
  currentWord = word;

  startAutoCloseTimer();
}

// releaseHover: ユーザーの意思で閉じたのでない場合(オートクローズ・scroll)に立てる。
// カーソルが単語に乗ったままでもmousemoveで再表示できるようにする
function closePopup({ releaseHover = false } = {}) {
  stopAutoCloseTimer();
  if (popupElement) {
    try {
      popupElement.hidePopover?.();
    } catch {
      // 開いていない場合は無視
    }
    popupElement.remove();
    popupElement = null;
  }
  // 表示中の重複fetchを防ぐためのガードなので、閉じたら解除する
  // (解除しないと同じ単語に再ホバーしてもポップアップが出なくなる)
  currentWord = null;
  popupLocked = false;
  // mousemove側の連打防止ガード。これを残すとカーソルが単語Aに乗ったままの間
  // ずっとタイマーが張られず、単語Aから一度出るまで二度と表示できない
  if (releaseHover) {
    lastHoveredWord = null;
  }
}

// 単語をAnkiに追加し、rangeの周辺文章を例文として登録する
function addWordToAnki(word, rawWord, range) {
  const notification = showNotification("Adding to Anki...", "loading");
  chrome.runtime.sendMessage({ type: "addWordToAnki", word }, (response) => {
    const error = chrome.runtime.lastError;
    if (response && response.success) {
      updateNotification(notification, `Added "${word}" to Anki`, "success");
    } else if (response && response.duplicate) {
      updateNotification(notification, `"${word}" already in your deck`, "success");
    } else {
      updateNotification(notification, `Anki error: ${response?.error || error?.message || "unknown"}`, "error");
    }

    // extractMarkedText は mark.js で定義された関数(同じcontent scriptワールドを共有)
    const marked = extractMarkedText(rawWord, range);
    if (marked) {
      chrome.runtime.sendMessage({ marked });
    }
  });
}

// 選択した原文を表面、その翻訳を裏面にしたカードを追加する。
// translation が null(翻訳ボタンを押していない)なら service worker 側で翻訳させる
function addTranslatedNoteToAnki(text, translation, range) {
  // 長文まるごと選択できるのでトーストに全部は載せない
  const label = text.length > 40 ? `${text.slice(0, 40)}…` : text;
  const notification = showNotification("Adding to Anki...", "loading");

  chrome.runtime.sendMessage({ type: "addTranslatedNote", text, translation }, (response) => {
    const error = chrome.runtime.lastError;
    if (response && response.success) {
      updateNotification(notification, `Added "${label}" to Anki`, "success");
    } else if (response && response.duplicate) {
      updateNotification(notification, `"${label}" already in your deck`, "success");
    } else {
      updateNotification(notification, `Anki error: ${response?.error || error?.message || "unknown"}`, "error");
    }

    const marked = extractMarkedText(text, range);
    if (marked) {
      chrome.runtime.sendMessage({ marked });
    }
  });
}

// service worker(add-example.js)からの結果通知をトーストで出す。
// 拡張ポップアップの「ホバー診断」からは直近のトレースを要求される
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!request) return;
  if (request.type === "notify") {
    showNotification(request.message);
    return;
  }
  if (request.type === "getHoverTrace") {
    sendResponse({ env: traceEnv(), trace: hoverTrace.slice(-50) });
  }
});

function showNotification(message, variant = "success") {
  const notification = document.createElement("div");
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 20px;
    background: #4CAF50;
    color: white;
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    z-index: 9999999;
    font-family: 'Helvetica Neue', Arial, sans-serif;
    font-size: 14px;
  `;
  notification.textContent = message;
  document.body.appendChild(notification);

  // fixedの基準はレイアウトビューポートなので、ピンチズームで可視領域(ビジュアル
  // ビューポート)が狭まると right:20px の位置が画面外に出る。可視領域の右上へ
  // 追従させ、ズーム中でもトーストが見えるようにする。
  // さらに、fixedはズームで拡大されるため scaleの逆数で縮めて画面上の大きさを保つ
  const viewport = window.visualViewport;
  let frame = 0;
  const place = () => {
    frame = 0;
    if (!viewport) return;
    const scale = viewport.scale || 1;
    notification.style.right = "auto";
    notification.style.transformOrigin = "top left";
    notification.style.transform = `scale(${1 / scale})`;
    notification.style.left = `${
      viewport.offsetLeft + viewport.width - (notification.offsetWidth + 20) / scale
    }px`;
    notification.style.top = `${viewport.offsetTop + 20 / scale}px`;
  };
  const schedulePlace = () => {
    if (frame) return;
    frame = requestAnimationFrame(place);
  };
  place();
  viewport?.addEventListener("resize", schedulePlace);
  viewport?.addEventListener("scroll", schedulePlace);
  window.addEventListener("resize", schedulePlace);

  const cleanup = () => {
    viewport?.removeEventListener("resize", schedulePlace);
    viewport?.removeEventListener("scroll", schedulePlace);
    window.removeEventListener("resize", schedulePlace);
    cancelAnimationFrame(frame);
    notification.remove();
  };
  if (variant !== "loading") setTimeout(cleanup, 3000);
  return { notification, cleanup, place };
}

function updateNotification(handle, message, variant = "success") {
  if (!handle?.notification?.isConnected) {
    showNotification(message, variant);
    return;
  }
  const { notification } = handle;
  notification.textContent = message;
  notification.style.background = "#4CAF50";
  // 文言変更で幅が変わるので、新しい幅で右端に合わせ直す。
  handle.place();
  setTimeout(handle.cleanup, 3000);
}

// ホバーで拾う単語のゲート。rear-ended / well-known のようなハイフン複合語も許す
const HOVER_WORD_PATTERN = /^[a-zA-Z]+(-[a-zA-Z]+)*$/;

// ホバーしてから表示するまでの待ち時間
const HOVER_DELAY_MS = 300;
// 通信失敗時の自動再試行(service workerのコールドスタート対策)
const HOVER_RETRY_DELAYS = [350, 900];

// 選択中のテキストがある間はホバーで引かない。選択した語のポップアップと
// ホバーのポップアップが重なったり入れ替わったりするのを防ぐ
function hasSelection() {
  const sel = window.getSelection();
  return !!(sel && !sel.isCollapsed && sel.rangeCount && sel.toString().trim());
}

function clearHoverState(reason) {
  const hadWord = lastHoveredWord;
  const hadTimer = !!hoverTimer;
  lastHoveredWord = null;
  hoveredRange = null;
  hoveredContext = null;
  if (hoverTimer) {
    clearTimeout(hoverTimer);
    hoverTimer = null;
  }
  if (hadWord || hadTimer) trace("hover-clear", { reason, word: hadWord, pending: hadTimer });
}

// ポップアップが実際に見える位置に出たか(画面外・他要素の下に隠れていないか)を記録する
function tracePopupShown(word, rawWord, idiom, anchorRect) {
  requestAnimationFrame(() => {
    if (!popupElement) return;
    const rect = popupElement.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const top = document.elementFromPoint(x, y);
    trace("popup-shown", {
      word,
      headword: idiom?.headword || word,
      idiom: idiom?.query || null,
      rect: [Math.round(rect.left), Math.round(rect.top), Math.round(rect.width), Math.round(rect.height)],
      anchor: anchorRect
        ? [Math.round(anchorRect.left), Math.round(anchorRect.top), Math.round(anchorRect.width), Math.round(anchorRect.height)]
        : null,
      onScreen:
        rect.width > 0 && rect.height > 0 &&
        rect.right > 0 && rect.bottom > 0 &&
        rect.left < window.innerWidth && rect.top < window.innerHeight,
      topElement: top ? `${top.nodeName}${top.id ? `#${top.id}` : ""}` : null,
      covered: !!top && top !== popupElement && !popupElement.contains(top),
      bodyTransform: getComputedStyle(document.body).transform,
      frame: { top: window === window.top, href: location.href },
    });
  });
}

// タイマー発火後の本体。通信失敗(null)なら自動で引き直し、それでも駄目なら
// lastHoveredWordを解除して次のmousemoveで再試行できるようにする
async function showHoveredWord({ hovered, point, attempt }) {
  if (hovered !== lastHoveredWord) {
    trace("lookup-skip", { reason: "moved-away", word: hovered });
    return;
  }

  const word = hovered.toLowerCase();
  if (currentWord === word) {
    trace("lookup-skip", { reason: "current-word", word });
    return;
  }
  const range = hoveredRange;
  const context = hoveredContext;
  const started = performance.now();
  let shown = false;
  let settled = 0;

  const anchorFor = () =>
    range ? range.getBoundingClientRect() : new DOMRect(point.x, point.y, 0, 0);

  // 単語そのものとイディオム候補を同時に投げ、先に届いた方をすぐ表示する。
  // イディオムは候補12件の一番遅い応答まで待つので初回は数秒かかることがあり、
  // 全部揃うまで待つと単語の結果だけで済むケースまで遅くなる。
  // イディオムが後から届いたら、そのときだけ差し替える
  const render = (html, headword, idiom) => {
    if (!html) return false;
    // fetch中に別の単語へ移っていたら、その単語の結果を優先して捨てる
    if (hovered !== lastHoveredWord) return false;
    if (shown) {
      // 差し替えはイディオムだけ。ユーザーがポップアップ内を操作していたら触らない
      if (!idiom || popupLocked) return false;
      // オートクローズ・mousedown・+追加などで閉じていたら開き直さない
      if (!popupElement || currentWord !== word) return false;
    }
    // fetch中にスクロールされている可能性があるので、表示直前に単語の位置を測り直す
    const anchorRect = anchorFor();
    // 第3引数(rawWord)はmark.jsが本文との文字列一致で<mark>位置を探すのに使うので、
    // 本文に無い並びになりうるイディオムではなく、ホバーした単語のままにする
    showPopup(html, headword, hovered, range, anchorRect);
    // showPopupはcurrentWordに見出し語を入れるが、再ホバーの重複判定は
    // ホバーした単語で行うので戻す
    currentWord = word;
    shown = true;
    trace("lookup-shown", {
      word,
      attempt,
      kind: idiom ? "idiom" : "word",
      headword,
      ms: Math.round(performance.now() - started),
    });
    tracePopupShown(word, hovered, idiom, anchorRect);
    return true;
  };

  // 単語とイディオムの両方が決着してから、失敗時の再試行を判断する
  const finish = () => {
    settled += 1;
    if (settled < 2) return;
    if (shown) {
      trace("lookup-done", { word, attempt, ms: Math.round(performance.now() - started) });
      return;
    }
    // WeblioはMISSでもHTMLを返すので、htmlが無い=通信自体の失敗。
    // 一度だけ自動で引き直し、それでも駄目なら同じ単語の上でも再試行できるよう解除する
    trace("lookup-empty", { word, attempt, ms: Math.round(performance.now() - started) });
    if (attempt < HOVER_RETRY_DELAYS.length) {
      const delay = HOVER_RETRY_DELAYS[attempt];
      trace("lookup-retry", { word, attempt, delay });
      hoverTimer = setTimeout(() => {
        hoverTimer = null;
        showHoveredWord({ hovered, point, attempt: attempt + 1 });
      }, delay);
    } else {
      lastHoveredWord = null;
    }
  };

  const onError = (error) => {
    trace("lookup-exception", { word, attempt, error: error?.message || String(error) });
    console.error("[weblio] hover lookup error:", error?.message || error);
    if (!shown) lastHoveredWord = null;
  };

  cached(word, () => fetchDictionaryHTML(word))
    .then((html) => render(html, word, null))
    .catch(onError)
    .finally(finish);

  (context ? lookupIdiom(context.text, context.start) : Promise.resolve(null))
    .then((idiom) => render(idiom?.html, idiom?.headword, idiom || null))
    .catch(onError)
    .finally(finish);
}

// captureで拾う。ページ側がstopPropagationしていてもホバーが死なないようにする
document.addEventListener("mousemove", (event) => {
  const point = { x: event.clientX, y: event.clientY };

  // 選択中のテキストがある間はホバー処理をしない(選択は別ハンドラで処理する)。
  // 選択を解除したら通常どおり引けるよう、保留中のタイマーは必ず落とす
  if (hasSelection()) {
    clearHoverState("selection");
    return;
  }

  // ポップアップ自体の上では辞書HTML内の英単語を拾わない。
  // 拾うと翻訳ボタンへ向かう途中で別の語を引き直してしまう
  if (popupElement) {
    const over = deepElementFromPoint(point.x, point.y);
    if (over && isNodeInside(over, popupElement)) return;
  }

  const hit = getWordUnderCursor(point.x, point.y);
  const hovered = hit?.word;
  if (!hovered) {
    // 空白や要素の上をなぞるたびに記録するとトレースが埋まるので、状態が変わった時だけ
    if (lastHitKey !== hit?.reason) {
      lastHitKey = hit?.reason;
      trace("hover-miss", { ...hit });
    }
    clearHoverState("not-a-word");
    return;
  }
  if (!HOVER_WORD_PATTERN.test(hovered)) {
    const key = `pattern:${hovered}`;
    if (lastHitKey !== key) {
      lastHitKey = key;
      trace("hover-reject", { reason: "pattern", word: hovered });
    }
    clearHoverState("pattern");
    return;
  }

  lastHitKey = `word:${hovered}`;
  if (hovered === lastHoveredWord) {
    return;
  }

  lastHoveredWord = hovered;
  hoveredRange = hit.range;
  hoveredContext = { text: hit.text, start: hit.start };
  trace("hover-hit", {
    word: hovered,
    node: hit.nodeTag,
    inShadow: hit.inShadow,
    textLen: hit.text.length,
  });
  if (hoverTimer) {
    clearTimeout(hoverTimer);
  }
  trace("timer-armed", { word: hovered, delay: HOVER_DELAY_MS });
  hoverTimer = setTimeout(() => {
    hoverTimer = null;
    trace("timer-fired", { word: hovered });
    showHoveredWord({ hovered, point, attempt: 0 });
  }, HOVER_DELAY_MS);
}, true);

// 句動詞・熟語(take off など)や記号混じり(don't worry, be happy)も引けるようにする。
// 記号込みだとWeblioは「英和・和英辞典で一致する英語は見つかりませんでした。」を返すが、
// そのHTMLにも+ボタンは入っているのでポップアップは出して翻訳ボタンから引かせる。
// ASCII印字可能文字("' など含む)に加えて、Webページで多い約物(“ ” ‘ ’ – — …)も通す。
// 英字を1文字以上含むことを条件にして日本語や記号だけの選択は弾く。
// 長さは段落まるごとの選択(=翻訳ボタン用)まで許し、ページ全選択だけ弾ければよいので
// Google翻訳が余裕で捌ける範囲(実測5400文字までOK)に収まる文字数で頭打ちにする。
// なおWeblio側は31文字以上だと+ボタンを返さず、51文字以上だと翻訳誘導ページを返す
const MAX_SELECTION_CHARS = 2000;
const SELECTION_PATTERN = /^(?=[^a-zA-Z]*[a-zA-Z])[\x20-\x7e‘’“”–—…]+$/;

let selectionTimer = null;

// 選択の終端(focus)が開始点(anchor)より前にあるか。下から上へドラッグした選択か
function selectionFocusFirst(sel) {
  if (!sel?.focusNode || !sel?.anchorNode) return false;
  if (sel.focusNode === sel.anchorNode) return sel.focusOffset < sel.anchorOffset;
  return !!(sel.anchorNode.compareDocumentPosition(sel.focusNode) &
    Node.DOCUMENT_POSITION_PRECEDING);
}

// 複数行の選択では getBoundingClientRect() が選択全体の外接矩形になり、
// 下から上へドラッグするとカーソル(終端)から遠い最終行の下を基準にしてしまう。
// 終端のある行の矩形を返し、ポップアップをカーソルのすぐ下に出せるようにする
function selectionAnchorRect(range, focusFirst) {
  if (!range) return new DOMRect(0, 0, 0, 0);
  const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0 || r.height > 0);
  if (rects.length <= 1) return range.getBoundingClientRect();
  return focusFirst ? rects[0] : rects[rects.length - 1];
}

// 選択即時実行。ドラッグ中は1文字ごとにselectionchangeが飛ぶので、
// 途中経過("take o"など)でfetchしないよう確定を待つ
document.addEventListener("selectionchange", () => {
  if (selectionTimer) clearTimeout(selectionTimer);
  selectionTimer = setTimeout(lookupSelection, 250);
});

async function lookupSelection() {
  const sel = window.getSelection();
  const rawText = sel ? sel.toString().trim() : "";
  if (!rawText) return;

  // 改行や連続スペースを潰してから判定する(複数行にまたがる選択も引けるように)
  const phrase = rawText.replace(/\s+/g, " ");
  if (phrase.length > MAX_SELECTION_CHARS) return;
  if (!SELECTION_PATTERN.test(phrase)) return;

  const word = phrase.toLowerCase();
  if (currentWord === word) return;
  currentWord = word;

  const range = sel.rangeCount ? sel.getRangeAt(0) : null;
  // fetch中に選択が変わっても、取得したrangeと同じ向きで測れるよう先に控える
  const focusFirst = selectionFocusFirst(sel);

  // 選んだ形のままでは見出しに無いことがある(get his act together はMISSで
  // get one's act together が見出し)。ホバーと同じ変形を並列で投げて、
  // 選んだ形が外れたときだけ差し替える。選んだ形が当たっていればそちらが優先
  // buildPhraseVariants は idiom-candidates.js で定義(同じcontent scriptワールドを共有)
  const variants = buildPhraseVariants(phrase);
  const [html, ...variantHtml] = await Promise.all([
    fetchDictionaryHTML(word),
    ...variants.map((v) => cached(v.query, () => fetchDictionaryHTML(v.query))),
  ]);
  let shown = html;
  let headword = word;
  if (!html || !parseWeblioHit(html)) {
    const index = variantHtml.findIndex((candidate) => candidate && parseWeblioHit(candidate));
    if (index >= 0) {
      shown = variantHtml[index];
      headword = parseWeblioHit(shown).headword;
    }
  }
  if (shown) {
    // fetch中にスクロールされている可能性があるので、表示直前に選択範囲の位置を測り直す
    const anchorRect = selectionAnchorRect(range, focusFirst);
    // extractMarkedTextは本文との文字列一致で<mark>位置を探すので、正規化前の選択文字列を渡す
    showPopup(shown, headword, rawText, range, anchorRect);
  } else {
    // 取得失敗のままcurrentWordを握ると、その単語が二度と引けなくなる
    currentWord = null;
  }
}

document.addEventListener("mousedown", (event) => {
  if (popupElement && !popupElement.contains(event.target)) {
    // ユーザーの意思で閉じたのでホバー状態も解除する。残すと、同じ単語から
    // カーソルを動かさない限り二度と表示できなくなる
    closePopup({ releaseHover: true });
  }
}, true);

// 入れ子のスクロールコンテナでも確実に閉じるためcaptureで拾う(scrollはbubbleしない)
document.addEventListener("scroll", () => {
  closePopup({ releaseHover: true });
}, true);

// ページ環境を最初に1件残す。iframe内か・bodyにtransformが掛かっていないか等、
// サイト固有の失敗を後から切り分けるのに使う
trace("env", traceEnv());
