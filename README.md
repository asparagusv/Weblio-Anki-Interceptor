# Weblio-Anki-Interceptor

Weblio ポップアップ辞書と組み合わせて、調べた英単語・例文を Anki へ無制限に保存できる Chrome 拡張機能です。

## 概要

[Weblioポップアップ英和辞書](https://chrome.google.com/webstore/detail/weblio%E3%83%9D%E3%83%83%E3%83%97%E3%82%A2%E3%83%83%E3%83%97%E8%8B%B1%E5%92%8C%E8%BE%9E%E5%85%B8/oingodpdjohhkelnginmkagmkbplgema?hl=ja)のポップアップ辞書と同時に使用することで、Weblio 辞書と Anki フラッシュカードソフトウェアを使用して、無制限の英単語と定義を保存して学習することができます。通常、Weblio は個人の単語帳に保存できる単語数に上限があり、月額プランに加入しない限り 200 単語しか保存できません。しかし、この拡張機能では、Weblio から単語の定義や音声を直接ダウンロードして、Anki にインポートすることで、単語数の制限を回避できます。

## 仕組み

### Weblio 拡張機能側の機能

保存したい単語にマウスオーバーして現れたポップアップの＋を押すと、Weblio で単語を検索するネットワーク通信が行われます。

### Weblio-Anki-Interceptor 側の機能

ネットワーク通信の header から単語を特定し、Weblio で検索。
取得した html ドキュメントを解析して Anki に情報を追加（AnkiConnect 経由。単語の音声もカードに添付します）。

また、ページ内でテキスト選択して「原文 + DeepL 翻訳」のカードを作ることもできます。

## セットアップ

### 前提

- [Anki](https://apps.ankiweb.net/) と [AnkiConnect](https://foosoft.net/projects/anki-connect/)（拡張機能コード `2055492159`）
  - AnkiConnect の WebCorsOriginList 制限に `http://localhost` が許可されていることを確認してください（デフォルト設定のままで動きます）
- Anki のノートタイプ「基本」（表面 / 裏面 のフィールドを持つもの）。日本語ロケールの Anki であればデフォルトのまま使えます
- [Weblioポップアップ英和辞書](https://chrome.google.com/webstore/detail/weblio%E3%83%9D%E3%83%83%E3%83%97%E3%82%A2%E3%83%83%E3%83%97%E8%8B%B1%E5%92%8C%E8%BE%9E%E5%85%B8/oingodpdjohhkelnginmkagmkbplgema?hl=ja)（本拡張機能と同時に有効化します）

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
2. 任意のページで単語にマウスオーバーし、Weblio ポップアップの＋を押す
   - Weblio への通信を本拡張機能が傍受し、定義と音声を取得して Anki にカードを追加します
   - テキストを選択して翻訳ボタンを押すと、「原文（表面）+ DeepL 翻訳（裏面）」のカードも作れます
3. 追加先のデッキ名はツールバーの拡張機能ポップアップから変更できます（未設定時は「デフォルト」）

## ファイル構成

| ファイル | 役割 |
| --- | --- |
| `sw.js` | MV3 service worker。各スクリプトを読み込む入口 |
| `background.js` | Weblio への通信を傍受してカード追加を起動 |
| `ankiconnect.js` | AnkiConnect への fetch ラッパーとノート追加 |
| `deck-name.js` | デッキ名の保存・取得 |
| `add-example.js` | 例文カードの追加 |
| `add-translate.js` | DeepL / Google 翻訳の実装（webpack で `dist/addTranslate.js` にバンドル） |
| `translate-config.js` | 翻訳プロバイダの切り替え（`"deepl"` / `"google"`） |
| `content.js` / `mark.js` / `idiom-candidates.js` / `dictionary-popup.js` | コンテンツスクリプト側。ホバー単語の判定・選択範囲の処理・辞書ポップアップ |
| `popup.html` / `popup.js` | ツールバーポップアップ（デッキ名設定・診断表示） |
| `offscreen.js` / `offscreen.html` | 音声ダウンロードなどのオフスクリーン処理 |

## 開発

- `add-translate.js` を変更した場合は `npx webpack` を実行してバンドルを更新
- `npm test` … 実 Chrome（headless）で `test/*.test.html` の単体テストを実行。macOS 以外や Chrome の場所が違う場合は `CHROME=/path/to/chrome npm test` で指定
- `npm run test:e2e` … puppeteer-core による E2E テスト
- `npm run test:e2e:live` … 実環境向け E2E

## 注意事項

この拡張機能を使用する前に、Weblio の利用規約を必ず確認し、遵守してください。また、この拡張機能を使用することで生じるいかなる損害についても、開発者は一切責任を負いません。

## ライセンス

ISC
