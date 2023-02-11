let deckName = "デフォルト";

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.type) {
    case "updateDeckName":
      deckName = request.deckName;
      sendResponse(true);
      break;
    case "getDeckName":
      sendResponse(deckName);
      break;
  }
});

function invoke(action, version, params = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.addEventListener("error", () => reject("failed to issue request"));
    xhr.addEventListener("load", () => {
      try {
        const response = JSON.parse(xhr.responseText);
        if (Object.getOwnPropertyNames(response).length != 2) {
          throw "response has an unexpected number of fields";
        }
        if (!response.hasOwnProperty("error")) {
          throw "response is missing required error field";
        }
        if (!response.hasOwnProperty("result")) {
          throw "response is missing required result field";
        }
        if (response.error) {
          throw response.error;
        }
        resolve(response.result);
      } catch (e) {
        reject(e);
      }
    });

    xhr.open("POST", "http://127.0.0.1:8765");
    xhr.send(JSON.stringify({ action, version, params }));
  });
}

// Chrome の webRequest API の onBeforeRequest イベントリスナーを追加
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
      let word = url.searchParams.get("lemma");
      fetch("https://ejje.weblio.jp/content/" + word)
        .then((response) => response.text())
        .then((data) => {
          // レスポンスの HTML テキストを DOM パーサーで解析
          const parser = new DOMParser();
          const htmlDoc = parser.parseFromString(data, "text/html");
          // 解析した HTML 文書から意味、音声ファイルの URL を取得
          const meaning = htmlDoc.getElementsByClassName(
            "content-explanation"
          )[0].textContent;
          const audio = htmlDoc.querySelector(".contentAudio > source").src;
          // 取得した情報をコンソールに出力
          console.log(word);
          console.log(meaning);
          console.log(audio);
          // トリガーとなるメッセージと、単語、意味をオブジェクトにする
          const messages = [
            "weblioAnkiInterceptor",
            { word: word, meaning: meaning },
          ];
          //現在のアクティブタブにメッセージを送り、content.jsで受信
          chrome.tabs.query(
            { active: true, currentWindow: true },
            function (tabs) {
              chrome.tabs.sendMessage(tabs[0].id, messages);
            }
          );

          async function saveToAnki() {
            const result = await invoke("addNote", 6, {
              note: {
                deckName: deckName,
                modelName: "基本",
                fields: {
                  表面: word + " [sound:" + word + "]",
                  裏面: meaning,
                },
                audio: [
                  {
                    url: audio,
                    filename: word,
                    fields: ["Front"],
                  },
                ],
              },
            });
            console.log(`${result}`);
          }

          saveToAnki();
        })
        .catch((error) => console.error(error));
    }
  },
  { urls: ["<all_urls>"] },
  ["blocking"]
);
