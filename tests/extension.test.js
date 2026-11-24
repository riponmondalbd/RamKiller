const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const WORKSPACE = path.resolve(__dirname, "..");

function createChromeMock(initialState = {}) {
  const syncStore = Object.assign({}, initialState.sync || {});
  const localStore = Object.assign({}, initialState.local || {});
  const tabs = (initialState.tabs || []).map((t) => ({ ...t }));
  const alarms = {};
  const badgeState = { text: "", color: "" };
  let cacheClearedCount = 0;

  const listeners = {
    onActivated: [],
    onUpdated: [],
    onReplaced: [],
    onCreated: [],
    onRemoved: [],
    onInstalled: [],
    onStartup: [],
    onAlarm: [],
    onMessage: [],
  };

  function makeStorageArea(store) {
    return {
      get(keys, cb) {
        const result = {};
        if (typeof keys === "string") {
          if (keys in store) result[keys] = structuredClone(store[keys]);
        } else if (Array.isArray(keys)) {
          for (const k of keys) {
            if (k in store) result[k] = structuredClone(store[k]);
          }
        } else if (keys && typeof keys === "object") {
          for (const [k, def] of Object.entries(keys)) {
            result[k] = k in store ? structuredClone(store[k]) : structuredClone(def);
          }
        } else {
          Object.assign(result, structuredClone(store));
        }
        if (cb) {
          Promise.resolve().then(() => cb(result));
          return;
        }
        return Promise.resolve(result);
      },
      set(items, cb) {
        for (const [k, v] of Object.entries(items)) {
          store[k] = structuredClone(v);
        }
        if (cb) {
          Promise.resolve().then(() => cb());
          return;
        }
        return Promise.resolve();
      },
    };
  }

  const chrome = {
    storage: {
      sync: makeStorageArea(syncStore),
      local: makeStorageArea(localStore),
    },
    action: {
      setBadgeText({ text }) {
        badgeState.text = text;
        return Promise.resolve();
      },
      setBadgeBackgroundColor({ color }) {
        badgeState.color = color;
        return Promise.resolve();
      },
    },
    browsingData: {
      remove(_opts, _types) {
        cacheClearedCount += 1;
        return Promise.resolve();
      },
    },
    alarms: {
      create(name, info) {
        alarms[name] = { name, ...info };
      },
      get(name) {
        return Promise.resolve(alarms[name] || null);
      },
      onAlarm: {
        addListener(fn) {
          listeners.onAlarm.push(fn);
        },
      },
    },
    tabs: {
      query(queryInfo, cb) {
        const matched = tabs.filter((t) => {
          if (queryInfo.active !== undefined && t.active !== queryInfo.active)
            return false;
          return true;
        });
        const cloned = matched.map((t) => ({ ...t }));
        if (cb) {
          Promise.resolve().then(() => cb(cloned));
          return;
        }
        return Promise.resolve(cloned);
      },
      get(tabId) {
        const t = tabs.find((x) => x.id === tabId);
        return Promise.resolve(t ? { ...t } : null);
      },
      discard(tabId) {
        const t = tabs.find((x) => x.id === tabId);
        if (!t) return Promise.reject(new Error("Tab not found"));
        t.discarded = true;
        return Promise.resolve({ ...t });
      },
      reload(tabId) {
        const t = tabs.find((x) => x.id === tabId);
        if (!t) return Promise.reject(new Error("Tab not found"));
        t.discarded = false;
        t.status = "loading";
        return Promise.resolve();
      },
      update(tabId, props) {
        const t = tabs.find((x) => x.id === tabId);
        if (!t) return Promise.reject(new Error("Tab not found"));
        Object.assign(t, props);
        return Promise.resolve({ ...t });
      },
      onActivated: { addListener: (fn) => listeners.onActivated.push(fn) },
      onUpdated: { addListener: (fn) => listeners.onUpdated.push(fn) },
      onReplaced: { addListener: (fn) => listeners.onReplaced.push(fn) },
      onCreated: { addListener: (fn) => listeners.onCreated.push(fn) },
      onRemoved: { addListener: (fn) => listeners.onRemoved.push(fn) },
    },
    runtime: {
      lastError: null,
      getURL(p) {
        return `chrome-extension://test-id/${p}`;
      },
      openOptionsPage() {},
      onInstalled: { addListener: (fn) => listeners.onInstalled.push(fn) },
      onStartup: { addListener: (fn) => listeners.onStartup.push(fn) },
      onMessage: { addListener: (fn) => listeners.onMessage.push(fn) },
      sendMessage(msg, cb) {
        for (const fn of listeners.onMessage) {
          fn(msg, {}, (resp) => cb && cb(resp));
        }
      },
    },
  };

  return {
    chrome,
    syncStore,
    localStore,
    tabs,
    alarms,
    badgeState,
    listeners,
    getCacheClearedCount: () => cacheClearedCount,
  };
}

