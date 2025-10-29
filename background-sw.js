const CONTEXT_MENU_IDS = {
  example: "example",
  googleTranslate: "google-translate",
};

let deckName = "デフォルト";

function storageGet(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(result);
      }
    });
  });
}

function storageSet(items) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(items, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
}

async function initializeDeckName() {
  try {
    const result = await storageGet(["deckName"]);
    deckName = result.deckName || "デフォルト";
  } catch (error) {
    console.error(error);
  }
}

function rebuildContextMenus() {
  chrome.contextMenus.removeAll(() => {
    if (chrome.runtime.lastError) {
      console.warn(chrome.runtime.lastError);
    }

    chrome.contextMenus.create(
      {
        id: CONTEXT_MENU_IDS.example,
        title: "Add selected text as an example for the last added note",
        contexts: ["selection"],
      },
      () => {
        if (chrome.runtime.lastError) {
          console.error(chrome.runtime.lastError);
        }
      }
    );

    chrome.contextMenus.create(
      {
        id: CONTEXT_MENU_IDS.googleTranslate,
        title: "Add selected text with Google Translation",
        contexts: ["selection"],
      },
      () => {
        if (chrome.runtime.lastError) {
          console.error(chrome.runtime.lastError);
        }
      }
    );
  });
}

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === CONTEXT_MENU_IDS.example && info.selectionText) {
    addExampleSentenceToLatestNote(info.selectionText).catch((error) =>
      console.error(error)
    );
  }

  if (
    info.menuItemId === CONTEXT_MENU_IDS.googleTranslate &&
    info.selectionText
  ) {
    addNoteWithTranslatedText(info.selectionText).catch((error) =>
      console.error(error)
    );
  }
});

chrome.runtime.onInstalled.addListener(() => {
  initializeDeckName();
  rebuildContextMenus();
});

chrome.runtime.onStartup?.addListener(() => {
  initializeDeckName();
  rebuildContextMenus();
});

