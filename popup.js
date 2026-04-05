document.addEventListener("DOMContentLoaded", async () => {
  updateStats();

  document.getElementById("settings").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  document.getElementById("killNow").addEventListener("click", async () => {
    const btn = document.getElementById("killNow");
    btn.classList.add("scanning");
    btn.innerText = "Killing...";

    chrome.runtime.sendMessage({ action: "killIdleNow" }, (response) => {
      setTimeout(() => {
        btn.classList.remove("scanning");
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6"/><path d="m12 12 4 10 1.7-4.3L22 16Z"/></svg> Kill Idle Tabs Now`;
        updateStats();
      }, 1500);
    });
  });

  document.getElementById("resetStats").addEventListener("click", () => {
    if (confirm("Are you sure you want to reset all suspension stats?")) {
      chrome.runtime.sendMessage({ action: "resetCount" }, () => {
        updateStats();
      });
    }
  });
});

async function updateStats() {
  // Get sync storage count
  const data = await chrome.storage.sync.get({ suspendCount: 0 });
  const count = data.suspendCount;

  // Get live stats from background
  chrome.runtime.sendMessage({ action: "getStats" }, (stats) => {
    if (stats) {
      document.getElementById("count").innerText = stats.suspendedTabs;
      document.getElementById("totalTabs").innerText = stats.totalTabs;

      // Estimate RAM saved: 50MB per suspended tab (safe conservative estimate)
      const ramSaved = stats.suspendedTabs * 50;
      document.getElementById("ramValue").innerText =
        ramSaved >= 1024
          ? (ramSaved / 1024).toFixed(1) + " GB"
          : ramSaved + " MB";
    }
  });
}
