# Image Background Remover

A Next.js web app that removes image backgrounds using the remove.bg API. Deployable to Cloudflare Pages.

## Setup

1. Get a free API key from [remove.bg](https://www.remove.bg/api)
2. Copy `.env.local.example` to `.env.local` and fill in your key:
   ```
   REMOVE_BG_API_KEY=your_key_here
   ```

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000

## Deploy to Cloudflare Pages

1. Push this repo to GitHub
2. In Cloudflare Pages, connect your repo
3. Build command: `npx @cloudflare/next-on-pages`
4. Output directory: `.vercel/output/static`
5. Add environment variable: `REMOVE_BG_API_KEY=your_key`

## Features

- Drag & drop or click to upload
- Before/after comparison
- Download result as PNG
- Edge runtime (fast, no cold starts)
- No image storage (processed in memory)
