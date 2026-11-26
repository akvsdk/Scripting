import type { QuotaGroup, QuotaItem } from './types';

export type ProviderKey =
  | 'agy'
  | 'deepseek'
  | 'magpie'
  | 'workbuddy'
  | 'emby'
  | 'qbittorrent';

export interface Env {
  ASSETS: { fetch(req: Request): Promise<Response> };
  QUOTA_KV: {
    get<T = unknown>(key: string, type: 'json'): Promise<T | null>;
    put(key: string, value: string): Promise<void>;
  };
  ENABLED_PROVIDERS: string;
  INGEST_TOKEN: string;
  CORS_ORIGIN?: string;
  // ── 预留公开/自建服务环境变量（仅在 ENABLED_PROVIDERS 显式启用对应项后生效）──
  DEEPSEEK_API_KEY?: string;
  MAGPIE_BASE_URL?: string;
  MAGPIE_TOKEN?: string;
  WORKBUDDY_BASE_URL?: string;
  WORKBUDDY_TOKEN?: string;
  EMBY_BASE_URL?: string;
  EMBY_API_KEY?: string;
  QBIT_BASE_URL?: string;
  QBIT_AUTH?: string;
}

export interface AgyQuotaBucket {
  remaining_fraction?: number;
  remaining_amount?: number;
  reset_time?: string;
  reset_in_seconds?: number;
  disabled?: boolean;
}

export interface AgySnapshot {
  updatedAt: number;
  email?: string | null;
  planTier?: string;
  model?: string | null;
  costUsd?: number | null;
  quota: Record<string, AgyQuotaBucket>;
}

export const AGY_KV_KEY = 'agy:latest';

type WorkerProvider = (env: Env) => Promise<QuotaGroup | null>;

