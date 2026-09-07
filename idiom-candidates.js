// idiom-candidates.js - ホバーした単語の周りから、Weblioに投げるイディオム候補を組み立てる
// DOMに触らない純粋ロジックなので content script と node のテストの両方から読む
(function (root) {
  // 目的語を挟むイディオム(keep A at bay)を辞書の見出し(keep at bay)に寄せるための前置詞
  const PREPOSITIONS = new Set([
    "at", "in", "on", "to", "from", "with", "by", "for", "of", "into", "off",
  ]);
  // 分離可能な句動詞の副詞小辞(give it up → give up)。
  // 前置詞と違って後ろに目的語が要らないので、句の末尾にあっても切れていないとみなす
  const PARTICLES = new Set(["up", "out", "down", "away", "back"]);
  // 所有格。辞書の見出しではここが one's / someone's のスロットになっている
  // (stole his thunder → steal someone's thunder →（人の）手柄を横取りする)。
  // steal thunder のように落としてしまうとMISSするので、落とさず置き換える
  const POSSESSIVES = new Set(["my", "your", "his", "her", "its", "our", "their"]);
  const POSSESSIVE_SLOTS = ["one's", "someone's"];
  // 3語以上の候補はこれを含むものだけWeblioに投げる。
  // 辞書の見出しは必ず機能語を含む(keep at bay / call it a day / cats and dogs)ので、
  // 内容語だけの並び(regular exercise helps)を捨ててリクエスト数を減らす
  const FUNCTION_WORDS = new Set([
    ...PREPOSITIONS, ...PARTICLES, ...POSSESSIVES, ...POSSESSIVE_SLOTS,
    "a", "an", "the", "and", "or", "it", "no", "not", "than",
  ]);

  // 冠詞・代名詞・程度の副詞。2語の候補に混じると、イディオムではなくただの直訳がヒットする
  // (the door→戸, at the→とも, very happy→とても嬉しい, the room→映画『ザ・ルーム』)。
  // 3語以上は逆に機能語を含むのが普通(call it a day)なので、2語の判定と
  // 目的語落としの検算(下)にだけ使う
  const WEAK_WORDS = new Set([
    "the", "a", "an", "this", "that", "these", "those",
    "i", "you", "he", "she", "it", "we", "they", "me", "him", "us", "them",
    "my", "your", "his", "her", "its", "our", "their",
    "very", "too", "such",
  ]);

  // 見出しの最長。実測で4→6にすると take the bull by the horns /
  // kill two birds with one stone / hit the nail on the head / the ball is in your court
  // が拾えるようになる(長いイディオム9件中4→7)。5は1件も増えないので飛ばす。
  // 7にしても増えるのは let the cat out of the bag の1件だけ
  const MAX_NGRAM = 6;
  // ホバー1回あたりのWeblioへのリクエスト上限。実測の上限なしの最大がちょうど50。
  // 並列に投げるので待ち時間は語数を増やしても伸びない(実測300ms前後)
  const MAX_CANDIDATES = 50;

  // 単語境界。don't / it’s を1語として扱う
  const WORD_RE = /[A-Za-z][A-Za-z'’]*/g;

  // Weblioは2語以上の見出しを活用形では引けない(cutting corners は自動生成の直訳、
  // 原形の cut corners が研究社の見出し。keeps at bay はMISSで keep at bay がHIT)。
  // なので候補の先頭語だけ原形に戻したものも投げる。
  // イディオムの見出しに出てくる不規則動詞ぶんだけの表で足りる
  const IRREGULAR = {
    kept: "keep", held: "hold", took: "take", taken: "take", gave: "give", given: "give",
    made: "make", got: "get", gotten: "get", came: "come", went: "go", gone: "go",
    ran: "run", broke: "break", broken: "break", caught: "catch", brought: "bring",
    blew: "blow", blown: "blow", drew: "draw", drawn: "draw", fell: "fall", fallen: "fall",
    felt: "feel", found: "find", knew: "know", known: "know", laid: "lay", led: "lead",
    left: "leave", lost: "lose", paid: "pay", said: "say", saw: "see", seen: "see",
    sold: "sell", sent: "send", stood: "stand", struck: "strike", thought: "think",
    threw: "throw", thrown: "throw", told: "tell", wore: "wear", worn: "wear", won: "win",
    wrote: "write", written: "write", drove: "drive", driven: "drive", spoke: "speak",
    spoken: "speak", meant: "mean", did: "do", done: "do", had: "have", bore: "bear",
    stole: "steal", stolen: "steal",
  };

  // 語尾を落として原形の候補を返す。-ed/-ing は綴りが復元しきれない
  // (cutting→cut, making→make)ので両方返して、外れた方はWeblio側でMISSさせる
  function lemmaGuesses(word) {
    const w = word.toLowerCase();
    if (IRREGULAR[w]) return [IRREGULAR[w]];
    // 語尾を落とした結果が短すぎるものは動詞の活用ではない
    const ok = (s) => s.length >= 2 && s !== w;
    // 子音の重ね(cutt→cut)を戻したものと、落ちた e(mak→make)を足したもの
    const undouble = (s) =>
      s.length >= 3 && s[s.length - 1] === s[s.length - 2] ? s.slice(0, -1) : `${s}e`;

    let guesses = [];
    if (w.endsWith("ies") && w.length > 4) guesses = [`${w.slice(0, -3)}y`];
    // goes → go。下の -es 規則は s/x/z/ch/sh の後ろしか見ないので先に処理する
    else if (w.endsWith("oes") && w.length > 3) guesses = [w.slice(0, -2)];
    else if (/(?:s|x|z|ch|sh)es$/.test(w)) guesses = [w.slice(0, -2)];
    else if (w.endsWith("ied") && w.length > 4) guesses = [`${w.slice(0, -3)}y`];
    else if (w.endsWith("ing")) guesses = [w.slice(0, -3), undouble(w.slice(0, -3))];
    else if (w.endsWith("ed")) guesses = [w.slice(0, -2), undouble(w.slice(0, -2))];
    else if (w.endsWith("s") && !w.endsWith("ss") && !w.endsWith("us")) guesses = [w.slice(0, -1)];
    return [...new Set(guesses.filter(ok))];
  }

  // ホバー位置を含む一文だけを切り出す。
  // Intl.Segmenter なら "He lives in the U.S. and works at" の U.S. を文末と誤判定しない
  function sentenceAt(text, index) {
    if (typeof Intl === "undefined" || !Intl.Segmenter) return { text, offset: 0 };
    for (const s of new Intl.Segmenter("en", { granularity: "sentence" }).segment(text)) {
      if (index >= s.index && index < s.index + s.segment.length) {
        return { text: s.segment, offset: s.index };
      }
    }
    return { text, offset: 0 };
  }

  function tokenize(text) {
    const tokens = [];
    for (const m of text.matchAll(WORD_RE)) {
      tokens.push({ word: m[0], start: m.index, end: m.index + m[0].length });
    }
    return tokens;
  }

  // keep stress at bay → keep at bay。前置詞/小辞の直前1語(=目的語)を落とす。
  // 前置詞は後ろに目的語が要るので、末尾にある場合は句の途中で切れているだけとみなして捨てる
  // (keep books at → keep at のような別のイディオムへの誤ヒットを防ぐ)
  function dropObject(words) {
    for (let i = 2; i < words.length; i++) {
      const w = words[i].toLowerCase();
      const usable = PARTICLES.has(w) || (PREPOSITIONS.has(w) && i < words.length - 1);
      if (!usable) continue;
      return words.slice(0, i - 1).concat(words.slice(i));
    }
    return null;
  }

  // 1つの語並びに、目的語落とし・先頭語の原形化・所有格スロットの3通りの変形をかけて
  // push(words, derived, lemma) に流す。ホバー(n-gramの各窓)と選択(選択範囲そのもの)で共用する
  function expandShape(words, push) {
    let dropped = dropObject(words);
    // 落とした結果に代名詞・冠詞が残っているなら、落としたのは目的語ではない
    // (he looked up the → he up the で動詞の方を落としている)
    if (dropped && dropped.some((w) => WEAK_WORDS.has(w.toLowerCase()))) dropped = null;
    for (const shape of dropped ? [words, dropped] : [words]) {
      // 見出しは原形なので、先頭語(=動詞のことが多い)を戻したものも投げる。
      // 機能語は活用ではないので触らない(his → hi になる)
      const heads = FUNCTION_WORDS.has(shape[0].toLowerCase())
        ? [shape[0]]
        : [shape[0], ...lemmaGuesses(shape[0])];
      // 所有格は見出しでは one's / someone's のスロット。落とすとMISSする
      // (steal thunder)ので置き換える。見出しの形は「動詞 + 所有格 + 名詞」
      // (pull one's leg)か「動詞 + 小辞 + 所有格 + 名詞」(make up one's mind)だけなので、
      // その並びに合うときだけ作る。先頭が代名詞(she stole his …)や
      // 前置詞の目的語(mile for her clients)は見出しにならない
      const at = shape.findIndex((w) => POSSESSIVES.has(w.toLowerCase()));
      const slot =
        shape.length > 2 &&
        !WEAK_WORDS.has(shape[0].toLowerCase()) &&
        (at === 1 || (at === 2 && PARTICLES.has(shape[1].toLowerCase())))
          ? at
          : -1;
      for (const head of heads) {
        const form = [head, ...shape.slice(1)];
        const lemma = head !== shape[0];
        const derived = shape !== words || lemma;
        push(form, derived, lemma);
        // stole his thunder → steal someone's thunder
        if (slot > 0) {
          for (const filler of POSSESSIVE_SLOTS) {
            push(form.map((w, i) => (i === slot ? filler : w)), true, lemma);
          }
        }
      }
    }
  }

  // text: ホバーした単語を含むテキスト、wordStart: その単語の開始位置
  // 返り値: [{ query, size, derived, lemma }]
  //   derived = 本文にそのまま出ていない並び、lemma = 先頭語を原形に戻したもの
  function buildIdiomCandidates(text, wordStart) {
    const sentence = sentenceAt(text, wordStart);
    const tokens = tokenize(sentence.text);
    const rel = wordStart - sentence.offset;
    const hovered = tokens.findIndex((t) => rel >= t.start && rel < t.end);
    if (hovered < 0) return [];

    const seen = new Set();
    const out = [];
    const push = (words, derived, lemma) => {
      if (words.length < 2 || out.length >= MAX_CANDIDATES) return;
      const lower = words.map((w) => w.toLowerCase());
      if (words.length === 2 && lower.some((w) => WEAK_WORDS.has(w))) return;
      if (words.length > 2 && !lower.some((w) => FUNCTION_WORDS.has(w))) return;
      const query = words.join(" ").toLowerCase();
      if (seen.has(query)) return;
      seen.add(query);
      out.push({ query, size: words.length, derived, lemma });
    };

    // 長い候補ほど具体的なイディオムなので、上限で切られるとき短いものから落ちるよう長い順に積む
    for (let size = MAX_NGRAM; size >= 2; size--) {
      for (let start = hovered - size + 1; start <= hovered; start++) {
        if (start < 0 || start + size > tokens.length) continue;
        expandShape(tokens.slice(start, start + size).map((t) => t.word), push);
      }
    }
    return out;
  }

  // 選択した文字列そのものへの変形。ホバーと違って窓は切らない(選んだ範囲が答えなので)。
  // 選択には機能語ゲートもかけない。ユーザーが明示的に選んだものは全部投げる
  // 返り値: [{ query, size, derived, lemma }] 元の並びそのものは含まない
  function buildPhraseVariants(phrase) {
    const words = tokenize(phrase).map((t) => t.word);
    // 見出しは長くても7語。段落まるごとの選択に変形をかけても意味がない
    if (words.length < 2 || words.length > MAX_NGRAM + 1) return [];
    const original = words.join(" ").toLowerCase();
    const seen = new Set([original]);
    const out = [];
    expandShape(words, (form, derived, lemma) => {
      const query = form.join(" ").toLowerCase();
      if (seen.has(query)) return;
      seen.add(query);
      out.push({ query, size: form.length, derived, lemma });
    });
    return out;
  }

  root.buildIdiomCandidates = buildIdiomCandidates;
  root.buildPhraseVariants = buildPhraseVariants;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      buildIdiomCandidates, buildPhraseVariants, dropObject, sentenceAt, tokenize,
    };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
