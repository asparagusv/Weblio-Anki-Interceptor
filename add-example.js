// 直近に作成したノートのIDを取得する
function getNoteId() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get("noteId", function (result) {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(result.noteId);
      }
    });
  });
}

async function addExampleSentenceToLatestNote(info) {
  const noteId = await getNoteId();
  console.log(noteId);
  // ノートIDから情報取得後、裏面を変数にする
  const notesInfo = await invoke("notesInfo", 6, { notes: [noteId] });
  console.log(JSON.stringify(notesInfo, null, 2));
  const back = notesInfo[0].fields["裏面"].value;

  // 選択範囲を例文として追加
  const note = {
    id: noteId,
    fields: {
      裏面: back + "<ul><li>" + info.selectionText + "</li></ul>",
    },
  };
  console.log(JSON.stringify(note, null, 2));
  const result = await invoke("updateNoteFields", 6, { note });
}

// 右クリックメニュー作成
chrome.contextMenus.create({
  id: "example",
  title: "Add selected text as an example for the last added note",
  contexts: ["selection"],
  onclick: addExampleSentenceToLatestNote,
});

// 右クリックメニューの名前更新
// background.jsで単語が登録されるとトリガーされる
async function updateContextMenuTitle(noteId) {
  const notesInfo = await invoke("notesInfo", 6, { notes: [noteId] });
  const front = notesInfo[0].fields["表面"].value.replace(/\s\[[^\]]*\]/g, "");

  const title = front
    ? `Add selected text as an example for the note "${front}"`
    : "Add selected text as an example for the last added note";
  chrome.contextMenus.update("example", { title: title });
}

