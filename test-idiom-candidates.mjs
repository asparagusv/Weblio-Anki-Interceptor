import assert from "node:assert";
import { createRequire } from "node:module";

const { buildIdiomCandidates, buildPhraseVariants } = createRequire(import.meta.url)(
  "./idiom-candidates.js"
);

// 単語の開始位置を単語そのもので探すヘルパ(テストを読みやすくするだけ)
const at = (text, word) => buildIdiomCandidates(text, text.indexOf(word));
const queries = (text, word) => at(text, word).map((c) => c.query);

const SENTENCE = "Regular exercise helps keep stress at bay.";

// 本命: keep / at / bay のどこにホバーしても keep at bay に辿り着く
for (const word of ["keep", "at", "bay"]) {
  assert.ok(
    queries(SENTENCE, word).includes("keep at bay"),
    `"${word}" にホバーして keep at bay が出ない: ${queries(SENTENCE, word)}`
  );
}
// 前置詞そのままの並びも投げる(辞書に目的語込みで載っている場合の保険)
assert.ok(queries(SENTENCE, "bay").includes("keep stress at bay"));
assert.ok(queries(SENTENCE, "bay").includes("at bay"));

// 内容語だけの3語以上は捨てる(リクエスト削減)。2語は残す
const onExercise = queries(SENTENCE, "exercise");
assert.ok(!onExercise.includes("regular exercise helps"), "内容語だけの3語を投げている");
assert.ok(onExercise.includes("regular exercise"));

// 目的語落としは前置詞の後ろに語があるときだけ。keep books at → keep at を作らない
assert.ok(
  !queries("I keep books at home.", "keep").includes("keep at"),
  "句の途中で切れた前置詞から誤った2語を作っている"
);
// 小辞は後ろに目的語が要らないので末尾でも落とす
assert.ok(queries("Please give it up now.", "give").includes("give up"));

// 2語のイディオムはどちらの語にホバーしても出す。
// 活用形(cutting corners)は自動生成の直訳しか無いので、原形(cut corners)も投げる
const CUT = "They are cutting corners to meet the deadline.";
for (const word of ["cutting", "corners"]) {
  const q = queries(CUT, word);
  assert.ok(q.includes("cutting corners"), `活用形が出ない: ${q}`);
  assert.ok(q.includes("cut corners"), `原形が出ない: ${q}`);
}
// 不規則動詞も戻す(目的語落とし → 原形化の順に効く)
assert.ok(
  queries("She kept them at bay all season.", "bay").includes("keep at bay"),
  "kept → keep に戻せていない"
);
// -ing / -ed は綴りが復元しきれないので両方投げる
assert.ok(queries("He is making sense now.", "sense").includes("make sense"));
assert.ok(queries("They looked up the word.", "up").includes("look up"));
// than は前置詞でも小辞でもないが、機能語ゲートに入れないと
// better late than never のような比較のイディオムが3語超で全落ちする
assert.ok(
  queries("Better late than never, he finished the report.", "never").includes(
    "better late than never"
  ),
  "better late than never が出ない"
);
// goes → go。-es規則(s/x/z/ch/sh の後ろ)に当たらず goe になっていた
for (const text of [
  "Go the extra mile for your customers.",
  "She always goes the extra mile for her clients.",
  "He went the extra mile to help us.",
]) {
  assert.ok(
    queries(text, "mile").includes("go the extra mile"),
    `go the extra mile が出ない: ${text}`
  );
}
// 所有格は見出しでは one's / someone's のスロット。
// 落とした形(steal thunder)はMISSするので、置き換えた形を投げる
for (const [text, words, want] of [
  ["She stole his thunder at the meeting.", ["stole", "his", "thunder"], "steal someone's thunder"],
  ["He pulled my leg about it.", ["pulled", "my", "leg"], "pull one's leg"],
  ["She changed her mind again.", ["changed", "mind"], "change one's mind"],
  ["He lost his temper quickly.", ["lost", "temper"], "lose one's temper"],
  // 動詞 + 小辞 + 所有格 + 名詞
  ["She made up her mind to go.", ["made", "up", "mind"], "make up one's mind"],
]) {
  for (const word of words) {
    assert.ok(queries(text, word).includes(want), `"${word}" から ${want} が出ない`);
  }
}
// 見出しにならない並びには作らない(主語の代名詞始まり・前置詞の目的語・2語)
for (const [text, word, junk] of [
  ["She stole his thunder at the meeting.", "stole", "she stole one's thunder"],
  ["She stole his thunder at the meeting.", "stole", "stole one's"],
  ["She always goes the extra mile for her clients.", "mile", "mile for one's clients"],
  ["She always goes the extra mile for her clients.", "mile", "mile for one's"],
]) {
  assert.ok(!queries(text, word).includes(junk), `"${junk}" を投げている`);
}
// 原形かどうかが分かるようにフラグを立てる(自動生成層の活用形の項目より原形を優先するため)
const mindCands = at("She changed her mind again.", "mind");
assert.strictEqual(mindCands.find((c) => c.query === "change one's mind").lemma, true);
assert.strictEqual(mindCands.find((c) => c.query === "changed one's mind").lemma, false);

