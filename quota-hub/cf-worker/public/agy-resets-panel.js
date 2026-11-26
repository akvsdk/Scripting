// Ruixen-inspired Extreme Tech Liquid-Glass AgyResets Panel: <agy-resets-panel>
// Mirrors AgyResets.scripting data model (agyresets.com public API: latest reset, 26-week Pacific heatmap, 3 stats)
// redesigned in the unified liquid-glass HUD aesthetic.

const DAY_MS = 86400000;
const HEATMAP_WEEKS = 26;
const WEBSITE_URL = 'https://agyresets.com/zh-CN';

const pacificFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Los_Angeles',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const RESET_ICON = `
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M21 12a9 9 0 1 1-2.64-6.36"></path>
  <polyline points="21 3 21 9 15 9"></polyline>
</svg>`;

const EXT_ICON = `
<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M7 17L17 7"></path>
  <path d="M7 7h10v10"></path>
</svg>`;

function escapeHtml(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toPacificDateKey(date) {
  return pacificFormatter.format(date);
}

function todayPacificUtc() {
  const [y, m, d] = toPacificDateKey(new Date()).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatRelativeZh(iso) {
  if (!iso) return '--';
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return '--';
  const sec = Math.abs(Math.round((Date.now() - ts) / 1000));
  if (sec < 45) return '刚刚';
  const units = [
    [31536000, '年'],
    [2592000, '个月'],
    [86400, '天'],
    [3600, '小时'],
    [60, '分钟'],
  ];
  for (const [unitSec, label] of units) {
    if (sec >= unitSec) return `${Math.round(sec / unitSec)} ${label}前`;
  }
  return '刚刚';
}

function formatLocalDate(iso) {
  if (!iso) return '--';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function kindLabel(kind) {
  if (kind === 'weekly') return '每周重置';
  if (kind === 'rate_limit') return '触发限流';
  if (kind === 'unspecified') return '未标注';
  return '无记录';
}

function buildHeatmapColumns(history = [], weeks = HEATMAP_WEEKS) {
  const map = new Map();
  for (const rec of history) {
    const ts = Date.parse(rec.announced_at);
    if (Number.isNaN(ts)) continue;
    const key = toPacificDateKey(new Date(ts));
    const prev = map.get(key);
    if (!prev) {
      map.set(key, { kind: rec.kind, ts, count: 1 });
    } else {
      const latest = ts >= prev.ts;
      map.set(key, {
        kind: latest ? rec.kind : prev.kind,
        ts: latest ? ts : prev.ts,
        count: prev.count + 1,
      });
    }
  }

  const utcToday = todayPacificUtc();
  const mondayOffset = (utcToday.getUTCDay() + 6) % 7;
  const currentMonday = new Date(utcToday.getTime() - mondayOffset * DAY_MS);
  const firstMonday = new Date(currentMonday.getTime() - (weeks - 1) * 7 * DAY_MS);

  const cols = [];
  for (let w = 0; w < weeks; w++) {
    const days = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(firstMonday.getTime() + (w * 7 + d) * DAY_MS);
      const dateKey = date.toISOString().slice(0, 10);
      const agg = map.get(dateKey);
      days.push({
        dateKey,
        kind: agg?.kind ?? null,
        count: agg?.count ?? 0,
        isFuture: date.getTime() > utcToday.getTime(),
      });
    }
    cols.push(days);
  }
  return cols;
}

export class AgyResetsPanelElement extends HTMLElement {
  static get observedAttributes() {
    return ['variant'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._data = null;
    this._onPointerMove = (e) => {
      const el = e.target && e.target.closest ? e.target.closest('.stat, .panel') : null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${(e.clientX - r.left).toFixed(1)}px`);
      el.style.setProperty('--my', `${(e.clientY - r.top).toFixed(1)}px`);
    };
  }

  set data(val) {
    this._data = val;
    this.render();
  }

  get data() {
    return this._data;
  }

  connectedCallback() {
    this.render();
    this.shadowRoot.addEventListener('pointermove', this._onPointerMove);
  }

  disconnectedCallback() {
    this.shadowRoot.removeEventListener('pointermove', this._onPointerMove);
  }

  attributeChangedCallback() {
    this.render();
  }

  render() {
    const variant = this.getAttribute('variant') || 'frosted';
    const d = this._data;
    const latest = d?.latest ?? null;
    const stats = d?.stats ?? null;
    const history = Array.isArray(d?.history) ? d.history : [];
    const cols = buildHeatmapColumns(history, HEATMAP_WEEKS);

    const relText = latest ? formatRelativeZh(latest.announced_at) : '--';
    const dateText = latest ? formatLocalDate(latest.announced_at) : '等待公开接口数据...';
    const totalText = stats?.total ?? '--';
    const avgText = typeof stats?.avg_interval_days === 'number' ? `${stats.avg_interval_days.toFixed(1)} 天` : '--';
    const longestText = typeof stats?.longest_gap_days === 'number' ? `${stats.longest_gap_days.toFixed(1)} 天` : '--';

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          font-family: var(--qp-font-sans, 'Space Grotesk', 'Noto Sans SC', -apple-system, sans-serif);
        }

        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.45; transform: scale(0.82); }
        }

        .panel {
          --mx: 50%;
          --my: 0%;
          position: relative;
          border-radius: var(--qp-radius, 20px);
          padding: 20px;
          color: #f1f5f9;
          border: 1px solid rgba(148, 163, 184, 0.16);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.16),
            0 24px 54px -22px rgba(0, 0, 0, 0.78),
            0 0 0 1px rgba(56, 189, 248, 0.06);
          overflow: hidden;
          transition: background 0.25s ease, border-color 0.25s ease, backdrop-filter 0.25s ease;
        }

        .panel::before {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: radial-gradient(340px circle at var(--mx) var(--my), rgba(56, 189, 248, 0.08), transparent 68%);
          opacity: 0;
          transition: opacity 0.26s ease;
        }
        .panel:hover::before { opacity: 1; }

        .panel::after {
          content: "";
          position: absolute;
          top: 0;
          left: 12%;
          right: 12%;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(56, 189, 248, 0.75), rgba(251, 146, 60, 0.65), rgba(244, 114, 182, 0.7), transparent);
          pointer-events: none;
        }

        .panel[data-variant="frosted"] {
          background: linear-gradient(145deg, rgba(15, 23, 42, 0.56) 0%, rgba(7, 12, 24, 0.42) 100%);
          backdrop-filter: blur(24px) saturate(165%);
          -webkit-backdrop-filter: blur(24px) saturate(165%);
        }

        .panel[data-variant="crystal"] {
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.11) 0%, rgba(56, 189, 248, 0.03) 48%, rgba(244, 114, 182, 0.06) 100%);
          backdrop-filter: blur(12px) saturate(195%);
          -webkit-backdrop-filter: blur(12px) saturate(195%);
          border-color: rgba(125, 211, 252, 0.26);
        }

        .panel[data-variant="wireframe"] {
          background: rgba(6, 11, 22, 0.14);
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
          border-color: rgba(56, 189, 248, 0.28);
          box-shadow: inset 0 0 28px rgba(56, 189, 248, 0.05);
        }

        .reticle { position: absolute; width: 10px; height: 10px; pointer-events: none; opacity: 0.55; }
        .tl { top: 8px; left: 8px; border-top: 1px solid #38bdf8; border-left: 1px solid #38bdf8; }
        .tr { top: 8px; right: 8px; border-top: 1px solid #38bdf8; border-right: 1px solid #38bdf8; }
        .bl { bottom: 8px; left: 8px; border-bottom: 1px solid #38bdf8; border-left: 1px solid #38bdf8; }
        .br { bottom: 8px; right: 8px; border-bottom: 1px solid #38bdf8; border-right: 1px solid #38bdf8; }

        .top-grid {
          position: relative;
          z-index: 1;
          display: grid;
          grid-template-columns: minmax(210px, 0.92fr) minmax(0, 1.38fr);
          gap: 18px;
          align-items: center;
          padding-bottom: 16px;
          margin-bottom: 14px;
          border-bottom: 1px solid rgba(148, 163, 184, 0.12);
        }

        @media (max-width: 680px) {
          .top-grid { grid-template-columns: 1fr; }
        }

        .hero {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .hero-head {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .icon-orb {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border-radius: 9px;
          background: linear-gradient(135deg, rgba(56, 189, 248, 0.22), rgba(29, 111, 251, 0.1));
          border: 1px solid rgba(56, 189, 248, 0.42);
          color: #74e1ff;
          box-shadow: 0 0 16px rgba(56, 189, 248, 0.24);
        }

        .brand {
          font-size: 14.5px;
          font-weight: 700;
          letter-spacing: 0.04em;
        }

        .latest-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 2px 9px;
          border-radius: 999px;
          font-family: 'JetBrains Mono', 'Noto Sans SC', monospace;
          font-size: 10px;
          font-weight: 700;
          background: linear-gradient(135deg, rgba(250, 204, 21, 0.24), rgba(245, 158, 11, 0.12));
          border: 1px solid rgba(250, 204, 21, 0.5);
          color: #fde047;
          box-shadow: 0 0 14px rgba(250, 204, 21, 0.2);
        }

        .latest-dot {
          width: 5px;
          height: 5px;
          border-radius: 999px;
          background: #fde047;
          animation: pulse-dot 2s ease-in-out infinite;
        }

        .rel-time {
          font-family: 'JetBrains Mono', 'Noto Sans SC', monospace;
          font-variant-numeric: tabular-nums;
          font-size: 32px;
          font-weight: 700;
          line-height: 1.1;
          letter-spacing: -0.02em;
          background: linear-gradient(135deg, #ffffff 10%, #74e1ff 68%, #c084fc 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .date-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          color: rgba(148, 163, 184, 0.82);
        }

        .kind-chip {
          padding: 1px 6px;
          border-radius: 5px;
          font-size: 10px;
          font-weight: 600;
          border: 1px solid rgba(255, 255, 255, 0.12);
        }
        .kind-chip[data-kind="weekly"] { background: rgba(56, 189, 248, 0.18); border-color: rgba(56, 189, 248, 0.45); color: #7dd3fc; }
        .kind-chip[data-kind="rate_limit"] { background: rgba(251, 146, 60, 0.18); border-color: rgba(251, 146, 60, 0.45); color: #fdba74; }
        .kind-chip[data-kind="unspecified"] { background: rgba(244, 114, 182, 0.18); border-color: rgba(244, 114, 182, 0.45); color: #f9a8d4; }

        .source-link {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          width: fit-content;
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px;
          color: rgba(116, 225, 255, 0.78);
          text-decoration: none;
          transition: color 0.18s ease;
        }
        .source-link:hover { color: #ffffff; }

        /* 26-week heatmap panel */
        .heatmap-wrap {
          display: flex;
          flex-direction: column;
          gap: 7px;
          min-width: 0;
        }

        .heatmap-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          flex-wrap: wrap;
          font-family: 'JetBrains Mono', 'Noto Sans SC', monospace;
          font-size: 10px;
          color: rgba(148, 163, 184, 0.78);
        }

        .legend {
          display: inline-flex;
          align-items: center;
          gap: 9px;
        }

        .legend-item {
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }

        .swatch {
          width: 7px;
          height: 7px;
          border-radius: 2px;
        }
        .swatch.w { background: #38bdf8; box-shadow: 0 0 6px rgba(56, 189, 248, 0.7); }
        .swatch.r { background: #fb923c; box-shadow: 0 0 6px rgba(251, 146, 60, 0.7); }
        .swatch.u { background: #f472b6; box-shadow: 0 0 6px rgba(244, 114, 182, 0.7); }

        .heatmap-grid {
          display: grid;
          grid-template-columns: repeat(26, minmax(0, 1fr));
          gap: 3px;
          padding: 9px 10px;
          border-radius: 12px;
          background: rgba(6, 11, 22, 0.42);
          border: 1px solid rgba(255, 255, 255, 0.07);
          box-shadow: inset 0 1px 4px rgba(0, 0, 0, 0.45);
        }

        .hm-col {
          display: grid;
          grid-template-rows: repeat(7, 1fr);
          gap: 3px;
        }

        .hm-cell {
          aspect-ratio: 1 / 1;
          border-radius: 2.5px;
          background: rgba(148, 163, 184, 0.1);
          transition: transform 0.15s ease, filter 0.15s ease;
        }

        .hm-cell:hover {
          transform: scale(1.35);
          z-index: 2;
        }

        .hm-cell[data-future="true"] {
          background: rgba(148, 163, 184, 0.035);
        }

        .hm-cell[data-kind="weekly"] {
          background: #38bdf8;
          box-shadow: 0 0 8px rgba(56, 189, 248, 0.65);
        }

        .hm-cell[data-kind="rate_limit"] {
          background: #fb923c;
          box-shadow: 0 0 8px rgba(251, 146, 60, 0.65);
        }

        .hm-cell[data-kind="unspecified"] {
          background: #f472b6;
          box-shadow: 0 0 8px rgba(244, 114, 182, 0.65);
        }

        .note-strip {
          position: relative;
          z-index: 1;
          margin-bottom: 14px;
          padding: 9px 12px;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.035);
          border: 1px solid rgba(255, 255, 255, 0.07);
          font-size: 11.5px;
          line-height: 1.5;
          color: rgba(226, 232, 240, 0.8);
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        /* 3-column stats bar (mirrors AgyResets StatsRow) */
        .stats-row {
          position: relative;
          z-index: 1;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
        }

        @media (max-width: 520px) {
          .stats-row { grid-template-columns: 1fr; }
        }

        .stat {
          --mx: 50%;
          --my: 50%;
          position: relative;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 13px;
          border-radius: 12px;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.055), rgba(255, 255, 255, 0.02));
          border: 1px solid rgba(255, 255, 255, 0.09);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
          transition: border-color 0.18s ease, transform 0.18s ease;
        }

        .stat::before {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.2s ease;
          background: radial-gradient(110px circle at var(--mx) var(--my), rgba(116, 225, 255, 0.16), transparent 72%);
        }

        .stat:hover { border-color: rgba(116, 225, 255, 0.36); transform: translateY(-1px); }
        .stat:hover::before { opacity: 1; }

        .stat-label {
          position: relative;
          z-index: 1;
          font-size: 11px;
          color: rgba(148, 163, 184, 0.85);
        }

        .stat-val {
          position: relative;
          z-index: 1;
          font-family: 'JetBrains Mono', 'Noto Sans SC', monospace;
          font-variant-numeric: tabular-nums;
          font-size: 14px;
          font-weight: 700;
        }

        .stat-val.sky { color: #74e1ff; text-shadow: 0 0 12px rgba(116, 225, 255, 0.4); }
        .stat-val.pink { color: #f9a8d4; text-shadow: 0 0 12px rgba(244, 114, 182, 0.35); }
        .stat-val.gold { color: #fde047; text-shadow: 0 0 12px rgba(250, 204, 21, 0.35); }
      </style>

      <section class="panel" data-variant="${escapeHtml(variant)}">
        <span class="reticle tl"></span><span class="reticle tr"></span>
        <span class="reticle bl"></span><span class="reticle br"></span>

        <div class="top-grid">
          <div class="hero">
            <div class="hero-head">
              <span class="icon-orb">${RESET_ICON}</span>
              <span class="brand">AGY RESETS</span>
              <span class="latest-pill"><span class="latest-dot"></span>最近重置</span>
            </div>
            <div class="rel-time">${escapeHtml(relText)}</div>
            <div class="date-meta">
              <span>${escapeHtml(dateText)}</span>
              ${latest?.kind ? `<span class="kind-chip" data-kind="${escapeHtml(latest.kind)}">${escapeHtml(kindLabel(latest.kind))}</span>` : ''}
            </div>
            <a class="source-link" href="${WEBSITE_URL}" target="_blank" rel="noopener noreferrer">
              <span>agyresets.com 公开公告源</span>${EXT_ICON}
            </a>
          </div>

          <div class="heatmap-wrap">
            <div class="heatmap-head">
              <span>26 周重置热力图 (PT)</span>
              <span class="legend">
                <span class="legend-item"><i class="swatch w"></i>周重置</span>
                <span class="legend-item"><i class="swatch r"></i>限流</span>
                <span class="legend-item"><i class="swatch u"></i>未标注</span>
              </span>
            </div>
            <div class="heatmap-grid" role="img" aria-label="26周重置热力图">
              ${cols.map((col) => `
                <div class="hm-col">
                  ${col.map((cell) => {
                    const tip = cell.count > 0
                      ? `${cell.dateKey} · ${kindLabel(cell.kind)} (${cell.count}次)`
                      : cell.dateKey;
                    return `<span class="hm-cell" title="${escapeHtml(tip)}" data-kind="${escapeHtml(cell.kind || '')}" data-future="${cell.isFuture}"></span>`;
                  }).join('')}
                </div>
              `).join('')}
            </div>
          </div>
        </div>

        ${latest?.text ? `<div class="note-strip">${escapeHtml(latest.text)}</div>` : ''}

        <div class="stats-row">
          <div class="stat">
            <span class="stat-label">累计重置</span>
            <span class="stat-val sky">${escapeHtml(totalText)} 次</span>
          </div>
          <div class="stat">
            <span class="stat-label">平均间隔</span>
            <span class="stat-val pink">${escapeHtml(avgText)}</span>
          </div>
          <div class="stat">
            <span class="stat-label">最长间隔</span>
            <span class="stat-val gold">${escapeHtml(longestText)}</span>
          </div>
        </div>
      </section>
    `;
  }
}

export function registerAgyResetsPanel(tagName = 'agy-resets-panel') {
  if (!customElements.get(tagName)) {
    customElements.define(tagName, AgyResetsPanelElement);
  }
}

registerAgyResetsPanel();
