# 部署步骤

## 1. 创建 D1 数据库

```bash
npx wrangler d1 create bg-remover-db
```

复制返回的 `database_id`，更新到 `wrangler.toml` 中。

## 2. 初始化数据库表

```bash
npx wrangler d1 execute bg-remover-db --file=./schema.sql
```

## 3. 部署 Worker

```bash
npx wrangler deploy
```

## 4. 部署前端到 Cloudflare Pages

1. 将 `index.html` 推送到 GitHub
2. 在 Cloudflare Pages 创建项目
3. 连接 GitHub 仓库
4. 部署完成

## 5. 验证

访问 https://image-background-remover.shop 测试登录功能。

## 环境变量

在 Cloudflare Dashboard 设置：
- `REMOVE_BG_API_KEY`: 你的 Remove.bg API Key
