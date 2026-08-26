// dictionary-popup.js - 単語をホバー/選択するとWeblioのポップアップ辞書を表示するcontent script
// +ボタン押下時、ホバー/選択で掴んだRangeをmark.jsのextractMarkedTextに渡し、
// 周辺のブロック要素だけを例文として自動登録する(選択操作なしでも例文登録が動くようにするため)

let popupElement = null;
let currentWord = null;
let hoverTimer = null;
let lastHoveredWord = null;
let hoveredRange = null;
let autoCloseTimer = null;

// 英数字かどうかを判定
const isEnglishCharacter = (code) => {
  return (
    (code >= 48 && code <= 57) || // 0-9
    (code >= 65 && code <= 90) || // A-Z
    (code >= 97 && code <= 122) || // a-z
    code === 45 || // -
    code === 95 || // _
    code === 46    // .
  );
};

// 英単語の開始位置を検索
const searchStartIndex = (text, index) => {
  let i = index;
  while (i >= 0) {
    const code = text.charCodeAt(i);
    if (!isEnglishCharacter(code)) {
      return i + 1;
    }
    i -= 1;
  }
  return 0;
};

// 英単語の終了位置を検索
const searchEndIndex = (text, index) => {
  let i = index + 1;
  while (i < text.length) {
    const code = text.charCodeAt(i);
    if (!isEnglishCharacter(code)) {
      return i;
    }
    i += 1;
  }
  return text.length;
};

// ポイント座標から Range を取得(クロスブラウザ)
function getRangeFromPoint(clientX, clientY) {
  if (document.caretRangeFromPoint) {
    return document.caretRangeFromPoint(clientX, clientY);
  }
  const pos = document.caretPositionFromPoint?.(clientX, clientY);
  if (!pos) return null;
  const r = document.createRange();
  r.setStart(pos.offsetNode, pos.offset);
  r.setEnd(pos.offsetNode, pos.offset);
  return r;
}

// マウスポインターの位置から英単語とそのRangeを抽出
function getWordUnderCursor(clientX, clientY) {
  try {
    const range = getRangeFromPoint(clientX, clientY);
    if (!range) return null;

    const node = range.startContainer;
    const offset = range.startOffset;
    if (node?.nodeType !== Node.TEXT_NODE) return null;

    const text = node.textContent || "";
    if (!text) return null;

    const code = text.charCodeAt(offset);
    if (!isEnglishCharacter(code)) return null;

    const startIndex = searchStartIndex(text, offset);
    const endIndex = searchEndIndex(text, offset);
    const word = text.substring(startIndex, endIndex).trim();
    if (!word) return null;
    return { word, range };
  } catch (_) {
    return null;
  }
}

// Weblioのポップアップ辞書HTMLを取得(CORSにかかるためbackground側に代行させる)
async function fetchDictionaryHTML(word) {
  const apiUrl = `https://api.weblio.jp/act/quote/v_1_0/e/?q=${encodeURIComponent(word)}&type=emicro&opul=chrome-extension%3A%2F%2F`;

  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "fetchWeblio", url: apiUrl }, (res) => {
      if (chrome.runtime.lastError) {
        console.error("[weblio] Dictionary fetch error:", chrome.runtime.lastError.message);
        resolve(null);
        return;
      }
      if (!res || !res.ok) {
        console.error("[weblio] Dictionary fetch error:", res?.error || "unknown");
        resolve(null);
        return;
      }
      resolve(res.text);
    });
  });
}

// ポップアップと単語の行の間に空けるマージン
const POPUP_GAP = 8;

// 引いた単語の行(anchorRect)に被らないよう、行の下か上の空いている側に置く
function positionPopup(el, content, anchorRect) {
  const spaceBelow = window.innerHeight - anchorRect.bottom - POPUP_GAP * 2;
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
    ? anchorRect.bottom + POPUP_GAP
    : Math.max(POPUP_GAP, anchorRect.top - POPUP_GAP - finalHeight);

  const width = el.getBoundingClientRect().width;
  const left = Math.max(POPUP_GAP, Math.min(anchorRect.left, window.innerWidth - width - POPUP_GAP));

  el.style.top = `${top}px`;
  el.style.left = `${left}px`;
}

// ポップアップを表示。rawWord/rangeは周辺文章を例文登録するために保持しておく
// anchorRect: 引いた単語の位置(viewport座標)。ここに被らない位置へ出す
function showPopup(html, word, rawWord, range, anchorRect) {
  closePopup();

  popupElement = document.createElement("div");
  popupElement.id = "weblio-dictionary-popup";
  // 位置は実サイズを測ってから決めるので、まずは画面外に置いてちらつきを防ぐ
  popupElement.style.cssText = `
    position: fixed;
    left: -9999px;
    top: 0;
    z-index: 999999;
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
    </style>
    <div class="weblio-popup-content">${html}</div>
  `;

  const addButton = shadow.querySelector(".wlaBtnTtlTng");
  if (addButton) {
    addButton.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      addWordToAnki(word, rawWord, range);
      closePopup();
    });
  }

  document.body.appendChild(popupElement);
  positionPopup(popupElement, shadow.querySelector(".weblio-popup-content"), anchorRect);
  // closePopup()でクリアされるので、表示後に貼り直す
  currentWord = word;

  autoCloseTimer = setTimeout(() => closePopup({ releaseHover: true }), 10000);
}