// 機能語混じりの2語は直訳がヒットするだけなので投げない
for (const [text, word, junk] of [
  ["He opened the door.", "door", "the door"],
  ["I was very happy.", "happy", "very happy"],
  ["Tell me about it.", "it", "about it"],
]) {
  assert.ok(!queries(text, word).includes(junk), `"${junk}" を投げている`);
}
// ただし前置詞は機能語でも2語で残す(at bay / give up / look up)
assert.ok(queries("They kept the wolves at bay.", "bay").includes("at bay"));
assert.ok(queries("He looked up the word.", "up").includes("looked up"));

// 文境界。前の文の語と繋いだ候補を作らない
const TWO = "He lives in the U.S. and works at a bank.";
const onWorks = queries(TWO, "works");
assert.ok(!onWorks.some((q) => q.includes("u.s")), `文をまたいでいる: ${onWorks}`);
assert.ok(onWorks.includes("works at a bank"), `同じ文内が拾えていない: ${onWorks}`);

// 重複なし・語数1は無し・上限内
const all = at(SENTENCE, "keep");
assert.strictEqual(new Set(all.map((c) => c.query)).size, all.length, "候補が重複している");
assert.ok(all.every((c) => c.size >= 2), "1語の候補が混ざっている");
assert.ok(all.length <= 50, "候補が上限を超えている");
assert.ok(at("He always washed my car on Sunday mornings.", "car").length <= 50);

// 6語の見出し。4語だと窓が届かない
for (const [text, words, want] of [
  ["He decided to take the bull by the horns today.", ["bull", "horns"], "take the bull by the horns"],
  ["That would kill two birds with one stone easily.", ["birds", "stone"], "kill two birds with one stone"],
  ["You hit the nail on the head there.", ["nail", "head"], "hit the nail on the head"],
  ["The ball is in your court now.", ["ball", "court"], "the ball is in your court"],
]) {
  for (const word of words) {
    assert.ok(queries(text, word).includes(want), `"${word}" から ${want} が出ない`);
  }
}

// 選択したときも同じ変形をかける。窓は切らず、選んだ並びそのものには変形3種だけ効く
const variants = (phrase) => buildPhraseVariants(phrase).map((v) => v.query);
assert.ok(
  variants("Get his act together").includes("get one's act together"),
  "選択に所有格スロットが効いていない"
);
assert.ok(variants("kept them at bay").includes("keep at bay"), "選択に目的語落とし+原形が効いていない");
assert.ok(variants("goes the extra mile").includes("go the extra mile"), "選択に原形化が効いていない");
// 選んだ並びそのものは呼び出し側が別に引くので返さない
assert.ok(!variants("cutting corners").includes("cutting corners"));
// ホバーの機能語ゲートはかけない(ユーザーが選んだものは全部投げる)
assert.ok(variants("washed my car").includes("wash my car"));
// 変形しようがないものは空。段落まるごとの選択にも作らない
assert.deepStrictEqual(variants("take off"), []);
assert.deepStrictEqual(variants("serendipity"), []);
assert.deepStrictEqual(
  variants("He always washed my car on Sunday mornings and never complained."),
  []
);

console.log("OK");
