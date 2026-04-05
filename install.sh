#!/usr/bin/env bash
set -euo pipefail

CLAUDE_DIR="$HOME/.claude"
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
      const existing = JSON.parse(fs.readFileSync('$SETTINGS_FILE', 'utf8'));
      const incoming = JSON.parse(fs.readFileSync('$REPO_DIR/settings.json', 'utf8'));
      const merged = { ...existing, ...incoming };
      fs.writeFileSync('$SETTINGS_FILE', JSON.stringify(merged, null, 2) + '\n');
    "
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
