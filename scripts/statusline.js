const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

const CLAUDE_DIR = path.join(process.env.USERPROFILE || process.env.HOME, '.claude');
const CACHE_FILE = path.join(CLAUDE_DIR, 'cache', 'rate_limit.json');
const CACHE_TTL_MS = 5 * 60 * 1000; // refresh if cache is older than 5 minutes

// ANSI color helpers (One Dark inspired, muted tones)
const c = {
  reset:  '\x1b[0m',
  dim:    '\x1b[38;2;92;99;112m',     // separator, labels
  model:  '\x1b[38;2;190;195;205m',   // light gray
  git:    '\x1b[38;2;97;175;239m',    // soft blue
  conda:  '\x1b[38;2;198;120;221m',   // soft purple
  node:   '\x1b[38;2;86;182;194m',    // soft cyan
  green:  '\x1b[38;2;152;195;121m',   // good
  yellow: '\x1b[38;2;229;192;123m',   // warning
  red:    '\x1b[38;2;224;108;117m',   // danger
};

function pctColor(pct) {
  if (pct < 50) return c.green;
  if (pct < 80) return c.yellow;
  return c.red;
}

const SEP = `${c.dim} | ${c.reset}`;

// Check if stdin is available
const hasStdin = !process.stdin.isTTY;

function readStdinSync() {
  if (!hasStdin) return '{}';
  try {
    return fs.readFileSync(0, 'utf-8');
  } catch (e) {
    return '{}';
  }
}

(() => {
  let d = {};
  try {
    d = JSON.parse(readStdinSync());
  } catch (e) {
    d = {};
  }

  // 1. Model name
  const model = `${c.model}${d.model?.display_name ?? d.model?.id ?? 'unknown'}${c.reset}`;

  // 2. Context window percentage
  const ctxWindow = d.context_window ?? {};
  let ctxPct = ctxWindow.used_percentage;
  if (ctxPct === undefined || ctxPct === null) {
    if (ctxWindow.total_input_tokens !== undefined && ctxWindow.total_input_tokens !== null) {
      const windowSize = ctxWindow.context_window_size ?? 200000;
      ctxPct = (ctxWindow.total_input_tokens / windowSize) * 100;
    } else {
      ctxPct = 0;
    }
  }
  const ctx = `${c.dim}ctx:${pctColor(ctxPct)}${ctxPct.toFixed(1)}%${c.reset}`;

  // 3. Rate limit (from cache, with background stale-while-revalidate)
  let rl = `${c.dim}rl:-/-${c.reset}`;
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      if (cache.usage_pct !== undefined && cache.reset_in !== undefined) {
        const rlPct = parseFloat(cache.usage_pct);
        const stale = cache.updated_at && (Date.now() - new Date(cache.updated_at).getTime()) > CACHE_TTL_MS;
        const staleMarker = stale ? `${c.dim}~` : '';
        rl = `${c.dim}rl:${staleMarker}${pctColor(rlPct)}${cache.usage_pct}%${c.dim}/${cache.reset_in}${c.reset}`;
        if (stale) {
          // Trigger background refresh without blocking the status line render
          const refreshScript = path.join(CLAUDE_DIR, 'scripts', 'session_start.js');
          spawn('node', [refreshScript], { detached: true, stdio: 'ignore' }).unref();
        }
      }
    }
  } catch (e) {}

  // 4. Git branch
  let git = `${c.dim}no-git${c.reset}`;
  try {
    const cwd = d.cwd ?? d.workspace?.current_dir ?? process.cwd();
    const branch = execSync('git branch --show-current', {
      cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 2000
    }).trim();
    if (branch) {
      git = `${c.git}${branch}${c.reset}`;
    }
  } catch (e) {}

  // 5. Conda environment
  const envName = process.env.CONDA_DEFAULT_ENV ?? 'no-env';
  const conda = `${c.dim}conda:${c.conda}${envName}${c.reset}`;

  // 6. Node version
  const nodeVer = `${c.dim}node:${c.node}${process.version}${c.reset}`;

  console.log([model, ctx, rl, git, conda, nodeVer].join(SEP));
})();
