"use strict";

// popup.js — Extension popup controller with direct Studio integration

const toggleBtn = document.getElementById("toggleBtn");
const sendToStudioBtn = document.getElementById("sendToStudioBtn");
const studioSpinner = document.getElementById("studioSpinner");
const exportJsonBtn = document.getElementById("exportJsonBtn");
const exportTxtBtn = document.getElementById("exportTxtBtn");
const copyBtn = document.getElementById("copyBtn");
const clearBtn = document.getElementById("clearBtn");
const linkCount = document.getElementById("linkCount");
const statusText = document.getElementById("statusText");
const statusDot = document.getElementById("statusDot");
const linksPreview = document.getElementById("linksPreview");
const skipShortsCheckbox = document.getElementById("skipShortsCheckbox");

let isCollecting = false;

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function showToast(message, type = "info") {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add("visible"));
  setTimeout(() => {
    toast.classList.remove("visible");
    setTimeout(() => toast.remove(), 260);
  }, 2200);
}

function updateUI(count) {
  const prev = parseInt(linkCount.textContent, 10) || 0;
  if (prev !== count) {
    linkCount.textContent = count;
    linkCount.classList.add("counter-bump");
    setTimeout(() => linkCount.classList.remove("counter-bump"), 300);
  }

  const hasLinks = count > 0;
  sendToStudioBtn.disabled = !hasLinks;
  exportJsonBtn.disabled = !hasLinks;
  exportTxtBtn.disabled = !hasLinks;
  copyBtn.disabled = !hasLinks;
  clearBtn.disabled = !hasLinks;
}

function renderPreview(links) {
  linksPreview.innerHTML = "";

  if (!links || links.length === 0) {
    const p = document.createElement("p");
    p.className = "empty-state";
    p.textContent = "No links yet. Start collecting and scroll through YouTube!";
    linksPreview.appendChild(p);
    return;
  }

  const recent = [...links].reverse().slice(0, YT_CONSTANTS.PREVIEW_LIMIT);
  const fragment = document.createDocumentFragment();

  recent.forEach((link) => {
    const div = document.createElement("div");
    div.className = "link-item";
    div.title = link;
    div.textContent = link;

    div.addEventListener("click", () => {
      chrome.tabs.create({ url: link, active: false });
    });
    fragment.appendChild(div);
  });

  linksPreview.appendChild(fragment);
}

function setCollectingState(collecting) {
  isCollecting = collecting;

  if (collecting) {
    toggleBtn.textContent = "⏹ Stop Collecting";
    toggleBtn.classList.add("collecting");
    statusText.textContent = "Collecting — Scroll feed to discover…";
    statusDot.classList.add("active");
  } else {
    toggleBtn.textContent = "▶ Start Collecting";
    toggleBtn.classList.remove("collecting");
    statusText.textContent = "Idle — Click Start to begin";
    statusDot.classList.remove("active");
  }
}

// Restore state from storage on open
chrome.storage.local.get(
  [
    YT_CONSTANTS.STORAGE_KEYS.LINKS,
    YT_CONSTANTS.STORAGE_KEYS.COLLECTING,
    YT_CONSTANTS.STORAGE_KEYS.SKIP_SHORTS,
  ],
  (result) => {
    if (chrome.runtime.lastError) return;

    const links = result[YT_CONSTANTS.STORAGE_KEYS.LINKS] || [];
    updateUI(links.length);
    renderPreview(links);

    if (result[YT_CONSTANTS.STORAGE_KEYS.COLLECTING]) {
      setCollectingState(true);
    }
    if (result[YT_CONSTANTS.STORAGE_KEYS.SKIP_SHORTS]) {
      skipShortsCheckbox.checked = true;
    }
  }
);

// Toggle skip shorts
skipShortsCheckbox.addEventListener("change", (e) => {
  chrome.storage.local.set({
    [YT_CONSTANTS.STORAGE_KEYS.SKIP_SHORTS]: e.target.checked,
  });
  showToast(e.target.checked ? "Shorts filtering enabled" : "Shorts filtering disabled");
});

