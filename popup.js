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
