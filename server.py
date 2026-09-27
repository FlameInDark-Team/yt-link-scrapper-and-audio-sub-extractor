"""
YT Link Harvester — Core Web Server & Orchestration Engine
Provides REST API, media streaming, subtitle processing, and yt-dlp execution.
Runs with Python standard library only (zero external pip server dependencies).
"""

import argparse
import http.server
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import urllib.parse
import webbrowser
from pathlib import Path

# --- Constants & Paths ---
DEFAULT_PORT = 8765
DEFAULT_HOST = "127.0.0.1"
BASE_DIR = Path(__file__).resolve().parent
BIN_DIR = BASE_DIR / "bin"
PYTHON_DIR = BASE_DIR / "python"
LINKS_FILE = BASE_DIR / "links.txt"
CONFIG_FILE = BASE_DIR / "config.json"
UI_DIR = BASE_DIR / "ui"

# Ensure portable tools and python directories are in PATH for subprocesses
for _p in (BIN_DIR, PYTHON_DIR / "Scripts", PYTHON_DIR):
    if _p.exists():
        _p_str = str(_p)
        if _p_str not in os.environ.get("PATH", "").split(os.pathsep):
            os.environ["PATH"] = _p_str + os.pathsep + os.environ.get("PATH", "")

# --- Global Download State ---
download_state = {
    "running": False,
    "current_url": "",
    "current_title": "",
    "completed": 0,
    "failed": 0,
    "total": 0,
    "cancelled": False,
    "progress": [],
}
download_lock = threading.Lock()
download_thread = None
active_subprocess = None


def get_ytdlp_cmd():
    """Detect yt-dlp command across local bin, portable python scripts, PATH, user scripts, and python module."""
    # 1. Local bin folder check (portable bundle)
    for name in ("yt-dlp.exe", "yt-dlp", "ytdlp.exe", "ytdlp"):
        local_bin = BIN_DIR / name
        if local_bin.exists():
            return [str(local_bin)]

    # 2. Local portable python Scripts check
    local_py_script = PYTHON_DIR / "Scripts" / "yt-dlp.exe"
    if local_py_script.exists():
        return [str(local_py_script)]

    # 3. Check system PATH
    if shutil.which("yt-dlp"):
        return ["yt-dlp"]

    # 4. Windows user scripts directory check
    appdata = os.environ.get("APPDATA", "")
    if appdata:
        py_ver = f"Python{sys.version_info.major}{sys.version_info.minor}"
        user_script = Path(appdata) / "Python" / py_ver / "Scripts" / "yt-dlp.exe"
        if user_script.exists():
            return [str(user_script)]

    # 5. Linux / macOS local bin check
    home = Path.home()
    local_bin = home / ".local" / "bin" / "yt-dlp"
    if local_bin.exists():
        return [str(local_bin)]

    # 6. Fallback to python -m yt_dlp
    try:
        import yt_dlp  # noqa: F401
        return [sys.executable, "-m", "yt_dlp"]
    except ImportError:
        return ["yt-dlp"]


def get_ffmpeg_info():
    """Check FFmpeg availability and path."""
    # 1. Local bin folder check (portable bundle)
    for name in ("ffmpeg.exe", "ffmpeg"):
        local_ffmpeg = BIN_DIR / name
        if local_ffmpeg.exists():
            return {"installed": True, "path": str(local_ffmpeg)}

    # 2. System PATH
    ffmpeg_path = shutil.which("ffmpeg")
    if ffmpeg_path:
        return {"installed": True, "path": ffmpeg_path}

    # 3. Common Windows install locations
    for candidate in [
        r"C:\ffmpeg\bin\ffmpeg.exe",
        r"C:\ffmpeg-2026-01-14\bin\ffmpeg.exe",
    ]:
        if Path(candidate).exists():
            return {"installed": True, "path": candidate}

    return {"installed": False, "path": None}


def get_disk_free_gb(path):
    """Return free disk space in GB for given path or base directory."""
    check_target = Path(path)
    if not check_target.exists():
        check_target = BASE_DIR
    try:
        usage = shutil.disk_usage(str(check_target))
        return round(usage.free / (1024 ** 3), 1)
    except Exception:
        return 0.0


