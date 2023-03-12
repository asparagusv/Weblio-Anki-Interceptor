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