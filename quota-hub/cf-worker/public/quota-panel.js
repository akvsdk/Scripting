// Ruixen-inspired Extreme Tech Liquid-Glass Account & Quota Panel: <quota-panel>
// Combines full 6-row Antigravity model matrix, vivid prestige tier badges (ULTRA / PRO / ENTERPRISE / FREE),
// and living plasma-flow progress bars with traveling comet sheen & glowing energy spark tips.

const CHECK_ICON = `
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <circle cx="12" cy="12" r="9"></circle>
  <polyline points="8.5 12.2 11 14.7 15.8 9.6"></polyline>
</svg>`;

const MAIL_ICON = `
<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <rect x="3" y="5" width="18" height="14" rx="2.5"></rect>
  <polyline points="4 7 12 13 20 7"></polyline>
</svg>`;

const SPARK_ICON = `
<svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" fill="currentColor"/>
</svg>`;

const CLUSTER_ICON = `
<svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <circle cx="12" cy="5" r="2.1" fill="currentColor"/>
  <circle cx="5.5" cy="12" r="2.1" fill="currentColor" opacity="0.78"/>
  <circle cx="18.5" cy="12" r="2.1" fill="currentColor" opacity="0.78"/>
  <circle cx="12" cy="19" r="2.1" fill="currentColor"/>
  <circle cx="12" cy="12" r="2.6" fill="currentColor"/>
</svg>`;

const CLOCK_ICON = `
<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <circle cx="12" cy="12" r="9"></circle>
  <polyline points="12 7 12 12 15 14"></polyline>
</svg>`;

