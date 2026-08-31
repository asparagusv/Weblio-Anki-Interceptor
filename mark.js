// 文章のまとまりとみなすタグ。BODY は遡りの打ち止め用
const BLOCK_TAGS = [
  "P", "DIV", "LI", "OL", "UL", "TD", "TH",
  "BLOCKQUOTE", "ARTICLE", "SECTION", "MAIN",
  "H1", "H2", "H3", "H4", "H5", "H6", "BODY",
];

// range を含む一番内側のブロック要素を返す
function findBlockAncestor(range) {
  let node = range.commonAncestorContainer;
  if (node.nodeType !== Node.ELEMENT_NODE) node = node.parentElement;
  while (node && !BLOCK_TAGS.includes(node.nodeName.toUpperCase())) {
    node = node.parentElement;
  }
  return node;
}

// カードには HTML として埋め込まれるので < > & を実体参照に変換する
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// 本文として読むべきテキストだけを集める。innerText を使わないのは、
// position:absolute の吹き出しやボタンが文書順でそのまま混ざってしまうため。
// Language Reactor の字幕では単語ごとのツールチップ(訳語)と Save Phrase ボタンが
// これに当たり、中の <br> が改行を作って文まで分断していた。
function collectVisibleText(element) {
  let text = "";
  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      // ソースの改行やインデントは CSS と同じく空白1つに畳む。
      // ここを畳まないと後段の行分割がソースの折り返し位置で文を切ってしまう
      text += node.data.replace(/\s+/g, " ");
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    if (node.nodeName === "BR") {
      text += "\n";
      continue;
    }
    const style = window.getComputedStyle(node);
    // 非表示のもの。display:none だけでなく visibility:hidden も落とす
    if (style.display === "none" || style.visibility !== "visible") continue;
    // 流れから外れた吹き出し・オーバーレイ・ボタンの類
    if (style.position === "absolute" || style.position === "fixed") continue;

    const isBlock = !style.display.startsWith("inline");
    if (isBlock) text += "\n";
    text += collectVisibleText(node);
    if (isBlock) text += "\n";
  }
  return text;
}

// selectedText を含むブロック要素から見た目どおりの1行を取り出し、
// selectedText を <mark> で囲んだ HTML を返す。
// range は選択範囲でもホバー時の(collapsedな)Rangeでもよい。
function extractMarkedText(selectedText, range) {
  if (!selectedText || !range) return null;

  const block = findBlockAncestor(range);
  if (!block) return null;

  // 計算済みスタイルを見て集めるので、必ず DOM 上のライブ要素を渡すこと。
  // cloneNode したものはレンダリング対象外で、スタイルも innerText も当てにならない。
  const text = collectVisibleText(block);

  // 改行はブロックの境界。選択語と同じ行だけ使う
  const line =
    text.split("\n").find((l) => l.includes(selectedText)) || text;

  // &nbsp; や連続する空白・インデントを普通の空白1つに潰す
  const sentence = line.replace(/\s+/g, " ").trim();
  if (!sentence) return null;

  const index = sentence.indexOf(selectedText);
  if (index === -1) return escapeHtml(sentence);

  return (
    escapeHtml(sentence.slice(0, index)) +
    "<mark>" + escapeHtml(selectedText) + "</mark>" +
    escapeHtml(sentence.slice(index + selectedText.length))
  );
}

chrome.runtime.onMessage.addListener((request) => {
    if (request.action === "getMarked") {
      var selectedText = window.getSelection().toString().trim();
      if (selectedText !== "") {
        var range = window.getSelection().getRangeAt(0);
        var marked = extractMarkedText(selectedText, range);
        if (marked) {
          chrome.runtime.sendMessage({ marked: marked });
        }
      }
    }
  });
