/**
 * YT Link Harvester — Astra Studio Application Logic
 * Zero external client libraries — pure modern vanilla ES6+
 */

"use strict";

// --- API Helper ---
const API = {
  async get(path) {
    const res = await fetch(path);
    return res.json();
  },
  async post(path, data = {}) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return res.json();
  },
  async del(path) {
    const res = await fetch(path, { method: "DELETE" });
    return res.json();
  },
};

// --- DOM Cache ---
const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

// App State
const state = {
  links: [],
  filteredLinks: [],
  config: {},
  system: {},
  library: [],
  isDownloading: false,
  soundEnabled: true,
  logFilter: "all",
  logs: [],
};

// --- Audio Synthesis for Completion Chime ---
function playChime() {
  if (!state.soundEnabled) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.8);
  } catch (e) {
    // Audio context may require prior user interaction
  }
}

// --- Toast System ---
function showToast(message, type = "info") {
  const container = $("toastContainer");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  const icon = type === "success" ? "✓" : type === "error" ? "✗" : "ℹ";
  toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(30px)";
    toast.style.transition = "all 0.25s ease";
    setTimeout(() => toast.remove(), 260);
  }, 3400);
}

// --- Tab Switching ---
function initTabs() {
  $$(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-tab");
      $$(".tab-btn").forEach((b) => b.classList.remove("active"));
      $$(".tab-panel").forEach((p) => p.classList.remove("active"));

      btn.classList.add("active");
      const targetPanel = $(targetId);
      if (targetPanel) {
        targetPanel.classList.add("active");
      }

      if (targetId === "libraryTab") {
        loadLibrary();
      }
    });
  });

  // Sound toggle
  $("soundToggleBtn").addEventListener("click", () => {
    state.soundEnabled = !state.soundEnabled;
    $("soundIcon").textContent = state.soundEnabled ? "🔔" : "🔕";
    showToast(state.soundEnabled ? "Audio chimes enabled" : "Audio chimes muted");
  });

  // Top open folder
  $("openFolderTopBtn").addEventListener("click", openDownloadFolder);
}

// --- System Metrics ---
async function fetchSystemMetrics() {
  try {
    const sys = await API.get("/api/system");
    state.system = sys;

    // yt-dlp metric
    const ytdlpPill = $("ytdlpMetric");
    if (sys.ytdlp && sys.ytdlp.installed) {
      ytdlpPill.classList.remove("status-error");
      $("ytdlpVer").textContent = `v${sys.ytdlp.version}`;
    } else {
      ytdlpPill.classList.add("status-error");
      $("ytdlpVer").textContent = "Not Installed";
    }

    // ffmpeg metric
    const ffmpegPill = $("ffmpegMetric");
    if (sys.ffmpeg && sys.ffmpeg.installed) {
      ffmpegPill.classList.remove("status-error");
      $("ffmpegStatus").textContent = "Ready";
    } else {
      ffmpegPill.classList.add("status-error");
      $("ffmpegStatus").textContent = "Missing";
    }

    // disk free
    if (sys.disk_free_gb !== undefined) {
      $("diskFree").textContent = `${sys.disk_free_gb} GB Free`;
    }
  } catch (e) {
    $("ytdlpVer").textContent = "Offline";
  }
}

// --- Queue Studio Logic ---
async function loadQueue() {
  try {
    const data = await API.get("/api/links");
    state.links = data.links || [];
    filterAndRenderQueue();
  } catch (e) {
    showToast("Failed to fetch links queue", "error");
  }
}

