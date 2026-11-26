# Quota Hub

独立拆分为三个解耦目录：

- `ui-kit/`：零依赖透明风格 Web Component (`<quota-panel>`)，可单独发布或被任何网页/桌面小组件复用。
- `cf-worker/`：独立 Cloudflare Worker 服务（`POST /api/ingest/agy`、`GET /api/quota`、`GET /api/egern/agy`、`GET /api/resets`、托管透明 Web 端，并预留 `deepseek` / `magpie` / `workbuddy` / `emby` / `qbittorrent` 后端适配器，默认仅开启 `agy`）。
- `local-agy/`：本机 `agy` 官方 `statusLine` 脱敏异步推送脚本（额度变化最短 120 秒推一次，无变化 10 分钟心跳一次）。

## 1. 本地预览组件库

```bash
cd ui-kit
npx serve .   # 打开 /demo.html
```

## 2. 部署 Cloudflare Worker

### 方式 A：Cloudflare Workers 原生 Git Integration（推荐，适配 `agy --remote-agent`）

无需在云端开发环境配置 Cloudflare Token，推送代码到 GitHub 后自动构建发布。

**快速入口：**

- GitHub 仓库：<https://github.com/akvsdk/Scripting>
- Cloudflare `quota-hub` Worker 设置（进入 **Settings → Build → Connect**）：<https://dash.cloudflare.com/?to=/:account/workers/services/view/quota-hub/production/settings>
- Cloudflare Workers & Pages 列表：<https://dash.cloudflare.com/?to=/:account/workers-and-pages>
- GitHub App 仓库授权管理（如未看到仓库，先在此勾选授权）：<https://github.com/settings/installations>

**Cloudflare Build 匹配参数：**

| 配置项 | 填写值 |
| --- | --- |
| Git Repository | `akvsdk/Scripting` |
| Production branch | `main` |
| Root directory | `quota-hub/cf-worker` |
| Build command | `npm run sync-ui` |
| Deploy command | `npx wrangler deploy` |
| Watch paths（可选） | `quota-hub/cf-worker/**`, `quota-hub/ui-kit/**` |

> 密钥（如 `INGEST_TOKEN`）直接在 Worker 的 **Settings → Variables and Secrets** 中维护，不写入 Git。

### 方式 B：本地 Wrangler 手动部署

```bash
cd cf-worker

# 1) 创建 KV 并将返回的 id 填入 wrangler.toml 的 QUOTA_KV.id
wrangler kv namespace create QUOTA_KV

# 2) 配置写入密钥（仅保护 POST /api/ingest/agy；读取接口默认公开可读）
wrangler secret put INGEST_TOKEN

# 3) 同步 ui-kit 并部署
npm run deploy
```

## 3. 配置本机 `agy` 自动推送

```bash
# 1) 安装脚本
cp local-agy/statusline-push.sh ~/.gemini/antigravity-cli/statusline-push.sh
chmod +x ~/.gemini/antigravity-cli/statusline-push.sh

# 2) 填写云端地址与 INGEST_TOKEN
mkdir -p ~/.config
cp local-agy/agy-quota-hub.env.example ~/.config/agy-quota-hub.env
chmod 600 ~/.config/agy-quota-hub.env
# 编辑 ~/.config/agy-quota-hub.env 填入 Worker URL 与 INGEST_TOKEN
```

最后将 `local-agy/settings.snippet.json` 中的 `statusLine` 合并进 `~/.gemini/antigravity-cli/settings.json`（保留原生状态栏）。
