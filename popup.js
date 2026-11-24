const KILL_BTN_DEFAULT_HTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6"/><path d="m12 12 4 10 1.7-4.3L22 16Z"/></svg> Kill Idle Tabs Now`;

document.addEventListener("DOMContentLoaded", () => {
  updateStats();

  document.getElementById("settings").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  document.getElementById("killNow").addEventListener("click", () => {
    const btn = document.getElementById("killNow");
    if (btn.disabled) return;

    btn.disabled = true;
    btn.classList.add("scanning");
    btn.innerText = "Killing...";

    chrome.runtime.sendMessage({ action: "killIdleNow" }, () => {
      if (chrome.runtime.lastError) {
        console.warn("killIdleNow error:", chrome.runtime.lastError.message);
      }
      setTimeout(() => {
        btn.disabled = false;
        btn.classList.remove("scanning");
        btn.innerHTML = KILL_BTN_DEFAULT_HTML;
        updateStats();
      }, 600);
    });
  });

  document.getElementById("resetStats").addEventListener("click", () => {
    if (confirm("Are you sure you want to reset the suspension counter?")) {
      chrome.runtime.sendMessage({ action: "resetCount" }, () => {
        if (chrome.runtime.lastError) {
          console.warn("resetCount error:", chrome.runtime.lastError.message);
        }
        updateStats();
      });
    }
  });
});

function updateStats() {
  chrome.runtime.sendMessage({ action: "getStats" }, (stats) => {
    if (chrome.runtime.lastError) {
      console.warn("getStats error:", chrome.runtime.lastError.message);
      return;
    }
    if (!stats) return;

    document.getElementById("count").innerText = stats.suspendedTabs;
    document.getElementById("totalTabs").innerText = stats.totalTabs;

    // Estimate RAM saved: 50MB per suspended tab (safe conservative estimate)
    const ramSaved = stats.suspendedTabs * 50;
    document.getElementById("ramValue").innerText =
      ramSaved >= 1024
        ? (ramSaved / 1024).toFixed(1) + " GB"
        : ramSaved + " MB";
  });
}
