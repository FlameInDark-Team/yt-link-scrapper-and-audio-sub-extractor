"use strict";

// --- Shared Configuration Constants ---
const YT_CONSTANTS = Object.freeze({
  // Comprehensive selectors for YouTube video link anchors across feeds, search, and playlists
  LINK_SELECTOR: 'a.ytLockupViewModelContentImage, a#video-title[href^="/watch"], ytd-thumbnail a[href^="/watch"], a.ytd-thumbnail[href^="/watch"]',

  // chrome.storage.local keys
  STORAGE_KEYS: Object.freeze({
    LINKS: "ytLinks",
    COLLECTING: "isCollecting",
    SKIP_SHORTS: "skipShorts",
  }),

  // Domain verification
  YT_DOMAIN: "youtube.com",
  YT_ORIGIN: "https://www.youtube.com",

  // Local server bridge
  STUDIO_API_URL: "http://127.0.0.1:8765/api/links",

  // Observer timing
  OBSERVER_DEBOUNCE_MS: 350,

  // UI preview limit
  PREVIEW_LIMIT: 30,

  // Export metadata
  EXPORT_SOURCE: "YT Link Harvester Pro",
});