function filterAndRenderQueue() {
  const query = ($("queueSearchInput").value || "").trim().toLowerCase();
  if (query) {
    state.filteredLinks = state.links.filter((l) => l.toLowerCase().includes(query));
  } else {
    state.filteredLinks = [...state.links];
  }

  const count = state.links.length;
  $("queueBadge").textContent = count;
  $("queueCountPill").textContent = `${count} Links`;
  $("statQueueTotal").textContent = count;

  const container = $("queueListContainer");
  const emptyState = $("queueEmptyState");

  if (state.links.length === 0) {
    container.innerHTML = "";
    container.appendChild(emptyState);
    emptyState.style.display = "flex";
    $("queueFilteredInfo").textContent = "Queue is empty";
    return;
  }

  emptyState.style.display = "none";
  container.innerHTML = "";

  if (state.filteredLinks.length === 0) {
    container.innerHTML = `<div class="empty-state"><h4>No matching links</h4><p>Try a different search term</p></div>`;
    $("queueFilteredInfo").textContent = `0 of ${count} matching`;
    return;
  }

  $("queueFilteredInfo").textContent = query ? `Showing ${state.filteredLinks.length} of ${count} links` : `Showing all ${count} links`;

  const fragment = document.createDocumentFragment();
  state.filteredLinks.forEach((url, idx) => {
    const realIndex = state.links.indexOf(url);
    const row = document.createElement("div");
    row.className = "queue-row";

    // Clean display url
    let displayUrl = url;
    try {
      const u = new URL(url);
      displayUrl = u.hostname + u.pathname + u.search;
    } catch (_) {}

    row.innerHTML = `
      <div class="q-left">
        <span class="q-index">#${realIndex + 1}</span>
        <a href="${url}" target="_blank" rel="noopener" class="q-url" title="${url}">${displayUrl}</a>
      </div>
      <div class="q-actions">
        <button class="q-btn download-one" title="Download this video now" data-url="${url}">⬇</button>
        <button class="q-btn delete" title="Remove link" data-index="${realIndex}">✕</button>
      </div>
    `;

    fragment.appendChild(row);
  });

  container.appendChild(fragment);

  // Bind row actions
  container.querySelectorAll(".q-btn.delete").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const index = parseInt(e.currentTarget.getAttribute("data-index"), 10);
      await deleteLink(index);
    });
  });

  container.querySelectorAll(".q-btn.download-one").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const url = e.currentTarget.getAttribute("data-url");
      await downloadSingle(url);
    });
  });
}

async function addRawLinks() {
  const text = $("rawLinksInput").value.trim();
  if (!text) {
    showToast("Please paste at least one URL", "error");
    return;
  }

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.startsWith("http"));
  if (lines.length === 0) {
    showToast("No valid HTTP/HTTPS URLs detected", "error");
    return;
  }

  try {
    const res = await API.post("/api/links", { links: lines });
    $("rawLinksInput").value = "";
    showToast(`Added ${res.added} new links (Total: ${res.total})`, "success");
    await loadQueue();
  } catch (e) {
    showToast("Failed to add links", "error");
  }
}

async function unpackPlaylist() {
  const url = $("playlistUrlInput").value.trim();
  if (!url) {
    showToast("Please enter a playlist or channel URL", "error");
    return;
  }

  const spinner = $("unpackSpinner");
  const btn = $("unpackPlaylistBtn");
  spinner.style.display = "inline-block";
  btn.disabled = true;

  try {
    showToast("Querying playlist structure with yt-dlp…");
    const res = await API.post("/api/expand-playlist", { url });
    if (res.error) {
      showToast(res.error, "error");
    } else {
      $("playlistUrlInput").value = "";
      showToast(`Playlist unpacked: Found ${res.found} videos, added ${res.added}!`, "success");
      await loadQueue();
    }
  } catch (e) {
    showToast("Failed to unpack playlist: " + e.message, "error");
  } finally {
    spinner.style.display = "none";
    btn.disabled = false;
  }
}

async function deleteLink(index) {
  try {
    await API.del(`/api/links/${index}`);
    await loadQueue();
  } catch (e) {
    showToast("Failed to delete link", "error");
  }
}

async function clearAllQueue() {
  if (!confirm("Are you sure you want to clear the entire queue?")) return;
  try {
    await API.del("/api/links");
    showToast("Queue cleared", "info");
    await loadQueue();
  } catch (e) {
    showToast("Failed to clear queue", "error");
  }
}

