chrome.runtime.onMessage.addListener((request, sendResponse) => {
    if (request.action === "getMarked") {
      var selectedText = window.getSelection().toString().trim();
      if (selectedText !== "") {
        var selection = window.getSelection();
        var range = selection.getRangeAt(0);
        // 選択範囲の親要素
        var selectedElement = range.commonAncestorContainer;

        // pかdivタグにたどり着くまで親要素をたどる
        let i = 0
        while (selectedElement.tagName !== "P" && selectedElement.tagName !== "DIV" && i!==3) {
            selectedElement = selectedElement.parentElement;
            i++
        }
        console.log(selectedElement)

        // // selectedElementの単語数がselectedTextと同じか+-2の場合
        // console.log('selectedElement.textContent.trim().split(" ").length', selectedElement.textContent.trim().split(" ").length)
        // console.log('selectedText.trim().split(" ").length', selectedText.trim().split(" ").length)
        // if (Math.abs(selectedElement.textContent.trim().split(" ").length - selectedText.trim().split(" ").length) <= 2) {
        //     console.log("hi")
        //     console.log("selectedElement.nextElementSibling", selectedElement.nextElementSibling)
        //     console.log("selectedElement.previousElementSibling", selectedElement.previousElementSibling)
        //     if (selectedElement.nextElementSibling || selectedElement.previousElementSibling) {
        //         selectedElement = selectedElement.nextSibling;
        //     } else {
        //         selectedElement = selectedElement.parentElement;
        //     }
        // }
        // console.log(selectedElement)
        
        // // selectedElementが要素ではなくテキストノードの場合にpタグで囲む
        // if (selectedElement.nodeType === Node.TEXT_NODE) {
        //     console.log("oi")
        //     var pTag = document.createElement("p");
        //     pTag.appendChild(selectedElement.cloneNode(true));
        //     selectedElement = pTag;
        // }

        

        // console.log(typeof(selectedElement))
        // console.log(String(selectedElement.textContent))
        // console.log("outer", selectedElement.outerHTML)
        // if (String(selectedElement.textContent) === selectedText){
        //     console.log("hi")
        // }
        // console.log("selectedElement", selectedElement)
  
        // 親要素のコピーを作成し、それにマークアップを適用
        var parentClone = selectedElement.cloneNode(true); // 親要素のコピー
        var mark = document.createElement("mark");
        mark.innerText = selectedText; // 範囲内の内容を <mark> に移動
  
        const marked = parentClone.innerText.replace(selectedText, mark.outerHTML);
  
        chrome.runtime.sendMessage({ marked: marked });
      }
    }
  });