// background.jsからのメッセージをトリガーに実行
chrome.extension.onMessage.addListener(function (
  request,
  sender,
  sendResponse
) {
  const targetElement = document.getElementById("extensionsWeblioEjBx");
  // cssを適用
  targetElement.style.width = "350px";
  targetElement.style.height = "48px";
  targetElement.style.backgroundColor = "white";
  targetElement.style.color = "black";
  targetElement.style.borderRadius = "5px";
  targetElement.style.textAlign = "center";
  targetElement.style.lineHeight = "48px";
  targetElement.style.boxShadow =
    "rgb(204, 219, 232) 3px 3px 6px 0px inset, rgba(255, 255, 255, 0.5) -3px -3px 6px 1px inset";
  if (request[0] == "weblioAnkiInterceptor-succeed") {
    console.log(request[0]);
    // 内部のHTMLを上書き
    targetElement.innerHTML =
      "added " + "<b>" + request[1]["word"] + "</b>" + " to Anki";
  } else if (request[0] == "weblioAnkiInterceptor-duplicate") {
    console.log(request[0]);
    targetElement.innerHTML =
      "<b>" + request[1]["word"] + "</b>" + " already in your deck";
  }
});
