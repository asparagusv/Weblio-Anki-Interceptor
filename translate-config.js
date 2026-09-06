// 翻訳プロバイダの切り替え(開発者向け)。ここを書き換えて拡張をリロードするだけで切り替わる。
//   "deepl"  : DeepL API。精度が良いのでこちらが既定
//   "google" : @vitalets/google-translate-api。精度が落ちるので deprecated。
//              DeepL で問題が出なければ google 側の実装ごと削除する
// importScripts はグローバル変数を self に生やさないと webpack バンドル側から見えないので self に付ける
self.TRANSLATE_PROVIDER = "deepl";
