const DEFAULT_SETTINGS = {
  idleTime: 5,
  whitelist: [],
  skipPinned: true,
  skipAudio: true,
  mode: "discard",
};

function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, resolve);
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  const settings = await getSettings();

  document.getElementById("idleTime").value = settings.idleTime;
  document.getElementById("whitelist").value = settings.whitelist.join("\n");
  document.getElementById("skipPinned").checked = settings.skipPinned;
  document.getElementById("skipAudio").checked = settings.skipAudio;
  document.getElementById("mode").value = settings.mode;
});

document.getElementById("save").addEventListener("click", async () => {
  const btn = document.getElementById("save");
  const originalText = btn.innerText;

  const settings = {
    idleTime: Number(document.getElementById("idleTime").value),
    whitelist: document
      .getElementById("whitelist")
      .value.split("\n")
      .map((d) => d.trim())
      .filter(Boolean),
    skipPinned: document.getElementById("skipPinned").checked,
    skipAudio: document.getElementById("skipAudio").checked,
    mode: document.getElementById("mode").value,
  };

  btn.disabled = true;
  btn.innerText = "Saving...";

  await chrome.storage.sync.set(settings);

  setTimeout(() => {
    btn.disabled = false;
    btn.innerText = originalText;
    showToast();
  }, 600);
});

function showToast() {
  const toast = document.getElementById("toast");
  toast.classList.add("show");
  setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}