function loadBackground(chrome) {
  const code = fs.readFileSync(path.join(WORKSPACE, "background.js"), "utf8");
  const context = {
    chrome,
    console: { log: () => {}, warn: () => {}, error: console.error },
    URL,
    URLSearchParams,
    Set,
    Date,
    Math,
    Number,
    Object,
    Array,
    Promise,
    setTimeout,
    clearTimeout,
  };
  vm.createContext(context);
  vm.runInContext(code, context);
  return context;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function runTests() {
  // 1. Test whitelist matching
  {
    const env = createChromeMock();
    const bg = loadBackground(env.chrome);
    const wl = ["*.youtube.com", "GitHub.com", "  "];
    assert.strictEqual(bg.matchWhitelist("https://www.youtube.com/watch?v=1", wl), true);
    assert.strictEqual(bg.matchWhitelist("https://youtube.com/", wl), true);
    assert.strictEqual(bg.matchWhitelist("https://notyoutube.com/", wl), false);
    assert.strictEqual(bg.matchWhitelist("https://github.com/user/repo", wl), true);
    assert.strictEqual(bg.matchWhitelist("chrome://settings", wl), false);
    assert.strictEqual(bg.isSuspendableUrl("https://example.com"), true);
    assert.strictEqual(bg.isSuspendableUrl("http://localhost:3000"), true);
    assert.strictEqual(bg.isSuspendableUrl("chrome://extensions"), false);
    assert.strictEqual(bg.isSuspendableUrl("chrome-extension://abc/popup.html"), false);
    assert.strictEqual(bg.isSuspendableUrl("about:blank"), false);
    console.log("PASS: Whitelist & URL checks");
  }

  // 2. Test tab suspension, skipping rules, and MV3 service worker restart persistence
  {
    const now = Date.now();
    const sixMinsAgo = now - 6 * 60000;
    const env = createChromeMock({
      sync: {
        idleTime: 5,
        whitelist: ["*.youtube.com"],
        skipPinned: true,
        skipAudio: true,
        mode: "discard",
        suspendCount: 0,
        clearAfter: 20,
      },
      local: {
        tabActivity: {
          1: sixMinsAgo, // active -> skip
          2: sixMinsAgo, // pinned -> skip
          3: sixMinsAgo, // audible -> skip
          4: sixMinsAgo, // whitelisted -> skip
          5: sixMinsAgo, // chrome:// -> skip
          6: sixMinsAgo, // idle -> SHOULD DISCARD
          7: sixMinsAgo, // idle -> SHOULD DISCARD
          8: now - 1 * 60000, // only 1 min idle -> skip
        },
      },
      tabs: [
        { id: 1, active: true, pinned: false, audible: false, discarded: false, url: "https://google.com" },
        { id: 2, active: false, pinned: true, audible: false, discarded: false, url: "https://slack.com" },
        { id: 3, active: false, pinned: false, audible: true, discarded: false, url: "https://spotify.com" },
        { id: 4, active: false, pinned: false, audible: false, discarded: false, url: "https://music.youtube.com" },
        { id: 5, active: false, pinned: false, audible: false, discarded: false, url: "chrome://settings" },
        { id: 6, active: false, pinned: false, audible: false, discarded: false, url: "https://example.com" },
        { id: 7, active: false, pinned: false, audible: false, discarded: false, url: "https://news.ycombinator.com" },
        { id: 8, active: false, pinned: false, audible: false, discarded: false, url: "https://wikipedia.org" },
      ],
    });

    // Simulate service worker waking up fresh from cold start and running checkTabs
    const bg = loadBackground(env.chrome);
    await bg.checkTabs();
    await wait(50);

    assert.strictEqual(env.tabs.find((t) => t.id === 1).discarded, false);
    assert.strictEqual(env.tabs.find((t) => t.id === 2).discarded, false);
    assert.strictEqual(env.tabs.find((t) => t.id === 3).discarded, false);
    assert.strictEqual(env.tabs.find((t) => t.id === 4).discarded, false);
    assert.strictEqual(env.tabs.find((t) => t.id === 5).discarded, false);
    assert.strictEqual(env.tabs.find((t) => t.id === 6).discarded, true);
    assert.strictEqual(env.tabs.find((t) => t.id === 7).discarded, true);
    assert.strictEqual(env.tabs.find((t) => t.id === 8).discarded, false);
    assert.strictEqual(env.syncStore.suspendCount, 2);
    assert.strictEqual(env.badgeState.text, "2");

    // Run checkTabs again -> already-discarded tabs MUST NOT increment suspendCount again!
    await bg.checkTabs();
    await wait(50);
    assert.strictEqual(env.syncStore.suspendCount, 2);
    assert.strictEqual(env.badgeState.text, "2");
    assert.strictEqual(env.getCacheClearedCount(), 0);
    console.log("PASS: Suspension rules, cold-start persistence & no re-counting");
  }

  // 3. Test dynamic badge updates when visiting/un-discarding or closing tabs
  {
    const env = createChromeMock({
      tabs: [
        { id: 1, active: true, discarded: false, url: "https://a.com" },
        { id: 2, active: false, discarded: true, url: "https://b.com" },
        { id: 3, active: false, discarded: true, url: "https://c.com" },
        { id: 4, active: false, discarded: true, url: "https://d.com" },
      ],
    });
    loadBackground(env.chrome);
    await wait(50);
    assert.strictEqual(env.badgeState.text, "3");

    // Simulate user clicking tab 2 (initially still discarded when onActivated fires, then un-discards)
    env.tabs[0].active = false;
    env.tabs[1].active = true;
    for (const fn of env.listeners.onActivated) fn({ tabId: 2 });
    setTimeout(() => {
      env.tabs[1].discarded = false;
      for (const fn of env.listeners.onUpdated) fn(2, { discarded: false, status: "loading" });
    }, 30);

    await wait(250);
    assert.strictEqual(env.badgeState.text, "2");

    // Simulate closing discarded tab 3
    const idx = env.tabs.findIndex((t) => t.id === 3);
    env.tabs.splice(idx, 1);
    for (const fn of env.listeners.onRemoved) fn(3);
    await wait(200);
    assert.strictEqual(env.badgeState.text, "1");

    // Simulate getStats message
    let statsResp = null;
    env.chrome.runtime.sendMessage({ action: "getStats" }, (r) => {
      statsResp = r;
    });
    await wait(20);
    assert.deepStrictEqual({ ...statsResp }, { totalTabs: 3, suspendedTabs: 1 });
    assert.strictEqual(env.badgeState.text, "1");
    console.log("PASS: Dynamic badge tracking & getStats sync");
  }

  // 4. Test popup.js one-click whitelist & stats UI
  {
    const env = createChromeMock({
      sync: { whitelist: ["google.com"] },
      tabs: [
        { id: 10, active: true, discarded: false, url: "https://Sub.Example.com/path" },
        { id: 11, active: false, discarded: true, url: "https://other.com" },
      ],
    });
    loadBackground(env.chrome);

    const elements = {};
    function makeEl(id) {
      return {
        id,
        disabled: false,
        innerText: "",
        innerHTML: "",
        title: "",
        classList: {
          classes: new Set(),
          add(c) { this.classes.add(c); },
          remove(c) { this.classes.delete(c); },
          toggle(c, force) {
            if (force === undefined) {
              if (this.classes.has(c)) this.classes.delete(c);
              else this.classes.add(c);
            } else if (force) this.classes.add(c);
            else this.classes.delete(c);
          },
          contains(c) { return this.classes.has(c); },
        },
        listeners: {},
        addEventListener(ev, fn) {
          this.listeners[ev] = this.listeners[ev] || [];
          this.listeners[ev].push(fn);
        },
        async click() {
          for (const fn of this.listeners.click || []) await fn();
        },
      };
    }
    for (const id of ["settings", "killNow", "resetStats", "whitelistBtn", "whitelistText", "count", "totalTabs", "ramValue"]) {
      elements[id] = makeEl(id);
    }

    const docListeners = {};
    const popupCtx = {
      chrome: env.chrome,
      console: { log: () => {}, warn: () => {}, error: console.error },
      confirm: () => true,
      URL,
      Set,
      setTimeout,
      clearTimeout,
      document: {
        getElementById: (id) => elements[id],
        addEventListener: (ev, fn) => {
          docListeners[ev] = docListeners[ev] || [];
          docListeners[ev].push(fn);
        },
      },
    };
    vm.createContext(popupCtx);
    vm.runInContext(fs.readFileSync(path.join(WORKSPACE, "popup.js"), "utf8"), popupCtx);
    for (const fn of docListeners.DOMContentLoaded || []) await fn();
    await wait(50);

    assert.strictEqual(elements.count.innerText, 1);
    assert.strictEqual(elements.totalTabs.innerText, 2);
    assert.strictEqual(elements.ramValue.innerText, "50 MB");
    assert.strictEqual(elements.whitelistText.innerText, "Whitelist sub.example.com");
    assert.strictEqual(elements.whitelistBtn.classList.contains("whitelisted"), false);

    // Click to whitelist
    await elements.whitelistBtn.click();
    assert.ok(env.syncStore.whitelist.includes("sub.example.com"));
    assert.strictEqual(elements.whitelistText.innerText, "Whitelisted: sub.example.com");
    assert.strictEqual(elements.whitelistBtn.classList.contains("whitelisted"), true);

    // Click again to remove from whitelist
    await elements.whitelistBtn.click();
    assert.strictEqual(env.syncStore.whitelist.includes("sub.example.com"), false);
    assert.strictEqual(elements.whitelistText.innerText, "Whitelist sub.example.com");
    console.log("PASS: Popup one-click whitelist & stats");
  }

  // 5. Test options.js validation
  {
    const env = createChromeMock({
      sync: { idleTime: 5, whitelist: [], skipPinned: true, skipAudio: true, mode: "discard" },
    });
    const elements = {
      idleTime: { value: "0" },
      whitelist: { value: " *.youtube.com \n\n github.com " },
      skipPinned: { checked: true },
      skipAudio: { checked: false },
      mode: { value: "autoReload" },
      save: {
        innerText: "Save Preferences",
        disabled: false,
        listeners: {},
        addEventListener(ev, fn) {
          this.listeners[ev] = this.listeners[ev] || [];
          this.listeners[ev].push(fn);
        },
      },
      toast: { classList: { add() {}, remove() {} } },
    };
    const docListeners = {};
    const optCtx = {
      chrome: env.chrome,
      Number,
      Math,
      setTimeout,
      clearTimeout,
      document: {
        getElementById: (id) => elements[id],
        addEventListener: (ev, fn) => {
          docListeners[ev] = docListeners[ev] || [];
          docListeners[ev].push(fn);
        },
      },
    };
    vm.createContext(optCtx);
    vm.runInContext(fs.readFileSync(path.join(WORKSPACE, "options.js"), "utf8"), optCtx);
    for (const fn of docListeners.DOMContentLoaded || []) await fn();

    // Now set invalid idleTime = "-3" and whitelist, then click save
    elements.idleTime.value = "-3";
    elements.whitelist.value = " *.youtube.com \n\n github.com ";
    for (const fn of elements.save.listeners.click || []) await fn();
    await wait(20);

    assert.strictEqual(env.syncStore.idleTime, 5); // clamped back to default 5
    assert.strictEqual(elements.idleTime.value, 5);
    assert.deepStrictEqual([...env.syncStore.whitelist], ["*.youtube.com", "github.com"]);
    console.log("PASS: Options validation & save");
  }

  // 6. Test Manual Reload (Reload on Click) mode + suspended.js
  {
    const sixMinsAgo = Date.now() - 6 * 60000;
    const env = createChromeMock({
      sync: {
        idleTime: 5,
        whitelist: [],
        skipPinned: true,
        skipAudio: true,
        mode: "manualReload",
        suspendCount: 0,
        clearAfter: 20,
      },
      local: { tabActivity: { 20: sixMinsAgo } },
      tabs: [
        { id: 19, active: true, discarded: false, url: "https://active.com" },
        { id: 20, active: false, discarded: false, url: "https://docs.example.com/page", title: "Example Docs" },
      ],
    });
    const bg = loadBackground(env.chrome);
    await bg.checkTabs();
    await wait(50);

    const suspendedTab = env.tabs.find((t) => t.id === 20);
    assert.ok(suspendedTab.url.startsWith("chrome-extension://test-id/suspended.html?"));
    assert.strictEqual(suspendedTab.discarded, false);
    assert.strictEqual(env.badgeState.text, "1");

    // Switching to tab 20 must NOT auto-reload it; it stays on suspended.html until clicked
    for (const fn of env.listeners.onActivated) fn({ tabId: 20 });
    await wait(200);
    assert.ok(suspendedTab.url.startsWith("chrome-extension://test-id/suspended.html?"));
    assert.strictEqual(env.badgeState.text, "1");

    // Load suspended.js and simulate user clicking the page
    let replacedUrl = null;
    const reloadBtn = { addEventListener: (ev, fn) => { if (ev === "click") reloadBtn.onClick = fn; } };
    const suspCtx = {
      URLSearchParams,
      window: {
        location: {
          search: "?" + suspendedTab.url.split("?")[1],
          replace: (u) => { replacedUrl = u; },
        },
      },
      document: {
        title: "",
        body: { addEventListener: (ev, fn) => { if (ev === "click") suspCtx.bodyClick = fn; } },
        addEventListener: () => {},
        getElementById: (id) => {
          if (id === "reloadBtn") return reloadBtn;
          return { innerText: "", src: "", style: {} };
        },
      },
    };
    vm.createContext(suspCtx);
    vm.runInContext(fs.readFileSync(path.join(WORKSPACE, "suspended.js"), "utf8"), suspCtx);
    assert.strictEqual(suspCtx.document.title, "Suspended: Example Docs");
    suspCtx.bodyClick();
    assert.strictEqual(replacedUrl, "https://docs.example.com/page");
    console.log("PASS: Manual Reload (Reload on Click) & suspended.js");
  }

  console.log("\nALL TESTS PASSED!");
}

runTests().catch((err) => {
  console.error("TEST FAILED:", err);
  process.exit(1);
});
