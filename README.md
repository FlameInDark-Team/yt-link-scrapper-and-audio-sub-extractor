# YT Link Harvester — Download & Transcription Studio

A high-performance YouTube link harvester, batch audio/video downloader, and subtitle transcription suite. Built for speed, portability, and zero external web server dependencies (pure Python standard library).

---

## Key Features

### 1. Web Studio Interface
- **Queue Studio**: Bulk URL paste, search & instant filtering, deduplication, order reversing, and TXT/JSON import & export.
- **YouTube Playlist Unpacker**: Paste any YouTube Playlist, Channel, or Mix URL to unpack and extract all video links directly in the UI.
- **Media Engine**:
  - **Audio Extraction**: Native Best, MP3, M4A (AAC), WAV (Lossless), FLAC (Hi-Fi), and OPUS.
  - **Bitrate Presets**: 320 kbps (Extreme), 256 kbps (High), 192 kbps (Standard), 128 kbps (Compact).
  - **Video Mode**: Download high-definition MP4 streams up to 1080p / best available.
- **AI-Ready Clean Transcripts**: Automatically strips WebVTT/SRT timing cues, formatting tags, and rolling duplicate speech lines to generate clean, readable `_transcript.txt` files for reading or Whisper/LLM dataset training.
- **In-Browser Media Library & Player**: Browse downloaded tracks, listen with the built-in floating audio player, read transcripts in a dedicated reader modal, or open the folder in your operating system.
- **Real-Time Execution Terminal**: Live streaming console output with log filtering, progress bars, and completion chime notifications.

### 2. Chrome Extension (Manifest V3)
- Real-time DOM link scraper with debounced `MutationObserver`.
- Automatic YouTube URL normalization (strips tracking query strings like `&pp=...` to avoid duplicate downloads).
- Optional toggle to skip YouTube Shorts.
- **Direct Studio Bridge**: Click **"Send to Download Studio"** to push discovered links directly into the running local server without manually saving files.

### 3. Fully Self-Contained Portability
- **Zero Global Requirements**: The folder includes portable **Python 3.12**, **yt-dlp**, and **FFmpeg & FFprobe** directly in `python/` and `bin/`.
- **Windows**: Double-click `start.bat` to launch the Studio anywhere (e.g. from USB drive or unzipped folder) without installing Python or FFmpeg globally.
- **macOS & Linux**: Launch via `./start.sh` (falls back to system Python if portable package is Windows-specific).
- **Headless Terminal**: Run `downloads.bat` for standalone CLI batch processing using the local binaries.
- **Repair / Re-setup**: Run `setup_portable.bat` if you ever need to refresh or re-download the portable environment.

---

## Quick Start

### 1. Launching the Web Studio (Portable)

#### On Windows (Zero Install Needed):
Simply double-click `start.bat` or run in terminal:
```cmd
start.bat
```
`start.bat` automatically detects and uses:
- `python\python.exe` (Portable Python runtime)
- `bin\yt-dlp.exe` (Standalone YouTube downloader)
- `bin\ffmpeg.exe` (Full static FFmpeg build)

#### On Linux / macOS:
```bash
chmod +x start.sh
./start.sh
```

#### Manual Python Execution:
```bash
python\python.exe server.py --port 8765
```
The studio will launch at `http://127.0.0.1:8765` and open your default browser.

---

### 2. Installing the Chrome Extension

1. Open Google Chrome and navigate to `chrome://extensions`.
2. Toggle on **Developer mode** in the top-right corner.
3. Click **Load unpacked**.
4. Select the `Yt Scrapper extension` folder in this repository.
5. Navigate to YouTube, open the extension popup, and click **▶ Start Collecting**. Scroll through any feed, channel, or playlist.
6. Click **🚀 Send to Download Studio** to push all links to the server queue immediately.

---

### 3. Headless Batch Downloader

For automated terminal downloads without the web interface:
1. Place YouTube URLs in `links.txt` (one per line).
2. Run `downloads.bat` on Windows.
3. Files will be saved in `downloads/<video_title>/`.

---

## REST API Reference

The local server exposes the following endpoints (with full CORS support for browser extensions and external tools):

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/links` | Returns current links queue. |
| `POST` | `/api/links` | Append links to queue (`{"links": ["..."]}`). |
| `DELETE` | `/api/links` | Clear the queue or delete by index (`/api/links/<id>`). |
| `POST` | `/api/links/dedup` | Remove duplicate links from queue. |
| `POST` | `/api/expand-playlist` | Extract all video links from a YouTube playlist URL. |
| `GET` | `/api/config` | Retrieve current download configuration. |
| `POST` | `/api/config` | Update download configuration. |
| `GET` | `/api/status` | Real-time download progress, current item, and logs. |
| `POST` | `/api/download` | Start queue download worker. |
| `POST` | `/api/download-single`| Download a single video URL immediately. |
| `POST` | `/api/cancel` | Cancel active download process. |
| `GET` | `/api/library` | List all downloaded media and transcript items. |
| `GET` | `/api/media?path=...` | Stream downloaded audio/video file with byte-range support. |
| `GET` | `/api/transcript?path=...` | Read text transcript or subtitle file. |
| `POST` | `/api/open-folder` | Open destination directory in OS file manager. |
| `POST` | `/api/update-ytdlp` | Upgrade `yt-dlp` binary via pip. |

---

## Directory Structure

```
├── bin/                       # Portable standalone binaries (FFmpeg, FFprobe, yt-dlp)
├── python/                    # Self-contained embedded Python 3.12 runtime with pip & yt-dlp
├── Yt Scrapper extension/     # Manifest V3 Chrome Extension
│   ├── manifest.json          # Extension manifest & permissions
│   ├── constants.js           # Shared constants & studio API configuration
│   ├── content.js             # YouTube DOM observer & URL normalization
│   ├── popup.html             # Extension popup interface
│   ├── popup.js               # Extension controller & studio HTTP bridge
│   └── popup.css              # Obsidian dark theme stylesheet
├── ui/                        # Web Studio Frontend (Zero Dependencies)
│   ├── index.html             # Studio layout (Queue, Config, Library, Terminal)
│   ├── style.css              # Astra Obsidian design system
│   └── app.js                 # Frontend application controller
├── downloads.bat              # Standalone Windows batch downloader
├── links.txt                  # User links queue seed file
├── requirements.txt           # Python dependency specifications
├── server.py                  # Core server & download orchestrator
├── setup_portable.bat         # One-click portable environment installer & repair tool
├── start.bat                  # One-click Windows launcher (Portable Edition)
├── start.sh                   # One-click Linux / macOS launcher
└── .gitignore                 # Git ignore rules
```

---

## License

MIT License. See project source for details.
