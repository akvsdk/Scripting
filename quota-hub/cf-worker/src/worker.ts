import {
  AGY_KV_KEY,
  collectEnabledGroups,
  fetchEgernAgyPayload,
  type AgySnapshot,
  type Env,
} from './providers';

const AGY_RESETS_API = 'https://agyresets.com/api/v1';

function buildCorsHeaders(env: Env): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': env.CORS_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  };
}

function jsonResponse(
  body: unknown,
  status: number,
  extraHeaders: Record<string, string>,
  cacheControl = 'no-store'
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cacheControl,
      ...extraHeaders,
    },
  });
}

function isUnknownPlanTier(value?: string | null): boolean {
  if (!value) return true;
  const trimmed = value.trim().toLowerCase();
  return trimmed === '' || trimmed === 'unknown';
}

// 公开只读代理 agyresets.com/api/v1（无个人凭据，边缘缓存 5 分钟，解决浏览器 CORS）
async function fetchAgyResetsPublic(): Promise<unknown> {
  const statusRes = await fetch(`${AGY_RESETS_API}/status`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(6000),
  });
  if (!statusRes.ok) throw new Error(`agyresets status HTTP ${statusRes.status}`);
  const statusJson = (await statusRes.json()) as {
    data?: { latest_reset?: unknown; stats?: unknown };
    meta?: { generated_at?: string };
  };

  const history: unknown[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 5; page++) {
    const query = cursor ? `?limit=100&cursor=${encodeURIComponent(cursor)}` : '?limit=100';
    const listRes = await fetch(`${AGY_RESETS_API}/resets${query}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(6000),
    });
    if (!listRes.ok) break;
    const listJson = (await listRes.json()) as {
      data?: unknown[];
      pagination?: { has_more?: boolean; next_cursor?: string | null };
    };
    if (Array.isArray(listJson.data)) history.push(...listJson.data);
    if (!listJson.pagination?.has_more || !listJson.pagination?.next_cursor) break;
    cursor = listJson.pagination.next_cursor;
  }

  return {
    latest: statusJson.data?.latest_reset ?? null,
    stats: statusJson.data?.stats ?? null,
    history,
    generatedAt: statusJson.meta?.generated_at ?? new Date().toISOString(),
  };
}

export default {
  async fetch(req: Request, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }): Promise<Response> {
    const url = new URL(req.url);
    const cors = buildCorsHeaders(env);

    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(req);
    }

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    // 0. 公开信息接口：AGY 重置公告 & 26 周热力图（无需个人 Token，边缘缓存 5 分钟）
    if (url.pathname === '/api/resets' && req.method === 'GET') {
      const cache = (caches as unknown as { default?: Cache }).default;
      const cacheKey = new Request(`${url.origin}/__cache/agy-resets-v1`);
      if (cache && url.searchParams.get('fresh') !== '1') {
        const hit = await cache.match(cacheKey);
        if (hit) return hit;
      }
      try {
        const payload = await fetchAgyResetsPublic();
        const res = jsonResponse(payload, 200, cors, 'public, max-age=300');
        if (cache) ctx.waitUntil(cache.put(cacheKey, res.clone()));
        return res;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Upstream error';
        return jsonResponse({ error: msg }, 502, cors);
      }
    }

    const auth = req.headers.get('Authorization');

    // 1. 写入接口：接收本机 agy statusLine 推送的脱敏配额快照
    if (url.pathname === '/api/ingest/agy' && req.method === 'POST') {
      if (!env.INGEST_TOKEN || auth !== `Bearer ${env.INGEST_TOKEN}`) {
        return jsonResponse({ error: 'Unauthorized' }, 401, cors);
      }
      let body: AgySnapshot;
      try {
        body = (await req.json()) as AgySnapshot;
      } catch {
        return jsonResponse({ error: 'Invalid JSON' }, 400, cors);
      }
      if (!body || typeof body.quota !== 'object' || body.quota === null) {
        return jsonResponse({ error: 'Missing quota object' }, 400, cors);
      }
      const incomingEmail = typeof body.email === 'string' ? body.email : null;
      let resolvedPlanTier =
        typeof body.planTier === 'string' && !isUnknownPlanTier(body.planTier)
          ? body.planTier.trim()
          : undefined;

      // 冷启动或缺失订阅等级时，同账号保留 KV 中已有的有效 planTier，避免被 Unknown 覆盖
      if (!resolvedPlanTier) {
        const prev = await env.QUOTA_KV.get<AgySnapshot>(AGY_KV_KEY, 'json');
        if (
          prev?.planTier &&
          !isUnknownPlanTier(prev.planTier) &&
          (!incomingEmail || !prev.email || prev.email === incomingEmail)
        ) {
          resolvedPlanTier = prev.planTier;
        }
      }

      const sanitized: AgySnapshot = {
        updatedAt: typeof body.updatedAt === 'number' ? body.updatedAt : Date.now(),
        email: incomingEmail,
        planTier: resolvedPlanTier,
        model: typeof body.model === 'string' ? body.model : null,
        costUsd: typeof body.costUsd === 'number' ? body.costUsd : null,
        quota: body.quota,
      };
      await env.QUOTA_KV.put(AGY_KV_KEY, JSON.stringify(sanitized));
      return jsonResponse({ ok: true, updatedAt: sanitized.updatedAt }, 200, cors);
    }

    // 2. 公开只读聚合接口：默认直接可读（写端 /api/ingest/agy 仍严格受 INGEST_TOKEN 保护）
    if (url.pathname === '/api/quota' && req.method === 'GET') {
      const groups = await collectEnabledGroups(env);
      return jsonResponse({ updatedAt: Date.now(), groups }, 200, cors);
    }

    // 3. Egern 小组件专用只读接口：直接输出四卡规范配额 + 精确 ISO resetTime
    if (url.pathname === '/api/egern/agy' && req.method === 'GET') {
      const payload = await fetchEgernAgyPayload(env);
      return jsonResponse(payload, 200, cors);
    }

    return jsonResponse({ error: 'Not Found' }, 404, cors);
  },
};
