# Egern AGY 重置与余额小组件（透明版）

基于 [Egern 小组件 DSL](https://egernapp.com/zh-CN/docs/configuration/widgets/)、[AgyResets.scripting](https://github.com/hsingyin/Script/raw/refs/heads/main/Scripting/AgyResets.scripting) 与透明玻璃风格（根背景 `#00000000` 全透明 + `rgba` 半透明内层卡片与 `0.5pt` 细描边，不使用 `backgroundGradient`，兼容普通桌面与 iOS 26 透明/液态玻璃桌面）设计的 iOS 桌面与锁屏小组件。

## 文件说明

- [`agy-widget.js`](./agy-widget.js)：Egern `generic` 小组件脚本（透明版、单文件、带 `ctx.storage` 缓存降级与 Base64 矢量热力图）。
- [`agy-widget.yaml`](./agy-widget.yaml)：Egern 模块配置模板，包含 `env_schema`、`scriptings` 与 `widgets` 定义。

## 功能概览

1. **透明四卡样式**
   - 根背景采用 `#00000000` 全透明（无 `backgroundGradient`），内层四卡采用 `rgba` 半透明玻璃底 + `0.5pt` 细描边 + `Menlo` 刷新时间戳。
   - **小号（Small）**：2×2 四宫格卡片 + 顶部标题/时间戳 + 底部最近重置时间。
   - **中号（Medium）**：1×4 横排四卡片 + 顶栏最近重置时间与相对时间 + 底栏节奏/配额摘要。
   - **大号（Large）**：2×2 放大四宫格 + 每张卡片内嵌 Base64 矢量图形（重置间隔渐变走势折线、迷你热力图、配额进度条）。
2. **AGY 公开重置追踪（开箱即用，无需登录）**
   - 读取 `https://agyresets.com/api/v1/status` 与 `/resets`（仅大号拉取完整历史用于走势与热力图，小/中号单次请求即可渲染）。
   - 未配置余额时展示四张重置核心卡片：`最近重置`、`累计重置`、`平均间隔`、`最长间隔`；内置 `ctx.storage` 快照缓存，断网或接口异常自动降级。
2. **个人余额与模型配额（可选配置，零硬编码密钥）**
   - 方式 A（推荐，直连本仓库 `quota-hub` Worker）：将 `AGY_BALANCE_URL` 填为你的 Quota Hub 地址（`https://quota-hub.<subdomain>.workers.dev`、`.../api/egern/agy` 或 `.../api/quota`），无需额外 Token（默认公开只读）：
     - 填根地址时自动优先请求专用接口 `GET /api/egern/agy`（直接输出四卡规范桶与精确 ISO `resetTime`），若旧版 Worker 尚未部署该接口则自动回退 `GET /api/quota`（兼容 `groups[].items[]` 并自动去重镜像项）。
     - 自动优先复用同源 `GET /api/resets` 的 5 分钟边缘缓存（异常时自动回退直连 `agyresets.com`），点击小组件直达你的 Quota Hub 页面。
   - 方式 B（自定义 JSON 中转）：`AGY_BALANCE_URL`（+ 可选 `AGY_BALANCE_TOKEN`）也兼容通用余额/配额 JSON：
     ```json
     {
       "plan": "Pro",
       "balance": 12.5,
       "currency": "$",
       "quotas": [
         { "label": "Gemini Pro", "remaining": 0.85, "resetAt": "2026-11-24T20:00:00Z" },
         { "label": "Gemini Flash", "remaining": 1.0, "resetAt": "2026-11-24T18:00:00Z" }
       ]
     }
     ```
     同时兼容 Google `fetchAvailableModels`（`models` 映射）与 `RetrieveUserQuotaSummary`（`groups[].buckets` 分组）原始 JSON。
   - 方式 C（Google OAuth 直连）：配置 `AGY_ACCESS_TOKEN`，或配置 `AGY_REFRESH_TOKEN` + `AGY_CLIENT_ID` + `AGY_CLIENT_SECRET`（可选 `AGY_PROJECT_ID`、`AGY_API_BASE`）。脚本会自动轮询 `cloudcode-pa.googleapis.com` → `daily-cloudcode-pa.googleapis.com` → `daily-cloudcode-pa.sandbox.googleapis.com`，先查 `v1internal:retrieveUserQuotaSummary`，无数据时自动回落 `v1internal:fetchAvailableModels`，并把 Token 与 `projectId` 缓存在 `ctx.storage`。
   - **如何获取 AGY OAuth 凭证**（AGY 不使用网页 Cookie，而是 Google OAuth 2.0）：
     1. **从已登录的桌面端读取**：在 macOS 上 Antigravity IDE/CLI 的 OAuth 状态保存在 `~/Library/Application Support/Antigravity/User/globalStorage/state.vscdb`（`ItemTable` 中 `key LIKE '%oauth%'`）或系统钥匙串中。
     2. **手动 OAuth 授权换取 `refresh_token`**：浏览器打开 Google OAuth 授权页（`access_type=offline&prompt=consent`，回调 `http://localhost:51121/oauth-callback`，包含 `cloud-platform`、`cclog`、`experimentsandconfigs` 等 scope），复制跳转后地址栏的 `code`，用一次 `POST https://oauth2.googleapis.com/token` 换取 `refresh_token`，填入 Egern 环境变量即可长期自动续期。
   - 未配置余额变量时自动降级为纯重置视图，绝不伪造余额数据；余额接口异常时仍保留重置信息并提示错误。
3. **全尺寸适配**
   - 主屏幕：`systemSmall`、`systemMedium`、`systemLarge`、`systemExtraLarge`
   - 锁屏：`accessoryInline`、`accessoryCircular`、`accessoryRectangular`

## 安装方式

### 方式一：模块导入（推荐，自动注册两个独立小组件）

在 Egern **工具 → 模块 → +** 中直接填入模块链接：

```text
https://raw.githubusercontent.com/akvsdk/Scripting/main/egern/agy-widget.yaml
```

启用后会在 **分析 → 小组件画廊** 中同时出现两个独立小组件，可在主屏幕分别添加或同时摆放：
- **AGY 重置**（`WIDGET_MODE=resets`）：专注展示重置统计、间隔走势与迷你热力图，开箱即用。
- **AGY 余额**（`WIDGET_MODE=balance`）：专注展示个人配额四卡（`Gemini 5H` / `Claude 5H` / `Gemini 周` / `Claude 周`）与快照同步状态；在模块设置页的 `Env` 中填写 `AGY_BALANCE_URL`（或 OAuth 凭证）即可生效。

### 方式二：本地脚本

1. 在 Egern 中进入 **工具 → 脚本 → +**，新建 `generic` 脚本，名称填 `agy-resets-balance`，粘贴 `agy-widget.js` 内容并保存。
2. 进入 **分析 → 左上角小组件画廊 → +**，分别新建小组件 **AGY 重置**（`Env` 加 `WIDGET_MODE=resets`）和 **AGY 余额**（`Env` 加 `WIDGET_MODE=balance` 及 `AGY_BALANCE_URL`），均关联 `agy-resets-balance`。
3. 在 iOS 主屏幕添加 **Egern** 小组件并选择对应名称。

## 免责声明

公开重置数据来自第三方站点 [agyresets.com](https://agyresets.com/zh-CN)，与 Google / Antigravity 官方无隶属关系。个人凭据仅保存在你的 Egern 本地配置中，脚本不会将其发送给第三方站点。