initializeDeckName();
rebuildContextMenus();

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes.deckName) {
    deckName = changes.deckName.newValue || "デフォルト";
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request && request.type === "updateDeckName") {
    deckName = request.deckName || "デフォルト";
    storageSet({ deckName })
      .then(() => sendResponse(true))
      .catch((error) => {
        console.error(error);
        sendResponse(false);
      });
    return true;
  }

  if (request && typeof request.marked === "string") {
    addExampleSentenceToLatestNote(request.marked).catch((error) =>
      console.error(error)
    );
  }

  if (request && request.type === "weblioApiRequest") {
    console.log("🎯 メッセージ受信:", request);
    handleDictionaryRequest(request.details).catch((error) => 
      console.error(error)
    );
  }

  if (request && request.type === "addWordToAnki" && request.word) {
    handleWordAddition(request.word)
      .then((result) => {
        if (result === "cannot create note because it is a duplicate") {
          sendResponse({ success: false, duplicate: true });
        } else {
          sendResponse({ success: true, noteId: result });
        }
      })
      .catch((error) => {
        console.error(error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (request && request.type === 'fetchWeblio') {
    fetch(request.url, { method: 'GET', credentials: 'omit' })
      .then(async (res) => {
        if (!res.ok) {
          sendResponse({ ok: false, status: res.status, error: 'Bad status' });
          return;
        }
        const text = await res.text();
        sendResponse({ ok: true, text });
      })
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }

  return false;
});


// Handle word addition from popup dictionary
async function handleWordAddition(word) {
  console.log('Adding word to Anki:', word);
  
  const response = await fetch("https://ejje.weblio.jp/content/" + word);
  if (!response.ok) {
    throw new Error(`Failed to fetch dictionary page: ${response.status}`);
  }
  
  const html = await response.text();
  const parser = new DOMParser();
  const htmlDoc = parser.parseFromString(html, "text/html");

  const wordInput = htmlDoc.querySelector(".formBoxInputTd > input");
  let wordToUse = wordInput ? wordInput.value.toLowerCase() : word.toLowerCase();

  let meaning = "";
  const explanation = htmlDoc.querySelector(".content-explanation");
  if (explanation) {
    meaning = explanation.textContent;
  } else {
    const fallback = htmlDoc.querySelector(".werbjJ > p");
    if (fallback) {
      meaning = fallback.textContent;
    }
  }

  let audio = "";
  const audioSource = htmlDoc.querySelector(".contentAudio > source");
  if (audioSource) {
    audio = audioSource.src;
  } else {
    audio = "there was no audio source";
  }

  const imageSearchUrl =
    "https://www.google.com/search?q=" +
    encodeURIComponent(wordToUse) +
    "+definition+images&tbm=isch&ved=2ahUKEwiymp6x6sz_AhUfTPUHHQcRACUQ2-cCegQIABAA&oq=glorious+definition+images&gs_lcp=" +
    "CgNpbWcQAzIECCMQJ1CxB1ixB2CeCmgAcAB4AIABSYgBjQGSAQEymAEAoAEBqgELZ3dzLXdpei1pbWfAAQE&sclient=img&ei=__mOZPKeEZ-Y1e8Ph6KAqAI&bih=1041&biw=2133&hl=en";

  const imageSearchButton =
    '<a href="' +
    imageSearchUrl +
    '" style="margin-left:15px"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a9c7e3" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M20.4 14.5L16 10 4 20"/></svg></a>';

  const answer = meaning + imageSearchButton;

  try {
    const result = await addNote(deckName, wordToUse, answer, audio);
    return result;
  } catch (error) {
    console.error(error);
    throw error;
  }
}

async function handleDictionaryRequest(details) {
  if (details.method !== "GET") {
    return;
  }

  const url = new URL(details.url);
  const lemma = url.searchParams.get("lemma");
  if (!lemma) {
    return;
  }
  let word = lemma;
  const response = await fetch("https://ejje.weblio.jp/content/" + lemma);
  if (!response.ok) {
    throw new Error(`Failed to fetch dictionary page: ${response.status}`);
  }
  const html = await response.text();
  const parser = new DOMParser();
  const htmlDoc = parser.parseFromString(html, "text/html");

  const wordInput = htmlDoc.querySelector(".formBoxInputTd > input");
  if (wordInput) {
    word = wordInput.value.toLowerCase();
  } else {
    word = word.toLowerCase();
  }

  let meaning = "";
  const explanation = htmlDoc.querySelector(".content-explanation");
  if (explanation) {
    meaning = explanation.textContent;
  } else {
    const fallback = htmlDoc.querySelector(".werbjJ > p");
    if (fallback) {
      meaning = fallback.textContent;
    }
  }

  let audio = "";
  const audioSource = htmlDoc.querySelector(".contentAudio > source");
  if (audioSource) {
    audio = audioSource.src;
  } else {
    audio = "there was no audio source";
  }

  const imageSearchUrl =
    "https://www.google.com/search?q=" +
    encodeURIComponent(word) +
    "+definition+images&tbm=isch&ved=2ahUKEwiymp6x6sz_AhUfTPUHHQcRACUQ2-cCegQIABAA&oq=glorious+definition+images&gs_lcp=" +
    "CgNpbWcQAzIECCMQJ1CxB1ixB2CeCmgAcAB4AIABSYgBjQGSAQEymAEAoAEBqgELZ3dzLXdpei1pbWfAAQE&sclient=img&ei=__mOZPKeEZ-Y1e8Ph6KAqAI&bih=1041&biw=2133&hl=en";

  const imageSearchButton =
    '<a href="' +
    imageSearchUrl +
    '" style="margin-left:15px"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a9c7e3" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M20.4 14.5L16 10 4 20"/></svg></a>';

  const answer = meaning + imageSearchButton;

  try {
    const result = await addNote(deckName, word, answer, audio);
    addNoteErrorHandler(result, word, answer);
    getMarkedParentElement();
  } catch (error) {
    console.error(error);
  }
}

async function invoke(action, version, params = {}) {
  let response;
  try {
    response = await fetch("http://127.0.0.1:8765", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, version, params }),
    });
  } catch (error) {
    throw new Error("failed to issue request");
  }

  if (!response.ok) {
    throw new Error(`request failed with status ${response.status}`);
  }

  let data;
  try {
    data = await response.json();
  } catch (error) {
    throw new Error("failed to parse response");
  }

  if (Object.getOwnPropertyNames(data).length !== 2) {
    throw new Error("response has an unexpected number of fields");
  }
  if (!Object.prototype.hasOwnProperty.call(data, "error")) {
    throw new Error("response is missing required error field");
  }
  if (!Object.prototype.hasOwnProperty.call(data, "result")) {
    throw new Error("response is missing required result field");
  }
  if (data.error) {
    throw data.error;
  }
  return data.result;
}

