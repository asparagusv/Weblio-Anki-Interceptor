// deckNameを取得する（エラーハンドリング付き）
// deckNameがなければデフォルトのまま
chrome.storage.local.get("deckName", function (result) {
  if (chrome.runtime.lastError) {
    console.error(chrome.runtime.lastError);
  } else {
    // result.deckNameがundefinedの場合、デフォルトが設定される
    deckName = result.deckName || "デフォルト";
    console.log(deckName);
  }
});

// deckNameの変更を監視、変更があればデッキ名を保存する
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.type) {
    case "updateDeckName":
      deckName = request.deckName;
      console.log(deckName);
      // deckNameを保存する（エラーハンドリング付き）
      chrome.storage.local.set({ deckName: deckName }, function () {
        if (chrome.runtime.lastError) {
          console.error(chrome.runtime.lastError);
        }
      });

      sendResponse(true);
      break;
  }
});
