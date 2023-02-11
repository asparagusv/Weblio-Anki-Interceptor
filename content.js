// background.jsからのメッセージをトリガーに実行
chrome.extension.onMessage.addListener(function (
  request,
  sender,
  sendResponse
) {
  if (request[0] == "weblioAnkiInterceptor") {
    console.log("weblioAnkiInterceptor");
    const targetElement = document.getElementById("extensionsWeblioEjBx");
    // var box = document.createElement("div");
    // box.id = "box";
    targetElement.style.width = "350px";
    targetElement.style.height = "48px";
    targetElement.style.backgroundColor = "white";
    targetElement.style.color = "black";
    targetElement.style.borderRadius = "5px";
    targetElement.style.textAlign = "center";
    targetElement.style.lineHeight = "48px";
    targetElement.style.boxShadow =
      "rgb(204, 219, 232) 3px 3px 6px 0px inset, rgba(255, 255, 255, 0.5) -3px -3px 6px 1px inset";
    targetElement.innerHTML = request[1]["word"];
  }
});