async function deduplicateQueue() {
  try {
    const res = await API.post("/api/links/dedup");
    showToast(`Removed ${res.removed} duplicates (${res.total} remaining)`, "success");
    await loadQueue();
  } catch (e) {
    showToast("Deduplication failed", "error");
  }
}

async function reverseQueue() {
  try {
    const res = await API.post("/api/links/reverse");
    showToast("Queue order reversed", "info");
    await loadQueue();
  } catch (e) {
    showToast("Reverse failed", "error");
  }
}

function exportQueueTxt() {
  if (state.links.length === 0) {
    showToast("Queue is empty", "error");
    return;
  }
  const blob = new Blob([state.links.join("\n") + "\n"], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `yt_links_${Date.now()}.txt`;
  a.click();
  showToast("Queue exported as TXT", "success");
}

function exportQueueJson() {
  if (state.links.length === 0) {
    showToast("Queue is empty", "error");
    return;
  }
  const blob = new Blob([JSON.stringify({ links: state.links, exported_at: new Date().toISOString() }, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `yt_links_${Date.now()}.json`;
  a.click();
  showToast("Queue exported as JSON", "success");
}

function initQueueControls() {
  $("addLinksBtn").addEventListener("click", addRawLinks);

  // Ingest mode tabs
  $("modeUrlsBtn").addEventListener("click", () => {
    $("modeUrlsBtn").classList.add("active");
    $("modePlaylistBtn").classList.remove("active");
    $("sectionPaste").style.display = "block";
    $("sectionPlaylist").style.display = "none";
  });

  $("modePlaylistBtn").addEventListener("click", () => {
    $("modePlaylistBtn").classList.add("active");
    $("modeUrlsBtn").classList.remove("active");
    $("sectionPaste").style.display = "none";
    $("sectionPlaylist").style.display = "block";
  });

  $("unpackPlaylistBtn").addEventListener("click", unpackPlaylist);
  $("dedupBtn").addEventListener("click", deduplicateQueue);
  $("reverseBtn").addEventListener("click", reverseQueue);
  $("exportTxtBtn").addEventListener("click", exportQueueTxt);
  $("exportJsonBtn").addEventListener("click", exportQueueJson);
  $("clearAllQueueBtn").addEventListener("click", clearAllQueue);

  // Search filter
  $("queueSearchInput").addEventListener("input", filterAndRenderQueue);

  // File import
  $("fileImportInput").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const content = evt.target.result;
      let urls = [];
      if (file.name.endsWith(".json")) {
        try {
          const parsed = JSON.parse(content);
          urls = Array.isArray(parsed) ? parsed : parsed.links || [];
        } catch (_) {}
      } else {
        urls = content.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.startsWith("http"));
      }

      if (urls.length > 0) {
        const res = await API.post("/api/links", { links: urls });
        showToast(`Imported ${res.added} links from ${file.name}`, "success");
        await loadQueue();
      } else {
        showToast("No valid URLs found in file", "error");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  });

  // Batch download trigger from Queue tab
  $("startBatchFromQueueBtn").addEventListener("click", () => {
    // Switch to Terminal tab and start download
    const terminalTabBtn = document.querySelector('[data-tab="terminalTab"]');
    if (terminalTabBtn) terminalTabBtn.click();
    startDownload();
  });
}

// --- Configuration Studio Logic ---
async function loadConfig() {
  try {
    const cfg = await API.get("/api/config");
    state.config = cfg;

    // Media mode
    const mode = cfg.media_type || "audio";
    setMediaMode(mode);

    // Audio format
    const audioFmt = cfg.audio_format || "best";
    $$("#audioFormatGrid .chip-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-val") === audioFmt);
    });

    // Audio quality
    const audioQ = cfg.audio_quality || "192k";
    $$("#audioQualityGrid .chip-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-val") === audioQ);
    });

    // Video res
    const videoRes = cfg.video_resolution || "best";
    $$("#videoResGrid .chip-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-val") === videoRes);
    });

    // Subtitles
    $("subLangConfigInput").value = cfg.sub_lang || "bn,bn-BD,bn-IN,en,.*";
    $("cleanTranscriptToggle").checked = cfg.clean_transcript !== false;
    $("outputDirConfigInput").value = cfg.output_dir || "";
  } catch (e) {
    showToast("Failed to load settings", "error");
  }
}

