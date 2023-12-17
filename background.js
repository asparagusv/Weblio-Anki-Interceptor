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
          word = htmlDoc
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

          // 取得した情報をコンソールに出力
          console.log(word);
          console.log(meaning);
          console.log(audio);

          const imageSearchUrl =
            "https://www.google.com/search?q=" +
            word +
            "+definition+images&tbm=isch&ved=2ahUKEwiymp6x6sz_AhUfTPUHHQcRACUQ2-cCegQIABAA&oq=glorious+definition+images&gs_lcp=CgNpbWcQAzIECCMQJ1CxB1ixB2CeCmgAcAB4AIABSYgBjQGSAQEymAEAoAEBqgELZ3dzLXdpei1pbWfAAQE&sclient=img&ei=__mOZPKeEZ-Y1e8Ph6KAqAI&bih=1041&biw=2133&hl=en";

          const imageSearchButton =
            '<a href="' +
            imageSearchUrl +
            '" style="margin-left:15px"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a9c7e3" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M20.4 14.5L16 10 4 20"/></svg></a>';

          const answer = meaning + imageSearchButton;

          addNote(deckName, word, answer, audio).then((result) => {
            addNoteErrorHandler(result, word, answer);
            getMarkedParentElement()
          });
          // .catch((e) => console.error(e));
        })
        .catch((error) => console.error(error));
    }
  },
  { urls: ["<all_urls>"] },
  ["blocking"]
);
