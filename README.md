# Weblio-Anki-Interceptor

Weblio 辞書の内容をその場でポップアップ表示し、調べた英単語・例文を Anki へ無制限に保存できる Chrome 拡張機能です。

> 名前に「Interceptor」とありますが、初期バージョンは Weblio 拡張機能の通信をヘッダから傍受する仕組みでした。現在は通信の傍受を行わず、Weblio のページを直接取得して自前で表示する実装に変わっています（歴史的経緯による名称です）。

## 概要

英単語にマウスオーバー（またはテキスト選択）すると、この拡張機能が Weblio 英和辞書 (ejje.weblio.jp) の内容を取得してページ上に自前の辞書ポップアップを表示します。ポップアップの＋ボタンを押すと、単語の定義と音声を Anki にカードとして追加できます。

通常、Weblio は個人の単語帳に保存できる単語数に上限があり、月額プランに加入しない限り 200 単語しか保存できません。この拡張機能では、Weblio から単語の定義や音声を直接取得して Anki にインポートすることで、単語数の制限を回避できます。

## 仕組み

1. 単語にホバー（またはテキスト選択）すると、content script (`dictionary-popup.js`) が Weblio の辞書ページを background 経由で取得し、自前のポップアップ辞書を表示します（熟語は周辺の n-gram を並列に照会して最長一致で判定します）
2. ポップアップの＋ボタンを押すと、background (`background.js`) が `ejje.weblio.jp/content/<見出し語>` を取得し、offscreen document の DOMParser で HTML を解析して `{word, meaning, audio}` を抽出します
3. AnkiConnect 経由で Anki にノートを追加します（単語の音声もカードに添付します）。重複していた場合は追加をスキップして通知します
4. ポップアップの＋押下時に掴んだ Range から周辺の文章を切り出し、例文として先ほどのノートの裏面に追記します
5. テキストを選択して翻訳ボタンを押すと、「原文（表面）+ DeepL 翻訳（裏面）」のカードも作れます

## セットアップ

### 前提

- [Anki](https://apps.ankiweb.net/) と [AnkiConnect](https://foosoft.net/projects/anki-connect/)（拡張機能コード `2055492159`）
  - AnkiConnect の WebCorsOriginList 制限に `http://localhost` が許可されていることを確認してください（デフォルト設定のままで動きます）
- Anki のノートタイプ「基本」（表面 / 裏面 のフィールドを持つもの）。日本語ロケールの Anki であればデフォルトのまま使えます

### インストール

```sh
git clone https://github.com/asparagusv/Weblio-Anki-Interceptor.git
cd Weblio-Anki-Interceptor
npm install
npx webpack   # dist/addTranslate.js を生成
```

その後、Chrome の `chrome://extensions` で「デベロッパーモード」を有効にし、「パッケージ化されていない拡張機能を読み込む」でこのリポジトリのフォルダを指定してください。

### DeepL 翻訳を使う場合（任意）

テキスト選択からの翻訳カード追加機能には DeepL API キーが必要です（単語ホバーからのカード追加には不要です）。

1. `translate-secrets.example.js` を `translate-secrets.js` にコピーしてキーを入れる
   - キー末尾が `:fx` なら Free プラン、無ければ Pro プランのエンドポイントに自動で切り替わります
2. `chrome://extensions` で本拡張機能をリロードする

`translate-secrets.js` は `.gitignore` 済みなのでコミットされません。キーが無い場合でも拡張機能本体は動きます（DeepL 翻訳だけが使えなくなります）。

## 使い方

1. Anki を起動しておく
2. 任意のページで単語にマウスオーバー（またはテキスト選択）すると、Weblio の辞書ポップアップが表示される
3. ポップアップの＋ボタンを押す
   - 定義と音声を取得して Anki にカードを追加し、周辺の文章を例文として裏面に追記します
   - テキストを選択して翻訳ボタンを押すと、「原文（表面）+ DeepL 翻訳（裏面）」のカードも作れます
4. 追加先のデッキ名はツールバーの拡張機能ポップアップから変更できます（未設定時は「デフォルト」）

## ファイル構成

| ファイル | 役割 |
| --- | --- |
| `sw.js` | MV3 service worker。各スクリプトを読み込む入口 |
| `background.js` | content script からのリクエストで Weblio の辞書ページを取得し、offscreen で解析した結果を Anki に登録 |
| `ankiconnect.js` | AnkiConnect への fetch ラッパーとノート追加 |
| `deck-name.js` | デッキ名の保存・取得 |
| `add-example.js` | 直近のノートの裏面に例文を追記、画像検索ボタンや画像の追加 |
| `add-translate.js` | DeepL / Google 翻訳の実装（webpack で `dist/addTranslate.js` にバンドル） |
| `translate-config.js` | 翻訳プロバイダの切り替え（`"deepl"` / `"google"`） |
| `mark.js` / `idiom-candidates.js` / `dictionary-popup.js` | コンテンツスクリプト側。ホバー単語の判定・選択範囲の処理・自前の辞書ポップアップ |
| `popup.html` / `popup.js` | ツールバーポップアップ（デッキ名設定・診断表示） |
| `offscreen.js` / `offscreen.html` | service worker には DOMParser がないため、Weblio の HTML 解析をオフスクリーンで行う |

## 開発

- `add-translate.js` を変更した場合は `npx webpack` を実行してバンドルを更新
- `npm test` … 実 Chrome（headless）で `test/*.test.html` の単体テストを実行。macOS 以外や Chrome の場所が違う場合は `CHROME=/path/to/chrome npm test` で指定
- `npm run test:e2e` … puppeteer-core による E2E テスト
- `npm run test:e2e:live` … 実環境向け E2E

## 注意事項

この拡張機能を使用する前に、Weblio の利用規約を必ず確認し、遵守してください。また、この拡張機能を使用することで生じるいかなる損害についても、開発者は一切責任を負いません。

## ライセンス

ISC