function setMediaMode(mode) {
  state.config.media_type = mode;
  if (mode === "audio") {
    $("modeCardAudio").classList.add("active");
    $("modeCardVideo").classList.remove("active");
    $("audioFormatRow").style.display = "block";
    $("audioQualityRow").style.display = "block";
    $("videoResRow").style.display = "none";
  } else {
    $("modeCardVideo").classList.add("active");
    $("modeCardAudio").classList.remove("active");
    $("audioFormatRow").style.display = "none";
    $("audioQualityRow").style.display = "none";
    $("videoResRow").style.display = "block";
  }
}

async function saveConfig() {
  const activeAudioFmt = document.querySelector("#audioFormatGrid .chip-btn.active")?.getAttribute("data-val") || "best";
  const activeAudioQ = document.querySelector("#audioQualityGrid .chip-btn.active")?.getAttribute("data-val") || "192k";
  const activeVideoRes = document.querySelector("#videoResGrid .chip-btn.active")?.getAttribute("data-val") || "best";

  const payload = {
    media_type: state.config.media_type || "audio",
    audio_format: activeAudioFmt,
    audio_quality: activeAudioQ,
    video_resolution: activeVideoRes,
    sub_lang: $("subLangConfigInput").value.trim(),
    clean_transcript: $("cleanTranscriptToggle").checked,
    output_dir: $("outputDirConfigInput").value.trim(),
  };

  try {
    const saved = await API.post("/api/config", payload);
    state.config = saved;
    showToast("Configuration saved successfully", "success");
    await fetchSystemMetrics();
  } catch (e) {
    showToast("Failed to save configuration", "error");
  }
}

function initConfigControls() {
  $("modeCardAudio").addEventListener("click", () => setMediaMode("audio"));
  $("modeCardVideo").addEventListener("click", () => setMediaMode("video"));

  // Chip buttons select handlers
  const bindChips = (containerId) => {
    $$(containerId + " .chip-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        $$(containerId + " .chip-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
      });
    });
  };

  bindChips("#audioFormatGrid");
  bindChips("#audioQualityGrid");
  bindChips("#videoResGrid");

  // Quick lang pills
  $$(".pill-btn").forEach((pill) => {
    pill.addEventListener("click", () => {
      $("subLangConfigInput").value = pill.getAttribute("data-lang");
    });
  });

  $("saveConfigBtn").addEventListener("click", saveConfig);
  $("openFolderFromConfigBtn").addEventListener("click", openDownloadFolder);

  // Update yt-dlp button
  $("updateYtdlpBtn").addEventListener("click", async () => {
    const spinner = $("updateSpinner");
    spinner.style.display = "inline-block";
    showToast("Checking and updating yt-dlp via pip…");
    try {
      const res = await API.post("/api/update-ytdlp");
      if (res.success) {
        showToast("yt-dlp is up to date!", "success");
        await fetchSystemMetrics();
      } else {
        showToast("Update output: " + (res.output || "Error"), "warn");
      }
    } catch (e) {
      showToast("Update failed: " + e.message, "error");
    } finally {
      spinner.style.display = "none";
    }
  });
}

// --- Media Library Logic ---
async function loadLibrary() {
  try {
    const data = await API.get("/api/library");
    state.library = data.items || [];
    renderLibrary();
  } catch (e) {
    showToast("Failed to fetch library", "error");
  }
}

