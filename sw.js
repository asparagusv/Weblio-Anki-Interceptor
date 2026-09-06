// MV3のservice worker。MV2で複数登録していたbackgroundスクリプトをここでまとめて読み込む
// APIキーはgitignoreした別ファイルに置くので、cloneした直後など無くてもservice workerは動かす
try {
  importScripts("translate-secrets.js");
} catch (_) {
  console.warn("[weblio] translate-secrets.js が無い。DeepL翻訳は使えない");
}

importScripts(
  "translate-config.js",
  "dist/addTranslate.js",
  "ankiconnect.js",
  "deck-name.js",
  "background.js",
  "add-example.js",
  "mark_background.js"
);