// 高辨识度用户等级矢量图标（ULTRA 钻石保持端正静稳，仅两颗小星星交替闪烁 + 柔光）
const TIER_ICONS = {
  ultra: `
<span class="gem-stage">
  <svg class="gem-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M6.2 4.5H17.8L21.4 10L12 20.8L2.6 10L6.2 4.5Z" fill="#ffffff" fill-opacity="0.28" stroke="#ffffff" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M8.6 4.5L12 10L15.4 4.5H8.6Z" fill="#ffffff" fill-opacity="0.72"/>
    <path d="M2.6 10H21.4M8.6 4.5L6.8 10L12 20.8L17.2 10L15.4 4.5" stroke="#ffffff" stroke-width="1.35" stroke-linejoin="round"/>
  </svg>
  <span class="gem-star gem-star-a">✦</span>
  <span class="gem-star gem-star-b">✦</span>
</span>`,
  pro: `
<svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <path d="M12 2.2L21.8 12L12 21.8L2.2 12L12 2.2Z" fill="currentColor"/>
</svg>`,
  enterprise: `
<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <path d="M3.5 17.5L5.2 7.5L10 11.5L12 5.2L14 11.5L18.8 7.5L20.5 17.5H3.5Z" fill="currentColor" fill-opacity="0.35" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/>
  <path d="M4.5 20.2H19.5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>
</svg>`,
  free: `
<svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <circle cx="12" cy="12" r="7.5" stroke="currentColor" stroke-width="2" stroke-dasharray="3 2.5"/>
  <circle cx="12" cy="12" r="2.2" fill="currentColor"/>
</svg>`,
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatRelativeAge(ts) {
  if (!ts || !Number.isFinite(ts)) return '';
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return 'SYNCED JUST NOW';
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `SYNCED ${min}M AGO`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `SYNCED ${hr}H AGO`;
  return `SYNCED ${Math.floor(hr / 24)}D AGO`;
}

function statusTone(pct) {
  if (pct === null || pct === undefined || Number.isNaN(pct)) return 'na';
  if (pct <= 20) return 'danger';
  if (pct <= 50) return 'warn';
  return 'ok';
}

function resolveBadgeIcon(badge) {
  if (badge.icon && TIER_ICONS[badge.icon]) return badge.icon;
  const text = String(badge.text || '').toLowerCase();
  if (text.includes('ultra')) return 'ultra';
  if (text.includes('enterprise') || text.includes('business')) return 'enterprise';
  if (text === 'pro' || text.includes(' pro') || text.startsWith('pro ')) return 'pro';
  if (text === 'free' || text.includes('free')) return 'free';
  return null;
}

function resolveBadgeTone(badge, inferredIcon) {
  if (badge.tone) return badge.tone;
  if (inferredIcon === 'ultra') return 'purple';
  if (inferredIcon === 'pro') return 'accent';
  if (inferredIcon === 'enterprise') return 'gold';
  return 'default';
}

export class QuotaPanelElement extends HTMLElement {
  static get observedAttributes() {
    return ['variant'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._data = { id: 'empty', title: '当前账号', badges: [], items: [] };
    this._onPointerMove = this._handlePointerMove.bind(this);
  }

  set data(value) {
    this._data = value || { id: 'empty', title: '当前账号', badges: [], items: [] };
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

  _handlePointerMove(e) {
    const target = e.target && e.target.closest ? e.target.closest('.pill, .panel') : null;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    target.style.setProperty('--mx', `${(e.clientX - rect.left).toFixed(1)}px`);
    target.style.setProperty('--my', `${(e.clientY - rect.top).toFixed(1)}px`);
  }

  render() {
    const variant = this.getAttribute('variant') || 'frosted';
    const {
      title = '当前账号',
      accountEmail = '',
      subtitle = '',
      updatedAt,
      badges = [],
      items = [],
    } = this._data;
    const syncedText = formatRelativeAge(updatedAt);

    // 去重统计均值（只取核心 4 桶或全部数值项均值）
    const coreIds = new Set(['gemini-5h', '3p-5h', 'gemini-weekly', '3p-weekly']);
    const coreItems = items.filter((i) => coreIds.has(i.id));
    const statPool = coreItems.length > 0 ? coreItems : items;
    const numeric = statPool.map((i) => i.remainingPercent).filter((v) => typeof v === 'number');
    const avgPct = numeric.length
      ? Math.round(numeric.reduce((a, b) => a + b, 0) / numeric.length)
      : null;

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          font-family: var(--qp-font-sans, 'Space Grotesk', 'Noto Sans SC', -apple-system, BlinkMacSystemFont, sans-serif);
        }

        /* 全部动画仅使用 GPU 合成属性（transform + opacity），杜绝浏览器卡顿冻结 */
        @keyframes stripe-slide {
          0% { transform: translate3d(-28px, 0, 0); }
          100% { transform: translate3d(0px, 0, 0); }
        }

        @keyframes flux-sheen {
          0% { transform: translate3d(-120%, 0, 0); opacity: 0.35; }
          45% { opacity: 0.95; }
          100% { transform: translate3d(340%, 0, 0); opacity: 0.35; }
        }

        @keyframes tip-breathe {
          0%, 100% { transform: translate3d(0, -50%, 0) scale(0.9); opacity: 0.8; }
          50% { transform: translate3d(0, -50%, 0) scale(1.4); opacity: 1; }
        }

        /* 仅两颗小星星交替闪烁 + 柔和星芒光效（极简克制） */
        @keyframes star-twinkle {
          0%, 100% { opacity: 0.15; transform: scale(0.45) rotate(0deg); }
          45% { opacity: 1; transform: scale(1.25) rotate(45deg); }
        }

        @keyframes gem-glow-breathe {
          0%, 100% { filter: drop-shadow(0 0 3px rgba(255, 255, 255, 0.55)); }
          50% { filter: drop-shadow(0 0 8px rgba(255, 255, 255, 0.95)); }
        }

        @keyframes pill-enter {
          0% { opacity: 0; transform: translate3d(0, 10px, 0); }
          100% { opacity: 1; transform: translate3d(0, 0, 0); }
        }

        @keyframes bar-grow {
          0% { transform: scaleX(0); }
          100% { transform: scaleX(1); }
        }

        .panel {
          --mx: 50%;
          --my: 0%;
          position: relative;
          border-radius: var(--qp-radius, 20px);
          padding: 18px 20px 16px;
          color: var(--qp-text, #f1f5f9);
          border: 1px solid var(--qp-border, rgba(148, 163, 184, 0.16));
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.16),
            0 24px 54px -22px rgba(0, 0, 0, 0.8),
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
          background: linear-gradient(90deg, transparent, rgba(52, 211, 153, 0.65), rgba(56, 189, 248, 0.75), rgba(217, 70, 239, 0.72), transparent);
          pointer-events: none;
        }

        .panel[data-variant="frosted"] {
          background: linear-gradient(145deg, rgba(15, 23, 42, 0.58) 0%, rgba(7, 12, 24, 0.46) 100%);
          backdrop-filter: blur(24px) saturate(165%);
          -webkit-backdrop-filter: blur(24px) saturate(165%);
        }

        .panel[data-variant="crystal"] {
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.11) 0%, rgba(56, 189, 248, 0.03) 48%, rgba(217, 70, 239, 0.07) 100%);
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
        .tr { top: 8px; right: 8px; border-top: 1px solid #d946ef; border-right: 1px solid #d946ef; }
        .bl { bottom: 8px; left: 8px; border-bottom: 1px solid #38bdf8; border-left: 1px solid #38bdf8; }
        .br { bottom: 8px; right: 8px; border-bottom: 1px solid #d946ef; border-right: 1px solid #d946ef; }

        /* ── 极简单行头部：当前账号 + 脱敏邮箱 ｜ AVG + 醒目尊享等级徽章 ── */
        .account-header {
          position: relative;
          z-index: 1;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding-bottom: 14px;
          margin-bottom: 14px;
          border-bottom: 1px solid rgba(148, 163, 184, 0.12);
        }

        .account-left {
          display: flex;
          flex-direction: column;
          gap: 5px;
          min-width: 0;
        }

        .status-title {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-size: 13px;
          font-weight: 700;
          color: #f8fafc;
        }

        .check-ic {
          display: inline-flex;
          color: #34d399;
          filter: drop-shadow(0 0 8px rgba(52, 211, 153, 0.65));
        }

        .email-wrap {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          min-width: 0;
        }

        .mail-ic {
          display: inline-flex;
          color: rgba(148, 163, 184, 0.78);
        }

        .email-text {
          font-family: 'JetBrains Mono', 'Noto Sans SC', monospace;
          font-size: 14px;
          font-weight: 600;
          color: #f1f5f9;
          letter-spacing: 0.01em;
          word-break: break-all;
        }

        .badges {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
        }

        .avg-chip {
          padding: 4px 10px;
          border-radius: 999px;
          border: 1px solid rgba(116, 225, 255, 0.3);
          background: rgba(29, 111, 251, 0.14);
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          font-weight: 700;
          color: #74e1ff;
          font-variant-numeric: tabular-nums;
        }

        /* 高显眼度尊享身份徽章：胶囊静谧稳重，仅钻石图标切面与星芒闪耀 */
        .tier-badge {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 5px 14px;
          border-radius: 10px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.08em;
          color: #ffffff;
          border: 1px solid rgba(255, 255, 255, 0.26);
        }

        .tier-badge[data-tone="purple"] {
          background: linear-gradient(135deg, #7c3aed 0%, #c026d3 52%, #ec4899 100%);
          border-color: rgba(244, 114, 182, 0.8);
          text-shadow: 0 1px 6px rgba(0, 0, 0, 0.35);
          box-shadow: 0 0 20px rgba(217, 70, 239, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.45);
        }

        .tier-badge[data-tone="accent"] {
          background: linear-gradient(135deg, #1d4ed8 0%, #2563eb 50%, #06b6d4 100%);
          border-color: rgba(125, 211, 252, 0.7);
          box-shadow: 0 0 20px rgba(37, 99, 235, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.4);
        }

        .tier-badge[data-tone="gold"] {
          background: linear-gradient(135deg, #b45309 0%, #d97706 50%, #f59e0b 100%);
          border-color: rgba(253, 224, 71, 0.75);
          box-shadow: 0 0 20px rgba(245, 158, 11, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.45);
        }

        .tier-badge[data-tone="emerald"] {
          background: rgba(16, 185, 129, 0.16);
          border-color: rgba(52, 211, 153, 0.45);
          color: #6ee7b7;
          font-size: 11px;
          padding: 4px 10px;
        }

        .tier-badge[data-tone="default"] {
          background: rgba(148, 163, 184, 0.16);
          border-color: rgba(148, 163, 184, 0.36);
          color: #e2e8f0;
        }

        .tier-icon {
          position: relative;
          z-index: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .gem-stage {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 18px;
          height: 18px;
        }

        .gem-icon {
          animation: gem-glow-breathe 2.4s ease-in-out infinite;
        }

        .gem-star {
          position: absolute;
          font-size: 9px;
          line-height: 1;
          color: #ffffff;
          text-shadow: 0 0 6px #ffffff, 0 0 12px #fbcfe8;
          pointer-events: none;
          user-select: none;
        }

        .gem-star-a {
          top: -4px;
          right: -4px;
          animation: star-twinkle 1.6s ease-in-out infinite;
        }

        .gem-star-b {
          bottom: -3px;
          left: -4px;
          font-size: 7.5px;
          color: #fef08a;
          text-shadow: 0 0 6px #fef08a, 0 0 12px #fde047;
          animation: star-twinkle 1.6s ease-in-out 0.8s infinite;
        }

        .tier-label {
          position: relative;
          z-index: 1;
        }

        /* ── Quota Matrix Grid (完全对齐参考图 6 栏结构) ── */
        .grid {
          position: relative;
          z-index: 1;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 9px;
        }

        @media (max-width: 620px) {
          .grid { grid-template-columns: 1fr; }
        }

        .empty {
          position: relative;
          z-index: 1;
          padding: 20px 12px;
          text-align: center;
          border-radius: 12px;
          border: 1px dashed rgba(148, 163, 184, 0.22);
          font-family: 'JetBrains Mono', monospace;
          font-size: 11.5px;
          color: rgba(148, 163, 184, 0.72);
        }

        .pill {
          --mx: 50%;
          --my: 50%;
          position: relative;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          gap: 7px;
          padding: 10px 12px 11px;
          border-radius: 11px;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.052), rgba(255, 255, 255, 0.018));
          border: 1px solid rgba(255, 255, 255, 0.085);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
          animation: pill-enter 0.52s cubic-bezier(0.16, 1, 0.3, 1) backwards;
          animation-delay: calc(var(--i, 0) * 50ms + 90ms);
          transition: border-color 0.2s ease, transform 0.2s ease, background 0.2s ease;
        }

        .pill.featured {
          background: linear-gradient(135deg, rgba(88, 28, 135, 0.24) 0%, rgba(49, 46, 129, 0.22) 55%, rgba(15, 23, 42, 0.34) 100%);
          border-color: rgba(167, 139, 250, 0.32);
        }

        .panel[data-variant="wireframe"] .pill {
          background: rgba(6, 11, 22, 0.2);
          border-color: rgba(56, 189, 248, 0.2);
          box-shadow: none;
        }

        .pill::before {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: radial-gradient(140px circle at var(--mx) var(--my), rgba(52, 211, 153, 0.14), transparent 72%);
          opacity: 0;
          transition: opacity 0.2s ease;
        }

        .pill:hover {
          border-color: rgba(52, 211, 153, 0.42);
          transform: translateY(-1px);
        }
        .pill:hover::before { opacity: 1; }

        .pill.full { grid-column: 1 / -1; }

        .pill-top {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .pill-left {
          display: flex;
          align-items: center;
          gap: 7px;
          min-width: 0;
          flex-wrap: wrap;
        }

        .icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: #38bdf8;
          flex-shrink: 0;
        }

        .icon[data-kind="cluster"] { color: #c4b5fd; }

        .label {
          font-size: 12.5px;
          font-weight: 600;
          color: #f8fafc;
        }

        .window-tag {
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px;
          color: rgba(148, 163, 184, 0.85);
        }

        .micro-tags { display: inline-flex; gap: 4px; margin-left: 2px; }
        .micro-tag {
          font-family: 'JetBrains Mono', monospace;
          font-size: 9.5px;
          font-weight: 600;
          padding: 1px 6px;
          border-radius: 5px;
          background: rgba(139, 92, 246, 0.24);
          border: 1px solid rgba(167, 139, 250, 0.42);
          color: #ddd6fe;
        }

        .pill-right {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-shrink: 0;
          font-family: 'JetBrains Mono', monospace;
          font-variant-numeric: tabular-nums;
        }

        .reset {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 11px;
          font-weight: 500;
          color: #7dd3fc;
        }

        .reset[data-rt="5h"] { color: #fbbf24; }
        .reset.na { font-style: italic; color: rgba(148, 163, 184, 0.45); }

        .pct {
          font-size: 12.5px;
          font-weight: 700;
          min-width: 36px;
          text-align: right;
        }

        .pct[data-tone="ok"] { color: #34d399; text-shadow: 0 0 12px rgba(52, 211, 153, 0.45); }
        .pct[data-tone="warn"] { color: #fbbf24; text-shadow: 0 0 12px rgba(251, 191, 36, 0.4); }
        .pct[data-tone="danger"] { color: #fb7185; text-shadow: 0 0 12px rgba(251, 113, 133, 0.45); }
        .pct[data-tone="na"] { color: rgba(148, 163, 184, 0.55); }

        /* ── 动态能量流体进度条（流动等离子渐变 + 动态光纹 + 彗星扫光 + 呼吸激光火芯）── */
        .flux-track {
          position: relative;
          z-index: 1;
          height: 6px;
          width: 100%;
          border-radius: 999px;
          background: rgba(15, 23, 42, 0.78);
          box-shadow: inset 0 1.5px 3px rgba(0, 0, 0, 0.6), inset 0 -1px 0 rgba(255, 255, 255, 0.06);
          overflow: visible;
        }

        .flux-clip {
          position: relative;
          height: 100%;
          border-radius: 999px;
          transform-origin: left center;
          animation: bar-grow 0.78s cubic-bezier(0.16, 1, 0.3, 1) backwards;
          animation-delay: calc(var(--i, 0) * 60ms + 180ms);
          transition: width 0.65s cubic-bezier(0.22, 1, 0.36, 1);
        }

        .flux-fill {
          position: relative;
          width: 100%;
          height: 100%;
          border-radius: 999px;
          overflow: hidden;
          background: linear-gradient(90deg, #059669 0%, #10b981 35%, #22d3ee 75%, #67e8f9 100%);
          box-shadow:
            0 0 10px rgba(16, 185, 129, 0.55),
            inset 0 1px 0 rgba(255, 255, 255, 0.55);
        }

        .flux-stripes {
          position: absolute;
          top: 0;
          bottom: 0;
          left: 0;
          right: -28px;
          background-image: repeating-linear-gradient(
            -55deg,
            rgba(255, 255, 255, 0.26) 0px,
            rgba(255, 255, 255, 0.26) 5px,
            transparent 5px,
            transparent 13px
          );
          animation: stripe-slide 0.9s linear infinite;
          pointer-events: none;
        }

        .flux-fill[data-tone="warn"] {
          background: linear-gradient(90deg, #b45309 0%, #f59e0b 50%, #fde047 100%);
          box-shadow: 0 0 10px rgba(245, 158, 11, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.5);
        }

        .flux-fill[data-tone="danger"] {
          background: linear-gradient(90deg, #9f1239 0%, #f43f5e 50%, #fda4af 100%);
          box-shadow: 0 0 10px rgba(244, 63, 94, 0.58), inset 0 1px 0 rgba(255, 255, 255, 0.5);
        }

        .flux-fill[data-tone="na"] {
          background: rgba(148, 163, 184, 0.3);
          box-shadow: none;
        }
        .flux-fill[data-tone="na"] .flux-stripes { display: none; }

        .flux-sheen {
          position: absolute;
          top: 0;
          bottom: 0;
          left: 0;
          width: 36%;
          background: linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.82) 50%, transparent 100%);
          animation: flux-sheen 1.6s ease-in-out infinite;
          pointer-events: none;
        }

        /* 进度条右端发光能量火芯 */
        .flux-tip {
          position: absolute;
          right: -2px;
          top: 50%;
          width: 7px;
          height: 7px;
          border-radius: 999px;
          background: #ffffff;
          box-shadow: 0 0 8px 2px rgba(110, 231, 183, 0.95), 0 0 14px 3px rgba(34, 211, 238, 0.65);
          animation: tip-breathe 1.5s ease-in-out infinite;
          pointer-events: none;
        }

        .flux-tip[data-tone="warn"] {
          box-shadow: 0 0 8px 2px rgba(253, 224, 71, 0.95), 0 0 16px 3px rgba(245, 158, 11, 0.65);
        }

        .flux-tip[data-tone="danger"] {
          box-shadow: 0 0 8px 2px rgba(253, 164, 175, 0.95), 0 0 16px 3px rgba(244, 63, 94, 0.7);
        }

        /* ── 底部遥测状态条 ── */
        .meta-footer {
          position: relative;
          z-index: 1;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-top: 13px;
          padding-top: 11px;
          border-top: 1px solid rgba(148, 163, 184, 0.1);
          font-family: 'JetBrains Mono', monospace;
          font-size: 10.5px;
          color: rgba(148, 163, 184, 0.72);
        }

        .meta-right {
          display: inline-flex;
          align-items: center;
          gap: 10px;
        }

        .avg-tag {
          color: #74e1ff;
          font-weight: 600;
        }
      </style>

      <section class="panel" data-variant="${escapeHtml(variant)}">
        <span class="reticle tl"></span><span class="reticle tr"></span>
        <span class="reticle bl"></span><span class="reticle br"></span>

        <header class="account-header">
          <div class="account-left">
            <div class="status-title">
              <span class="check-ic">${CHECK_ICON}</span>
              <span>${escapeHtml(title)}</span>
            </div>
            <div class="email-wrap">
              <span class="mail-ic">${MAIL_ICON}</span>
              <span class="email-text">${escapeHtml(accountEmail || 'Antigravity CLI · 已连接')}</span>
            </div>
          </div>
          <div class="badges">
            ${avgPct !== null ? `<span class="avg-chip">AVG ${avgPct}%</span>` : ''}
            ${badges.map((b) => {
              const tierIcon = resolveBadgeIcon(b);
              const tone = resolveBadgeTone(b, tierIcon);
              return `<span class="tier-badge" data-tone="${escapeHtml(tone)}">${
                tierIcon ? `<span class="tier-icon">${TIER_ICONS[tierIcon]}</span>` : ''
              }<span class="tier-label">${escapeHtml(b.text)}</span></span>`;
            }).join('')}
          </div>
        </header>

        ${items.length === 0
          ? `<div class="empty">[ NO SNAPSHOT ] 等待终端 agy statusLine 推送首个配额数据包...</div>`
          : `<div class="grid">
              ${items.map((item, idx) => {
                const tone = statusTone(item.remainingPercent);
                const width = item.remainingPercent === null || item.remainingPercent === undefined
                  ? 0
                  : Math.max(0, Math.min(100, item.remainingPercent));
                const pctText = item.remainingPercent === null || item.remainingPercent === undefined
                  ? 'N/A'
                  : `${item.remainingPercent}%`;
                const icon = item.icon === 'cluster' ? CLUSTER_ICON : SPARK_ICON;
                return `
                  <div class="pill ${item.fullWidth ? 'full' : ''} ${item.featured ? 'featured' : ''}" style="--i:${idx}">
                    <div class="pill-top">
                      <div class="pill-left">
                        <span class="icon" data-kind="${escapeHtml(item.icon || 'spark')}">${icon}</span>
                        <span class="label">${escapeHtml(item.label)}</span>
                        ${item.windowTag ? `<span class="window-tag">${escapeHtml(item.windowTag)}</span>` : ''}
                        ${Array.isArray(item.tags) && item.tags.length ? `
                          <span class="micro-tags">
                            ${item.tags.map((t) => `<span class="micro-tag">${escapeHtml(t)}</span>`).join('')}
                          </span>` : ''}
                      </div>
                      <div class="pill-right">
                        ${item.resetInText
                          ? `<span class="reset" data-rt="${escapeHtml(item.resetTone || 'weekly')}">${CLOCK_ICON}${escapeHtml(item.resetInText)}</span>`
                          : `<span class="reset na">N/A</span>`}
                        <span class="pct" data-tone="${tone}">${pctText}</span>
                      </div>
                    </div>
                    <div class="flux-track" role="progressbar" aria-valuenow="${width}" aria-valuemin="0" aria-valuemax="100">
                      <div class="flux-clip" style="width: ${width}%; --i:${idx}">
                        <div class="flux-fill" data-tone="${tone}">
                          ${width > 0 ? '<span class="flux-stripes"></span><span class="flux-sheen"></span>' : ''}
                        </div>
                        ${width > 2 && tone !== 'na' ? `<span class="flux-tip" data-tone="${tone}"></span>` : ''}
                      </div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>`}

        <div class="meta-footer">
          <span>MODEL // ${escapeHtml(subtitle || 'Antigravity CLI')}</span>
          <span class="meta-right">
            ${avgPct !== null ? `<span class="avg-tag">AVG ${avgPct}%</span>` : ''}
            ${syncedText ? `<span>${escapeHtml(syncedText)}</span>` : ''}
          </span>
        </div>
      </section>
    `;
  }
}

export function registerQuotaPanel(tagName = 'quota-panel') {
  if (!customElements.get(tagName)) {
    customElements.define(tagName, QuotaPanelElement);
  }
}

registerQuotaPanel();
