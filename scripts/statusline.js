const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

const CLAUDE_DIR = path.join(process.env.USERPROFILE || process.env.HOME, '.claude');
const CACHE_FILE = path.join(CLAUDE_DIR, 'cache', 'rate_limit.json');
const CACHE_TTL_MS      = 2  * 60 * 1000; // background refresh threshold
const CACHE_SYNC_TTL_MS = 30 * 60 * 1000; // synchronous refresh threshold (long idle)

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

  // 2. Context window percentage (support both snake_case and camelCase field names)
  const ctxWindow = d.context_window ?? d.contextWindow ?? {};
  let ctxPct = ctxWindow.used_percentage ?? ctxWindow.usedPercentage;
  if (ctxPct === undefined || ctxPct === null) {
    const usedTokens = ctxWindow.total_input_tokens ?? ctxWindow.totalInputTokens;
    if (usedTokens !== undefined && usedTokens !== null) {
      const windowSize = ctxWindow.context_window_size ?? ctxWindow.contextWindowSize ?? 200000;
      ctxPct = (usedTokens / windowSize) * 100;
    } else {
      ctxPct = 0;
    }
  }
  const ctx = `${c.dim}ctx:${pctColor(ctxPct)}${ctxPct.toFixed(1)}%${c.reset}`;

  // 3. Rate limit (from cache, with stale-while-revalidate)
  let rl = `${c.dim}rl:-/-${c.reset}`;
  try {
    const refreshScript = path.join(CLAUDE_DIR, 'scripts', 'session_start.js');

    let cache = null;
    if (fs.existsSync(CACHE_FILE)) {
      cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    }

    const age = cache?.updated_at ? Date.now() - new Date(cache.updated_at).getTime() : Infinity;

    if (age >= CACHE_SYNC_TTL_MS) {
      // Long idle: block and refresh synchronously so we show fresh data immediately
      try {
        execSync(`node "${refreshScript}"`, { timeout: 8000, stdio: 'ignore' });
        cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      } catch (e) {}
    } else if (age >= CACHE_TTL_MS) {
      // Slightly stale: background refresh, show current cache with stale marker
      spawn('node', [refreshScript], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    }

    if (cache?.usage_pct !== undefined && cache?.reset_in !== undefined) {
      const rlPct = parseFloat(cache.usage_pct);
      const freshAge = cache.updated_at ? Date.now() - new Date(cache.updated_at).getTime() : Infinity;
      const staleMarker = freshAge >= CACHE_TTL_MS ? `${c.dim}~` : '';
      rl = `${c.dim}rl:${staleMarker}${pctColor(rlPct)}${cache.usage_pct}%${c.dim}/${cache.reset_in}${c.reset}`;
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
