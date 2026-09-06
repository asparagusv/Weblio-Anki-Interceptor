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

// 選択した原文を表面、その翻訳を裏面にしたノートを作る。戻り値はaddNoteのもの(noteId or エラー文字列)。
// translation はポップアップ側で既に表示済みの訳文。渡されればカードの裏面と表示を一致させられるし、
// 同じ文をもう一度APIに投げずに済む。未翻訳のまま押された場合はここで引く
async function addNoteWithTranslatedText(text, translation) {
  const meaning = translation || (await translateToJapanese(text));
  const result = await addNote(await getDeckName(), text, meaning);

  let answer = meaning;
  if (result !== "cannot create note because it is a duplicate") {
    answer = await appendImageSearchButton(result, text, meaning);
  }

  addNoteErrorHandler(result, text, answer);
  return result;
}

// dictionary-popup.js の翻訳ボタン / 翻訳カード追加ボタンからのリクエスト。
// content script からだと CORS とAPIキー露出の問題があるので service worker で代行する
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request && request.type === "translateText" && request.text) {
    translateToJapanese(request.text)
      .then((text) => sendResponse({ ok: true, text }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true; // 非同期でsendResponseするため
  }

  if (request && request.type === "addTranslatedNote" && request.text) {
    addNoteWithTranslatedText(request.text, request.translation)
      .then((result) =>
        sendResponse(
          result === "cannot create note because it is a duplicate"
            ? { success: false, duplicate: true }
            : { success: true, noteId: result }
        )
      )
      .catch((error) => sendResponse({ success: false, error: String(error) }));
    return true;
  }

  return false;
});
