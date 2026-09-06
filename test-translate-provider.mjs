import assert from "node:assert";
import { readFileSync } from "node:fs";

// add-translate.js は service worker 用の ESM なのでそのまま import できない。
// プロバイダ切り替えの部分だけ切り出して、self / fetch / translate を差し替えて評価する
const src = readFileSync(new URL("./add-translate.js", import.meta.url), "utf8");
const start = src.indexOf("// 翻訳プロバイダの実体");
const end = src.indexOf("async function addNoteWithTranslatedText");
assert.ok(start !== -1 && end > start, "切り出す範囲が見つからない");

function load({ provider, key, fetchImpl, googleImpl }) {
  const self = { TRANSLATE_PROVIDER: provider, DEEPL_API_KEY: key };
  return new Function(
    "self",
    "fetch",
    "translate",
    src.slice(start, end) + "\nreturn translateToJapanese;"
  )(self, fetchImpl, googleImpl);
}

const okResponse = (text) => ({
  ok: true,
  json: async () => ({ translations: [{ text, detected_source_language: "EN" }] }),
});

// --- DeepL Free (キー末尾 :fx) ---
{
  let seen;
  const translateToJapanese = load({
    provider: "deepl",
    key: "dummy-key:fx",
    fetchImpl: async (url, init) => ((seen = { url, init }), okResponse("リンゴ")),
  });
  assert.strictEqual(await translateToJapanese("apple"), "リンゴ");
  assert.strictEqual(seen.url, "https://api-free.deepl.com/v2/translate");
  assert.strictEqual(seen.init.method, "POST");
  assert.strictEqual(seen.init.headers.Authorization, "DeepL-Auth-Key dummy-key:fx");
  assert.deepStrictEqual(JSON.parse(seen.init.body), { text: ["apple"], target_lang: "JA" });
}

// --- DeepL Pro (:fx なし) は別ホスト ---
{
  let seen;
  const translateToJapanese = load({
    provider: "deepl",
    key: "dummy-key",
    fetchImpl: async (url) => ((seen = url), okResponse("リンゴ")),
  });
  await translateToJapanese("apple");
  assert.strictEqual(seen, "https://api.deepl.com/v2/translate");
}

// --- TRANSLATE_PROVIDER 未設定なら DeepL に倒す ---
{
  let called = false;
  const translateToJapanese = load({
    provider: undefined,
    key: "dummy-key:fx",
    fetchImpl: async () => ((called = true), okResponse("リンゴ")),
  });
  await translateToJapanese("apple");
  assert.ok(called, "未設定時に DeepL が呼ばれていない");
}

// --- キー未設定は握りつぶさずエラーにする ---
{
  const translateToJapanese = load({ provider: "deepl", key: "", fetchImpl: async () => okResponse("x") });
  await assert.rejects(() => translateToJapanese("apple"), /DEEPL_API_KEY/);
}

// --- DeepL がエラーを返したらステータス付きで投げる ---
{
  const translateToJapanese = load({
    provider: "deepl",
    key: "dummy-key:fx",
    fetchImpl: async () => ({ ok: false, status: 403, text: async () => "Forbidden" }),
  });
  await assert.rejects(() => translateToJapanese("apple"), /DeepL 403/);
}

// --- deprecated な google 側にも切り替えられる ---
{
  let seen;
  const translateToJapanese = load({
    provider: "google",
    key: "dummy-key:fx",
    fetchImpl: async () => {
      throw new Error("google 指定なのに DeepL を呼んでいる");
    },
    googleImpl: async (text, opts) => ((seen = { text, opts }), { text: "リンゴ(google)" }),
  });
  assert.strictEqual(await translateToJapanese("apple"), "リンゴ(google)");
  assert.deepStrictEqual(seen, { text: "apple", opts: { to: "ja" } });
}

console.log("OK");
