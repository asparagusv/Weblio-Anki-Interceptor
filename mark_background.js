// 例文はcontent script側(dictionary-popup.js)がRangeから切り出して送ってくる。
// メッセージを受信する
chrome.runtime.onMessage.addListener((request) => {
// 他の用途のメッセージも届くのでmarkedを持つものだけ処理する
if (!request || request.marked === undefined) return;
// 受信したメッセージをコンソールに出力する
console.log(request.marked);
addExampleSentenceToLatestNote(request.marked)
});