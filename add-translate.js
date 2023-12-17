import { translate } from '@vitalets/google-translate-api';


async function addNoteWithTranslatedText(info) {
  const { text } = await translate(info.selectionText, { to: 'ja' });
  console.log(text);
  addNote(deckName, info.selectionText, text).then((result) => {
    addNoteErrorHandler(result, info.selectionText, text);
    getMarkedParentElement();
  });
}

// 右クリックメニュー作成
chrome.contextMenus.create({
  id: "google-translate",
  title: "Add selected text with Google Translation",
  contexts: ["selection"],
  onclick: addNoteWithTranslatedText
});
