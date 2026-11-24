# Ram Killer Pro

**Ram Killer Pro** is a Manifest V3 Chrome extension designed to optimize browser performance and reduce memory usage. It automatically suspends inactive tabs, tracks live suspension statistics on the toolbar badge, and offers one-click domain whitelisting.

## ✨ Features

- **Auto Suspend Idle Tabs**: Automatically suspends inactive tabs after a configurable idle timeout (default: `5` minutes).
- **Three Suspension Modes**:
  - **Discard (Best Memory Saving)**: Uses Chrome's native `chrome.tabs.discard` to free RAM and automatically reloads the tab when you switch back to it.
  - **Auto Reload on Activation**: Discards idle tabs and triggers a fresh reload when activated.
  - **Manual Reload (Reload on Click)**: Replaces idle tabs with a lightweight suspended placeholder page (`suspended.html`) and restores the original page only when you click **Reload Tab**, click anywhere on the page, or press `Enter` / `Space`.
- **Smart Exceptions & One-Click Whitelist**:
  - Skip pinned tabs.
  - Skip tabs currently playing audio/video.
  - **One-Click Popup Whitelist**: Whitelist or un-whitelist the active website directly from the extension popup.
  - **Custom Domain Whitelist**: Manage domains in Settings with wildcard support (e.g., `*.youtube.com`, `github.com`).
- **Dynamic Toolbar Badge & Real-Time Stats**:
  - The extension icon badge dynamically displays the live number of currently suspended tabs and updates automatically as tabs are suspended, restored, or closed.
  - View suspended tabs, total open tabs, and estimated RAM recovered (`50 MB` per suspended tab) in the popup.
- **One-Click Kill & Modern Dark UI**:
  - Instantly suspend all eligible idle tabs with **Kill Idle Tabs Now**.
  - Unified dark glassmorphic UI across the popup, settings page, and suspended placeholder page.

## 📁 Project Structure

| File | Description |
| --- | --- |
| `manifest.json` | Manifest V3 configuration and permissions (`tabs`, `storage`, `alarms`, `browsingData`) |
| `background.js` | Service worker for idle tracking, tab suspension, dynamic badge updates, and messaging |
| `popup.html` / `popup.js` | Extension popup dashboard, one-click domain whitelist toggle, and quick actions |
| `options.html` / `options.js` | Settings page for idle timeout, suspension mode, exceptions, and domain whitelist |
| `suspended.html` / `suspended.js` | Lightweight placeholder page for **Manual Reload (Reload on Click)** mode |
| `convert.ps1` / `convert_rounded.ps1` | PowerShell scripts to generate `icon_16.png`, `icon_48.png`, and `icon_128.png` from `icon_pro.png` |

## 🚀 Installation (Local / Developer Mode)

1. Clone or download this repository to your local machine.
2. Open Chrome, Brave, or Edge and navigate to `chrome://extensions/`.
3. Enable **Developer mode** in the top-right corner.
4. Click **Load unpacked** and select the `RamKiller` folder.
5. Pin **Ram Killer Pro** to your browser toolbar for quick access and live suspended-tab badge counts.

## 🛠️ Usage & Configuration

- **Popup Menu**: Click the extension icon to view live RAM recovery stats, whitelist/un-whitelist the current website in one click, or run **Kill Idle Tabs Now**.
- **Settings Page**: Click the gear icon in the popup (or right-click the extension icon and select **Options**) to configure your idle timeout, suspension mode, pinned/audio exceptions, and domain whitelist.

## 👨‍💻 Developer

**Developed by:** [Ripon](https://riponmondalbd.vercel.app/)
