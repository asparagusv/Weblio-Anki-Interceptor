let deckName = "デフォルト";

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.type) {
    case "updateDeckName":
      deckName = request.deckName;
      sendResponse(true);
      break;
    case "getDeckName":
      sendResponse(deckName);
      break;
  }
});