function formatReset(resetTime?: string, fallbackSec?: number): string {
  const sec = resetTime
    ? Math.floor((Date.parse(resetTime) - Date.now()) / 1000)
    : (fallbackSec ?? 0);
  if (!Number.isFinite(sec) || sec <= 0) return '已重置';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function resolveTierBadge(planTier?: string) {
  const raw = (planTier || '').trim();
  const lower = raw.toLowerCase();
  if (lower.includes('ultra')) return { text: 'ULTRA', icon: 'ultra' as const, tone: 'purple' as const };
  if (lower.includes('enterprise') || lower.includes('business')) {
    return { text: 'ENTERPRISE', icon: 'enterprise' as const, tone: 'gold' as const };
  }
  if (lower.includes('pro')) return { text: 'PRO', icon: 'pro' as const, tone: 'accent' as const };
  if (lower.includes('free')) return { text: 'FREE', icon: 'free' as const, tone: 'default' as const };
  return { text: raw || 'AGY', icon: 'free' as const, tone: 'default' as const };
}

function maskEmail(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const s = raw.trim();
  const at = s.indexOf('@');
  if (at <= 0) return s.length > 4 ? `${s.slice(0, 2)}***${s.slice(-2)}` : '***';
  const local = s.slice(0, at);
  const domain = s.slice(at);
  if (local.includes('***')) return s;
  if (local.length <= 2) return `${local[0]}***${domain}`;
  if (local.length <= 4) return `${local[0]}***${local.slice(-1)}${domain}`;
  return `${local.slice(0, 2)}***${local.slice(-2)}${domain}`;
}

function toPct(q?: AgyQuotaBucket): number | null {
  if (!q || typeof q.remaining_fraction !== 'number') return null;
  return Math.max(0, Math.min(100, Math.round(q.remaining_fraction * 100)));
}

// ✅ 当前默认启用：读取本机 agy statusLine 推送进 KV 的快照，按完整 6 栏模型配额结构映射
const fetchAgyFromKv: WorkerProvider = async (env) => {
  const snap = await env.QUOTA_KV.get<AgySnapshot>(AGY_KV_KEY, 'json');
  if (!snap) return null;

  const q = snap.quota || {};
  const g5h = q['gemini-5h'];
  const p5h = q['3p-5h'];
  const gWk = q['gemini-weekly'];
  const pWk = q['3p-weekly'];

  const items: QuotaItem[] = [];

  if (g5h) {
    items.push({
      id: 'gemini-5h',
      icon: 'spark',
      label: 'Gemini 4 / 3.8',
      windowTag: '5H',
      remainingPercent: toPct(g5h),
      resetInText: formatReset(g5h.reset_time, g5h.reset_in_seconds),
      resetTone: '5h',
    });
  }
  if (p5h) {
    items.push({
      id: '3p-5h',
      icon: 'cluster',
      label: 'Claude 5.5 / GPT',
      windowTag: '5H',
      remainingPercent: toPct(p5h),
      resetInText: formatReset(p5h.reset_time, p5h.reset_in_seconds),
      resetTone: '5h',
    });
  }
  if (gWk) {
    items.push({
      id: 'gemini-weekly',
      icon: 'spark',
      label: 'Gemini 周配额',
      remainingPercent: toPct(gWk),
      resetInText: formatReset(gWk.reset_time, gWk.reset_in_seconds),
      resetTone: 'weekly',
    });
  }
  if (pWk) {
    items.push({
      id: '3p-weekly',
      icon: 'cluster',
      label: 'Claude 周配额',
      remainingPercent: toPct(pWk),
      resetInText: formatReset(pWk.reset_time, pWk.reset_in_seconds),
      resetTone: 'weekly',
    });
  }
  if (g5h) {
    items.push({
      id: 'gemini-argon-neon-5h',
      icon: 'spark',
      label: 'Gemini 4 Argon / Neon',
      windowTag: '5H',
      remainingPercent: toPct(g5h),
      resetInText: formatReset(g5h.reset_time, g5h.reset_in_seconds),
      resetTone: '5h',
      fullWidth: true,
    });
  }
  if (gWk) {
    items.push({
      id: 'gemini-argon-neon-weekly',
      icon: 'spark',
      label: 'Gemini 4 Argon / Neon 周配额',
      tags: ['High', 'Med', 'Low'],
      remainingPercent: toPct(gWk),
      resetInText: formatReset(gWk.reset_time, gWk.reset_in_seconds),
      resetTone: 'weekly',
      fullWidth: true,
      featured: true,
    });
  }

  // 兜底：若未来官方新增了未知配额桶名，自动追加展示
  const known = new Set(['gemini-5h', '3p-5h', 'gemini-weekly', '3p-weekly']);
  for (const [id, bucket] of Object.entries(q)) {
    if (known.has(id)) continue;
    const isWeekly = /week/i.test(id);
    const isFiveHour = /5h|five|hour/i.test(id);
    items.push({
      id,
      icon: /3p|claude|gpt/i.test(id) ? 'cluster' : 'spark',
      label: id,
      windowTag: isFiveHour ? '5H' : isWeekly ? '周配额' : undefined,
      tags: bucket.disabled ? ['Disabled'] : undefined,
      remainingPercent: toPct(bucket),
      resetInText: formatReset(bucket.reset_time, bucket.reset_in_seconds),
      resetTone: isFiveHour ? '5h' : 'weekly',
    });
  }

  return {
    id: 'agy',
    source: 'agy-snapshot',
    updatedAt: snap.updatedAt,
    title: '当前账号',
    accountEmail: maskEmail(snap.email),
    subtitle: snap.model ?? undefined,
    badges: [
      resolveTierBadge(snap.planTier),
      ...(typeof snap.costUsd === 'number'
        ? [{ text: `$${snap.costUsd.toFixed(2)}`, tone: 'emerald' as const }]
        : []),
    ],
    items,
  };
};

export interface EgernQuotaEntry {
  id: string;
  label: string;
  remainingFraction: number;
  remainingPercent: number;
  resetTime: string | null;
  resetInText: string;
}

export interface EgernAgyPayload {
  source: 'agy-snapshot';
  updatedAt: number | null;
  plan: string | null;
  email: string | null;
  model: string | null;
  quotas: EgernQuotaEntry[];
}

const EGERN_CANONICAL_BUCKETS: ReadonlyArray<readonly [string, string]> = [
  ['gemini-5h', 'Gemini 5H'],
  ['3p-5h', 'Claude 5H'],
  ['gemini-weekly', 'Gemini 周'],
  ['3p-weekly', 'Claude 周'],
];

function toEgernEntry(id: string, label: string, bucket?: AgyQuotaBucket): EgernQuotaEntry | null {
  if (!bucket || typeof bucket.remaining_fraction !== 'number' || !Number.isFinite(bucket.remaining_fraction)) {
    return null;
  }
  const fraction = Math.max(0, Math.min(1, bucket.remaining_fraction));
  return {
    id,
    label,
    remainingFraction: Number(fraction.toFixed(4)),
    remainingPercent: Math.round(fraction * 100),
    resetTime: bucket.reset_time ?? null,
    resetInText: formatReset(bucket.reset_time, bucket.reset_in_seconds),
  };
}

// ✅ Egern 小组件专用输出：直接读取 KV 原始快照，去重保留 4 个核心桶与精确 ISO resetTime
export async function fetchEgernAgyPayload(env: Env): Promise<EgernAgyPayload> {
  const snap = await env.QUOTA_KV.get<AgySnapshot>(AGY_KV_KEY, 'json');
  if (!snap) {
    return {
      source: 'agy-snapshot',
      updatedAt: null,
      plan: null,
      email: null,
      model: null,
      quotas: [],
    };
  }

  const q = snap.quota || {};
  const quotas: EgernQuotaEntry[] = [];
  const known = new Set<string>();

  for (const [id, label] of EGERN_CANONICAL_BUCKETS) {
    known.add(id);
    const entry = toEgernEntry(id, label, q[id]);
    if (entry) quotas.push(entry);
  }

  for (const [id, bucket] of Object.entries(q)) {
    if (known.has(id)) continue;
    const entry = toEgernEntry(id, id, bucket);
    if (entry) quotas.push(entry);
  }

  const rawTier = (snap.planTier || '').trim();
  const plan =
    rawTier && rawTier.toLowerCase() !== 'unknown' ? resolveTierBadge(rawTier).text : null;

  return {
    source: 'agy-snapshot',
    updatedAt: snap.updatedAt,
    plan,
    email: maskEmail(snap.email) ?? null,
    model: snap.model ?? null,
    quotas,
  };
}

// ── 以下为预留 CF Worker 适配器（默认不启用，不生成额外 UI）──

const fetchDeepSeek: WorkerProvider = async (env) => {
  if (!env.DEEPSEEK_API_KEY) return null;
  const res = await fetch('https://api.deepseek.com/user/balance', {
    headers: { Authorization: `Bearer ${env.DEEPSEEK_API_KEY}` },
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) throw new Error(`DeepSeek HTTP ${res.status}`);
  const data = (await res.json()) as {
    is_available?: boolean;
    balance_infos?: Array<{ currency: string; total_balance: string }>;
  };

  return {
    id: 'deepseek',
    source: 'direct-api',
    updatedAt: Date.now(),
    title: 'DeepSeek API',
    badges: [
      {
        text: data.is_available ? '可用' : '不可用',
        tone: data.is_available ? 'emerald' : 'default',
      },
    ],
    items: (data.balance_infos ?? []).map((b) => ({
      id: `ds-${b.currency}`,
      icon: 'spark',
      label: `余额 ${b.total_balance} ${b.currency}`,
      remainingPercent: data.is_available ? 100 : 0,
      fullWidth: true,
    })),
  };
};

const reservedAdapter =
  (id: ProviderKey, title: string): WorkerProvider =>
  async () => ({
    id,
    source: 'direct-api',
    updatedAt: Date.now(),
    title,
    badges: [{ text: 'RESERVED', tone: 'default' }],
    items: [],
  });

export const PROVIDERS: Record<ProviderKey, WorkerProvider> = {
  agy: fetchAgyFromKv,
  deepseek: fetchDeepSeek,
  magpie: reservedAdapter('magpie', 'Magpie Gateway'),
  workbuddy: reservedAdapter('workbuddy', 'WorkBuddy Pool'),
  emby: reservedAdapter('emby', 'Emby Media'),
  qbittorrent: reservedAdapter('qbittorrent', 'qBittorrent'),
};

export async function collectEnabledGroups(env: Env): Promise<QuotaGroup[]> {
  const keys = (env.ENABLED_PROVIDERS || 'agy')
    .split(',')
    .map((s) => s.trim() as ProviderKey)
    .filter((k): k is ProviderKey => k in PROVIDERS);

  const settled = await Promise.allSettled(keys.map((k) => PROVIDERS[k](env)));
  return settled
    .filter(
      (r): r is PromiseFulfilledResult<QuotaGroup | null> =>
        r.status === 'fulfilled' && r.value !== null
    )
    .map((r) => r.value!);
}
