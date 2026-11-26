/**
 * ==========================================
 * AGY 重置与余额小组件（透明四卡版）
 * - 样式与布局：
 *   · 根背景全透明 #00000000（无 backgroundGradient），内层四卡采用 rgba 半透明玻璃底 + 0.5pt 细描边
 *   · 同时适配普通桌面与 iOS 26 透明/液态玻璃桌面
 *   · 小号 (Small)  ：2x2 四宫格卡片，紧凑留白
 *   · 中号 (Medium) ：1x4 横排卡片 + 顶栏最近重置 + 底栏统计与刷新时间
 *   · 大号 (Large)  ：2x2 放大四宫格 + 内嵌 SVG 走势图/热力图/配额条
 *   · 锁屏 (Lock)   ：支持 accessoryInline / accessoryCircular / accessoryRectangular
 * - 数据来源：
 *   · 公开重置：优先复用 Quota Hub /api/resets，自动回退 https://agyresets.com/api/v1
 *   · 个人配额：优先请求 Quota Hub /api/egern/agy（回退 /api/quota），并兼容自定义 JSON 或 Google OAuth
 *   · 本地缓存：ctx.storage 持久化快照，断网或接口异常自动降级
 * ==========================================
 */

const RESETS_API_BASE = 'https://agyresets.com/api/v1';
const WEBSITE_URL = 'https://agyresets.com/zh-CN';
const DEFAULT_CLOUDCODE_HOSTS = [
  'https://cloudcode-pa.googleapis.com',
  'https://daily-cloudcode-pa.googleapis.com',
  'https://daily-cloudcode-pa.sandbox.googleapis.com',
];
const CLOUDCODE_UA = 'vscode/1.X.X (Antigravity/4.3.0)';
const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';

const TOKEN_CACHE_KEY = 'agy_widget_oauth_cache_v1';
const PROJECT_CACHE_KEY = 'agy_widget_project_v1';
const SNAPSHOT_CACHE_KEY = 'agy_widget_snapshot_v2';

const DEFAULT_REFRESH_MINUTES = 15;
const REQUEST_TIMEOUT_MS = 10000;
const MAX_HISTORY_PAGES = 20;
const DAY_IN_MS = 86400000;
const HEATMAP_WEEKS = 14;
const PACIFIC_TIME_ZONE = 'America/Los_Angeles';

// 全模式透明玻璃色板（根背景全透明，内层卡片采用 rgba 半透明底 + 0.5pt 玻璃细描边）
const ROOT_BG = '#00000000';
const C = {
  card: { light: 'rgba(255, 255, 255, 0.28)', dark: 'rgba(255, 255, 255, 0.09)' },
  cardBorder: { light: 'rgba(0, 0, 0, 0.09)', dark: 'rgba(255, 255, 255, 0.16)' },
  main: { light: '#1C1C1E', dark: '#F2F2F7' },
  muted: { light: '#6E6E73', dark: '#98989F' },
  gold: { light: '#B07C1A', dark: '#D4A02A' },
  accent: { light: '#FF9F0A', dark: '#FFB347' },
  red: { light: '#C0392B', dark: '#FF453A' },
  teal: { light: '#1E7E44', dark: '#30D158' },
  blue: { light: '#2C5F8A', dark: '#5E9ED6' },
  divider: { light: 'rgba(0, 0, 0, 0.10)', dark: 'rgba(255, 255, 255, 0.14)' },
};

const HEX = {
  gold: '#D4A02A',
  red: '#FF453A',
  blue: '#2F80ED',
  teal: '#27AE60',
  orange: '#FF9F0A',
  pink: '#FF6482',
  empty: 'rgba(142,142,147,0.25)',
};

// ---------------------------------------------------------------------------
// Base64, time & formatting helpers
// ---------------------------------------------------------------------------

function stringToBase64(str) {
  if (typeof Buffer !== 'undefined') return Buffer.from(str, 'utf8').toString('base64');
  const encoded = encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  );
  return btoa(encoded);
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatStamp(date) {
  return `${pad2(date.getMonth() + 1)}.${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function toPacificDateKey(date) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: PACIFIC_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch (_) {
    return new Date(date.getTime() - 8 * 3600000).toISOString().slice(0, 10);
  }
}

function todayPacificDate(now = new Date()) {
  const [year, month, day] = toPacificDateKey(now).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatRelativeTime(value, now = Date.now()) {
  const ts = Date.parse(value);
  if (Number.isNaN(ts)) return '--';
  const deltaSec = Math.round((ts - now) / 1000);
  const abs = Math.abs(deltaSec);
  if (abs < 45) return '刚刚';

  const units = [
    { seconds: 31536000, label: '年' },
    { seconds: 2592000, label: '月' },
    { seconds: 604800, label: '周' },
    { seconds: 86400, label: '天' },
    { seconds: 3600, label: '小时' },
  ];
  const suffix = deltaSec < 0 ? '前' : '后';
  for (const unit of units) {
    if (abs >= unit.seconds) {
      return `${Math.abs(Math.round(deltaSec / unit.seconds))}${unit.label}${suffix}`;
    }
  }
  return `${Math.abs(Math.round(deltaSec / 60))}分${suffix}`;
}

function formatCountdown(isoTime, now = Date.now()) {
  if (!isoTime) return '';
  const ts = Date.parse(isoTime);
  if (Number.isNaN(ts)) return '';
  const totalMin = Math.max(0, Math.floor((ts - now) / 60000));
  if (totalMin === 0) return '已刷新';
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days}d${hours}h后`;
  return `${hours}h${mins}m后`;
}

function formatResetSub(quota) {
  if (!quota) return '剩余配额';
  const fromIso = formatCountdown(quota.resetTime);
  if (fromIso) return fromIso;
  const raw = (quota.resetText || '').trim();
  if (!raw) return '剩余配额';
  if (/已重置|已刷新|后$/.test(raw)) return raw;
  return `${raw.replace(/\s+/g, '')}后`;
}

function clampFraction(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  if (num > 1 && num <= 100) return Math.max(0, Math.min(1, num / 100));
  return Math.max(0, Math.min(1, num));
}