def load_config():
    """Load configuration with safe fallbacks."""
    defaults = {
        "output_dir": str(BASE_DIR / "downloads"),
        "media_type": "audio",              # "audio" or "video"
        "audio_format": "best",             # "best", "mp3", "m4a", "wav", "flac", "opus"
        "audio_quality": "192k",            # "320k", "256k", "192k", "128k"
        "video_resolution": "best",         # "best", "1080p", "720p", "480p"
        "sub_lang": "bn,bn-BD,bn-IN,en,.*",
        "sub_format": "vtt",
        "clean_transcript": True,
        "embed_metadata": True,
    }
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                saved = json.load(f)
                defaults.update(saved)
        except Exception:
            pass
    return defaults


def save_config(config):
    """Write configuration to disk."""
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2)


def load_links():
    """Read links.txt, excluding empty lines and comments."""
    if not LINKS_FILE.exists():
        return []
    with open(LINKS_FILE, "r", encoding="utf-8") as f:
        lines = f.read().splitlines()
    return [l.strip() for l in lines if l.strip() and not l.strip().startswith("#")]


def save_links(links):
    """Save links list to links.txt."""
    with open(LINKS_FILE, "w", encoding="utf-8") as f:
        f.write("\n".join(links) + ("\n" if links else ""))


def log_progress(message, level="info"):
    """Append structured message to global progress log."""
    with download_lock:
        entry = {
            "time": time.strftime("%H:%M:%S"),
            "message": message,
            "level": level,
        }
        download_state["progress"].append(entry)
        if len(download_state["progress"]) > 600:
            download_state["progress"] = download_state["progress"][-600:]


def clean_vtt_subtitles(vtt_content):
    """
    Parse WebVTT content and generate clean continuous readable transcript.
    Removes timestamp cues, HTML styling tags, and rolling duplicate speech lines.
    """
    lines = vtt_content.splitlines()
    cleaned_tokens = []
    prev_line = ""

    for raw_line in lines:
        line = raw_line.strip()
        if not line:
            continue
        if line.startswith("WEBVTT") or line.startswith("Kind:") or line.startswith("Language:"):
            continue
        if "-->" in line:
            continue
        if re.match(r"^\d+$", line):
            continue

        # Strip inline timestamps like <00:00:01.680> and formatting tags
        line = re.sub(r"<[^>]+>", "", line).strip()
        if not line:
            continue

        # YouTube rolling auto-captions frequently repeat or append partial phrases
        if line == prev_line or (prev_line and line in prev_line):
            continue
        if prev_line and prev_line in line:
            if cleaned_tokens:
                cleaned_tokens.pop()

        cleaned_tokens.append(line)
        prev_line = line

    return " ".join(cleaned_tokens)


def generate_transcripts_in_dir(target_dir):
    """Scan directory for subtitle files (.vtt, .srt) and generate clean text transcripts."""
    target_path = Path(target_dir)
    if not target_path.exists():
        return 0

    created_count = 0
    for sub_file in target_path.glob("*.vtt"):
        # Skip if already a transcript or non-caption
        transcript_file = sub_file.with_name(f"{sub_file.stem}_transcript.txt")
        if transcript_file.exists():
            continue
        try:
            with open(sub_file, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()
            cleaned = clean_vtt_subtitles(content)
            if cleaned.strip():
                with open(transcript_file, "w", encoding="utf-8") as f:
                    f.write(cleaned)
                created_count += 1
        except Exception:
            pass

    return created_count


def run_process_safe(cmd, timeout=360):
    """Execute command with cross-platform window hiding and timeout handling."""
    global active_subprocess
    creation_flags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0

    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            creationflags=creation_flags,
        )
        with download_lock:
            active_subprocess = proc

        stdout, stderr = proc.communicate(timeout=timeout)
        return proc.returncode, stdout, stderr
    except subprocess.TimeoutExpired:
        if proc:
            proc.kill()
        return -1, "", "Process timed out"
    except FileNotFoundError:
        return -2, "", "Executable not found"
    except Exception as e:
        return -3, "", str(e)
    finally:
        with download_lock:
            active_subprocess = None


