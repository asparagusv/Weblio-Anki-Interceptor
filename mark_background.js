function getMarkedParentElement() {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      chrome.tabs.sendMessage(tabs[0].id, { action: "getMarked" });
    });
}
  
// メッセージを受信する
chrome.runtime.onMessage.addListener((request) => {
// 受信したメッセージをコンソールに出力する
console.log(request.marked);
addExampleSentenceToLatestNote(request.marked)
});