function renderLibrary() {
  const container = $("libraryGrid");
  const count = state.library.length;
  $("libraryBadge").textContent = count;
  $("libraryCountPill").textContent = `${count} Items`;

  if (count === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">🎵</span>
        <h4>No Downloads Yet</h4>
        <p>Completed extractions will appear here for playback and transcript reading.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = "";
  state.library.forEach((item) => {
    const card = document.createElement("div");
    card.className = "library-card";

    // Badges
    let badgesHtml = "";
    if (item.media_files && item.media_files.length > 0) {
      const isVideo = item.media_files.some((f) => f.type === "video");
      badgesHtml += `<span class="badge-tag ${isVideo ? "video" : "audio"}">${isVideo ? "🎬 Video" : "🎵 Audio"}</span>`;
    }
    if (item.sub_files && item.sub_files.length > 0) {
      badgesHtml += `<span class="badge-tag sub">📝 Subtitles (${item.sub_files.length})</span>`;
    }
    if (item.transcript_files && item.transcript_files.length > 0) {
      badgesHtml += `<span class="badge-tag transcript">⚡ Clean Transcript</span>`;
    }
    badgesHtml += `<span class="badge-tag">${item.total_size_mb} MB</span>`;

    // Action buttons
    const primaryMedia = item.media_files && item.media_files[0];
    const primaryTranscript = (item.transcript_files && item.transcript_files[0]) || (item.sub_files && item.sub_files[0]);

    card.innerHTML = `
      <div class="lc-title" title="${item.title}">${item.title}</div>
      <div class="lc-badges">${badgesHtml}</div>
      <div class="lc-actions">
        <div class="action-left">
          ${
            primaryMedia
              ? `<button class="btn btn-primary btn-sm play-audio-btn" data-path="${primaryMedia.path}" data-title="${item.title}">
                  <span>▶</span> Play
                </button>`
              : ""
          }
          ${
            primaryTranscript
              ? `<button class="btn btn-glass btn-sm read-transcript-btn" data-path="${primaryTranscript.path}" data-title="${item.title}">
                  <span>📖</span> Transcript
                </button>`
              : ""
          }
        </div>
        <div class="action-right">
          <button class="btn btn-danger-ghost btn-sm delete-item-btn" data-folder="${item.folder}" title="Delete downloaded files">
            🗑
          </button>
        </div>
      </div>
    `;

    container.appendChild(card);
  });

  // Bind library item actions
  container.querySelectorAll(".play-audio-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const path = e.currentTarget.getAttribute("data-path");
      const title = e.currentTarget.getAttribute("data-title");
      playMediaStream(path, title);
    });
  });

  container.querySelectorAll(".read-transcript-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const path = e.currentTarget.getAttribute("data-path");
      const title = e.currentTarget.getAttribute("data-title");
      await openTranscriptModal(path, title);
    });
  });

  container.querySelectorAll(".delete-item-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const folder = e.currentTarget.getAttribute("data-folder");
      if (!confirm(`Delete all downloaded files for:\n"${folder}"?`)) return;
      try {
        await API.del(`/api/library?folder=${encodeURIComponent(folder)}`);
        showToast("Item deleted", "info");
        await loadLibrary();
      } catch (err) {
        showToast("Failed to delete item", "error");
      }
    });
  });
}

function initLibraryControls() {
  $("refreshLibraryBtn").addEventListener("click", loadLibrary);
  $("openFolderLibraryBtn").addEventListener("click", openDownloadFolder);
}

// --- Audio Player Logic ---
function playMediaStream(relPath, title) {
  const audio = $("globalAudioPlayer");
  const bar = $("stickyPlayerBar");
  $("playerTitle").textContent = title || "Audio Track";
  $("playerSubtitle").textContent = relPath.split("/").pop();

  audio.src = `/api/media?path=${encodeURIComponent(relPath)}`;
  bar.style.display = "flex";
  audio.play().catch(() => {});
  $("playerPlayPauseBtn").textContent = "⏸";

  // Player controls
  $("playerPlayPauseBtn").onclick = () => {
    if (audio.paused) {
      audio.play();
      $("playerPlayPauseBtn").textContent = "⏸";
    } else {
      audio.pause();
      $("playerPlayPauseBtn").textContent = "▶";
    }
  };

  audio.ontimeupdate = () => {
    const cur = audio.currentTime || 0;
    const dur = audio.duration || 0;
    $("playerCurrentTime").textContent = formatTime(cur);
    $("playerDuration").textContent = formatTime(dur);
    if (dur > 0) {
      $("playerSeeker").value = (cur / dur) * 100;
    }
  };

  $("playerSeeker").oninput = (e) => {
    const dur = audio.duration || 0;
    if (dur > 0) {
      audio.currentTime = (e.target.value / 100) * dur;
    }
  };

  $("playerCloseBtn").onclick = () => {
    audio.pause();
    bar.style.display = "none";
  };
}

