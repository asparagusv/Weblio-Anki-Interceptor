// MV3のservice worker。MV2で複数登録していたbackgroundスクリプトをここでまとめて読み込む
importScripts(
  "dist/addTranslate.js",
  "ankiconnect.js",
  "deck-name.js",
  "background.js",
  "add-example.js",
  "mark_background.js"
);
