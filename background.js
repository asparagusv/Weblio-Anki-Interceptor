// offscreen documentは一度だけ作る。service workerが再起動しても既存があれば作り直さない
let offscreenReady = null;
async function ensureOffscreenDocument() {
  if (offscreenReady) return offscreenReady;
  offscreenReady = (async () => {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
    });
    if (contexts.length > 0) return;
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["DOM_PARSER"],
      justification: "WeblioのHTMLから単語・意味・音声を抽出する",
    });
  })();
  return offscreenReady;
}

// WeblioのHTMLを解析して {word, meaning, audio} を得る
async function parseWeblioHtml(html) {
  await ensureOffscreenDocument();
  return chrome.runtime.sendMessage({ type: "parseWeblioHtml", html });
}

// lemma(見出し語)からWeblioのページを取得・解析してAnkiにノート追加する共通処理
async function addWordFromLemma(lemma) {
  // 熟語はスペースを含むのでエンコードしてから繋ぐ
  const response = await fetch(
    "https://ejje.weblio.jp/content/" + encodeURIComponent(lemma)
  );
  const html = await response.text();
  const { word, meaning, audio } = await parseWeblioHtml(html);

  // noteIdはaddNoteの戻り値でしか分からないので、先にボタン無しで作成してから
  // ボタンにnoteIdを埋め込んだ内容でupdateNoteFieldsする
  const result = await addNote(await getDeckName(), word, meaning, audio);

  let answer = meaning;
  if (result !== "cannot create note because it is a duplicate") {
    answer = await appendImageSearchButton(result, word, meaning);
  }

  addNoteErrorHandler(result, word, answer);
  return { word, result };
}

// dictionary-popup.js からのホバー/選択登録リクエストを処理する
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request && request.type === "addWordToAnki" && request.word) {
    addWordFromLemma(request.word)
      .then(({ result }) => {
        if (result === "cannot create note because it is a duplicate") {
          sendResponse({ success: false, duplicate: true });
        } else {
          sendResponse({ success: true, noteId: result });
        }
      })
      .catch((error) => {
        console.error(error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // 非同期でsendResponseするため
  }

  // dictionary-popup.js のポップアップHTML取得はcontent script側からだとCORSにかかるためbackground側で代行する
  if (request && request.type === "fetchWeblio") {
    fetch(request.url)
      .then((res) => res.text())
      .then((text) => sendResponse({ ok: true, text }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  return false;
});
