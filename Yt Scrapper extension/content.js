// content.js — Runs on YouTube pages

let observer = null;
let isCollecting = false;

// ─── Extract all matching anchor hrefs currently in the DOM ───
function extractLinks() {
  const anchors = document.querySelectorAll("a.ytLockupViewModelContentImage");
  const links = [];

  anchors.forEach((anchor) => {
    const href = anchor.getAttribute("href");
    if (href) {
      // Convert relative URLs to absolute
      const fullUrl = href.startsWith("http")
        ? href
        : `https://www.youtube.com${href}`;
      links.push(fullUrl);
    }
  });

  return links;
}

// ─── Save new links to chrome.storage (deduplication via Set) ───
function saveLinks(links) {
  if (links.length === 0) return;

  chrome.storage.local.get(["ytLinks"], (result) => {
    const existing = result.ytLinks || [];
    const existingSet = new Set(existing);
    const newLinks = links.filter((link) => !existingSet.has(link));

    if (newLinks.length > 0) {
      const updated = [...existing, ...newLinks];
      chrome.storage.local.set({ ytLinks: updated });
    }
  });
}

// ─── Start collection + MutationObserver for infinite scroll ───
function startCollecting() {
  if (isCollecting) return { status: "already_running" };
  isCollecting = true;

  // Grab everything already visible
  saveLinks(extractLinks());

  // Watch for new nodes injected by YouTube's infinite scroll
  observer = new MutationObserver((mutations) => {
    if (!isCollecting) return;

    const hasNewNodes = mutations.some((m) => m.addedNodes.length > 0);
    if (hasNewNodes) {
      saveLinks(extractLinks());
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  return { status: "started" };
}

// ─── Stop collection and disconnect observer ───
function stopCollecting() {
  isCollecting = false;
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  return { status: "stopped" };
}

// ─── Listen for messages from the popup ───
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "start") {
    sendResponse(startCollecting());
  } else if (message.action === "stop") {
    sendResponse(stopCollecting());
  } else if (message.action === "getStatus") {
    sendResponse({ isCollecting });
  }
  return true; // Keep channel open for async response
});