def download_single_item(url, config, index=None, total_count=None):
    """Process a single YouTube video: download audio/video and subtitles."""
    output_dir = config.get("output_dir", str(BASE_DIR / "downloads"))
    media_type = config.get("media_type", "audio")
    audio_format = config.get("audio_format", "best")
    audio_quality = config.get("audio_quality", "192k")
    video_res = config.get("video_resolution", "best")
    sub_lang = config.get("sub_lang", "bn,bn-BD,bn-IN,en,.*")
    clean_transcript = config.get("clean_transcript", True)

    os.makedirs(output_dir, exist_ok=True)
    ytdlp = get_ytdlp_cmd()

    # Pass --ffmpeg-location if ffmpeg is available
    ffmpeg_info = get_ffmpeg_info()
    ffmpeg_args = []
    if ffmpeg_info.get("installed") and ffmpeg_info.get("path"):
        ffmpeg_bin_dir = str(Path(ffmpeg_info["path"]).parent)
        ffmpeg_args = ["--ffmpeg-location", ffmpeg_bin_dir]

    prefix = f"[{index}/{total_count}] " if index and total_count else ""
    log_progress(f"{prefix}Processing: {url}")

    # Step 0: Fetch title
    title_cmd = ytdlp + ["--print", "%(title)s", "--no-warnings", url]
    code, stdout, _ = run_process_safe(title_cmd, timeout=30)
    title = stdout.strip() if code == 0 and stdout.strip() else ""
    if title:
        with download_lock:
            download_state["current_title"] = title
        log_progress(f"  Title: {title}")

    # Folder template for output
    output_template = os.path.join(output_dir, "%(title)s", "%(title)s.%(ext)s")

    # Step 1: Download Media (Audio or Video)
    if media_type == "video":
        log_progress("  ↳ Downloading video...")
        if video_res == "best":
            format_str = "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best"
        elif video_res == "1080p":
            format_str = "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080]"
        elif video_res == "720p":
            format_str = "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720]"
        else:
            format_str = "bestvideo[height<=480]+bestaudio/best[height<=480]"

        cmd_media = ytdlp + ffmpeg_args + [
            "-f", format_str,
            "--no-warnings",
            "-o", output_template,
            url
        ]
    else:
        log_progress("  ↳ Extracting audio...")
        cmd_media = ytdlp + ffmpeg_args + [
            "-x",
            "--no-warnings",
            "-o", output_template,
        ]
        if audio_format != "best":
            cmd_media.extend(["--audio-format", audio_format])
        if audio_quality:
            cmd_media.extend(["--audio-quality", audio_quality])
        cmd_media.append(url)

    code, _, stderr = run_process_safe(cmd_media, timeout=600)
    if code == 0:
        log_progress(f"  ✓ Media extracted successfully", "success")
    elif code == -2:
        log_progress("  ✗ yt-dlp was not found on system.", "error")
        return False
    else:
        err_msg = stderr.strip()[:180] if stderr else "Download error"
        log_progress(f"  ✗ Media failed: {err_msg}", "error")
        return False

    # Step 2: Download Subtitles
    log_progress(f"  ↳ Fetching subtitles ({sub_lang})...")
    cmd_subs = ytdlp + ffmpeg_args + [
        "--skip-download",
        "--write-subs",
        "--write-auto-subs",
        "--sub-lang", sub_lang,
        "--no-warnings",
        "-o", output_template,
        url
    ]
    sub_code, _, _ = run_process_safe(cmd_subs, timeout=120)
    if sub_code == 0:
        log_progress("  ✓ Subtitles saved", "success")
    else:
        log_progress("  ⚠ No subtitles found for specified languages", "warn")

    # Step 3: Generate Clean Plain-Text Transcripts
    if clean_transcript:
        item_folder = os.path.join(output_dir, title) if title else output_dir
        if os.path.exists(item_folder):
            created = generate_transcripts_in_dir(item_folder)
            if created > 0:
                log_progress(f"  ✓ Clean transcript generated ({created} file)", "success")

    return True


