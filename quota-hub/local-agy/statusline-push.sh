#!/usr/bin/env bash
set -euo pipefail

# ── 节流参数（单一配置点）──
MIN_CHANGE_INTERVAL=120  # 额度变化时最短推送间隔（秒）
HEARTBEAT_INTERVAL=600   # 额度无变化时心跳间隔（秒）

ENV_FILE="${HOME}/.config/agy-quota-hub.env"
[[ -f "$ENV_FILE" ]] && source "$ENV_FILE"

STATE_DIR="${HOME}/.cache/agy-quota-hub"
mkdir -p "$STATE_DIR"
LATEST_FILE="${STATE_DIR}/latest.json"
HASH_FILE="${STATE_DIR}/last.sha256"
TS_FILE="${STATE_DIR}/last.ts"
TIER_FILE="${STATE_DIR}/last.tier"

# 读取本机上次已知的有效 planTier 与 email，用于冷启动 plan_tier 为空时兜底
PREV_EMAIL=""
PREV_TIER=""
if [[ -f "$LATEST_FILE" ]]; then
  PREV_EMAIL="$(jq -r '.email // ""' "$LATEST_FILE" 2>/dev/null || true)"
  PREV_TIER="$(jq -r '.planTier // ""' "$LATEST_FILE" 2>/dev/null || true)"
  [[ "$(printf '%s' "$PREV_TIER" | tr '[:upper:]' '[:lower:]')" == "unknown" ]] && PREV_TIER=""
fi

# 1. 白名单裁剪 + 邮箱源头脱敏：绝不上传明文邮箱 / cwd / 对话标题 / transcript_path
PAYLOAD="$(jq -c --arg prev_email "$PREV_EMAIL" --arg prev_tier "$PREV_TIER" '
  def mask_email:
    if (. == null or . == "") then null
    elif contains("@") then
      (split("@") as [$u, $d] |
        if ($u | length) <= 2 then ($u[0:1] + "***@" + $d)
        elif ($u | length) <= 4 then ($u[0:1] + "***" + $u[-1:] + "@" + $d)
        else ($u[0:2] + "***" + $u[-2:] + "@" + $d) end)
    else "***" end;
  def clean_tier:
    if (. == null) then null
    else (tostring | gsub("^\\s+|\\s+$"; "") | if (. == "" or ascii_downcase == "unknown") then null else . end)
    end;
  (.email | mask_email) as $masked_email |
  (.plan_tier | clean_tier) as $raw_tier |
  (if $raw_tier != null then $raw_tier
   elif ($prev_tier != "" and ($masked_email == null or $prev_email == "" or $masked_email == $prev_email)) then $prev_tier
   else null end) as $resolved_tier |
  {
    updatedAt: (now | floor * 1000),
    email: $masked_email,
    planTier: $resolved_tier,
    model: (.model.display_name // null),
    costUsd: (.cost.total_usd // null),
    quota: (.quota // {})
  }
' 2>/dev/null)" || exit 0

[[ "$(printf '%s' "$PAYLOAD" | jq -r '.quota | length')" == "0" ]] && exit 0

# 2. 始终原子写入本机最新快照（本机小组件可 0 延迟读取，不占 CF KV 额度）
TMP_FILE="${LATEST_FILE}.tmp.$$"
printf '%s' "$PAYLOAD" > "$TMP_FILE" && mv "$TMP_FILE" "$LATEST_FILE"

# 未配置云端地址或 Token 时，仅保留本地快照，静默退出
[[ -z "${CF_INGEST_URL:-}" || -z "${CF_INGEST_TOKEN:-}" ]] && exit 0

# 3. 精确节流判定：变化 >=120s 推，无变化 >=600s 心跳推；planTier 从空/Unknown 恢复为有效等级时立即补推
NOW="$(date +%s)"
LAST_TS="$(cat "$TS_FILE" 2>/dev/null || echo 0)"
ELAPSED=$((NOW - LAST_TS))

NEW_HASH="$(printf '%s' "$PAYLOAD" | jq -c '{quota, planTier}' | shasum -a 256 | awk '{print $1}')"
OLD_HASH="$(cat "$HASH_FILE" 2>/dev/null || true)"
NEW_TIER="$(printf '%s' "$PAYLOAD" | jq -r '.planTier // ""')"
OLD_TIER="$(cat "$TIER_FILE" 2>/dev/null || true)"

SHOULD_PUSH=0
OLD_TIER_LOWER="$(printf '%s' "$OLD_TIER" | tr '[:upper:]' '[:lower:]')"
if [[ -n "$NEW_TIER" && ( -z "$OLD_TIER_LOWER" || "$OLD_TIER_LOWER" == "unknown" ) ]]; then
  SHOULD_PUSH=1
elif [[ "$NEW_HASH" != "$OLD_HASH" ]]; then
  (( ELAPSED >= MIN_CHANGE_INTERVAL )) && SHOULD_PUSH=1
else
  (( ELAPSED >= HEARTBEAT_INTERVAL )) && SHOULD_PUSH=1
fi

(( SHOULD_PUSH == 0 )) && exit 0

printf '%s' "$NEW_HASH" > "$HASH_FILE"
printf '%s' "$NOW" > "$TS_FILE"
printf '%s' "$NEW_TIER" > "$TIER_FILE"

# 4. 后台非阻塞推送（关闭全部 FD，避免阻塞 agy 状态栏 5 秒超时）
(
  curl -sS --max-time 10 -X POST "$CF_INGEST_URL" \
    -H "Authorization: Bearer $CF_INGEST_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD"
) >/dev/null 2>&1 </dev/null &
