// deckNameを取得する
// service workerは随時停止するのでグローバル変数に保持せず、都度storageから読む
// 未設定ならデフォルトを返す
async function getDeckName() {
  const result = await chrome.storage.local.get("deckName");
  return result.deckName || "デフォルト";
}

// deckNameの変更を受け取り、デッキ名を保存する
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type !== "updateDeckName") return;
  chrome.storage.local.set({ deckName: request.deckName }).then(() => {
    sendResponse(true);
  });
  return true; // 非同期でsendResponseするため
});
