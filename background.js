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
      // 1秒後に fetch 関数を実行
      setTimeout(function () {
        fetch("https://uwl.weblio.jp/word-list")
          .then((response) => response.text())
          .then((data) => {
            // レスポンスの HTML テキストを DOM パーサーで解析
            const parser = new DOMParser();
            const htmlDoc = parser.parseFromString(data, "text/html");
            // 解析した HTML 文書から単語、意味、音声ファイルの URL を取得
            const word = htmlDoc.querySelector(
              ".tngMainTCK > div > a"
            ).textContent;
            const meaning = htmlDoc.querySelector(
              "td:nth-child(1) > div.tngMainTIML"
            ).textContent;
            const audio = htmlDoc.querySelector(".wordAudio > source").src;
            // 取得した情報をコンソールに出力
            console.log(word);
            console.log(meaning);
            console.log(audio);
            async function saveToAnki() {
              const result = await invoke("addNote", 6, {
                note: {
                  deckName: "デフォルト",
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
      }, 1000);
    }
  },
  { urls: ["<all_urls>"] },
  ["blocking"]
);