def run_download_queue():
    """Worker thread processing all links sequentially."""
    global active_subprocess
    config = load_config()
    links = load_links()

    with download_lock:
        download_state["running"] = True
        download_state["progress"] = []
        download_state["completed"] = 0
        download_state["failed"] = 0
        download_state["total"] = len(links)
        download_state["cancelled"] = False
        download_state["current_url"] = ""
        download_state["current_title"] = ""

    log_progress(f"Starting batch download for {len(links)} links...")
    log_progress(f"Mode: {config.get('media_type', 'audio').upper()} | Output: {config.get('output_dir')}")

    for idx, url in enumerate(links, 1):
        with download_lock:
            if download_state["cancelled"]:
                log_progress("Batch download was cancelled by user.", "warn")
                break
            download_state["current_url"] = url

        success = download_single_item(url, config, index=idx, total_count=len(links))

        with download_lock:
            if success:
                download_state["completed"] += 1
            else:
                download_state["failed"] += 1

    with download_lock:
        download_state["running"] = False
        download_state["current_url"] = ""
        download_state["current_title"] = ""

    comp = download_state["completed"]
    fail = download_state["failed"]
    log_progress(f"Queue complete: {comp} succeeded, {fail} failed.", "success" if fail == 0 else "warn")


def scan_library(output_dir):
    """Scan downloads directory and return structured list of completed items."""
    out_path = Path(output_dir)
    if not out_path.exists():
        return []

    items = []
    # Check subfolders (each video typically gets a folder)
    subfolders = [p for p in out_path.iterdir() if p.is_dir()]
    for folder in sorted(subfolders, key=lambda p: p.stat().st_mtime, reverse=True):
        media_files = []
        sub_files = []
        transcript_files = []
        total_size = 0

        for file in folder.iterdir():
            if not file.is_file():
                continue
            size = file.stat().st_size
            total_size += size
            ext = file.suffix.lower()

            rel_file_path = f"{folder.name}/{file.name}"

            if ext in [".mp3", ".m4a", ".wav", ".flac", ".opus", ".aac", ".ogg"]:
                media_files.append({"name": file.name, "type": "audio", "path": rel_file_path, "size": size})
            elif ext in [".mp4", ".mkv", ".webm"]:
                media_files.append({"name": file.name, "type": "video", "path": rel_file_path, "size": size})
            elif ext in [".vtt", ".srt"]:
                sub_files.append({"name": file.name, "path": rel_file_path, "size": size})
            elif ext == ".txt":
                transcript_files.append({"name": file.name, "path": rel_file_path, "size": size})

        if media_files or sub_files or transcript_files:
            items.append({
                "title": folder.name,
                "folder": folder.name,
                "media_files": media_files,
                "sub_files": sub_files,
                "transcript_files": transcript_files,
                "total_size_mb": round(total_size / (1024 * 1024), 2),
                "modified": folder.stat().st_mtime,
            })

    return items


