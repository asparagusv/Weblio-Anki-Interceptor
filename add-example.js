// 直近に作成したノートのIDを取得する
async function getNoteId() {
  const result = await chrome.storage.local.get("noteId");
  return result.noteId;
}

async function addExampleSentenceToLatestNote(text) {
  const noteId = await getNoteId();
  console.log(noteId);
  // ノートIDから情報取得後、裏面を変数にする
  const notesInfo = await invoke("notesInfo", 6, { notes: [noteId] });
  console.log(JSON.stringify(notesInfo, null, 2));
  const back = notesInfo[0].fields["裏面"].value;

  // 選択範囲を例文として追加
  const note = {
    id: noteId,
    fields: {
      裏面: back + "<ul><li>" + text + "</li></ul>",
    },
  };
  console.log(JSON.stringify(note, null, 2));
  const result = await invoke("updateNoteFields", 6, { note });
}

// 画像をnoteIdで指定したノートの裏面に追加する。追加先の単語を返す
// storeMediaFileはurlを渡すとAnki側がダウンロードするのでCORSにかからない。
// ただしAnki側はrequestsで取得するのでdata:URIは扱えず
// "No connection adapters were found" で失敗する。
// Google画像検索のサムネイルはdata:URIなので、その場合はbase64を取り出してdataで渡す
async function addImageToNote(noteId, imageUrl) {
  const notesInfo = await invoke("notesInfo", 6, { notes: [noteId] });
  const back = notesInfo[0].fields["裏面"].value;
  const front = notesInfo[0].fields["表面"].value.replace(/\s\[[^\]]*\]/g, "");

  const dataUri = imageUrl.match(/^data:image\/([a-z0-9.+-]+);base64,(.+)$/i);
  const ext = dataUri ? dataUri[1].replace(/[^a-z0-9]/gi, "") : "jpg";
  const filename = `weblio-anki-${noteId}-${Date.now()}.${ext}`;
  await invoke(
    "storeMediaFile",
    6,
    dataUri ? { filename, data: dataUri[2] } : { filename, url: imageUrl }
  );

  console.log("[wai] stored", filename, dataUri ? "(data)" : "(url)");

  const note = {
    id: noteId,
    fields: {
      // 原寸だとカードが崩れるので幅を抑える
      裏面: back + `<img src="${filename}" style="max-width:400px">`,
    },
  };
  await invoke("updateNoteFields", 6, { note });
  // 何枚目かを返す。1回目が入っていないように見える問題の切り分け用
  const count = (note.fields["裏面"].match(/<img /g) || []).length;
  console.log("[wai] updated note", noteId, front, "images:", count);
  return { front, count };
}

// content script(dictionary-popup.js)のトーストを借りて結果を出す。
// 拡張をリロードした直後などcontent scriptが居ないタブでは届かないので握り潰す
function notify(tabId, message) {
  chrome.tabs.sendMessage(tabId, { type: "notify", message }).catch(() => {});
}

const tabKey = (tabId) => `noteIdForTab-${tabId}`;

async function getTabNote(tabId) {
  const key = tabKey(tabId);
  return (await chrome.storage.session.get(key))[key];
}

// 画像検索ボタンで開いたタブがどのnoteIdに紐づくか記録する
// Googleの検索結果ページは読み込み後にJSでURLのクエリを書き換える(noteIdが消える)ことがあるため、
// 書き換わる前のnoteIdをonBeforeNavigateで拾ってtabIdに紐付けて保存しておく
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId !== 0) return;
  const params = new URL(details.url).searchParams;
  const noteId = params.get("noteId");
  if (!noteId) return;
  // wordは右クリックメニューの表示専用。ノートの特定は常にnoteIdで行う
  const word = (params.get("q") || "").replace(/\s*definition images$/, "");
  console.log("[wai] bind tab", details.tabId, "->", noteId, word);
  chrome.storage.session.set({
    [tabKey(details.tabId)]: { noteId: Number(noteId), word },
  });
});

// 画像を「新しいタブで開く」と別タブになり紐付けが無いので、開き元のタブから引き継ぐ
// (グリッドのサムネイルより拡大した画像の方が高解像度なのでこの導線はよく使う)
chrome.tabs.onCreated.addListener(async (tab) => {
  if (tab.id == null || tab.openerTabId == null) return;
  const note = await getTabNote(tab.openerTabId);
  if (note) await chrome.storage.session.set({ [tabKey(tab.id)]: note });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(tabKey(tabId));
});

// ChromeにはcontextMenus.onShownが無い(Firefox専用)ので、右クリックされる前に先回りで更新する
async function refreshImageMenuTitle(tabId) {
  const note = await getTabNote(tabId);
  // メニューがまだ作られていない(onInstalled前)とupdateはrejectするので握り潰す
  await chrome.contextMenus
    .update("image", {
      title:
        note && note.word
          ? `Add image to "${note.word}"`
          : "Add image to this word's Anki card",
    })
    .catch(() => {});
}

chrome.tabs.onActivated.addListener(({ tabId }) => refreshImageMenuTitle(tabId));
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.active) refreshImageMenuTitle(tabId);
});

// 右クリックメニュー作成
// MV3ではservice worker起動のたびにトップレベルが再実行されid重複するのでonInstalledで作る
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "example",
    title: "Add selected text as an example for the last added note",
    contexts: ["selection"],
  });
  chrome.contextMenus.create({
    id: "image",
    // 対象単語が分かればrefreshImageMenuTitleが差し替える。これは分からない場合の文言
    title: "Add image to this word's Anki card",
    contexts: ["image"],
  });
});

// MV3ではcontextMenus.createのonclickが使えないのでonClickedで受ける
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "example") {
    addExampleSentenceToLatestNote(info.selectionText);
  } else if (info.menuItemId === "image") {
    if (!tab || tab.id == null) {
      console.warn("[wai] click without tab", info);
      return;
    }
    const note = await getTabNote(tab.id);
    console.log(
      "[wai] click tab",
      tab.id,
      "note",
      note,
      "src",
      String(info.srcUrl).slice(0, 100),
      "len",
      String(info.srcUrl).length
    );
    if (!note) {
      notify(tab.id, "No Anki card linked to this tab");
      return;
    }
    try {
      const { front, count } = await addImageToNote(note.noteId, info.srcUrl);
      notify(tab.id, `Added image to "${front}" (${count} total)`);
    } catch (e) {
      // invokeはErrorではなく文字列をthrowすることがあるのでStringで包む
      console.error("[wai] addImageToNote failed:", e);
      notify(tab.id, `Anki error: ${String(e)}`);
    }
  }
});

// 右クリックメニューの名前更新
// background.jsで単語が登録されるとトリガーされる
async function updateContextMenuTitle(noteId) {
  const notesInfo = await invoke("notesInfo", 6, { notes: [noteId] });
  const front = notesInfo[0].fields["表面"].value.replace(/\s\[[^\]]*\]/g, "");

  chrome.contextMenus.update("example", {
    title: front
      ? `Add selected text as an example for the note "${front}"`
      : "Add selected text as an example for the last added note",
  });
}

