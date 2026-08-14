// service workerにはDOMParserがないため、HTML解析はこのoffscreen documentで行う
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type !== "parseWeblioHtml") return;

  const htmlDoc = new DOMParser().parseFromString(request.html, "text/html");

  // wordも取得したものに書き換える。スペースの有無を正しくするため。一律小文字化
  const word = htmlDoc
    .querySelector(".formBoxInputTd > input")
    .value.toLowerCase();

  let meaning;
  try {
    meaning = htmlDoc.getElementsByClassName("content-explanation")[0]
      .textContent;
  } catch (e) {
    meaning = htmlDoc.querySelector(".werbjJ > p").textContent;
  }

  // 音声がない場合のエラーをキャッチ
  let audio;
  try {
    audio = htmlDoc.querySelector(".contentAudio > source").src;
  } catch (e) {
    audio = "there was no audio source" + "\n" + e;
  }

  sendResponse({ word, meaning, audio });
});
