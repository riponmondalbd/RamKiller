const DEFAULT_SETTINGS = {
  idleTime: 5, // in minutes
  whitelist: [],
  skipPinned: true,
  skipAudio: true,
  mode: "discard", // discard | autoReload | manualReload
  suspendCount: 0,
  clearAfter: 20,
};

const ALARM_NAME = "tabCheck";
const ALARM_PERIOD_MINUTES = 0.5; // Chrome MV3 minimum alarm interval (30s)

let tabActivity = {};
let activityLoaded = false;
let activityLoadPromise = null;
let isCheckingTabs = false;
let badgeUpdateSeq = 0;
let badgeTimer = null;

// ===== Storage Helpers =====
function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, resolve);
  });
}

function updateBadge(count) {
  if (count > 0) {
    chrome.action.setBadgeText({ text: count.toString() });
    chrome.action.setBadgeBackgroundColor({ color: "#ff6b00" });
  } else {
    chrome.action.setBadgeText({ text: "" });
  }
}

async function updateDynamicBadge() {
  const seq = ++badgeUpdateSeq;
  const tabs = await chrome.tabs.query({});
  if (seq !== badgeUpdateSeq) return;
  const suspendedCount = tabs.filter((t) => t.discarded).length;
  updateBadge(suspendedCount);
}

function scheduleBadgeUpdate(delay = 150) {
  if (badgeTimer) clearTimeout(badgeTimer);
  badgeTimer = setTimeout(() => {
    badgeTimer = null;
    updateDynamicBadge();
  }, delay);
}

async function incrementSuspendCount(amount = 1) {
  const settings = await getSettings();
  const newCount = (settings.suspendCount || 0) + amount;

  await chrome.storage.sync.set({ suspendCount: newCount });
  await updateDynamicBadge();

  return newCount;
}

// ===== Whitelist & URL checks =====
function isSuspendableUrl(url) {
  if (!url) return false;
  return url.startsWith("http://") || url.startsWith("https://");
}

function matchWhitelist(url, whitelist) {
  if (!url || !Array.isArray(whitelist) || whitelist.length === 0) return false;

  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return whitelist.some((rawRule) => {
      const rule = rawRule.trim().toLowerCase();
      if (!rule) return false;

      if (rule.startsWith("*.")) {
        const domain = rule.slice(2);
        return (
          domain.length > 0 &&
          (hostname === domain || hostname.endsWith("." + domain))
        );
      }
      return hostname === rule;
    });
  } catch {
    return false;
  }
}

// ===== Reset stats / Clear cache =====
async function resetSuspendCount() {
  await chrome.storage.sync.set({ suspendCount: 0 });
  await updateDynamicBadge();
}

async function clearCache() {
  await chrome.browsingData.remove({ since: 0 }, { cache: true });
  await resetSuspendCount();
  console.log("Cache cleared & suspend count reset");
}

// ===== Track tab activity =====
async function ensureActivityLoaded() {
  if (activityLoaded) return;
  if (!activityLoadPromise) {
    activityLoadPromise = chrome.storage.local
      .get("tabActivity")
      .then((data) => {
        tabActivity = data.tabActivity || {};
        activityLoaded = true;
      })
      .finally(() => {
        activityLoadPromise = null;
      });
  }
  await activityLoadPromise;
}

async function trackActivity(tabId) {
  if (!tabId) return;
  await ensureActivityLoaded();
  tabActivity[tabId] = Date.now();
  await chrome.storage.local.set({ tabActivity });
}

async function removeTabActivity(tabId) {
  if (!tabId) return;
  await ensureActivityLoaded();
  if (tabId in tabActivity) {
    delete tabActivity[tabId];
    await chrome.storage.local.set({ tabActivity });
  }

  const data = await chrome.storage.local.get("autoReloadTabs");
  const autoReloadTabs = data.autoReloadTabs || [];
  if (autoReloadTabs.includes(tabId)) {
    await chrome.storage.local.set({
      autoReloadTabs: autoReloadTabs.filter((id) => id !== tabId),
    });
  }
}

