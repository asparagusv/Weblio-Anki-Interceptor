import { translate } from '@vitalets/google-translate-api';


async function addNoteWithTranslatedText(info) {
  const { text } = await translate(info.selectionText, { to: 'ja' });
  const result = await addNote(await getDeckName(), info.selectionText, text);

  let answer = text;
  if (result !== "cannot create note because it is a duplicate") {
    answer = await appendImageSearchButton(result, info.selectionText, text);
  }

  addNoteErrorHandler(result, info.selectionText, answer);
  getMarkedParentElement();
}

// 右クリックメニュー作成
// MV3ではservice worker起動のたびにトップレベルが再実行されid重複するのでonInstalledで作る
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "google-translate",
    title: "Add selected text with Google Translation",
    contexts: ["selection"],
  });
});

// MV3ではcontextMenus.createのonclickが使えないのでonClickedで受ける
chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === "google-translate") {
    addNoteWithTranslatedText(info);
  }
});
