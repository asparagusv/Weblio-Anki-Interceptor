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
  const response = await fetch("https://ejje.weblio.jp/content/" + lemma);
  const html = await response.text();
  const { word, meaning, audio } = await parseWeblioHtml(html);

  const imageSearchUrl =
    "https://www.google.com/search?q=" +
    word +
    "+definition+images&tbm=isch&ved=2ahUKEwiymp6x6sz_AhUfTPUHHQcRACUQ2-cCegQIABAA&oq=glorious+definition+images&gs_lcp=CgNpbWcQAzIECCMQJ1CxB1ixB2CeCmgAcAB4AIABSYgBjQGSAQEymAEAoAEBqgELZ3dzLXdpei1pbWfAAQE&sclient=img&ei=__mOZPKeEZ-Y1e8Ph6KAqAI&bih=1041&biw=2133&hl=en";

  const imageSearchButton =
    '<a href="' +
    imageSearchUrl +
    '" style="margin-left:15px"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a9c7e3" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M20.4 14.5L16 10 4 20"/></svg></a>';

  const answer = meaning + imageSearchButton;

  const result = await addNote(await getDeckName(), word, answer, audio);
  addNoteErrorHandler(result, word, answer);
  return { word, result };
}

// Chrome の webRequest API の onBeforeRequest イベントリスナーを追加
// MV3ではblockingが使えないが、元々リクエストを書き換えていないので監視のみで足りる
chrome.webRequest.onBeforeRequest.addListener(
  // details にリクエストの詳細情報が格納される
  function (details) {
    // details.method が GET かつ、details.url の先頭が "https://uwl.weblio.jp/api/word-post-api-json" である場合
    if (
      details.method === "GET" &&
      details.url.startsWith("https://uwl.weblio.jp/api/word-post-api-json")
    ) {
      console.log(details.url);
      let url = new URL(details.url);
      let lemma = url.searchParams.get("lemma");
      addWordFromLemma(lemma)
        .then(() => getMarkedParentElement())
        .catch((error) => console.error(error));
    }
  },
  { urls: ["<all_urls>"] }
);

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