// releaseHover: ユーザーの意思で閉じたのでない場合(オートクローズ・scroll)に立てる。
// カーソルが単語に乗ったままでもmousemoveで再表示できるようにする
function closePopup({ releaseHover = false } = {}) {
  if (autoCloseTimer) {
    clearTimeout(autoCloseTimer);
    autoCloseTimer = null;
  }
  if (popupElement) {
    popupElement.remove();
    popupElement = null;
  }
  // 表示中の重複fetchを防ぐためのガードなので、閉じたら解除する
  // (解除しないと同じ単語に再ホバーしてもポップアップが出なくなる)
  currentWord = null;
  // mousemove側の連打防止ガード。これを残すとカーソルが単語Aに乗ったままの間
  // ずっとタイマーが張られず、単語Aから一度出るまで二度と表示できない
  if (releaseHover) {
    lastHoveredWord = null;
  }
}

// 単語をAnkiに追加し、rangeの周辺文章を例文として登録する
function addWordToAnki(word, rawWord, range) {
  chrome.runtime.sendMessage({ type: "addWordToAnki", word }, (response) => {
    if (response && response.success) {
      showNotification(`Added "${word}" to Anki`);
    } else if (response && response.duplicate) {
      showNotification(`"${word}" already in your deck`);
    }

    // extractMarkedText は mark.js で定義された関数(同じcontent scriptワールドを共有)
    const marked = extractMarkedText(rawWord, range);
    if (marked) {
      chrome.runtime.sendMessage({ marked });
    }
  });
}

// service worker(add-example.js)からの結果通知をトーストで出す
chrome.runtime.onMessage.addListener((request) => {
  if (request && request.type === "notify") {
    showNotification(request.message);
  }
});

function showNotification(message) {
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

  setTimeout(() => {
    notification.remove();
  }, 3000);
}

document.addEventListener("mousemove", (event) => {
  // 選択がある場合はホバー処理をスキップ(選択は別ハンドラで即時処理)
  const sel = window.getSelection();
  if (sel && sel.toString().trim()) {
    return;
  }

  const hit = getWordUnderCursor(event.clientX, event.clientY);
  const hovered = hit?.word;
  if (!hovered || !/^[a-zA-Z]+$/.test(hovered)) {
    lastHoveredWord = null;
    hoveredRange = null;
    if (hoverTimer) {
      clearTimeout(hoverTimer);
      hoverTimer = null;
    }
    return;
  }

  if (hovered === lastHoveredWord) {
    return;
  }

  lastHoveredWord = hovered;
  hoveredRange = hit.range;
  if (hoverTimer) {
    clearTimeout(hoverTimer);
  }
  hoverTimer = setTimeout(async () => {
    if (hovered !== lastHoveredWord) {
      return;
    }

    const word = hovered.toLowerCase();
    if (currentWord === word) {
      return;
    }
    currentWord = word;
    const range = hoveredRange;

    const html = await fetchDictionaryHTML(word);
    if (html) {
      // fetch中にスクロールされている可能性があるので、表示直前に単語の位置を測り直す
      const anchorRect = range
        ? range.getBoundingClientRect()
        : new DOMRect(event.clientX, event.clientY, 0, 0);
      showPopup(html, word, hovered, range, anchorRect);
    } else {
      // 取得失敗のままcurrentWordを握ると、その単語が二度と引けなくなる
      currentWord = null;
    }
  }, 300);
});

// 句動詞・熟語(take off など)を引けるように単語間のスペースを許す。
// 段落まるごと選択したときに長文を投げないよう語数で頭打ちにする
const MAX_SELECTION_WORDS = 4;
const SELECTION_PATTERN = /^[a-zA-Z]+(?: [a-zA-Z]+)*$/;

let selectionTimer = null;

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
  if (!SELECTION_PATTERN.test(phrase)) return;
  if (phrase.split(" ").length > MAX_SELECTION_WORDS) return;

  const word = phrase.toLowerCase();
  if (currentWord === word) return;
  currentWord = word;

  const range = sel.rangeCount ? sel.getRangeAt(0) : null;

  const html = await fetchDictionaryHTML(word);
  if (html) {
    // fetch中にスクロールされている可能性があるので、表示直前に選択範囲の位置を測り直す
    const anchorRect = range ? range.getBoundingClientRect() : new DOMRect(0, 0, 0, 0);
    // extractMarkedTextは本文との文字列一致で<mark>位置を探すので、正規化前の選択文字列を渡す
    showPopup(html, word, rawText, range, anchorRect);
  } else {
    // 取得失敗のままcurrentWordを握ると、その単語が二度と引けなくなる
    currentWord = null;
  }
}

document.addEventListener("mousedown", (event) => {
  if (popupElement && !popupElement.contains(event.target)) {
    closePopup();
  }
});

document.addEventListener("scroll", () => {
  closePopup({ releaseHover: true });
});
