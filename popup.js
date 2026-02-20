document.addEventListener("DOMContentLoaded", async () => {
  const data = await chrome.storage.sync.get({ suspendCount: 0 });
  document.getElementById("count").innerText = data.suspendCount;
});

document.getElementById("settings").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});
