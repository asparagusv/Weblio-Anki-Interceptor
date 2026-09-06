import { translate } from '@vitalets/google-translate-api';

// 翻訳プロバイダの実体。切り替えは translate-config.js の self.TRANSLATE_PROVIDER で行う。
// 呼び出しごとに読むので、拡張のリロードだけで切り替わる
async function translateToJapanese(text) {
  return self.TRANSLATE_PROVIDER === "google"
    ? translateWithGoogle(text)
    : translateWithDeepL(text);
}

// DeepL: キー末尾が ":fx" なら Free プラン。エンドポイントが別ホストなので出し分ける
async function translateWithDeepL(text) {
  const key = self.DEEPL_API_KEY;
  if (!key) throw new Error("DEEPL_API_KEY が未設定。translate-secrets.js を作る");

  const host = key.endsWith(":fx") ? "api-free.deepl.com" : "api.deepl.com";
  const response = await fetch(`https://${host}/v2/translate`, {
    method: "POST",
    headers: {
      "Authorization": `DeepL-Auth-Key ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text: [text], target_lang: "JA" }),
  });
  if (!response.ok) {
    throw new Error(`DeepL ${response.status}: ${await response.text()}`);
  }
  const { translations } = await response.json();
  return translations[0].text;
}

// deprecated: DeepL より精度が落ちる。DeepL で問題が出なければこの関数と
// @vitalets/google-translate-api 依存ごと削除する
async function translateWithGoogle(text) {
  const { text: translated } = await translate(text, { to: "ja" });
  return translated;
}

async function addNoteWithTranslatedText(info) {
  const text = await translateToJapanese(info.selectionText);
  const result = await addNote(await getDeckName(), info.selectionText, text);

  let answer = text;
  if (result !== "cannot create note because it is a duplicate") {
    answer = await appendImageSearchButton(result, info.selectionText, text);
  }

  addNoteErrorHandler(result, info.selectionText, answer);
  getMarkedParentElement();
}

// 右クリックメニュー作成
// MV3ではservice worker起動のたびにトップレベルが再実行されid重複するのでonInstalledで作る
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "google-translate",
    title: "Add selected text with Google Translation",
    contexts: ["selection"],
  });
});

// MV3ではcontextMenus.createのonclickが使えないのでonClickedで受ける
chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === "google-translate") {
    addNoteWithTranslatedText(info);
  }
});
