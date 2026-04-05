const fs = require('fs');
const path = require('path');

const CREDS_FILE = path.join(process.env.USERPROFILE || process.env.HOME, '.claude', '.credentials.json');
const CACHE_DIR = path.join(process.env.USERPROFILE || process.env.HOME, '.claude', 'cache');
const CACHE_FILE = path.join(CACHE_DIR, 'rate_limit.json');

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

async function fetchUsage() {
  try {
    if (!fs.existsSync(CREDS_FILE)) return null;
    const creds = JSON.parse(fs.readFileSync(CREDS_FILE, 'utf8'));
    const { accessToken, expiresAt } = creds.claudeAiOauth || {};
    if (!accessToken) return null;
    if (expiresAt && Date.now() > expiresAt) return null;

    const res = await fetch('https://api.anthropic.com/api/oauth/usage', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'anthropic-beta': 'oauth-2025-04-20',
        'Content-Type': 'application/json'
      }
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

function computeResetIn(resetsAtIso) {
  try {
    const msLeft = Math.max(0, new Date(resetsAtIso).getTime() - Date.now());
    const h = Math.floor(msLeft / 3600000);
    const m = Math.floor((msLeft % 3600000) / 60000);
    return h > 0 ? `${h}h${String(m).padStart(2, '0')}m` : `${m}m`;
  } catch (e) {
    return '?';
  }
}

async function updateCache() {
  try {
    const data = await fetchUsage();
    if (!data) return false;

    const fh = data.five_hour ?? data.fiveHour;
    if (!fh) return false;

    fs.writeFileSync(CACHE_FILE, JSON.stringify({
      usage_pct: fh.utilization.toFixed(1),
      reset_in: computeResetIn(fh.resets_at ?? fh.resetsAt),
      five_hour_utilization: fh.utilization,
      seven_day_utilization: (data.seven_day ?? data.sevenDay)?.utilization,
      updated_at: new Date().toISOString()
    }));
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = { updateCache, CACHE_FILE };
