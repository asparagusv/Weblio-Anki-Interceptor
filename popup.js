chrome.storage.local.get("deckName", function (result) {
  if (chrome.runtime.lastError) {
    console.error(chrome.runtime.lastError);
  } else {
    // result.deckNameがundefinedの場合、デフォルトが設定される
    const deckName = result.deckName || "デフォルト";
    console.log(deckName);
    document.getElementById("deck-name-input").value = deckName;
  }
});

const deckNameInput = document.querySelector("#deck-name-input");
const submitButton = document.querySelector("#submit-button");
const messageBox = document.querySelector("#message-box");

// submitのクリックでトリガー
// deckNameの定義等を行う
submitButton.addEventListener("click", async (event) => {
  event.preventDefault();
  const deckName = deckNameInput.value;
  const result = await chrome.runtime.sendMessage({
    type: "updateDeckName",
    deckName,
  });
  messageBox.innerHTML =
    "The deck name has been changed to " +
    deckName +
    "<br>" +
    "you need to reload the pages to apply the change";

  setTimeout(() => {
    messageBox.textContent = "";
  }, 4000);
});

// ホバーが出ないときの診断。content scriptが保持している直近のトレースを表示する
const traceLoadButton = document.querySelector("#trace-load");
const traceCopyButton = document.querySelector("#trace-copy");
const traceOutput = document.querySelector("#trace-output");

// all_framesでcontent scriptが全フレームに入るため、frameIdを指定せずに
// sendMessageすると隠しiframe(RotateCookiesPage等)の応答が返ることがある。
// 全フレームへ個別に問い合わせ、実際にイベントがあるフレームを先頭に出す
function getFrameTrace(tabId, frameId) {
  return new Promise((resolve) => {
    try {
      chrome.tabs.sendMessage(tabId, { type: "getHoverTrace" }, { frameId }, (response) => {
        if (chrome.runtime.lastError || !response) {
          resolve(null);
          return;
        }
        resolve(response);
      });
    } catch {
      resolve(null);
    }
  });
}

traceLoadButton.addEventListener("click", async () => {
  traceOutput.textContent = "取得中...";
  traceCopyButton.disabled = true;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    traceOutput.textContent = "タブが取得できません";
    return;
  }

  let frames = null;
  try {
    frames = await chrome.webNavigation.getAllFrames({ tabId: tab.id });
  } catch {
    // webNavigationが使えないタブ(chrome://等)はトップフレームだけ試す
  }
  if (!frames?.length) frames = [{ frameId: 0, url: tab.url }];

  const responses = await Promise.all(
    frames.map((frame) =>
      getFrameTrace(tab.id, frame.frameId).then((response) =>
        response ? { ...response, frameId: frame.frameId, url: frame.url } : null
      )
    )
  );

  const rows = responses
    .filter(Boolean)
    .map((r) => {
      const events = (r.trace || []).filter((e) => e.stage !== "env").length;
      return {
        frameId: r.frameId,
        top: r.frameId === 0,
        url: r.url,
        events,
        last: (r.trace || []).at(-1) || null,
        env: r.env,
        trace: r.trace,
      };
    })
    .sort((a, b) => {
      if (a.top !== b.top) return a.top ? -1 : 1;
      return b.events - a.events || a.frameId - b.frameId;
    });

  if (!rows.length) {
    traceOutput.textContent =
      "content scriptから応答がありません。拡張を再読み込みしてページを再読込してください。";
    return;
  }
  // トップフレームが応答していない場合も、その事実が分かるように行を足す
  if (!rows.some((row) => row.top)) {
    rows.unshift({
      frameId: 0,
      top: true,
      url: tab.url,
      events: 0,
      last: null,
      env: null,
      trace: [],
      error: "no content script response (要: 拡張の再読み込み + ページ再読込)",
    });
  }

  const recommended = rows.reduce((best, row) => (row.events > best.events ? row : best), rows[0]);
  traceOutput.textContent = JSON.stringify(
    {
      tab: tab.url,
      frameCount: frames.length,
      respondingFrames: rows.filter((row) => !row.error).length,
      recommendedFrameId: recommended.events ? recommended.frameId : 0,
      frames: rows,
    },
    null,
    2
  );
  traceCopyButton.disabled = false;
});

traceCopyButton.addEventListener("click", () => {
  navigator.clipboard.writeText(traceOutput.textContent).then(() => {
    traceCopyButton.textContent = "コピー済み";
    setTimeout(() => {
      traceCopyButton.textContent = "コピー";
    }, 1500);
  });
});
