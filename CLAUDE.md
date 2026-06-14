# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Ram Killer Pro** is a Chrome Extension (Manifest V3) that automatically suspends inactive browser tabs to free up system RAM. It supports three suspension modes (discard, auto-reload, manual-reload), domain whitelisting with wildcard support, and idle-time-based tab eviction.

## Key Files

| File | Role |
|------|------|
| `manifest.json` | Extension manifest — MV3, permissions: tabs, storage, alarms, idle, browsingData |
| `background.js` | Service worker — core suspension logic, tab tracking, alarm scheduler, message routing |
| `popup.html` + `popup.js` | Popup UI — stats dashboard (suspended count, total tabs, estimated RAM saved), "Kill Now" button |
| `options.html` + `options.js` | Options page — idle timeout, suspension mode, skip-pinned/audio toggles, domain whitelist editor |
| `convert.ps1` / `convert_rounded.ps1` | PowerShell scripts to resize `icon_pro.png` into `icon_16/48/128.png` |

## Architecture

- **Service worker** (`background.js`) is the single source of logic. It runs a periodic alarm every ~10 seconds (`0.1667` minutes) that queries all tabs and discards/reloads idle ones based on settings.
- **Tab activity tracking**: `tabActivity` map in memory, persisted to `chrome.storage.local`. Updated on `onActivated` and `onUpdated`.
- **Settings** live in `chrome.storage.sync` with defaults defined in `DEFAULT_SETTINGS` (idleTime, whitelist, skipPinned, skipAudio, mode, suspendCount, clearAfter).
- **Message passing**: popup/options communicate with background via `chrome.runtime.sendMessage`. Supported actions: `getStats`, `killIdleNow`, `resetCount`.
- **Whitelist matching**: hostname-based with wildcard support (`*.domain.com`).
- **Auto-clear**: when `suspendCount` reaches `clearAfter` (default 20), browsing cache is cleared and count resets.

## Development

### Loading the extension in Chrome/Edge/Brave

1. Open `chrome://extensions/` (or equivalent)
2. Enable **Developer mode**
3. Click **Load unpacked** and select this directory

### Icon generation

From the high-res `icon_pro.png`, generate sized variants:

```powershell
# Standard (non-rounded) icons
powershell -File convert.ps1

# Rounded-corner icons (for Chrome Web Store)
powershell -File convert_rounded.ps1
```

Both scripts require Windows `System.Drawing` (PowerShell on Windows).

## Key Constants

- Idle timeout default: **5 minutes** (configurable in options)
- Alarm interval: **10 seconds** (`0.1667` minutes)
- RAM estimate per suspended tab: **50 MB**
- Auto-clear threshold: **20 suspensions** (configurable via `clearAfter`)
- Badge color: `#ff6b00` (orange)
