# Deployment

## 1. Supabase (Database)
1. Create a new Supabase project.
2. Get the Postgres connection string for `DATABASE_URL`.
   - Supabase Dashboard -> Project Settings -> Database -> Connection string (URI).
3. Run the schema.

```bash
# from repo root
psql "$DATABASE_URL" -f backend/schema.sql
```

4. Confirm tables exist.

```bash
psql "$DATABASE_URL" -c "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;"
```

## 2. Render (Backend)
1. Create a new Web Service from your GitHub repo.
2. Root directory: `/backend`
3. Build command:

```bash
npm install
```

4. Start command:

```bash
npm start
```

5. Add environment variables:

- `DATABASE_URL` = Supabase Postgres connection string
- `JWT_SECRET` = strong random string
- `FRONTEND_ORIGIN` = your Cloudflare Pages URL, e.g. `https://your-app.pages.dev`
- `NODE_ENV` = `production`

6. Optional health check: `GET /health` should return `{ "status": "ok" }`.
7. Note: Render Free services sleep when idle; the first request may be slow.

## 3. Cloudflare Pages (Frontend)
1. Create a new Pages project from your GitHub repo.
2. Root directory: `/frontend`
3. Build command:

```bash
npm install && npm run build
```

4. Output directory: `dist`
5. Add environment variable:

- `VITE_API_BASE_URL` = `https://<your-render-backend>.onrender.com`

6. SPA routing is handled via `frontend/public/_redirects`.
