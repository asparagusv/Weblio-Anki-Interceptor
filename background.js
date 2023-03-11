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
        .then((response) => response.text()) // fetchの返り値がresponseに入っているアロー関数
        .then((data) => {
          // レスポンスの HTML テキストを DOM パーサーで解析
          const parser = new DOMParser();
          const htmlDoc = parser.parseFromString(data, "text/html");

          // 解析した HTML 文書から単語、意味、音声ファイルを取得
          // wordも取得したものに書き換える。スペースの有無を正しくするため。一律小文字化
          word = htmlDoc.getElementById("h1Query").title.toLowerCase();

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

          // 取得した情報をコンソールに出力
          console.log(word);
          console.log(meaning);
          console.log(audio);

          function isURL(str) {
            try {
              new URL(str);
              return true;
            } catch (e) {
              return false;
            }
          }

          async function saveToAnki() {
            const note = {
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
            };
            // audioがない場合、audioに関する情報をnoteから消す
            if (!isURL(audio)) {
              console.log("false not url");
              delete note["audio"];
              note["fields"]["表面"] = word;
            }
            // // findNotesに大文字小文字の区別はない
            // const isDuplicate = await invoke("findNotes", 6, {
            //   // query: '"表面: luc"',
            //   query: `deck:current "表面:${word}"`,
            // });

            // console.log(isDuplicate);

            // const notesInfo = await invoke("notesInfo", 6, {
            //   notes: isDuplicate,
            // });

            // console.log(JSON.stringify(notesInfo, null, 2));
            // 重複時にエラーをsaveToAnkiの返り値にするためtryでaddNote
            try {
              const noteId = await invoke("addNote", 6, { note });
              console.log(`${noteId}`);

              // 作成したノートのIDを保存する
              chrome.storage.local.set({ noteId: noteId }, function () {
                //エラーハンドリング
                if (chrome.runtime.lastError) {
                  console.error(chrome.runtime.lastError);
                }
              });

              // add-example.jsのupdateContextMenuTitleをトリガー
              updateContextMenuTitle(noteId);

              let triggerKeyword = "weblioAnkiInterceptor-succeed";
              // トリガーとなるメッセージと、単語、意味をオブジェクトにする
              const messages = [
                triggerKeyword,
                { word: word, meaning: meaning },
              ];
              // saveToAnki成功時、重複していない時
              // 現在のアクティブタブにメッセージを送り、content.jsで受信
              chrome.tabs.query(
                { active: true, currentWindow: true },
                function (tabs) {
                  chrome.tabs.sendMessage(tabs[0].id, messages);
                }
              );
            } catch (e) {
              console.error(e);
              return e;
            }
          }

          saveToAnki().then((result) => {
            if (result === "cannot create note because it is a duplicate") {
              let triggerKeyword = "weblioAnkiInterceptor-duplicate";
              const messages = [
                triggerKeyword,
                { word: word, meaning: meaning },
              ];
              console.log(JSON.stringify(messages, null, 2));
              // メッセージでcontent.jsのdom操作をトリガー
              chrome.tabs.query(
                { active: true, currentWindow: true },
                function (tabs) {
                  chrome.tabs.sendMessage(tabs[0].id, messages);
                }
              );
            }
          });
          // .catch((e) => console.error(e));
        })
        .catch((error) => console.error(error));
    }
  },
  { urls: ["<all_urls>"] },
  ["blocking"]
);
