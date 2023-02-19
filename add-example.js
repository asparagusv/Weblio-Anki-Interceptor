async function addExampleSentenceToLatestNote(info) {
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

  const noteId = await getNoteId();

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

chrome.contextMenus.create({
  title: "Add this to the latest note as an example",
  contexts: ["selection"],
  onclick: addExampleSentenceToLatestNote,
});
