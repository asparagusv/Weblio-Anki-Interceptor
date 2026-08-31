#!/bin/sh
# mark.js の extractMarkedText を実ブラウザで検証する。
# innerText はレンダリング結果に依存するため jsdom では再現できない。
set -e
cd "$(dirname "$0")"

CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
if [ ! -x "$CHROME" ]; then
  echo "Chrome が見つからない。CHROME=/path/to/chrome で指定して実行する" >&2
  exit 2
fi

status=0
for f in *.test.html; do
  echo "--- $f"
  "$CHROME" --headless --disable-gpu --no-sandbox --virtual-time-budget=2000 \
    --dump-dom "file://$PWD/$f" 2>/dev/null | python3 -c "
import sys, re, html
d = sys.stdin.read()
m = re.search(r'<pre id=\"out\">(.*?)</pre>', d, re.S)
if not m:
    print('テスト出力が取れなかった'); sys.exit(2)
out = html.unescape(m.group(1))
print(out)
sys.exit(0 if 'ALL PASS' in out else 1)
" || status=1
done
exit $status