function formatTime(secs) {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

// --- Transcript Modal Reader ---
async function openTranscriptModal(relPath, title) {
  const modal = $("transcriptModal");
  $("transcriptModalTitle").textContent = title || "Transcript";
  $("transcriptModalMeta").textContent = relPath.split("/").pop();
  $("transcriptModalText").textContent = "Loading transcript text…";
  modal.style.display = "flex";

  try {
    const res = await API.get(`/api/transcript?path=${encodeURIComponent(relPath)}`);
    if (res.content) {
      const wordCount = res.content.trim().split(/\s+/).length;
      $("transcriptModalMeta").textContent = `${relPath.split("/").pop()} • ${wordCount.toLocaleString()} words`;
      $("transcriptModalText").textContent = res.content;
    } else {
      $("transcriptModalText").textContent = "No text content found.";
    }
  } catch (e) {
    $("transcriptModalText").textContent = "Failed to load transcript file.";
  }

  $("closeTranscriptModalBtn").onclick = () => {
    modal.style.display = "none";
  };

  $("copyTranscriptBtn").onclick = () => {
    const text = $("transcriptModalText").textContent;
    navigator.clipboard.writeText(text);
    showToast("Transcript copied to clipboard!", "success");
  };
}

// --- Open Folder Utility ---
async function openDownloadFolder() {
  try {
    const res = await API.post("/api/open-folder");
    if (res.status === "opened") {
      showToast("Opened destination folder in OS", "success");
    } else {
      showToast(res.error || "Could not open folder", "error");
    }
  } catch (e) {
    showToast("Failed to open folder", "error");
  }
}

// --- Download Execution & Real-Time Terminal ---
async function startDownload() {
  if (state.links.length === 0) {
    showToast("Queue is empty. Add URLs first!", "error");
    return;
  }

  try {
    const res = await API.post("/api/download");
    if (res.error) {
      showToast(res.error, "error");
      return;
    }
    showToast("Batch download started!", "success");
    state.isDownloading = true;
    updateTerminalUI(true);
  } catch (e) {
    showToast("Failed to start download: " + e.message, "error");
  }
}

async function downloadSingle(url) {
  try {
    showToast(`Downloading: ${url}`);
    const res = await API.post("/api/download-single", { url });
    // Switch to terminal tab
    const tabBtn = document.querySelector('[data-tab="terminalTab"]');
    if (tabBtn) tabBtn.click();
    updateTerminalUI(true);
  } catch (e) {
    showToast("Failed to trigger download", "error");
  }
}

async function cancelDownload() {
  try {
    await API.post("/api/cancel");
    showToast("Cancellation signal sent", "warn");
  } catch (e) {
    showToast("Failed to send cancel", "error");
  }
}

function updateTerminalUI(isRunning) {
  state.isDownloading = isRunning;
  const liveBadge = $("terminalLiveBadge");
  const orb = $("engineStatusOrb");
  const title = $("engineStatusTitle");
  const subtitle = $("engineStatusSubtitle");
  const startBtn = $("terminalStartDownloadBtn");
  const cancelBtn = $("terminalCancelDownloadBtn");
  const taskBox = $("currentTaskBox");

  if (isRunning) {
    liveBadge.style.display = "inline-block";
    orb.className = "status-indicator-orb running";
    title.textContent = "Engine Active";
    subtitle.textContent = "Processing queue links with yt-dlp & ffmpeg";
    startBtn.style.display = "none";
    cancelBtn.style.display = "inline-flex";
    taskBox.style.display = "flex";
  } else {
    liveBadge.style.display = "none";
    orb.className = "status-indicator-orb";
    title.textContent = "Engine Idle";
    subtitle.textContent = "Ready to process queue";
    startBtn.style.display = "inline-flex";
    cancelBtn.style.display = "none";
    taskBox.style.display = "none";
  }
}

// --- Terminal Polling Loop ---
let lastProgressLen = 0;
async function pollStatus() {
  try {
    const status = await API.get("/api/status");
    const wasRunning = state.isDownloading;
    const isNowRunning = status.running;

    updateTerminalUI(isNowRunning);

    // Update numbers
    const comp = status.completed || 0;
    const fail = status.failed || 0;
    const total = status.total || state.links.length;
    $("statQueueCompleted").textContent = comp;
    $("statQueueFailed").textContent = fail;
    $("statQueueTotal").textContent = total;

    const percent = total > 0 ? Math.round(((comp + fail) / total) * 100) : 0;
    $("statQueuePercent").textContent = `${percent}%`;
    $("heroProgressFill").style.width = `${percent}%`;

    // Current task
    if (status.current_url) {
      $("currentTaskTitle").textContent = status.current_title || "Fetching video info…";
      $("currentTaskUrl").textContent = status.current_url;
    }

    // Terminal log entries
    if (status.progress && status.progress.length > 0) {
      state.logs = status.progress;
      renderLogs();
    }

    // Completion detection
    if (wasRunning && !isNowRunning) {
      playChime();
      showToast(`Batch complete: ${comp} succeeded, ${fail} failed.`, fail === 0 ? "success" : "warn");
      loadLibrary(); // refresh library
    }
  } catch (e) {
    // server momentarily unreachable
  }
}

function renderLogs() {
  const windowEl = $("terminalWindow");
  const filter = state.logFilter;

  const filtered = state.logs.filter((entry) => {
    if (filter === "all") return true;
    return entry.level === filter;
  });

  windowEl.innerHTML = "";
  filtered.forEach((entry) => {
    const line = document.createElement("div");
    line.className = `t-line t-${entry.level || "info"}`;
    line.innerHTML = `
      <span class="t-time">${entry.time || "--:--:--"}</span>
      <span class="t-msg">${entry.message}</span>
    `;
    windowEl.appendChild(line);
  });

  windowEl.scrollTop = windowEl.scrollHeight;
}

function initTerminalControls() {
  $("terminalStartDownloadBtn").addEventListener("click", startDownload);
  $("terminalCancelDownloadBtn").addEventListener("click", cancelDownload);

  // Filter chips
  $$(".filter-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      $$(".filter-chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      state.logFilter = chip.getAttribute("data-filter");
      renderLogs();
    });
  });

  $("copyLogsBtn").addEventListener("click", () => {
    const text = state.logs.map((l) => `[${l.time}] ${l.message}`).join("\n");
    navigator.clipboard.writeText(text);
    showToast("Terminal logs copied", "success");
  });

  $("clearLogsBtn").addEventListener("click", () => {
    state.logs = [];
    $("terminalWindow").innerHTML = `<div class="t-line t-info"><span class="t-time">--:--:--</span><span class="t-msg">Logs cleared</span></div>`;
  });

  // Bridge ping test
  $("testBridgePingBtn").addEventListener("click", async () => {
    try {
      const res = await API.post("/api/links", {
        links: ["https://www.youtube.com/watch?v=dQw4w9WgXcQ"],
      });
      showToast(`Bridge test successful! Link added to queue (Total: ${res.total})`, "success");
      await loadQueue();
    } catch (e) {
      showToast("Bridge test failed: " + e.message, "error");
    }
  });
}

// --- App Bootstrap ---
async function bootstrap() {
  initTabs();
  initQueueControls();
  initConfigControls();
  initLibraryControls();
  initTerminalControls();

  await fetchSystemMetrics();
  await loadConfig();
  await loadQueue();
  await loadLibrary();

  // Status polling interval
  setInterval(pollStatus, 1500);
  setInterval(fetchSystemMetrics, 12000);
}

document.addEventListener("DOMContentLoaded", bootstrap);
