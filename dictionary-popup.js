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

// 引いた単語の行(anchorRect)に被らないよう、行の下か上の空いている側に置く
function positionPopup(el, content, anchorRect) {
  // 翻訳を足して置き直すとき、前回詰めた高さが残っていると計算がずれるのでリセットする
  content.style.maxHeight = "";
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
    closePopup();
  });
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

  const addButton = shadow.querySelector(".wlaBtnTtlTng");
  if (addButton) {
    addButton.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      addWordToAnki(word, rawWord, range);
      closePopup();
    });
  }
  appendPopupButtons(content, addButton, rawWord, range, anchorRect);

  document.body.appendChild(popupElement);
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

// 選択した原文を表面、その翻訳を裏面にしたカードを追加する。
// translation が null(翻訳ボタンを押していない)なら service worker 側で翻訳させる
function addTranslatedNoteToAnki(text, translation, range) {
  // 長文まるごと選択できるのでトーストに全部は載せない
  const label = text.length > 40 ? `${text.slice(0, 40)}…` : text;

  chrome.runtime.sendMessage({ type: "addTranslatedNote", text, translation }, (response) => {
    if (response && response.success) {
      showNotification(`Added "${label}" to Anki`);
    } else if (response && response.duplicate) {
      showNotification(`"${label}" already in your deck`);
    } else {
      showNotification(`Anki error: ${response?.error || chrome.runtime.lastError?.message || "unknown"}`);
    }

    const marked = extractMarkedText(text, range);
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
