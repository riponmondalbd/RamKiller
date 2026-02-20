const DEFAULT_SETTINGS = {
  idleTime: 5, // in minutes
  whitelist: [],
  skipPinned: true,
  skipAudio: true,
  mode: "discard", // discard | autoReload | manualReload
  suspendCount: 0,
  clearAfter: 20,
};

let tabActivity = {};

// ===== Storage Helpers =====
function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, resolve);
  });
}

async function incrementSuspendCount() {
  const settings = await getSettings();
  const newCount = (settings.suspendCount || 0) + 1;

  await chrome.storage.sync.set({ suspendCount: newCount });
  chrome.action.setBadgeText({ text: newCount.toString() });
  chrome.action.setBadgeBackgroundColor({ color: "#ff6b00" });

  console.log("Suspended tabs count:", newCount);
  return newCount;
}

// ===== Whitelist check =====
function matchWhitelist(url, whitelist) {
  if (!url) return false;

  try {
    const hostname = new URL(url).hostname;
    return whitelist.some((rule) => {
      rule = rule.trim();
      if (rule.startsWith("*.")) {
        const domain = rule.replace("*.", "");
        return hostname.endsWith(domain);
      }
      return hostname === rule;
    });
  } catch {
    return false;
  }
}

// ===== Clear cache =====
async function clearCache() {
  await chrome.browsingData.remove({ since: 0 }, { cache: true });
  await chrome.storage.sync.set({ suspendCount: 0 });
  chrome.action.setBadgeText({ text: "" });
  console.log("Cache cleared & suspend count reset");
}

// ===== Track tab activity =====
function trackActivity(tabId) {
  tabActivity[tabId] = Date.now();
  chrome.storage.local.set({ tabActivity });
  console.log("Activity tracked for tab:", tabId);
}

async function loadActivity() {
  const data = await chrome.storage.local.get("tabActivity");
  tabActivity = data.tabActivity || {};
  console.log("Loaded tab activity:", tabActivity);
}

// ===== Core Logic: suspend idle tabs =====
async function checkTabs() {
  const settings = await getSettings();
  const now = Date.now();

  console.log("Checking tabs...");

  chrome.tabs.query({}, async (tabs) => {
    for (const tab of tabs) {
      if (!tab.id || tab.active) continue;
      if (settings.skipPinned && tab.pinned) continue;
      if (settings.skipAudio && tab.audible) continue;
      if (!tab.url || tab.url.startsWith("chrome://")) continue;
      if (matchWhitelist(tab.url, settings.whitelist)) continue;

      const lastActive = tabActivity[tab.id] || now;
      const idleMinutes = (now - lastActive) / 60000;

      if (idleMinutes >= settings.idleTime) {
        console.log(
          `Tab ${tab.id} idle for ${idleMinutes.toFixed(2)} mins → suspending`,
        );

        try {
          if (settings.mode === "discard") {
            await chrome.tabs.discard(tab.id);
          } else if (settings.mode === "autoReload") {
            await chrome.tabs.reload(tab.id);
          } else if (settings.mode === "manualReload") {
            const stored =
              (await chrome.storage.local.get("manualTabs")).manualTabs || [];
            if (!stored.includes(tab.id)) {
              stored.push(tab.id);
              await chrome.storage.local.set({ manualTabs: stored });
            }
            await chrome.tabs.discard(tab.id);
          }
        } catch (e) {
          console.warn("Failed tab operation:", e);
        }

        const count = await incrementSuspendCount();
        if (count >= settings.clearAfter) {
          await clearCache();
        }
      }
    }
  });
}

// ===== Manual reload on tab click =====
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  console.log("Tab activated:", tabId);
  const settings = await getSettings();

  if (settings.mode === "manualReload") {
    const stored =
      (await chrome.storage.local.get("manualTabs")).manualTabs || [];
    if (stored.includes(tabId)) {
      await chrome.tabs.reload(tabId);
      const updated = stored.filter((id) => id !== tabId);
      await chrome.storage.local.set({ manualTabs: updated });
      console.log("Manually reloaded tab:", tabId);
    }
  }

  trackActivity(tabId);
});

chrome.tabs.onUpdated.addListener((tabId) => {
  trackActivity(tabId);
});

// ===== Initialize tab activity on startup =====
async function initializeTabActivity() {
  const tabs = await chrome.tabs.query({});
  const now = Date.now();
  for (const tab of tabs) {
    if (tab.id) tabActivity[tab.id] = now;
  }
  console.log("Initialized tabActivity for all tabs");
}

// ===== Startup =====
chrome.runtime.onInstalled.addListener(async () => {
  console.log("Extension installed");
  await loadActivity();
  await initializeTabActivity();
});

chrome.runtime.onStartup.addListener(async () => {
  console.log("Extension started");
  await loadActivity();
  await initializeTabActivity();
});

// ===== Alarm for periodic tab checking (every 10s for testing) =====
chrome.alarms.create("tabCheck", { periodInMinutes: 0.1667 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "tabCheck") {
    console.log("Alarm fired → checking tabs");
    checkTabs();
  }
});

console.log("Service worker loaded ✅");