// Live update while open
chrome.storage.onChanged.addListener((changes) => {
  if (changes[YT_CONSTANTS.STORAGE_KEYS.LINKS]) {
    const links = changes[YT_CONSTANTS.STORAGE_KEYS.LINKS].newValue || [];
    updateUI(links.length);
    renderPreview(links);
  }
});

// Start / Stop button
toggleBtn.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab || !tab.url || !tab.url.includes(YT_CONSTANTS.YT_DOMAIN)) {
    statusText.textContent = "⚠ Navigate to YouTube first!";
    showToast("Navigate to YouTube first", "error");
    return;
  }

  if (!isCollecting) {
    chrome.tabs.sendMessage(tab.id, { action: "start" }, () => {
      if (chrome.runtime.lastError) {
        statusText.textContent = "⚠ Refresh YouTube page and try again";
        showToast("Refresh YouTube page", "error");
        return;
      }
      setCollectingState(true);
      chrome.storage.local.set({ [YT_CONSTANTS.STORAGE_KEYS.COLLECTING]: true });
      showToast("Collection started!", "success");
    });
  } else {
    chrome.tabs.sendMessage(tab.id, { action: "stop" }, () => {
      setCollectingState(false);
      chrome.storage.local.set({ [YT_CONSTANTS.STORAGE_KEYS.COLLECTING]: false });
      showToast("Collection stopped", "info");
    });
  }
});

// Push directly to Studio Server
sendToStudioBtn.addEventListener("click", () => {
  chrome.storage.local.get([YT_CONSTANTS.STORAGE_KEYS.LINKS], async (res) => {
    const links = res[YT_CONSTANTS.STORAGE_KEYS.LINKS] || [];
    if (links.length === 0) return;

    sendToStudioBtn.disabled = true;
    studioSpinner.style.display = "inline-block";

    try {
      const response = await fetch(YT_CONSTANTS.STUDIO_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ links }),
      });
      const data = await response.json();
      showToast(`Pushed ${data.added} links to Studio! (Queue: ${data.total})`, "success");
    } catch (e) {
      showToast("Studio offline! Run start.bat to launch.", "error");
    } finally {
      sendToStudioBtn.disabled = false;
      studioSpinner.style.display = "none";
    }
  });
});

// Export JSON
exportJsonBtn.addEventListener("click", () => {
  chrome.storage.local.get([YT_CONSTANTS.STORAGE_KEYS.LINKS], (result) => {
    const links = result[YT_CONSTANTS.STORAGE_KEYS.LINKS] || [];
    const payload = {
      source: YT_CONSTANTS.EXPORT_SOURCE,
      exportedAt: new Date().toISOString(),
      totalLinks: links.length,
      links,
    };
    downloadFile(JSON.stringify(payload, null, 2), `yt-links-${Date.now()}.json`, "application/json");
    showToast(`Exported ${links.length} links as JSON`, "success");
  });
});

// Export TXT
exportTxtBtn.addEventListener("click", () => {
  chrome.storage.local.get([YT_CONSTANTS.STORAGE_KEYS.LINKS], (result) => {
    const links = result[YT_CONSTANTS.STORAGE_KEYS.LINKS] || [];
    downloadFile(links.join("\n") + "\n", `yt-links-${Date.now()}.txt`, "text/plain");
    showToast(`Exported ${links.length} links as TXT`, "success");
  });
});

// Copy all
copyBtn.addEventListener("click", () => {
  chrome.storage.local.get([YT_CONSTANTS.STORAGE_KEYS.LINKS], async (result) => {
    const links = result[YT_CONSTANTS.STORAGE_KEYS.LINKS] || [];
    if (links.length === 0) return;
    try {
      await navigator.clipboard.writeText(links.join("\n"));
      showToast(`Copied ${links.length} links!`, "success");
    } catch {
      showToast("Failed to copy", "error");
    }
  });
});

// Clear
clearBtn.addEventListener("click", () => {
  if (!confirm("Clear all collected links?")) return;
  chrome.storage.local.set({ [YT_CONSTANTS.STORAGE_KEYS.LINKS]: [] }, () => {
    updateUI(0);
    renderPreview([]);
    showToast("Queue cleared", "info");
  });
});