async function addNote(deckNameValue, word, meaning, audio) {
  const note = {
    deckName: deckNameValue,
    modelName: "基本",
    fields: {
      表面: `${word} [sound:${word}]`,
      裏面: meaning,
    },
    audio: [
      {
        url: audio,
        filename: word,
        fields: ["Front"],
      },
    ],
  };

  let urlValid = true;
  try {
    new URL(audio);
  } catch (error) {
    urlValid = false;
  }

  if (!urlValid) {
    delete note.audio;
    note.fields.表面 = word;
  }

  try {
    return await invoke("addNote", 6, { note });
  } catch (error) {
    return error;
  }
}

function addNoteErrorHandler(result, word, meaning) {
  if (result === "cannot create note because it is a duplicate") {
    const messages = [
      "weblioAnkiInterceptor-duplicate",
      { word, meaning },
    ];

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError);
        return;
      }
      const activeTab = tabs[0];
      if (activeTab?.id !== undefined) {
        chrome.tabs.sendMessage(activeTab.id, messages);
      }
    });
  } else {
    chrome.storage.local.set({ noteId: result }, () => {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError);
      }
    });

    updateContextMenuTitle(result).catch((error) => console.error(error));

    const messages = [
      "weblioAnkiInterceptor-succeed",
      { word, meaning },
    ];

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError);
        return;
      }
      const activeTab = tabs[0];
      if (activeTab?.id !== undefined) {
        chrome.tabs.sendMessage(activeTab.id, messages);
      }
    });
  }
}

async function getNoteId() {
  const result = await storageGet(["noteId"]);
  return result.noteId;
}

async function addExampleSentenceToLatestNote(text) {
  if (!text) {
    return;
  }

  const noteId = await getNoteId();
  if (!noteId) {
    console.warn("noteId is not available");
    return;
  }

  const notesInfo = await invoke("notesInfo", 6, { notes: [noteId] });
  if (!notesInfo || !notesInfo[0]) {
    console.warn("notesInfo result is empty");
    return;
  }

  const back = notesInfo[0].fields?.["裏面"]?.value || "";
  const note = {
    id: noteId,
    fields: {
      裏面: back + "<ul><li>" + text + "</li></ul>",
    },
  };

  await invoke("updateNoteFields", 6, { note });
}

async function updateContextMenuTitle(noteId) {
  const notesInfo = await invoke("notesInfo", 6, { notes: [noteId] });
  if (!notesInfo || !notesInfo[0]) {
    return;
  }

  const frontField = notesInfo[0].fields?.["表面"]?.value || "";
  const front = frontField.replace(/\s\[[^\]]*\]/g, "");

  const title = front
    ? `Add selected text as an example for the note "${front}"`
    : "Add selected text as an example for the last added note";

  chrome.contextMenus.update(CONTEXT_MENU_IDS.example, { title }, () => {
    if (chrome.runtime.lastError) {
      console.error(chrome.runtime.lastError);
    }
  });
}

function getMarkedParentElement() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (chrome.runtime.lastError) {
      console.error(chrome.runtime.lastError);
      return;
    }
    const activeTab = tabs[0];
    if (activeTab?.id !== undefined) {
      chrome.tabs.sendMessage(activeTab.id, { action: "getMarked" });
    }
  });
}

async function translateText(text) {
  const url =
    "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=ja&dt=t&q=" +
    encodeURIComponent(text);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Translation request failed with status ${response.status}`);
  }
  const data = await response.json();
  if (!Array.isArray(data) || !Array.isArray(data[0])) {
    throw new Error("Unexpected translation response format");
  }
  return data[0]
    .map((segment) => (Array.isArray(segment) ? segment[0] : ""))
    .join("");
}

async function addNoteWithTranslatedText(selectionText) {
  const translation = await translateText(selectionText);
  const result = await addNote(deckName, selectionText, translation, "");
  addNoteErrorHandler(result, selectionText, translation);
  getMarkedParentElement();
}
