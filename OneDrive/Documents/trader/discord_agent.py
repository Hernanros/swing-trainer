"""
TradeLog Discord agent — port 7433
Monitors a Discord channel for swing trading setups, scores them with Claude,
and exposes them via a REST queue for the frontend to consume.

Endpoints:
  GET  /health
  GET  /queue          → list of pending setups
  POST /queue/dismiss  → { id }
  POST /queue/clear
  GET  /watchlist      → list of symbols added from Discord
  GET  /config         → current bot config
  POST /config         → update bot config
  POST /scan           → trigger manual scan
"""

import json
import os
import time
import threading
import traceback
import uuid

from flask import Flask, jsonify, request
from flask_cors import CORS

app  = Flask(__name__)
CORS(app)

CONFIG_FILE = "discord_config.json"

# ── State ─────────────────────────────────────────────────────────────────────
_queue     = []   # list of setup dicts
_watchlist = []   # symbols auto-added from Discord
_lock      = threading.Lock()

DEFAULT_CONFIG = {
    "token":         "",
    "channels":      [],
    "min_score":     8,
    "auto_add":      True,
    "scan_interval": 30,
}


def load_config():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE) as f:
                return {**DEFAULT_CONFIG, **json.load(f)}
        except Exception:
            pass
    return DEFAULT_CONFIG.copy()


def save_config(cfg):
    with open(CONFIG_FILE, "w") as f:
        json.dump(cfg, f, indent=2)


_config = load_config()


# ── Discord polling (runs when token + channels are configured) ───────────────
def discord_poll_loop():
    """
    Background thread — polls Discord for new messages every scan_interval
    seconds, scores setups with Claude, and pushes them to the queue.
    Requires discord.py and a valid token in discord_config.json.
    """
    try:
        import discord
        import anthropic
    except ImportError:
        print("[discord_agent] discord.py or anthropic not installed — polling disabled.")
        return

    while True:
        cfg = load_config()
        if cfg["token"] and cfg["channels"]:
            # Real Discord polling would go here.
            # Left as a stub — implement when token is configured.
            pass
        time.sleep(cfg.get("scan_interval", 30))


# ── Routes ────────────────────────────────────────────────────────────────────

@app.route("/health")
def health():
    return jsonify({"status": "ok", "queue": len(_queue)})


@app.route("/queue")
def get_queue():
    with _lock:
        return jsonify(_queue)


@app.route("/queue/dismiss", methods=["POST"])
def dismiss():
    data = request.get_json(silent=True) or {}
    setup_id = data.get("id")
    with _lock:
        global _queue
        _queue = [s for s in _queue if s.get("id") != setup_id]
    return jsonify({"ok": True})


@app.route("/queue/clear", methods=["POST"])
def clear_queue():
    with _lock:
        _queue.clear()
    return jsonify({"ok": True})


@app.route("/watchlist")
def get_watchlist():
    with _lock:
        return jsonify(_watchlist)


@app.route("/config", methods=["GET"])
def get_config():
    return jsonify(_config)


@app.route("/config", methods=["POST"])
def set_config():
    global _config
    data = request.get_json(silent=True) or {}
    _config.update(data)
    save_config(_config)
    return jsonify({"ok": True})


@app.route("/scan", methods=["POST"])
def manual_scan():
    # Trigger immediate scan (stub)
    return jsonify({"ok": True, "message": "Scan triggered"})


# ── Dev helper: inject a fake setup so you can test the UI ───────────────────
@app.route("/dev/inject", methods=["POST"])
def dev_inject():
    """POST { symbol, score, text } to push a fake setup into the queue."""
    data = request.get_json(silent=True) or {}
    setup = {
        "id":      str(uuid.uuid4()),
        "symbol":  data.get("symbol", "AAPL"),
        "score":   data.get("score", 7),
        "text":    data.get("text", "Breakout above resistance with volume"),
        "author":  "dev",
        "ts":      int(time.time() * 1000),
    }
    with _lock:
        _queue.append(setup)
    return jsonify(setup)


if __name__ == "__main__":
    t = threading.Thread(target=discord_poll_loop, daemon=True)
    t.start()
    print("TradeLog Discord agent running on http://localhost:7433")
    app.run(host="0.0.0.0", port=7433, debug=False)
