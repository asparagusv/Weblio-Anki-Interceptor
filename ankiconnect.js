// service workerではXMLHttpRequestが使えないのでfetchを使う
async function invoke(action, version, params = {}) {
  let response;
  try {
    const res = await fetch("http://127.0.0.1:8765", {
      method: "POST",
      body: JSON.stringify({ action, version, params }),
    });
    response = await res.json();
  } catch (e) {
    throw "failed to issue request";
  }

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
  return response.result;
}



// ノートを追加する関数。返り値は、成功：noteId, 失敗：エラーメッセージ
async function addNote(deckName, word, meaning, audio) {
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

  function isURL(str) {
    try {
      new URL(str);
      return true;
    } catch (e) {
      return false;
    }
  }
  // audioがない場合、audioに関する情報をnoteから消す
  if (!isURL(audio)) {
    console.log("false not url");
    delete note["audio"];
    note["fields"]["表面"] = word;
  }
  let result
  try {
    result = await invoke("addNote", 6, { note });
  } catch (e) {
    result = e
  }
  
  return result;
}



// 画像検索ボタンを裏面に追記してAnki側に反映する。戻り値はボタン込みの裏面
// noteIdはaddNoteの戻り値でしか分からないので、addNote成功後に呼ぶ想定
async function appendImageSearchButton(noteId, word, meaning) {
  const imageSearchUrl =
    "https://www.google.com/search?q=" +
    encodeURIComponent(word) +
    "+definition+images&tbm=isch&noteId=" +
    encodeURIComponent(noteId);

  const imageSearchButton =
    '<a href="' +
    imageSearchUrl +
    '" style="margin-left:15px"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a9c7e3" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M20.4 14.5L16 10 4 20"/></svg></a>';

  const answer = meaning + imageSearchButton;
  await invoke("updateNoteFields", 6, {
    note: { id: noteId, fields: { 裏面: answer } },
  });
  return answer;
}

function addNoteErrorHandler(result, word, meaning) {
  //　重複時
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
  } else {
    // 重複していない時はnoteIdが返される
    console.log(`${result}`);

    // 作成したノートのIDを保存する
    chrome.storage.local.set({ noteId: result }, function () {
      //エラーハンドリング
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError);
      }
    });

    // add-example.jsのupdateContextMenuTitleをトリガー
    updateContextMenuTitle(result);

    let triggerKeyword = "weblioAnkiInterceptor-succeed";
    // トリガーとなるメッセージと、単語、意味をオブジェクトにする
    const messages = [
      triggerKeyword,
      { word: word, meaning: meaning },
    ];
    
    
    // 現在のアクティブタブにメッセージを送り、content.jsで受信
    chrome.tabs.query(
      { active: true, currentWindow: true },
      function (tabs) {
        chrome.tabs.sendMessage(tabs[0].id, messages);
      }
    );
  }
}