class HarvesterRequestHandler(http.server.SimpleHTTPRequestHandler):
    """Comprehensive HTTP Request Handler for UI, REST APIs, and Media Streaming."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(UI_DIR), **kwargs)

    def log_message(self, format, *args):
        """Suppress standard access logs to keep terminal readable."""
        pass

    def send_cors_headers(self):
        """Allow requests from Chrome extensions and external tools."""
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Range")

    def do_OPTIONS(self):
        """Handle CORS pre-flight checks."""
        self.send_response(204)
        self.send_cors_headers()
        self.end_headers()

    def send_json(self, data, status=200):
        """Send JSON response with CORS headers."""
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.send_cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def read_body(self):
        """Parse incoming JSON request body."""
        length = int(self.headers.get("Content-Length", 0))
        if length == 0:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except Exception:
            return {}

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        params = urllib.parse.parse_qs(parsed.query)

        # ─── API Routes ──────────────────────────────────────────
        if path == "/api/links":
            self.send_json({"links": load_links()})

        elif path == "/api/config":
            self.send_json(load_config())

        elif path == "/api/status":
            with download_lock:
                state = {
                    "running": download_state["running"],
                    "current_url": download_state["current_url"],
                    "current_title": download_state["current_title"],
                    "completed": download_state["completed"],
                    "failed": download_state["failed"],
                    "total": download_state["total"],
                    "progress": download_state["progress"][-100:],
                }
            self.send_json(state)

        elif path == "/api/check-ytdlp":
            ytdlp = get_ytdlp_cmd()
            code, stdout, _ = run_process_safe(ytdlp + ["--version"], timeout=8)
            installed = (code == 0)
            version = stdout.strip() if installed else None
            self.send_json({"installed": installed, "version": version})

        elif path == "/api/system":
            ytdlp = get_ytdlp_cmd()
            code, stdout, _ = run_process_safe(ytdlp + ["--version"], timeout=8)
            cfg = load_config()
            out_dir = cfg.get("output_dir", str(BASE_DIR / "downloads"))

            self.send_json({
                "ytdlp": {
                    "installed": (code == 0),
                    "version": stdout.strip() if code == 0 else None,
                    "command": " ".join(ytdlp),
                },
                "ffmpeg": get_ffmpeg_info(),
                "disk_free_gb": get_disk_free_gb(out_dir),
                "platform": sys.platform,
                "python_version": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
            })

        elif path == "/api/library":
            cfg = load_config()
            out_dir = cfg.get("output_dir", str(BASE_DIR / "downloads"))
            items = scan_library(out_dir)
            self.send_json({"items": items, "count": len(items), "output_dir": out_dir})

        elif path == "/api/transcript":
            rel_path = params.get("path", [""])[0]
            if not rel_path or ".." in rel_path:
                self.send_json({"error": "Invalid path"}, 400)
                return

            cfg = load_config()
            full_path = Path(cfg.get("output_dir", str(BASE_DIR / "downloads"))) / rel_path
            if full_path.exists() and full_path.is_file():
                try:
                    with open(full_path, "r", encoding="utf-8", errors="replace") as f:
                        text = f.read()
                    self.send_json({"content": text, "filename": full_path.name})
                except Exception as e:
                    self.send_json({"error": str(e)}, 500)
            else:
                self.send_json({"error": "File not found"}, 404)

        elif path == "/api/media":
            rel_path = params.get("path", [""])[0]
            if not rel_path or ".." in rel_path:
                self.send_error(400, "Invalid media path")
                return

            cfg = load_config()
            full_path = Path(cfg.get("output_dir", str(BASE_DIR / "downloads"))) / rel_path
            if not full_path.exists() or not full_path.is_file():
                self.send_error(404, "Media file not found")
                return

            ext = full_path.suffix.lower()
            content_types = {
                ".mp3": "audio/mpeg",
                ".m4a": "audio/mp4",
                ".wav": "audio/wav",
                ".flac": "audio/flac",
                ".opus": "audio/opus",
                ".aac": "audio/aac",
                ".ogg": "audio/ogg",
                ".mp4": "video/mp4",
                ".mkv": "video/x-matroska",
                ".webm": "video/webm",
            }
            content_type = content_types.get(ext, "application/octet-stream")

            # Stream audio/video with support for Range requests
            file_size = full_path.stat().st_size
            range_header = self.headers.get("Range")

            if range_header:
                match = re.match(r"bytes=(\d+)-(\d*)", range_header)
                if match:
                    start = int(match.group(1))
                    end = int(match.group(2)) if match.group(2) else file_size - 1
                    length = end - start + 1

                    self.send_response(206)
                    self.send_header("Content-Type", content_type)
                    self.send_header("Content-Range", f"bytes {start}-{end}/{file_size}")
                    self.send_header("Content-Length", str(length))
                    self.send_header("Accept-Ranges", "bytes")
                    self.send_cors_headers()
                    self.end_headers()

                    with open(full_path, "rb") as f:
                        f.seek(start)
                        self.wfile.write(f.read(length))
                    return

            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(file_size))
            self.send_header("Accept-Ranges", "bytes")
            self.send_cors_headers()
            self.end_headers()

            with open(full_path, "rb") as f:
                shutil.copyfileobj(f, self.wfile)

        else:
            # Serve frontend files from ui/
            if path == "/":
                self.path = "/index.html"
            super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == "/api/links":
            body = self.read_body()
            incoming = body.get("links", [])
            if isinstance(incoming, str):
                incoming = [l.strip() for l in incoming.splitlines() if l.strip()]

            # Validate basic URLs
            valid_links = []
            for item in incoming:
                item = item.strip()
                if item.startswith("http://") or item.startswith("https://"):
                    valid_links.append(item)

            existing = load_links()
            existing_set = set(existing)
            added = [l for l in valid_links if l not in existing_set]
            merged = existing + added
            save_links(merged)
            self.send_json({"added": len(added), "total": len(merged)})

        elif path == "/api/links/dedup":
            existing = load_links()
            seen = set()
            deduped = []
            for l in existing:
                if l not in seen:
                    seen.add(l)
                    deduped.append(l)
            save_links(deduped)
            self.send_json({"removed": len(existing) - len(deduped), "total": len(deduped)})

        elif path == "/api/links/reverse":
            existing = load_links()
            existing.reverse()
            save_links(existing)
            self.send_json({"total": len(existing), "links": existing})

        elif path == "/api/expand-playlist":
            body = self.read_body()
            url = body.get("url", "").strip()
            if not url:
                self.send_json({"error": "No URL provided"}, 400)
                return

            ytdlp = get_ytdlp_cmd()
            # Extract video IDs and titles using flat playlist extraction
            cmd = ytdlp + [
                "--flat-playlist",
                "--print", "%(id)s\t%(title)s",
                "--no-warnings",
                url
            ]
            code, stdout, stderr = run_process_safe(cmd, timeout=120)
            if code != 0:
                err = stderr.strip()[:180] if stderr else "Failed to parse playlist"
                self.send_json({"error": err}, 500)
                return

            extracted_links = []
            for line in stdout.splitlines():
                parts = line.strip().split("\t", 1)
                if parts and parts[0]:
                    video_id = parts[0].strip()
                    extracted_links.append(f"https://www.youtube.com/watch?v={video_id}")

            existing = load_links()
            existing_set = set(existing)
            added = [l for l in extracted_links if l not in existing_set]
            merged = existing + added
            save_links(merged)

            self.send_json({
                "found": len(extracted_links),
                "added": len(added),
                "total": len(merged),
            })

        elif path == "/api/config":
            body = self.read_body()
            config = load_config()
            config.update(body)
            save_config(config)
            self.send_json(config)

        elif path == "/api/download":
            global download_thread
            with download_lock:
                if download_state["running"]:
                    self.send_json({"error": "Download already in progress"}, 409)
                    return
            download_thread = threading.Thread(target=run_download_queue, daemon=True)
            download_thread.start()
            self.send_json({"status": "started"})

        elif path == "/api/download-single":
            body = self.read_body()
            url = body.get("url", "").strip()
            if not url:
                self.send_json({"error": "Missing URL"}, 400)
                return

            def worker():
                config = load_config()
                with download_lock:
                    download_state["running"] = True
                    download_state["current_url"] = url
                download_single_item(url, config)
                with download_lock:
                    download_state["running"] = False
                    download_state["current_url"] = ""

            threading.Thread(target=worker, daemon=True).start()
            self.send_json({"status": "started", "url": url})

        elif path == "/api/cancel":
            global active_subprocess
            with download_lock:
                download_state["cancelled"] = True
                if active_subprocess:
                    try:
                        active_subprocess.kill()
                    except Exception:
                        pass
            self.send_json({"status": "cancelling"})

        elif path == "/api/open-folder":
            cfg = load_config()
            out_dir = Path(cfg.get("output_dir", str(BASE_DIR / "downloads")))
            out_dir.mkdir(parents=True, exist_ok=True)

            try:
                if sys.platform == "win32":
                    os.startfile(str(out_dir))
                elif sys.platform == "darwin":
                    subprocess.Popen(["open", str(out_dir)])
                else:
                    subprocess.Popen(["xdg-open", str(out_dir)])
                self.send_json({"status": "opened", "path": str(out_dir)})
            except Exception as e:
                self.send_json({"error": str(e)}, 500)

        elif path == "/api/update-ytdlp":
            # If standalone bin/yt-dlp exists, update it directly with -U
            local_bin = BIN_DIR / ("yt-dlp.exe" if sys.platform == "win32" else "yt-dlp")
            output_msg = ""
            success = False
            if local_bin.exists():
                code, stdout, stderr = run_process_safe([str(local_bin), "-U"], timeout=120)
                if code == 0:
                    success = True
                    output_msg = stdout.strip()
                else:
                    output_msg = stderr.strip()

            # Also update pip package if available
            cmd = [sys.executable, "-m", "pip", "install", "--upgrade", "yt-dlp"]
            code_pip, stdout_pip, stderr_pip = run_process_safe(cmd, timeout=120)
            if code_pip == 0:
                success = True
                output_msg = (output_msg + ("\n" if output_msg else "") + stdout_pip).strip()
            elif not success:
                output_msg = (output_msg + ("\n" if output_msg else "") + stderr_pip).strip()

            self.send_json({
                "success": success,
                "output": output_msg or "Update completed"
            })

        else:
            self.send_json({"error": "Endpoint not found"}, 404)

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        params = urllib.parse.parse_qs(parsed.query)

        if path == "/api/links":
            save_links([])
            self.send_json({"status": "cleared", "total": 0})

        elif path.startswith("/api/links/"):
            try:
                idx = int(path.split("/")[-1])
                links = load_links()
                if 0 <= idx < len(links):
                    removed = links.pop(idx)
                    save_links(links)
                    self.send_json({"removed": removed, "total": len(links)})
                else:
                    self.send_json({"error": "Index out of range"}, 400)
            except ValueError:
                self.send_json({"error": "Invalid index"}, 400)

        elif path == "/api/library":
            folder_name = params.get("folder", [""])[0]
            if not folder_name or ".." in folder_name:
                self.send_json({"error": "Invalid folder name"}, 400)
                return

            cfg = load_config()
            target_folder = Path(cfg.get("output_dir", str(BASE_DIR / "downloads"))) / folder_name
            if target_folder.exists() and target_folder.is_dir():
                try:
                    shutil.rmtree(target_folder)
                    self.send_json({"status": "deleted", "folder": folder_name})
                except Exception as e:
                    self.send_json({"error": str(e)}, 500)
            else:
                self.send_json({"error": "Folder not found"}, 404)

        else:
            self.send_json({"error": "Not found"}, 404)


def main():
    parser = argparse.ArgumentParser(description="YT Link Harvester — Core Server")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="Port to listen on")
    parser.add_argument("--host", type=str, default=DEFAULT_HOST, help="Host to bind to")
    parser.add_argument("--no-browser", action="store_true", help="Do not auto-open browser")
    args = parser.parse_args()

    # Ensure UI directory exists
    UI_DIR.mkdir(parents=True, exist_ok=True)

    server = http.server.HTTPServer((args.host, args.port), HarvesterRequestHandler)
    url = f"http://{args.host}:{args.port}"

    ytdlp_cmd = get_ytdlp_cmd()
    ffmpeg_info = get_ffmpeg_info()
    is_portable_py = False
    try:
        is_portable_py = Path(sys.executable).resolve().is_relative_to(BASE_DIR.resolve())
    except Exception:
        pass

    print("=" * 60)
    print("  YT Link Harvester — Download Studio Engine")
    print("=" * 60)
    print(f"  Server URL   : {url}")
    print(f"  Host Platform: {sys.platform}")
    print(f"  Python       : {sys.version.split()[0]} ({'Portable' if is_portable_py else 'System'})")
    print(f"  yt-dlp       : {' '.join(ytdlp_cmd)}")
    print(f"  FFmpeg       : {ffmpeg_info['path'] if ffmpeg_info['installed'] else 'Not found'}")
    print("=" * 60)
    print("  Press Ctrl+C to terminate.")
    print("=" * 60)

    if not args.no_browser:
        threading.Timer(1.2, lambda: webbrowser.open(url)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Terminating server gracefully...")
        server.shutdown()


# Top-level entrypoint for serverless runtimes (Vercel, AWS Lambda)
handler = HarvesterRequestHandler
app = HarvesterRequestHandler

if __name__ == "__main__":
    main()

