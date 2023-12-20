# Weblio-Anki-Interceptor
Weblioのポップアップ辞書chrome拡張機能をインストールしてください
https://chrome.google.com/webstore/detail/weblio%E3%83%9D%E3%83%83%E3%83%97%E3%82%A2%E3%83%83%E3%83%97%E8%8B%B1%E5%92%8C%E8%BE%9E%E5%85%B8/oingodpdjohhkelnginmkagmkbplgema?hl=ja

## 概要
このChrome拡張機能をWeblioポップアップ辞書と同時に使用することで、Weblio 辞書とAnki フラッシュカードソフトウェアを使用して、無制限の英単語と定義を保存して学習することができます。通常、Weblioは個人の単語帳に保存できる単語数に上限があり、月額プランに加入しない限り200単語しか保存できません。しかし、この拡張機能では、Weblioから単語の定義や音声を直接ダウンロードして、Ankiにインポートすることで、単語数の制限を回避できます。

## 使用法,仕組み
### Weblio拡張機能側の機能
保存したい単語にマウスオーバーして現れたポップアップの＋を押すと、Weblioで単語を検索するネットワーク通信が行われます。
### Weblio-Anki-Interceptor側の機能
ネットワーク通信のheaderから単語を特定し、Weblioで検索。
取得したhtmlドキュメントを解析してAnkiに情報を追加

## 注意事項
この拡張機能を使用する前に、Weblioの利用規約を必ず確認し、遵守してください。また、この拡張機能を使用することで生じるいかなる損害についても、開発者は一切責任を負いません。

## 開発
add-translate.jsを変更した場合は`npx webpack`を実行


