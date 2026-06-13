# X-Post Scraper: Export Posts, Users & Trends

A premium, modern, and feature-rich Chrome Extension (Manifest V3) designed to scrape posts, profiles, engagement metrics, and trends from X (Twitter). Visualize your scraped data in real-time with an elegant glassmorphism analytics dashboard, and export it into multiple formats (JSON, CSV, Markdown, or Standalone HTML).

---

## 🌟 Features

### 1. **Live Extension Popup Scraper Panel**
*   **Custom Scrape Limits**: Set targets from 50, 100, 250, 500 tweets, or run indefinitely.
*   **Scroll Delay Controls**: Adjustable scraping intervals (`Safe Mode` (3s), `Balanced` (2s), or `Fast Mode` (1s)) to align with rate-limits and usage.
*   **Connection Status**: Visual green/yellow/red indicators verifying active connection status to X.com.
*   **Real-time Progress Tracker**: Pulse animations showing live tweet count and scraping progress.

### 2. **Analytics & Trends Dashboard**
*   **KPI Metrics**: Overview of total tweets scraped, active authors, average engagement rates, and a custom Word Density Index.
*   **Hashtag Analysis**: Dynamically generated SVG-based visual bar charts illustrating the frequency of extracted hashtags.
*   **Author Volume Charts**: Distribution charts highlighting the most active authors from the scraped dataset.

### 3. **Scraped Author Hub**
*   An interactive profile catalog displaying metadata cards for detected profiles, listing bios, handle tags, follower info, and display tags.

### 4. **Tweet Ledger (Data Table)**
*   **Search**: Instant text-based filter across content, handles, and hashtags.
*   **Granular Filters**: Filter by specific author handle or engagement milestones (e.g., >50, >250, or >1,000 likes).
*   **Sort options**: Sort by date, replies, retweets, likes, or views.
*   **Bulk Actions & Page Controls**: Select all or specific tweets to export, and paginate through large datasets.

### 5. **Export Formats**
*   **JSON**: Full database schema backup.
*   **CSV**: Ready for spreadsheet analysis (Excel, Google Sheets).
*   **Markdown**: Beautifully formatted tables and quotes for notes/docs.
*   **Standalone HTML**: Self-contained, styled dashboard displaying the exported tweets.

---

## 🛠️ Tech Stack & Architecture

*   **Manifest Version**: 3 (latest Chrome extension standard)
*   **UI/UX**: Custom CSS featuring glassmorphism, glowing micro-animations, and modern typography (Outfit Google Font)
*   **State Management**: Chrome Storage API (`chrome.storage.local`) for fast, persistent client-side data
*   **Background Worker**: Service worker orchestration (`background.js`) handling tab communication
*   **Content Injection**: Content scripts (`content.js`) that scan post feeds and extract data elements safely

---

## 🚀 Installation & Getting Started

Since this extension is in development, you can load it into Google Chrome as an **unpacked extension**:

1.  **Clone or Download this Repository**:
    ```bash
    git clone https://github.com/cursorkz-cmd/x-scraper.git
    ```
2.  **Open Chrome Extensions Page**:
    *   In Google Chrome, navigate to `chrome://extensions/`.
3.  **Enable Developer Mode**:
    *   Toggle the **Developer mode** switch in the top-right corner.
4.  **Load Unpacked Extension**:
    *   Click the **Load unpacked** button in the top-left.
    *   Select the root folder of this project (containing `manifest.json`).
5.  **Pin the Extension**:
    *   Click the puzzle piece icon in your Chrome toolbar and pin **X-Post Scraper**.

---

## 📖 How to Use

1.  **Navigate to X (Twitter)**: Open [x.com](https://x.com) or [twitter.com](https://twitter.com) and log in.
2.  **Configure Scraper**: Click the extension icon. If you are on an active X tab, the configuration panel will unlock.
3.  **Start Scraping**: Select your limits and interval, and click **Start Scraping**. Scroll down the feed or search page to allow tweets to load. The extension will gather data automatically.
4.  **View Analytics**: Click **Open Analytics Dashboard** at the bottom of the popup to open the full dashboard in a new tab.
5.  **Export Data**: In the dashboard, click **Export Ledger** and select your preferred output format.

---

## 📂 Project Structure

```text
├── assets/                  # Extension icons
├── utils/
│   └── export.js            # Export utility logic (CSV, JSON, Markdown, HTML)
├── background.js            # Background service worker
├── content.js               # Content script injected into X pages
├── dashboard.css            # Styles for the analytics dashboard
├── dashboard.html           # Analytics and Tweet ledger HTML
├── dashboard.js             # Dashboard client logic and SVG charting
├── manifest.json            # Extension configuration manifest
├── popup.css                # Styles for the extension popup
├── popup.html               # Main extension popup HTML
├── popup.js                 # Popup logic and controls
├── LICENSE                  # License file
└── README.md                # Documentation
```

---

## 📋 Changelog

### v1.1.0 — 2026-06-12

#### 🐛 Bug Fixes

**Scraper Resilience**
- **Background tab interruption** — Scraping no longer pauses when the user switches to another browser tab or window. Added `document.visibilitychange` detection: the scraper now detects when the page is hidden and resumes its scroll-and-collect loop upon returning, instead of silently halting.
- **100-tweet hard cap** — Fixed an incorrect count ceiling that stopped scraping at exactly 100–111 tweets regardless of the user-set limit. The root cause was comparing the total database size against the current-session limit. Replaced with a `sessionTweetIds` `Set` that tracks only tweets collected in the current session, so unlimited scraping works correctly across all limit presets.
- **"Show more" text truncation** — Tweets with collapsed long-form text were being stored with the literal string `"Show more"` appended at the end. The scraper now targets X's stable `[data-testid="tweet-text-show-more-link"]` element to detect and purge truncation remnants before saving the full text to storage.
- **Premature "bottom reached" detection** — Added an `isPageLoading` guard that checks for active spinner elements before concluding there are no more tweets to load, preventing false stops during slow network conditions.

**Dashboard — Content Security Policy (CSP)**
- **Inline `onclick` handlers blocked** — Chrome's Manifest V3 CSP rejects `onclick="..."` attributes in dynamically generated HTML. All four violation sites were eliminated:
  - SVG hashtag chart bars: replaced `onclick="window.filterLedgerByHashtag(...)"` with `data-hashtag` attributes and post-render `querySelectorAll` event listeners.
  - SVG author chart bars: replaced `onclick="window.filterLedgerByAuthor(...)"` with `data-handle` attributes and post-render `querySelectorAll` event listeners.
  - Author Hub profile cards: replaced `onclick` on the *View Scraped Posts* button with a `data-handle` attribute and a direct `addEventListener` call after DOM insertion.
  - Tweet Ledger text cells (`#hashtag` / `@mention` links): replaced inline `onclick` in regex-generated anchor tags with `data-hashtag` / `data-author` attributes and a single **delegated listener** on the `<tbody>` element that handles all current and future dynamically rendered rows.
  - Removed all `window.filterLedger*` global function exposures; replaced with local scoped functions.

#### ⚙️ Internal Improvements
- Added `unlimitedStorage` permission to `manifest.json` to support large scraping sessions without hitting Chrome's default storage quota.
- Added `chrome.runtime.lastError` guards to all `sendMessage` calls in `popup.js` to silence uncaught extension context errors on tab close.

---

## 🛡️ License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