// ===== Core Logic: suspend idle tabs =====
async function checkTabs() {
  if (isCheckingTabs) return;
  isCheckingTabs = true;

  try {
    await ensureActivityLoaded();
    const settings = await getSettings();
    const idleThreshold = Math.max(1, Number(settings.idleTime) || DEFAULT_SETTINGS.idleTime);
    const now = Date.now();

    const tabs = await chrome.tabs.query({});
    let activityChanged = false;
    let newlySuspended = 0;

    for (const tab of tabs) {
      if (!tab.id || tab.active || tab.discarded) continue;
      if (settings.skipPinned && tab.pinned) continue;
      if (settings.skipAudio && tab.audible) continue;
      if (!isSuspendableUrl(tab.url)) continue;
      if (matchWhitelist(tab.url, settings.whitelist)) continue;

      if (!(tab.id in tabActivity)) {
        tabActivity[tab.id] = now;
        activityChanged = true;
        continue;
      }

      const idleMinutes = (now - tabActivity[tab.id]) / 60000;
      if (idleMinutes < idleThreshold) continue;

      console.log(
        `Tab ${tab.id} idle for ${idleMinutes.toFixed(2)} mins -> suspending (${settings.mode})`
      );

      try {
        await chrome.tabs.discard(tab.id);
        newlySuspended += 1;

        if (settings.mode === "autoReload") {
          const data = await chrome.storage.local.get("autoReloadTabs");
          const stored = data.autoReloadTabs || [];
          if (!stored.includes(tab.id)) {
            stored.push(tab.id);
            await chrome.storage.local.set({ autoReloadTabs: stored });
          }
        }
      } catch (e) {
        console.warn(`Failed to discard tab ${tab.id}:`, e);
      }
    }

    if (activityChanged) {
      await chrome.storage.local.set({ tabActivity });
    }

    if (newlySuspended > 0) {
      const totalCount = await incrementSuspendCount(newlySuspended);
      if (settings.clearAfter > 0 && totalCount >= settings.clearAfter) {
        await clearCache();
      }
    } else {
      await updateDynamicBadge();
    }
  } finally {
    isCheckingTabs = false;
  }
}

// ===== Tab Event Listeners =====
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const settings = await getSettings();

  if (settings.mode === "autoReload") {
    const data = await chrome.storage.local.get("autoReloadTabs");
    const stored = data.autoReloadTabs || [];
    if (stored.includes(tabId)) {
      const updated = stored.filter((id) => id !== tabId);
      await chrome.storage.local.set({ autoReloadTabs: updated });
      try {
        const tab = await chrome.tabs.get(tabId);
        if (tab && tab.status !== "loading") {
          await chrome.tabs.reload(tabId);
        }
      } catch (e) {
        console.warn(`Failed to auto-reload tab ${tabId}:`, e);
      }
    }
  }

  await trackActivity(tabId);
  scheduleBadgeUpdate(150);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "complete" || changeInfo.url) {
    trackActivity(tabId);
  }
  if (
    changeInfo.discarded !== undefined ||
    changeInfo.status === "loading" ||
    changeInfo.status === "complete"
  ) {
    scheduleBadgeUpdate(100);
  }
});

chrome.tabs.onReplaced.addListener(async (addedTabId, removedTabId) => {
  await ensureActivityLoaded();
  if (removedTabId in tabActivity) {
    tabActivity[addedTabId] = tabActivity[removedTabId];
    delete tabActivity[removedTabId];
    await chrome.storage.local.set({ tabActivity });
  }
  scheduleBadgeUpdate(100);
});

chrome.tabs.onCreated.addListener(() => {
  scheduleBadgeUpdate(100);
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  await removeTabActivity(tabId);
  scheduleBadgeUpdate(100);
});

// ===== Initialize tab activity & alarm =====
async function initializeTabActivity() {
  await ensureActivityLoaded();
  const tabs = await chrome.tabs.query({});
  const now = Date.now();
  const activeTabIds = new Set();

  for (const tab of tabs) {
    if (tab.id) {
      activeTabIds.add(tab.id);
      if (!(tab.id in tabActivity)) {
        tabActivity[tab.id] = now;
      }
    }
  }

  for (const id of Object.keys(tabActivity)) {
    if (!activeTabIds.has(Number(id))) {
      delete tabActivity[id];
    }
  }

  await chrome.storage.local.set({ tabActivity });
}

async function ensureAlarm() {
  const existing = await chrome.alarms.get(ALARM_NAME);
  if (!existing) {
    chrome.alarms.create(ALARM_NAME, { periodInMinutes: ALARM_PERIOD_MINUTES });
  }
}

async function restoreBadge() {
  await updateDynamicBadge();
}

// ===== Startup =====
chrome.runtime.onInstalled.addListener(async () => {
  await initializeTabActivity();
  await ensureAlarm();
  await restoreBadge();
});

chrome.runtime.onStartup.addListener(async () => {
  await initializeTabActivity();
  await ensureAlarm();
  await restoreBadge();
});

ensureAlarm();
updateDynamicBadge();

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    checkTabs();
  }
});

// ===== Message Listener for Popup/Options =====
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "getStats") {
    chrome.tabs.query({}, (tabs) => {
      const suspendedTabs = tabs.filter((t) => t.discarded).length;
      updateBadge(suspendedTabs);
      sendResponse({
        totalTabs: tabs.length,
        suspendedTabs,
      });
    });
    return true;
  }

  if (message.action === "killIdleNow") {
    checkTabs()
      .then(() => sendResponse({ status: "done" }))
      .catch((err) => sendResponse({ status: "error", error: err.message }));
    return true;
  }

  if (message.action === "resetCount") {
    resetSuspendCount()
      .then(() => sendResponse({ status: "reset" }))
      .catch((err) => sendResponse({ status: "error", error: err.message }));
    return true;
  }
});
