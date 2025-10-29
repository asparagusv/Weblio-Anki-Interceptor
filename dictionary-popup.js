// dictionary-popup.js - Content Script for popup dictionary on hover/selection

let popupElement = null;
let currentWord = null;
let hoverTimer = null;
let lastHoveredWord = null;

// 英数字かどうかを判定（提供ロジック準拠）
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

// ポイント座標から Range を取得（クロスブラウザ）
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

// マウスポインターの位置から英単語を抽出（提供ロジック）
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
    return word || null;
  } catch (_) {
    return null;
  }
}

// Fetch dictionary HTML from Weblio API
async function fetchDictionaryHTML(word) {
  console.log(word)
  const apiUrl = `https://api.weblio.jp/act/quote/v_1_0/e/?q=${encodeURIComponent(word)}&type=emicro&opul=chrome-extension%3A%2F%2F`;
  
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'fetchWeblio', url: apiUrl }, (res) => {
      if (!res || !res.ok) {
        console.error('Dictionary fetch error:', res?.status || res?.error || 'unknown');
        resolve(null);
        return;
      }
      resolve(res.text);
    });
  });
}

// Create and display popup
function showPopup(html, word, x, y) {
  // Remove existing popup
  if (popupElement) {
    popupElement.remove();
  }
  
  // Create popup container
  popupElement = document.createElement('div');
  popupElement.id = 'weblio-dictionary-popup';
  popupElement.style.cssText = `
    position: fixed;
    left: ${x}px;
    top: ${y}px;
    max-width: 400px;
    max-height: 500px;
    overflow: auto;
    background: white;
    border: 1px solid #ddd;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 999999;
    padding: 12px;
    font-family: 'Helvetica Neue', Arial, sans-serif;
    font-size: 14px;
    line-height: 1.5;
  `;
  
  popupElement.innerHTML = html;
  
  // Add click handler to + button
  const addButton = popupElement.querySelector('.wlaBtnTtlTng');
  if (addButton) {
    addButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      addWordToAnki(word);
      closePopup();
    });
  }
  
  document.body.appendChild(popupElement);
  
  // Auto-close after 10 seconds
  setTimeout(() => {
    closePopup();
  }, 10000);
}

function closePopup() {
  if (popupElement) {
    popupElement.remove();
    popupElement = null;
  }
}

// Send word to Anki via background script
async function addWordToAnki(word) {
  chrome.runtime.sendMessage({
    type: 'addWordToAnki',
    word: word
  }, (response) => {
    if (response && response.success) {
      console.log('Word added to Anki:', word);
      // Show notification
      showNotification(`Added "${word}" to Anki`);
    } else if (response && response.duplicate) {
      console.log('Word already in Anki:', word);
      showNotification(`"${word}" already in your deck`);
    }
  });
}

// Show notification
function showNotification(message) {
  const notification = document.createElement('div');
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

// Event listeners
document.addEventListener('mousemove', async (event) => {
  // 選択がある場合はホバー処理をスキップ（選択は即時処理で対応）
  const sel = window.getSelection();
  if (sel && sel.toString().trim()) {
    return;
  }

  const hovered = getWordUnderCursor(event.clientX, event.clientY);
  if (!hovered || !/^[a-zA-Z]+$/.test(hovered)) {
    lastHoveredWord = null;
    if (hoverTimer) {
      clearTimeout(hoverTimer);
      hoverTimer = null;
    }
    return;
  }

  if (hovered === lastHoveredWord) {
    // すでにタイマー進行中なら何もしない
    return;
  }

  // 語が変わったのでタイマーをリセットして再セット
  lastHoveredWord = hovered;
  if (hoverTimer) {
    clearTimeout(hoverTimer);
  }
  hoverTimer = setTimeout(async () => {
    // タイマー発火時点でも同じ語であることを確認
    if (hovered !== lastHoveredWord) return;

    const word = hovered.toLowerCase();
    // 同一語の連続呼び出しを抑止
    if (currentWord === word) return;
    currentWord = word;

    const html = await fetchDictionaryHTML(currentWord);
    if (html) {
      const x = event.clientX;
      const y = event.clientY + window.scrollY - 100;
      showPopup(html, currentWord, x, y);
    }
  }, 300);
});

// 選択即時実行
document.addEventListener('selectionchange', async () => {
  const sel = window.getSelection();
  const text = sel ? sel.toString().trim() : '';
  console.log(text)
  if (!text || !/^[a-zA-Z]+$/.test(text)) return;

  const word = text.toLowerCase();
  if (currentWord === word) return;
  currentWord = word;

  const range = sel.rangeCount ? sel.getRangeAt(0) : null;
  const rect = range ? range.getBoundingClientRect() : null;
  const x = rect ? rect.right : 0;
  const y = rect ? (rect.bottom + window.scrollY - 100) : (20 + window.scrollY);

  const html = await fetchDictionaryHTML(currentWord);
  if (html) {
    showPopup(html, currentWord, x, y);
  }
});

document.addEventListener('mousedown', (event) => {
  // Close popup when clicking elsewhere
  if (popupElement && !popupElement.contains(event.target)) {
    closePopup();
  }
});

document.addEventListener('scroll', () => {
  closePopup();
});

console.log('✅ Dictionary Popup script loaded');