function clampPercent(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.max(0, Math.min(1, num / 100));
}

function pickLowestQuota(quotas) {
  if (!Array.isArray(quotas) || quotas.length === 0) return null;
  return quotas.reduce(
    (min, q) => (q.remainingFraction < min.remainingFraction ? q : min),
    quotas[0]
  );
}

function parseEndpointConfig(rawUrl) {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(https?:\/\/[^/?#]+)([^?#]*)(\?[^#]*)?/i);
  if (!match) {
    return { quotaUrls: [trimmed], resetsUrl: null, webUrl: WEBSITE_URL };
  }
  const origin = match[1];
  const pathname = match[2] || '';
  const query = match[3] || '';
  if (pathname === '' || pathname === '/') {
    return {
      quotaUrls: [`${origin}/api/egern/agy${query}`, `${origin}/api/quota${query}`, trimmed],
      resetsUrl: `${origin}/api/resets`,
      webUrl: origin,
    };
  }
  if (/\/api\/(?:egern\/agy|quota)\/?$/i.test(pathname)) {
    const base = `${origin}${pathname.replace(/\/api\/(?:egern\/agy|quota)\/?$/i, '')}`;
    return {
      quotaUrls: [trimmed],
      resetsUrl: `${base}/api/resets`,
      webUrl: base || origin,
    };
  }
  return { quotaUrls: [trimmed], resetsUrl: null, webUrl: WEBSITE_URL };
}

function formatBalanceAmount(amount, currency, unit) {
  const num = Number(amount);
  if (!Number.isFinite(num)) return String(amount);
  const formatted = Number.isInteger(num) ? String(num) : num.toFixed(2).replace(/\.?0+$/, '');
  if (currency) return `${currency}${formatted}`;
  if (unit) return `${formatted}${unit}`;
  return formatted;
}

function quotaTone(fraction) {
  if (fraction <= 0.15) return { color: C.red, hex: HEX.red };
  if (fraction <= 0.4) return { color: C.gold, hex: HEX.gold };
  return { color: C.teal, hex: HEX.teal };
}

function readStorageJSON(ctx, key) {
  try {
    return ctx.storage && typeof ctx.storage.getJSON === 'function' ? ctx.storage.getJSON(key) : null;
  } catch (_) {
    return null;
  }
}

function writeStorageJSON(ctx, key, value) {
  try {
    if (ctx.storage && typeof ctx.storage.setJSON === 'function') ctx.storage.setJSON(key, value);
  } catch (_) {}
}

// ---------------------------------------------------------------------------
// SVG generators (Base64 encoded, matching 实时油价.js lineChartSVG)
// ---------------------------------------------------------------------------

function lineChartSVG(arr, { color = HEX.teal, width = 84, height = 26, lineWidth = 1.8 } = {}) {
  const nums = (arr || []).map(Number).filter(Number.isFinite).slice(-12);
  if (nums.length < 2) return null;

  const pad = Math.max(3, Math.ceil(lineWidth));
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const range = max - min || 1;
  const points = nums.map((n, i) => {
    const x = pad + (width - pad * 2) * (i / (nums.length - 1));
    const y = pad + (height - pad * 2) * (1 - (n - min) / range);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const bottom = height - pad;
  const area = `${points[0]} ${points.slice(1).join(' ')} ${width - pad},${bottom} ${pad},${bottom}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity="0.28"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs><polygon points="${area}" fill="url(#fill)"/><polyline points="${points.join(' ')}" fill="none" stroke="${color}" stroke-width="${lineWidth}" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
  return `data:image/svg+xml;base64,${stringToBase64(svg)}`;
}

function quotaGaugeSVG(fraction, { color = HEX.teal, width = 84, height = 26 } = {}) {
  const f = Math.max(0, Math.min(1, Number(fraction) || 0));
  const barY = 9;
  const barH = 8;
  const pad = 2;
  const trackW = width - pad * 2;
  const fillW = Math.max(f > 0 ? 4 : 0, trackW * f);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect x="${pad}" y="${barY}" width="${trackW}" height="${barH}" rx="4" fill="${HEX.empty}"/>${fillW > 0 ? `<rect x="${pad}" y="${barY}" width="${fillW.toFixed(2)}" height="${barH}" rx="4" fill="${color}"/>` : ''}</svg>`;
  return `data:image/svg+xml;base64,${stringToBase64(svg)}`;
}

function miniHeatmapSVG(records, { width = 84, height = 26, weeks = HEATMAP_WEEKS } = {}) {
  if (!records || !records.length) return null;
  const aggregates = new Map();
  for (const r of records) {
    const ts = Date.parse(r.announced_at);
    if (Number.isNaN(ts)) continue;
    const key = toPacificDateKey(new Date(ts));
    const prev = aggregates.get(key);
    if (!prev || ts >= prev.ts) aggregates.set(key, { kind: r.kind, ts });
  }

  const utcToday = todayPacificDate();
  const mondayOffset = (utcToday.getUTCDay() + 6) % 7;
  const currentMonday = new Date(utcToday.getTime() - mondayOffset * DAY_IN_MS);
  const firstMonday = new Date(currentMonday.getTime() - (weeks - 1) * 7 * DAY_IN_MS);

  const gap = 1.2;
  const cellW = (width - gap * (weeks - 1)) / weeks;
  const cellH = (height - gap * 6) / 7;
  const rects = [];

  for (let w = 0; w < weeks; w += 1) {
    for (let d = 0; d < 7; d += 1) {
      const date = new Date(firstMonday.getTime() + (w * 7 + d) * DAY_IN_MS);
      if (date.getTime() > utcToday.getTime()) continue;
      const hit = aggregates.get(date.toISOString().slice(0, 10));
      const fill = !hit
        ? HEX.empty
        : hit.kind === 'weekly'
          ? HEX.blue
          : hit.kind === 'rate_limit'
            ? HEX.orange
            : HEX.pink;
      const x = (w * (cellW + gap)).toFixed(2);
      const y = (d * (cellH + gap)).toFixed(2);
      rects.push(`<rect x="${x}" y="${y}" width="${cellW.toFixed(2)}" height="${cellH.toFixed(2)}" rx="1" fill="${fill}"/>`);
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${rects.join('')}</svg>`;
  return `data:image/svg+xml;base64,${stringToBase64(svg)}`;
}

// ---------------------------------------------------------------------------
// HTTP & data fetchers
// ---------------------------------------------------------------------------

async function httpJson(ctx, method, url, options = {}) {
  const resp = await ctx.http[method](url, { timeout: REQUEST_TIMEOUT_MS, ...options });
  if (resp.status < 200 || resp.status >= 300) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

function computeIntervals(records) {
  const sorted = records
    .map((r) => Date.parse(r.announced_at))
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => a - b);
  const gaps = [];
  for (let i = 1; i < sorted.length; i += 1) {
    gaps.push(Number(((sorted[i] - sorted[i - 1]) / DAY_IN_MS).toFixed(2)));
  }
  return gaps;
}

async function fetchAllResets(ctx) {
  const records = [];
  let cursor = null;
  let hasMore = true;
  let page = 0;

  while (hasMore) {
    if (page >= MAX_HISTORY_PAGES) throw new Error(`历史翻页超限`);
    const query = cursor === null ? '?limit=100' : `?limit=100&cursor=${encodeURIComponent(cursor)}`;
    const body = await httpJson(ctx, 'get', `${RESETS_API_BASE}/resets${query}`, {
      headers: { Accept: 'application/json' },
    });
    if (Array.isArray(body.data)) records.push(...body.data);
    hasMore = Boolean(body.pagination && body.pagination.has_more);
    cursor = body.pagination ? body.pagination.next_cursor : null;
    page += 1;
    if (hasMore && cursor === null) throw new Error('缺少下一页游标');
  }
  return records;
}

function normalizeResetsDashboard(latest, stats, history, extras = {}) {
  const safeStats = stats || {};
  const safeHistory = Array.isArray(history) ? history : [];
  if (!latest) throw new Error('缺少最新重置记录');

  const intervals = computeIntervals(safeHistory);
  const longestFallback = intervals.length ? Math.max(...intervals) : 0;
  const daysSinceLast =
    safeStats.days_since_last != null
      ? Number(safeStats.days_since_last)
      : Math.max(0, (Date.now() - Date.parse(latest.announced_at)) / DAY_IN_MS);

  return {
    latest,
    scheduledReset: extras.scheduledReset || null,
    activeWatch: extras.activeWatch || null,
    total: Number(safeStats.total || 0),
    daysSinceLast,
    averageDays: Number(safeStats.avg_interval_days ?? 0),
    medianDays: safeStats.median_interval_days != null ? Number(safeStats.median_interval_days) : null,
    longestDays: safeStats.longest_gap_days != null ? Number(safeStats.longest_gap_days) : longestFallback,
    intervals,
    history: safeHistory,
  };
}

async function fetchResetsDashboard(ctx, needHistory, resetsUrl = null) {
  if (resetsUrl) {
    try {
      const payload = await httpJson(ctx, 'get', resetsUrl, { headers: { Accept: 'application/json' } });
      const latest = payload && (payload.latest || (payload.data && payload.data.latest_reset));
      const stats = payload && (payload.stats || (payload.data && payload.data.stats));
      const history = payload && Array.isArray(payload.history) ? payload.history : [];
      if (latest) {
        return normalizeResetsDashboard(latest, stats, history, {
          scheduledReset: payload.scheduled_reset || (payload.data && payload.data.scheduled_reset) || null,
          activeWatch: payload.active_watch || (payload.data && payload.data.active_watch) || null,
        });
      }
    } catch (_) {
      // 优先走 Quota Hub /api/resets 边缘缓存，失败时自动回退直连 agyresets.com
    }
  }

  const [response, history] = await Promise.all([
    httpJson(ctx, 'get', `${RESETS_API_BASE}/status`, { headers: { Accept: 'application/json' } }),
    needHistory ? fetchAllResets(ctx) : Promise.resolve([]),
  ]);

  const data = response && response.data ? response.data : {};
  return normalizeResetsDashboard(data.latest_reset, data.stats, history, {
    scheduledReset: data.scheduled_reset || null,
    activeWatch: data.active_watch || null,
  });
}

function buildFormBody(params) {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== '')
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join('&');
}

async function resolveAccessToken(ctx, env) {
  const direct = (env.AGY_ACCESS_TOKEN || '').trim();
  if (direct) return direct;

  const refreshToken = (env.AGY_REFRESH_TOKEN || '').trim();
  const clientId = (env.AGY_CLIENT_ID || '').trim();
  if (!refreshToken) return null;
  if (!clientId) throw new Error('缺少 AGY_CLIENT_ID');

  const cached = readStorageJSON(ctx, TOKEN_CACHE_KEY);
  if (
    cached &&
    cached.accessToken &&
    cached.sourceRefreshToken === refreshToken &&
    cached.expiresAt > Date.now() + 5 * 60000
  ) {
    return cached.accessToken;
  }

  const activeRefresh =
    cached && cached.sourceRefreshToken === refreshToken && cached.refreshToken
      ? cached.refreshToken
      : refreshToken;

  const form = buildFormBody({
    grant_type: 'refresh_token',
    refresh_token: activeRefresh,
    client_id: clientId,
    client_secret: (env.AGY_CLIENT_SECRET || '').trim() || undefined,
  });
  const tokenResp = await httpJson(ctx, 'post', OAUTH_TOKEN_URL, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: form,
  });
  if (!tokenResp || !tokenResp.access_token) throw new Error('OAuth 刷新失败');

  writeStorageJSON(ctx, TOKEN_CACHE_KEY, {
    accessToken: tokenResp.access_token,
    sourceRefreshToken: refreshToken,
    refreshToken: tokenResp.refresh_token || activeRefresh,
    expiresAt: Date.now() + Number(tokenResp.expires_in || 3600) * 1000,
  });
  return tokenResp.access_token;
}

function shortModelLabel(id, displayName) {
  const raw = (displayName || id || '').trim();
  if (!raw) return '配额';
  return raw.replace(/^Google\s+/i, '').replace(/\s+Preview$/i, '').slice(0, 14);
}

function normalizeQuotaEntry(label, rawValue, resetTime, opts = {}) {
  const fraction = opts.isPercent ? clampPercent(rawValue) : clampFraction(rawValue);
  if (fraction === null) return null;
  return {
    label: String(label || '配额').slice(0, 14),
    remainingFraction: fraction,
    resetTime: resetTime || null,
    resetText: opts.resetText || null,
  };
}

const QUOTA_HUB_LABELS = {
  'gemini-5h': 'Gemini 5H',
  '3p-5h': 'Claude 5H',
  'gemini-weekly': 'Gemini 周',
  '3p-weekly': 'Claude 周',
  'gemini-argon-neon-5h': 'Argon 5H',
  'gemini-argon-neon-weekly': 'Argon 周',
};

function shortQuotaHubItemLabel(item) {
  const id = String(item.id || '').trim();
  if (id && QUOTA_HUB_LABELS[id]) return QUOTA_HUB_LABELS[id];
  const base = String(item.label || id || '配额').trim();
  const tag = String(item.windowTag || '').trim();
  if (tag && !base.toLowerCase().includes(tag.toLowerCase()) && base.length + tag.length + 1 <= 14) {
    return `${base} ${tag}`;
  }
  return base.slice(0, 14);
}

function extractQuotaHubPlan(group) {
  if (!group || !Array.isArray(group.badges)) return null;
  for (const badge of group.badges) {
    if (!badge || typeof badge.text !== 'string') continue;
    const text = badge.text.trim();
    if (!text || text.startsWith('$') || /^(standby|reserved|agy|unknown)$/i.test(text)) continue;
    if (badge.icon && ['ultra', 'enterprise', 'pro', 'free'].includes(String(badge.icon).toLowerCase())) {
      return text;
    }
    if (/^(ultra|enterprise|pro|free)$/i.test(text)) return text;
  }
  return null;
}

function isQuotaHubPayload(src) {
  if (!src || !Array.isArray(src.groups)) return false;
  if (src.groups.some((g) => g && Array.isArray(g.items))) return true;
  return src.groups.length === 0 && typeof src.updatedAt === 'number';
}

function extractQuotaHubGroups(groups) {
  const ordered = [
    ...groups.filter((g) => g && g.id === 'agy'),
    ...groups.filter((g) => g && g.id !== 'agy'),
  ];
  const quotas = [];
  let primaryGroup = null;

  for (const group of ordered) {
    if (!Array.isArray(group.items) || group.items.length === 0) continue;
    if (!primaryGroup) primaryGroup = group;

    const idSet = new Set(group.items.map((it) => it && it.id).filter(Boolean));
    for (const item of group.items) {
      if (!item || typeof item !== 'object') continue;
      // providers.ts 将 gemini-5h / gemini-weekly 镜像展开为 Argon/Neon 栏，小组件四卡去重展示
      if (item.id === 'gemini-argon-neon-5h' && idSet.has('gemini-5h')) continue;
      if (item.id === 'gemini-argon-neon-weekly' && idSet.has('gemini-weekly')) continue;

      const hasPct = item.remainingPercent !== undefined && item.remainingPercent !== null;
      const rawVal = hasPct
        ? item.remainingPercent
        : item.remainingFraction ?? item.remaining_fraction ?? item.remaining;
      const entry = normalizeQuotaEntry(
        shortQuotaHubItemLabel(item),
        rawVal,
        item.resetTime || item.reset_time || item.resetAt,
        { isPercent: hasPct, resetText: item.resetInText || item.reset_in_text || null }
      );
      if (entry) quotas.push(entry);
    }
  }

  return { quotas, primaryGroup: primaryGroup || ordered[0] || null };
}

function bucketLabel(groupName, bucket, singleBucket) {
  const bId = String(bucket.bucketId || bucket.bucket_id || bucket.id || '').toLowerCase();
  const win = String(bucket.window || '').toLowerCase();
  const is5h = bId.includes('5h') || win.includes('5h');
  const isWeek = bId.includes('week') || win.includes('week');
  if (bId.includes('gemini')) return is5h ? 'Gemini 5h' : isWeek ? 'Gemini 周' : 'Gemini';
  if (bId.includes('3p') || bId.includes('claude') || bId.includes('gpt')) {
    return is5h ? 'Claude/GPT 5h' : isWeek ? 'C/G 周' : 'Claude/GPT';
  }
  if (singleBucket && groupName) return groupName;
  return bucket.displayName || bucket.display_name || bucket.bucketId || bucket.bucket_id || groupName || '配额';
}

function extractQuotasFromPayload(payload) {
  if (isQuotaHubPayload(payload)) {
    return extractQuotaHubGroups(payload.groups);
  }

  const quotas = [];

  if (Array.isArray(payload.quotas)) {
    for (const item of payload.quotas) {
      const hasFrac =
        item.remainingFraction !== undefined && item.remainingFraction !== null
          ? true
          : item.remaining_fraction !== undefined && item.remaining_fraction !== null
            ? true
            : item.remaining !== undefined && item.remaining !== null;
      const isPercent = !hasFrac && (item.remainingPercent != null || item.percent != null);
      const rawVal = hasFrac
        ? item.remainingFraction ?? item.remaining_fraction ?? item.remaining
        : item.remainingPercent ?? item.percent;
      const entry = normalizeQuotaEntry(
        item.label || item.name || item.model,
        rawVal,
        item.resetTime || item.reset_time || item.resetAt,
        { isPercent, resetText: item.resetInText || item.reset_in_text || null }
      );
      if (entry) quotas.push(entry);
    }
  }

  const groups = payload.groups || payload.quotaGroups || payload.quota_groups;
  if (Array.isArray(groups)) {
    for (const group of groups) {
      const gName = group.displayName || group.display_name || group.name || '';
      const buckets = group.buckets || group.quotaBuckets || group.quota_buckets || [];
      if (!Array.isArray(buckets)) continue;
      for (const bucket of buckets) {
        const frac = bucket.remainingFraction ?? bucket.remaining_fraction ?? bucket.remaining;
        const reset = bucket.resetTime || bucket.reset_time;
        const entry = normalizeQuotaEntry(bucketLabel(gName, bucket, buckets.length === 1), frac, reset);
        if (entry) quotas.push(entry);
      }
    }
  }

  const modelsObj = payload.models && typeof payload.models === 'object' && !Array.isArray(payload.models)
    ? payload.models
    : null;
  if (modelsObj) {
    const seen = new Set();
    for (const [modelId, info] of Object.entries(modelsObj)) {
      const qi = info && (info.quotaInfo || info.quota_info) ? info.quotaInfo || info.quota_info : null;
      if (!qi) continue;
      const fraction = qi.isExhausted || qi.is_exhausted ? 0 : qi.remainingFraction ?? qi.remaining_fraction ?? qi.remaining;
      const reset = qi.resetTime || qi.reset_time;
      const entry = normalizeQuotaEntry(shortModelLabel(modelId, info.displayName || info.display_name), fraction, reset);
      if (!entry) continue;
      const dedupeKey = `${entry.label.split(' ')[0]}|${entry.remainingFraction.toFixed(3)}|${entry.resetTime || ''}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      quotas.push(entry);
    }
  }

  if (payload.source !== 'agy-snapshot') {
    quotas.sort((a, b) => a.remainingFraction - b.remainingFraction);
  }
  return { quotas, primaryGroup: null };
}

function normalizeBalancePayload(payload, tierInfo = null) {
  const src = payload && typeof payload === 'object' ? payload : {};
  const isSnapshot = isQuotaHubPayload(src) || src.source === 'agy-snapshot';
  const { quotas, primaryGroup } = extractQuotasFromPayload(src);

  const rawBalance =
    src.balance ??
    src.remainingBalance ??
    src.remainingCredits ??
    src.availablePromptCredits ??
    src.availableCredits ??
    src.credits ??
    (tierInfo && (tierInfo.availableCredits ?? tierInfo.availablePromptCredits ?? tierInfo.credits)) ??
    null;

  const balanceText =
    rawBalance !== null && rawBalance !== undefined
      ? formatBalanceAmount(rawBalance, src.currency, src.unit || '')
      : null;

  const plan =
    src.plan ||
    src.tier ||
    extractQuotaHubPlan(primaryGroup) ||
    (tierInfo && ((tierInfo.paidTier && tierInfo.paidTier.name) || (tierInfo.currentTier && tierInfo.currentTier.name))) ||
    null;

  if (!balanceText && quotas.length === 0) {
    throw new Error(isSnapshot ? '暂无配额快照' : '无有效余额字段');
  }

  return {
    plan: plan ? String(plan) : null,
    balanceText,
    quotas,
    updatedAt: (primaryGroup && primaryGroup.updatedAt) || src.updatedAt || null,
  };
}

async function fetchBalanceSummary(ctx, env, endpointConfig = null) {
  const ep = endpointConfig || parseEndpointConfig(env.AGY_BALANCE_URL || env.QUOTA_HUB_URL || '');
  if (ep) {
    const headers = { Accept: 'application/json' };
    const token = (env.AGY_BALANCE_TOKEN || '').trim();
    if (token) headers.Authorization = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
    let lastErr = null;
    for (const url of ep.quotaUrls || []) {
      try {
        return normalizeBalancePayload(await httpJson(ctx, 'get', url, { headers }));
      } catch (err) {
        if (err && err.message === '暂无配额快照') throw err;
        lastErr = err;
      }
    }
    throw lastErr || new Error('余额接口不可用');
  }

  const accessToken = await resolveAccessToken(ctx, env);
  if (!accessToken) return null;

  const customBase = (env.AGY_API_BASE || '').trim().replace(/\/+$/, '');
  const hosts = customBase ? [customBase] : DEFAULT_CLOUDCODE_HOSTS;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'User-Agent': CLOUDCODE_UA,
  };

  let project = (env.AGY_PROJECT_ID || '').trim();
  if (!project) {
    const cachedProj = readStorageJSON(ctx, PROJECT_CACHE_KEY);
    if (cachedProj && cachedProj.project) project = cachedProj.project;
  }

  let tierInfo = null;
  if (!project) {
    for (const host of hosts) {
      try {
        tierInfo = await httpJson(ctx, 'post', `${host}/v1internal:loadCodeAssist`, {
          headers,
          body: { metadata: { ideType: 'ANTIGRAVITY', platform: 'PLATFORM_UNSPECIFIED', pluginType: 'GEMINI' } },
        });
        const pVal = tierInfo && tierInfo.cloudaicompanionProject;
        const pId = typeof pVal === 'string' ? pVal.trim() : pVal && typeof pVal.id === 'string' ? pVal.id.trim() : '';
        if (pId) {
          project = pId;
          writeStorageJSON(ctx, PROJECT_CACHE_KEY, { project });
          break;
        }
      } catch (_) {}
    }
  }

  const bodies = project ? [{ project }, {}] : [{}];
  const paths = ['/v1internal:retrieveUserQuotaSummary', '/v1internal:fetchAvailableModels'];
  let lastErr = null;

  for (const path of paths) {
    for (const host of hosts) {
      for (const body of bodies) {
        try {
          const payload = await httpJson(ctx, 'post', `${host}${path}`, { headers, body });
          return normalizeBalancePayload(payload, tierInfo);
        } catch (e) {
          lastErr = e;
        }
      }
    }
  }
  throw lastErr || new Error('配额接口均不可用');
}

// ---------------------------------------------------------------------------
// 4-card builder (always yields exactly 4 cards matching 实时油价.js)
// ---------------------------------------------------------------------------

function buildCardItems(dashboard, balance, balanceError) {
  const rel = formatRelativeTime(dashboard.latest.announced_at);
  const resetDate = new Date(dashboard.latest.announced_at);
  const resetShortDate = Number.isNaN(resetDate.getTime())
    ? '--'
    : `${pad2(resetDate.getMonth() + 1)}.${pad2(resetDate.getDate())}`;

  const resetTotalCard = {
    label: '累计重置',
    val: `${dashboard.total}次`,
    sub: `均${dashboard.averageDays.toFixed(1)}天`,
    subColor: C.blue,
    color: C.blue,
    hex: HEX.blue,
    graphic: { kind: 'heatmap', records: dashboard.history },
  };
  const avgIntervalCard = {
    label: '平均间隔',
    val: `${dashboard.averageDays.toFixed(1)}天`,
    sub: dashboard.medianDays != null ? `中位${dashboard.medianDays.toFixed(0)}天` : `最长${dashboard.longestDays.toFixed(0)}天`,
    subColor: C.teal,
    color: C.teal,
    hex: HEX.teal,
    graphic: { kind: 'line', series: dashboard.intervals },
  };
  const longestCard = {
    label: '最长间隔',
    val: `${dashboard.longestDays.toFixed(0)}天`,
    sub: `距今${dashboard.daysSinceLast.toFixed(1)}天`,
    subColor: dashboard.daysSinceLast >= dashboard.averageDays ? C.red : C.muted,
    color: C.red,
    hex: HEX.red,
    graphic: { kind: 'line', series: dashboard.intervals.slice().reverse() },
  };
  const latestResetCard = {
    label: '最近重置',
    val: rel,
    sub: resetShortDate,
    subColor: C.gold,
    color: C.gold,
    hex: HEX.gold,
    graphic: { kind: 'heatmap', records: dashboard.history },
  };

  if (balance) {
    const cards = [];
    const lowestQ = pickLowestQuota(balance.quotas);
    if (balance.balanceText) {
      cards.push({
        label: '账户余额',
        val: balance.balanceText,
        sub: balance.plan || '可用额度',
        subColor: C.gold,
        color: C.gold,
        hex: HEX.gold,
        graphic: lowestQ ? { kind: 'gauge', fraction: lowestQ.remainingFraction } : null,
      });
    }
    const maxQuotaCards = balance.balanceText ? 2 : 4;
    for (const q of balance.quotas.slice(0, maxQuotaCards)) {
      const tone = quotaTone(q.remainingFraction);
      cards.push({
        label: q.label,
        val: `${Math.round(q.remainingFraction * 100)}%`,
        sub: formatResetSub(q),
        subColor: tone.color,
        color: tone.color,
        hex: tone.hex,
        graphic: { kind: 'gauge', fraction: q.remainingFraction },
      });
    }
    const fillers = [resetTotalCard, avgIntervalCard, latestResetCard, longestCard];
    for (const filler of fillers) {
      if (cards.length >= 4) break;
      cards.push(filler);
    }
    return cards.slice(0, 4);
  }

  if (balanceError) {
    return [
      latestResetCard,
      resetTotalCard,
      avgIntervalCard,
      {
        label: '余额状态',
        val: '异常',
        sub: balanceError.slice(0, 10),
        subColor: C.red,
        color: C.red,
        hex: HEX.red,
        graphic: null,
      },
    ];
  }

  return [latestResetCard, resetTotalCard, avgIntervalCard, longestCard];
}

// ---------------------------------------------------------------------------
// DSL primitives & 实时油价.js-style card/layout renderers
// ---------------------------------------------------------------------------

function mkText(text, size, weight, color, opts = {}) {
  const { family, ...rest } = opts;
  return {
    type: 'text',
    text: String(text ?? ''),
    font: { size, weight, ...(family ? { family } : {}) },
    textColor: color,
    ...rest,
  };
}

function mkRow(children, gap = 4, opts = {}) {
  return { type: 'stack', direction: 'row', alignItems: 'center', gap, children, ...opts };
}

function mkIcon(name, color, size = 13) {
  return { type: 'image', src: `sf-symbol:${name}`, color, width: size, height: size };
}

function mkSpacer(length) {
  return length != null ? { type: 'spacer', length } : { type: 'spacer' };
}

function renderCardGraphic(item, config) {
  if (!config.showGraphic || !item.graphic) return null;
  const { graphicWidth: width, graphicHeight: height } = config;
  if (item.graphic.kind === 'gauge') {
    return quotaGaugeSVG(item.graphic.fraction, { color: item.hex, width, height });
  }
  if (item.graphic.kind === 'line') {
    return lineChartSVG(item.graphic.series, { color: item.hex, width, height, lineWidth: 1.8 });
  }
  if (item.graphic.kind === 'heatmap') {
    return miniHeatmapSVG(item.graphic.records, { width, height });
  }
  return null;
}

function buildInfoCard(item, config) {
  const svgUrl = renderCardGraphic(item, config);
  return {
    type: 'stack',
    direction: 'column',
    alignItems: 'center',
    flex: 1,
    backgroundColor: C.card,
    borderRadius: config.radius,
    padding: config.padding,
    borderWidth: 0.5,
    borderColor: C.cardBorder,
    children: [
      mkSpacer(),
      mkText(item.label, config.labelFz, config.labelWeight, item.color, { maxLines: 1, minScale: 0.7 }),
      mkSpacer(config.innerGap),
      mkText(item.val, config.valFz, 'heavy', C.main, { maxLines: 1, minScale: 0.65 }),
      mkSpacer(config.deltaGap ?? 2),
      mkText(item.sub || ' ', config.deltaFz, 'bold', item.subColor || C.muted, { maxLines: 1, minScale: 0.7 }),
      ...(svgUrl
        ? [
            mkSpacer(config.graphicGap ?? 5),
            {
              type: 'image',
              src: svgUrl,
              width: config.graphicWidth,
              height: config.graphicHeight,
              resizable: true,
              resizeMode: 'contain',
            },
          ]
        : []),
      mkSpacer(),
    ],
  };
}

function renderLockScreen(family, { dashboard, balance, refreshAfter, widgetUrl }) {
  const rel = formatRelativeTime(dashboard.latest.announced_at);
  const targetUrl = widgetUrl || WEBSITE_URL;
  const topQ = pickLowestQuota(balance && balance.quotas);
  const quotaShort = topQ
    ? `${Math.round(topQ.remainingFraction * 100)}%`
    : balance && balance.balanceText
      ? balance.balanceText
      : '';

  if (family === 'accessoryInline') {
    return {
      type: 'widget',
      url: targetUrl,
      refreshAfter,
      children: [mkText(quotaShort ? `AGY ${rel} · 余 ${quotaShort}` : `AGY 重置 ${rel}`, 'body', 'semibold', C.main, { maxLines: 1 })],
    };
  }
  if (family === 'accessoryCircular') {
    return {
      type: 'widget',
      url: targetUrl,
      refreshAfter,
      padding: 4,
      gap: 1,
      children: [
        mkText('AGY', 10, 'bold', C.muted, { textAlign: 'center', maxLines: 1 }),
        mkText(quotaShort || rel, 14, 'heavy', C.main, { textAlign: 'center', maxLines: 1, minScale: 0.6 }),
      ],
    };
  }
  const rectSub = topQ
    ? `${topQ.label} ${quotaShort}`
    : balance && balance.balanceText
      ? `余 ${balance.balanceText}`
      : `累计 ${dashboard.total}次 · 均 ${dashboard.averageDays.toFixed(1)}天`;
  return {
    type: 'widget',
    url: targetUrl,
    refreshAfter,
    gap: 2,
    children: [
      mkText(`AGY 重置 · ${rel}`, 'headline', 'bold', C.main, { maxLines: 1, minScale: 0.75 }),
      mkText(rectSub, 'caption1', 'medium', C.muted, { maxLines: 1, minScale: 0.75 }),
    ],
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export default async function (ctx) {
  const env = (ctx && ctx.env) || {};
  const familyRaw = (ctx && ctx.widgetFamily) || 'systemMedium';
  const family = familyRaw.toLowerCase();
  const isSmall = family.includes('small');
  const isLarge = family.includes('large');
  const isLock = family.startsWith('accessory');

  const refreshMinutes = Math.max(5, Number(env.REFRESH_MINUTES) || DEFAULT_REFRESH_MINUTES);
  const refreshAfter = new Date(Date.now() + refreshMinutes * 60 * 1000).toISOString();
  const updateTimeStr = formatStamp(new Date());

  const endpointConfig = parseEndpointConfig(env.AGY_BALANCE_URL || env.QUOTA_HUB_URL || '');
  const widgetUrl = (endpointConfig && endpointConfig.webUrl) || WEBSITE_URL;
  const hasBalanceConfig = Boolean(
    endpointConfig ||
      (env.AGY_ACCESS_TOKEN || '').trim() ||
      (env.AGY_REFRESH_TOKEN || '').trim()
  );
  const needHistory = isLarge;
  const cached = readStorageJSON(ctx, SNAPSHOT_CACHE_KEY);

  const [resetsResult, balanceResult] = await Promise.allSettled([
    fetchResetsDashboard(ctx, needHistory, endpointConfig && endpointConfig.resetsUrl),
    hasBalanceConfig ? fetchBalanceSummary(ctx, env, endpointConfig) : Promise.resolve(null),
  ]);

  let dashboard = null;
  if (resetsResult.status === 'fulfilled') {
    dashboard = resetsResult.value;
    if (!dashboard.history.length && cached && cached.dashboard && cached.dashboard.history) {
      dashboard.history = cached.dashboard.history;
      dashboard.intervals = cached.dashboard.intervals || [];
    }
  } else if (cached && cached.dashboard) {
    dashboard = cached.dashboard;
  } else {
    const errMsg = resetsResult.reason instanceof Error ? resetsResult.reason.message : String(resetsResult.reason);
    return {
      type: 'widget',
      url: widgetUrl,
      refreshAfter,
      padding: 16,
      backgroundColor: ROOT_BG,
      children: [
        mkRow([mkIcon('arrow.clockwise.circle.fill', C.red, 16), mkSpacer(4), mkText('AGY 加载失败', 15, 'heavy', C.main)], 0),
        mkSpacer(8),
        mkText(errMsg, 11, 'medium', C.muted, { maxLines: 3 }),
      ],
    };
  }

  let balance = null;
  let balanceError = null;
  if (hasBalanceConfig) {
    if (balanceResult.status === 'fulfilled') {
      balance = balanceResult.value;
    } else if (cached && cached.balance) {
      balance = cached.balance;
    } else {
      balanceError = balanceResult.reason instanceof Error ? balanceResult.reason.message : String(balanceResult.reason);
    }
  }

  writeStorageJSON(ctx, SNAPSHOT_CACHE_KEY, {
    dashboard,
    balance: balance || (cached && cached.balance) || null,
    savedAt: Date.now(),
  });

  if (isLock) {
    return renderLockScreen(familyRaw, { dashboard, balance, refreshAfter, widgetUrl });
  }

  const cards = buildCardItems(dashboard, balance, balanceError);
  const resetAt = new Date(dashboard.latest.announced_at);
  const resetDateStr = Number.isNaN(resetAt.getTime()) ? '--' : formatStamp(resetAt);
  const resetRel = formatRelativeTime(dashboard.latest.announced_at);
  const isUrgent = Boolean(dashboard.scheduledReset || dashboard.daysSinceLast >= dashboard.averageDays);
  const infoColor = isUrgent ? C.red : C.gold;

  const widgetTitle = balance
    ? balance.plan && (!isSmall || balance.plan.length <= 6)
      ? `AGY ${balance.plan}`
      : balance.balanceText
        ? 'AGY 余额'
        : 'AGY 配额'
    : 'AGY 重置';
  const footerLabel = balance ? '配额状态: ' : '重置节奏: ';
  const lowestQuota = pickLowestQuota(balance && balance.quotas);
  const footerInfo = lowestQuota
    ? `${lowestQuota.label} ${Math.round(lowestQuota.remainingFraction * 100)}%`
    : `均 ${dashboard.averageDays.toFixed(1)}天 · 最长 ${dashboard.longestDays.toFixed(0)}天`;
  const footerColor = lowestQuota ? quotaTone(lowestQuota.remainingFraction).color : isUrgent ? C.red : C.teal;

  // 小号 (Small): 2x2 四宫格，完全对齐 实时油价.js
  if (isSmall) {
    const cardCfg = {
      radius: 10,
      padding: [4, 2, 4, 2],
      labelFz: 10,
      labelWeight: 'bold',
      valFz: 14,
      innerGap: 1,
      deltaFz: 9,
      deltaGap: 1,
    };
    return {
      type: 'widget',
      url: widgetUrl,
      refreshAfter,
      padding: [12, 12, 8, 12],
      backgroundColor: ROOT_BG,
      children: [
        mkRow(
          [
            mkIcon('arrow.clockwise.circle.fill', C.accent, 13),
            mkSpacer(4),
            mkText(widgetTitle, 13, 'heavy', C.main, { maxLines: 1, minScale: 0.75 }),
            mkSpacer(),
            mkIcon('arrow.triangle.2.circlepath', C.muted, 9),
            mkSpacer(2),
            mkText(updateTimeStr, 9, 'bold', C.muted, { family: 'Menlo', maxLines: 1 }),
          ],
          0
        ),
        mkSpacer(7),
        {
          type: 'stack',
          direction: 'column',
          gap: 8,
          flex: 1,
          children: [
            mkRow(cards.slice(0, 2).map((item) => buildInfoCard(item, cardCfg)), 6, { flex: 1 }),
            mkRow(cards.slice(2, 4).map((item) => buildInfoCard(item, cardCfg)), 6, { flex: 1 }),
          ],
        },
        mkSpacer(7),
        mkRow(
          [
            mkSpacer(),
            mkIcon('clock.fill', isUrgent ? C.red : C.muted, 9),
            mkSpacer(3),
            mkText(`最近重置: ${resetDateStr}`, 9, 'bold', isUrgent ? C.red : C.muted, { maxLines: 1 }),
          ],
          0
        ),
      ],
    };
  }

  // 大号 (Large): 2x2 放大四宫格 + 内嵌 SVG 曲线/热力图/配额条
  if (isLarge) {
    const cardCfg = {
      radius: 14,
      padding: [10, 4, 10, 4],
      labelFz: 14,
      labelWeight: 'heavy',
      valFz: 24,
      innerGap: 4,
      deltaFz: 12,
      deltaGap: 2,
      showGraphic: true,
      graphicWidth: 84,
      graphicHeight: 26,
      graphicGap: 5,
    };
    return {
      type: 'widget',
      url: widgetUrl,
      refreshAfter,
      padding: [16, 16, 14, 16],
      backgroundColor: ROOT_BG,
      children: [
        mkRow(
          [
            mkIcon('arrow.clockwise.circle.fill', C.accent, 17),
            mkSpacer(4),
            mkText(widgetTitle, 16, 'heavy', C.main, { maxLines: 1, minScale: 0.75 }),
            mkSpacer(),
            mkText('最近重置: ', 12, 'medium', infoColor),
            mkText(resetDateStr, 12, 'bold', infoColor),
            mkText(` (${resetRel})`, 12, 'bold', infoColor),
          ],
          0
        ),
        mkSpacer(14),
        {
          type: 'stack',
          direction: 'column',
          gap: 12,
          flex: 1,
          children: [
            mkRow(cards.slice(0, 2).map((item) => buildInfoCard(item, cardCfg)), 12, { flex: 1 }),
            mkRow(cards.slice(2, 4).map((item) => buildInfoCard(item, cardCfg)), 12, { flex: 1 }),
          ],
        },
        mkSpacer(12),
        { type: 'stack', height: 0.5, backgroundColor: C.divider, borderRadius: 1, children: [] },
        mkSpacer(8),
        mkRow(
          [
            mkRow([mkText(footerLabel, 11, 'medium', C.muted), mkText(footerInfo, 11, 'bold', footerColor, { maxLines: 1 })], 2),
            mkSpacer(),
            mkRow(
              [
                mkIcon('arrow.triangle.2.circlepath', C.muted, 12),
                mkSpacer(4),
                mkText(updateTimeStr, 11, 'bold', C.muted, { family: 'Menlo' }),
              ],
              0
            ),
          ],
          0
        ),
      ],
    };
  }

  // 中号 (Medium): 1x4 横排卡片布局，对齐 实时油价.js
  const cardCfgMed = {
    radius: 13,
    padding: [12, 6, 12, 6],
    labelFz: 11,
    labelWeight: 'bold',
    valFz: 18,
    innerGap: 4,
    deltaFz: 11,
    deltaGap: 2,
  };
  return {
    type: 'widget',
    url: widgetUrl,
    refreshAfter,
    padding: [10, 12, 6, 12],
    backgroundColor: ROOT_BG,
    children: [
      mkRow(
        [
          mkIcon('arrow.clockwise.circle.fill', C.accent, 16),
          mkSpacer(2),
          mkText(widgetTitle, 15, 'heavy', C.main, { maxLines: 1, minScale: 0.75 }),
          mkSpacer(),
          mkText('最近重置: ', 11, 'medium', infoColor),
          mkText(resetDateStr, 11, 'bold', infoColor),
          mkText(` (${resetRel})`, 11, 'bold', infoColor),
        ],
        0
      ),
      mkSpacer(24),
      mkRow(cards.map((item) => buildInfoCard(item, cardCfgMed)), 6),
      mkSpacer(15),
      { type: 'stack', height: 0.5, backgroundColor: C.divider, borderRadius: 1, children: [] },
      mkSpacer(8),
      mkRow(
        [
          mkRow([mkText(footerLabel, 11, 'medium', C.muted), mkText(footerInfo, 11, 'bold', footerColor, { maxLines: 1 })], 2),
          mkSpacer(),
          mkRow(
            [
              mkIcon('arrow.triangle.2.circlepath', C.muted, 11),
              mkSpacer(4),
              mkText(updateTimeStr, 10, 'bold', C.muted, { family: 'Menlo' }),
            ],
            0
          ),
        ],
        0
      ),
    ],
  };
}
