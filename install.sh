#!/usr/bin/env bash
set -euo pipefail

CLAUDE_DIR="${USERPROFILE:-$HOME}/.claude"
SCRIPTS_DIR="$CLAUDE_DIR/scripts"
SETTINGS_FILE="$CLAUDE_DIR/settings.json"
REPO_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Claude Code Statusline Installer ==="

# 1. Create directories
mkdir -p "$SCRIPTS_DIR"
mkdir -p "$CLAUDE_DIR/cache"

# 2. Copy scripts
cp "$REPO_DIR/scripts/statusline.js"    "$SCRIPTS_DIR/"
cp "$REPO_DIR/scripts/usage_api.js"     "$SCRIPTS_DIR/"
cp "$REPO_DIR/scripts/session_start.js" "$SCRIPTS_DIR/"
cp "$REPO_DIR/scripts/stop_hook.js"     "$SCRIPTS_DIR/"
echo "[ok] scripts -> $SCRIPTS_DIR"

# 3. Merge settings.json (preserve user's existing keys, add ours)
if [ -f "$SETTINGS_FILE" ]; then
  # node available — use it for safe JSON merge
  if command -v node &>/dev/null; then
    node -e "
      const fs = require('fs');
      const path = require('path');
      const home = process.env.USERPROFILE || process.env.HOME;
      const settingsFile = path.join(home, '.claude', 'settings.json');
      const incomingFile = path.join(process.argv[1], 'settings.json');
      const existing = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
      const incoming = JSON.parse(fs.readFileSync(incomingFile, 'utf8'));
      // Deep-merge hooks: concatenate existing hook arrays with incoming ones
      const merged = { ...existing, ...incoming };
      if (existing.hooks && incoming.hooks) {
        merged.hooks = { ...existing.hooks };
        for (const [event, hooks] of Object.entries(incoming.hooks)) {
          if (merged.hooks[event]) {
            // Avoid duplicating our own hooks on re-install
            const ourCmds = hooks.flatMap(h => (h.hooks || []).map(hh => hh.command));
            const filtered = merged.hooks[event].filter(h =>
              !(h.hooks || []).some(hh => ourCmds.includes(hh.command))
            );
            merged.hooks[event] = [...filtered, ...hooks];
          } else {
            merged.hooks[event] = hooks;
          }
        }
      }
      fs.writeFileSync(settingsFile, JSON.stringify(merged, null, 2) + '\n');
    " "$REPO_DIR"
    echo "[ok] settings.json merged (existing keys preserved)"
  else
    echo "[warn] node not found — copying settings.json (backup: settings.json.bak)"
    cp "$SETTINGS_FILE" "$SETTINGS_FILE.bak"
    cp "$REPO_DIR/settings.json" "$SETTINGS_FILE"
  fi
else
  cp "$REPO_DIR/settings.json" "$SETTINGS_FILE"
  echo "[ok] settings.json created"
fi

echo ""
echo "Done! Restart Claude Code to activate the statusline."
