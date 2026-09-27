"use strict";

// content.js — YouTube DOM content script for link extraction
let observer = null;
let isCollecting = false;
const seenLinks = new Set();
let debounceTimer = null;
let skipShorts = false;

// Initialize preferences
chrome.storage.local.get([YT_CONSTANTS.STORAGE_KEYS.SKIP_SHORTS], (res) => {
  skipShorts = !!res[YT_CONSTANTS.STORAGE_KEYS.SKIP_SHORTS];
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes[YT_CONSTANTS.STORAGE_KEYS.SKIP_SHORTS]) {
    skipShorts = !!changes[YT_CONSTANTS.STORAGE_KEYS.SKIP_SHORTS].newValue;
  }
});

/**
 * Validates domain and schema.
 */
function isValidYouTubeUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    return (
      (parsed.protocol === "https:" || parsed.protocol === "http:") &&
      (host === YT_CONSTANTS.YT_DOMAIN || host.endsWith("." + YT_CONSTANTS.YT_DOMAIN))
    );
  } catch {
    return false;
  }
}

/**
 * Normalizes YouTube URLs to remove tracking queries (pp, ab_channel, etc.)
 * and converts /shorts/ links into canonical /watch?v= format or filters them.
 */
function normalizeYouTubeUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    if (u.pathname === "/watch" && u.searchParams.has("v")) {
      return `https://www.youtube.com/watch?v=${u.searchParams.get("v")}`;
    }
    if (u.pathname.startsWith("/shorts/")) {
      if (skipShorts) return null;
      const id = u.pathname.split("/shorts/")[1].split(/[/?#]/)[0];
      return id ? `https://www.youtube.com/watch?v=${id}` : null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Scans DOM for matching anchors.
 */
function extractNewLinks() {
  const anchors = document.querySelectorAll(YT_CONSTANTS.LINK_SELECTOR);
  const newLinks = [];

  anchors.forEach((anchor) => {
    const href = anchor.getAttribute("href");
    if (!href) return;

    const fullUrl = href.startsWith("http") ? href : `${YT_CONSTANTS.YT_ORIGIN}${href}`;
    if (!isValidYouTubeUrl(fullUrl)) return;

    const canonicalUrl = normalizeYouTubeUrl(fullUrl);
    if (!canonicalUrl) return;

    if (!seenLinks.has(canonicalUrl)) {
      seenLinks.add(canonicalUrl);
      newLinks.push(canonicalUrl);
    }
  });

  return newLinks;
}

/**
 * Writes newly found links to storage.
 */
function saveLinks(links) {
  if (links.length === 0) return;

  chrome.storage.local.get([YT_CONSTANTS.STORAGE_KEYS.LINKS], (result) => {
    if (chrome.runtime.lastError) return;
    const existing = result[YT_CONSTANTS.STORAGE_KEYS.LINKS] || [];
    const updated = [...existing, ...links];
    chrome.storage.local.set({ [YT_CONSTANTS.STORAGE_KEYS.LINKS]: updated });
  });
}

function debouncedScan() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    saveLinks(extractNewLinks());
  }, YT_CONSTANTS.OBSERVER_DEBOUNCE_MS);
}

function startCollecting() {
  if (isCollecting) return { status: "already_running" };
  isCollecting = true;

  saveLinks(extractNewLinks());

  const observeTarget = document.querySelector("#contents") || document.body;
  observer = new MutationObserver((mutations) => {
    if (!isCollecting) return;
    const hasNewNodes = mutations.some((m) => m.addedNodes.length > 0);
    if (hasNewNodes) debouncedScan();
  });

  observer.observe(observeTarget, { childList: true, subtree: true });
  return { status: "started" };
}

function stopCollecting() {
  isCollecting = false;
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  return { status: "stopped" };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.action) {
    case "start":
      sendResponse(startCollecting());
      break;
    case "stop":
      sendResponse(stopCollecting());
      break;
    case "getStatus":
      sendResponse({ isCollecting });
      break;
    default:
      sendResponse({ error: "unknown_action" });
  }
  return true;
});
