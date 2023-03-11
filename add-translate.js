import { translate } from '@vitalets/google-translate-api';


async function addNoteWithTranslatedText(info) {
  const meaning = await translate(info.selectionText, { to: 'ja' });
  // 選択範囲を翻訳結果とともにノートにする
  const note = {
    deckName: deckName,
    modelName: "基本",
    fields: {
      表面: info.selectionText,
      裏面: meaning["text"],
    },
  };
  console.log(JSON.stringify(note, null, 2));
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
  } catch (e) {
    console.error(e);
    return e;
  }
}

// 右クリックメニュー作成
chrome.contextMenus.create({
  id: "google-translate",
  title: "Add selected text with Google Translation",
  contexts: ["selection"],
  onclick: addNoteWithTranslatedText
});
