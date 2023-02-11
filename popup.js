const deckNameInput = document.querySelector("#deck-name-input");
const submitButton = document.querySelector("#submit-button");
const messageBox = document.querySelector("#message-box");

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

chrome.runtime.sendMessage({ type: "getDeckName" }).then((response) => {
  document.getElementById("deck-name").value = response;
});
