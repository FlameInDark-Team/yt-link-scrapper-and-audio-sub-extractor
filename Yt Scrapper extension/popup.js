// popup.js — Controls the popup UI and communicates with content.js

const toggleBtn = document.getElementById("toggleBtn");
const exportJsonBtn = document.getElementById("exportJsonBtn");
const exportTxtBtn = document.getElementById("exportTxtBtn");
const clearBtn = document.getElementById("clearBtn");
const linkCount = document.getElementById("linkCount");
const statusText = document.getElementById("statusText");
const statusDot = document.getElementById("statusDot");
const linksPreview = document.getElementById("linksPreview");

let isCollecting = false;

// ─── Helper: trigger a file download ───
function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Update counter and button states ───
function updateUI(count) {
  linkCount.textContent = count;
  exportJsonBtn.disabled = count === 0;
  exportTxtBtn.disabled = count === 0;
  clearBtn.disabled = count === 0;
}

// ─── Render last 25 links in the preview panel ───
function renderPreview(links) {
  if (!links || links.length === 0) {
    linksPreview.innerHTML =
      '<p class="empty-state">No links yet. Start collecting and scroll through YouTube!</p>';
    return;
  }

  const recent = [...links].reverse().slice(0, 25);
  linksPreview.innerHTML = recent
    .map((link) => `<div class="link-item" title="${link}">${link}</div>`)
    .join("");
}

// ─── Toggle the collecting visual state ───
function setCollectingState(collecting) {
  isCollecting = collecting;

  if (collecting) {
    toggleBtn.textContent = "⏹ Stop Collecting";
    toggleBtn.classList.add("collecting");
    statusText.textContent = "Collecting — Scroll to load more links…";
    statusDot.classList.add("active");
  } else {
    toggleBtn.textContent = "▶ Start Collecting";
    toggleBtn.classList.remove("collecting");
    statusText.textContent = "Idle — Click Start to begin";
    statusDot.classList.remove("active");
  }
}

// ─── On popup open: restore state from storage ───
chrome.storage.local.get(["ytLinks", "isCollecting"], (result) => {
  const links = result.ytLinks || [];
  updateUI(links.length);
  renderPreview(links);
  if (result.isCollecting) setCollectingState(true);
});

// ─── Live-update while popup is open ───
chrome.storage.onChanged.addListener((changes) => {
  if (changes.ytLinks) {
    const links = changes.ytLinks.newValue || [];
    updateUI(links.length);
    renderPreview(links);
  }
});

// ─── Start / Stop Button ───
toggleBtn.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab.url || !tab.url.includes("youtube.com")) {
    statusText.textContent = "⚠ Please navigate to YouTube first!";
    return;
  }

  if (!isCollecting) {
    chrome.tabs.sendMessage(tab.id, { action: "start" }, (response) => {
      if (chrome.runtime.lastError) {
        statusText.textContent = "⚠ Reload the YouTube page and try again.";
        return;
      }
      setCollectingState(true);
      chrome.storage.local.set({ isCollecting: true });
    });
  } else {
    chrome.tabs.sendMessage(tab.id, { action: "stop" }, () => {
      setCollectingState(false);
      chrome.storage.local.set({ isCollecting: false });
    });
  }
});

// ─── Export JSON Button ───
exportJsonBtn.addEventListener("click", () => {
  chrome.storage.local.get(["ytLinks"], (result) => {
    const links = result.ytLinks || [];

    const exportData = {
      source: "YT Link Harvester",
      exportedAt: new Date().toISOString(),
      totalLinks: links.length,
      links: links,
    };

    downloadFile(
      JSON.stringify(exportData, null, 2),
      `yt-links-${Date.now()}.json`,
      "application/json",
    );
  });
});

// ─── Export TXT Button ───
exportTxtBtn.addEventListener("click", () => {
  chrome.storage.local.get(["ytLinks"], (result) => {
    const links = result.ytLinks || [];

    // One URL per line — clean and simple
    const textContent = links.join("\n");

    downloadFile(textContent, `yt-links-${Date.now()}.txt`, "text/plain");
  });
});

// ─── Clear Button ───
clearBtn.addEventListener("click", () => {
  if (!confirm("Are you sure you want to clear all collected links?")) return;

  chrome.storage.local.set({ ytLinks: [] }, () => {
    updateUI(0);
    renderPreview([]);
  });
});
