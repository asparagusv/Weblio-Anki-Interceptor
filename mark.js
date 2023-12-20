chrome.runtime.onMessage.addListener((request) => {
    if (request.action === "getMarked") {
      var selectedText = window.getSelection().toString().trim();
      if (selectedText !== "") {
        var selection = window.getSelection();
        var range = selection.getRangeAt(0);
        // 選択範囲の親要素
        var selectedElement = range.commonAncestorContainer;

        // 文章のまとまりである可能性が高いタグにたどり着くまで親要素をたどる
        let i = 0
        while (
            selectedElement.nodeName.toUpperCase() !== "P" && 
            selectedElement.nodeName.toUpperCase() !== "DIV" && 
            selectedElement.nodeName.toUpperCase() !== "LI" && 
            selectedElement.nodeName.toUpperCase() !== "OL" && 
            selectedElement.nodeName.toUpperCase() !== "UL" && 
            selectedElement.nodeName.toUpperCase() !== "H1" && 
            selectedElement.nodeName.toUpperCase() !== "H2" && 
            selectedElement.nodeName.toUpperCase() !== "H3" && 
            selectedElement.nodeName.toUpperCase() !== "H4" && 
            selectedElement.nodeName.toUpperCase() !== "H5" && 
            selectedElement.nodeName.toUpperCase() !== "H6" && 
            i!==2) {
            selectedElement = selectedElement.parentElement;
            i++ 
        }

        var selectedElement = selectedElement.cloneNode(true); // DOMに影響を与えないようにコピーを作る


        // selectedElementの子がbrかテキストノード以外のaタグなどの場合はテキストノードに変換する
        for (let i = 0; i < selectedElement.childNodes.length; i++) {
            const child = selectedElement.childNodes[i];
            if (child.nodeName !== "BR" && child.nodeName !== "#text") {
                const newText = document.createTextNode(child.textContent);
                selectedElement.replaceChild(newText, child);
            }
        }
        // console.log("selectedElement No BR", selectedElement)

        

        // childrenにbrが含まれるか
        if(Array.from(selectedElement.childNodes).some(child => child.tagName === "BR")){
            // 子ノードをforで回す
            for (let i = 0; i < selectedElement.childNodes.length; i++) {
                const child = selectedElement.childNodes[i];
                // childが選択範囲のテキストを含む場合はpタグで囲みselectedElementとする
                if (child.textContent.includes(selectedText)) {
                    selectedElement = document.createElement("p");
                    selectedElement.appendChild(document.createTextNode(child.textContent));
                    break;
                }
                
            }
        }

  
        var mark = document.createElement("mark");
        mark.innerText = selectedText; // 範囲内の内容を <mark> に移動
  
        const marked = selectedElement.innerText.replace(selectedText, mark.outerHTML);
  
        chrome.runtime.sendMessage({ marked: marked });
      }
    }
  });