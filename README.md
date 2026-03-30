# 背景移除工具

基于 Cloudflare Workers + Remove.bg API 的图片背景移除服务

## 部署步骤

### 1. 获取 Remove.bg API Key
- 访问 https://www.remove.bg/api
- 注册账号并获取 API Key

### 2. 部署到 Cloudflare

#### 方式一：通过 Dashboard（推荐）
1. 登录 Cloudflare Dashboard
2. 进入 Workers & Pages
3. 创建新 Worker，粘贴 `worker.js` 内容
4. 设置环境变量：`REMOVE_BG_API_KEY` = 你的 API Key
5. 部署 Worker
6. 上传 `index.html` 到 Cloudflare Pages 或直接托管

#### 方式二：使用 Wrangler CLI
```bash
npm install -g wrangler
wrangler login
wrangler secret put REMOVE_BG_API_KEY
wrangler deploy
```

### 3. 配置路由
- 将 Worker 绑定到路由：`yourdomain.com/api/*`
- 将 Pages 绑定到根域名：`yourdomain.com`

### 4. 修改 API 路径
在 `index.html` 中修改：
```javascript
const API_URL = '/api/remove-bg'; // 改为你的 Worker 路径
```

## 文件说明
- `worker.js` - Cloudflare Worker 后端
- `index.html` - 前端页面
- `wrangler.toml` - Wrangler 配置文件
<!-- Auto-deploy enabled -->
