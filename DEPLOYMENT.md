# Deployment

## 1. Supabase (Database)
1. Create a new Supabase project.
2. Get the Postgres connection string for `DATABASE_URL`.
   - Supabase Dashboard -> Project Overview -> Connect -> Connection string (URI).
   - If you see an IPv6 warning, switch **Method** to **Session Pooler** and use that URI.
3. Run the schema.

```bash
# from repo root
psql "$DATABASE_URL" -f backend/schema.sql
```

4. Confirm tables exist.

```bash
psql "$DATABASE_URL" -c "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;"
```

## 2. Hostinger KVM 4 (Backend)

The backend runs in an isolated Docker Compose project. The API publishes no host ports and does not modify the VPS's existing Nginx, MySQL, Redis, or other project containers. It can be deployed and checked privately before a custom domain is available.

1. Clone the repository on the VPS and create the production environment file:

```bash
cd /opt
sudo git clone https://github.com/Enzizy/joyno-hr.git
cd joyno-hr/backend
sudo cp .env.example .env
sudo chmod 600 .env
sudo nano .env
```

Required values:

- `DATABASE_URL` = the existing Supabase **Session pooler** URI on port `5432`, with `sslmode=require`
- `JWT_SECRET` = a new random production secret; do not reuse a development secret
- `FRONTEND_ORIGIN` = the exact Cloudflare Pages URL, without a trailing slash
- `NODE_ENV=production`
- `RUN_BACKGROUND_JOBS=false` while Render remains live; change it to `true` only during final cutover

2. Build the image and apply pending migrations once:

```bash
sudo docker compose -f compose.kvm.yml build
sudo docker compose -f compose.kvm.yml run --rm api npm run migrate
```

3. Start the private API and verify it from inside the container:

```bash
sudo docker compose -f compose.kvm.yml up -d
sudo docker compose -f compose.kvm.yml ps
sudo docker compose -f compose.kvm.yml exec -T api node -e "fetch('http://127.0.0.1:3000/health').then(r => r.text()).then(console.log)"
```

At this point, the backend is running on the KVM but is intentionally inaccessible from the public Internet.

Keep the Render backend active during this private test. Both deployments may use the same Supabase database, but only Render should run scheduled email, escalation, and cleanup jobs. Use the same `JWT_SECRET` on both backends during cutover so existing login tokens remain valid.

### Publish the API after obtaining a domain

1. Add the domain to Cloudflare. Create a remotely managed tunnel named `joyno-hr`, then add a published application route:
   - Hostname: the API hostname, such as `api.example.com`
   - Service type: `HTTP`
   - Service URL: `http://api:3000`
2. In the tunnel's **Add a replica** screen, copy only the `eyJ...` token from the Docker command. Store it in the ignored tunnel environment file:

```bash
cd /opt/joyno-hr/backend
sudo cp deploy/tunnel.env.example deploy/tunnel.env
sudo chmod 600 deploy/tunnel.env
sudo nano deploy/tunnel.env
```

The file must contain `TUNNEL_TOKEN=<token>`. Treat this token as a secret and never commit it.

3. Start the tunnel alongside the existing private API, then verify it:

```bash
sudo docker compose -f compose.kvm.yml -f compose.tunnel.yml up -d
sudo docker compose -f compose.kvm.yml -f compose.tunnel.yml ps
curl https://api.example.com/health
```

The health response should be `{ "status": "ok", "database": "connected" }`. Cloudflare Tunnel makes an outbound connection from its container and reaches the API using the private Docker service name `api`.

For later releases, pull the code, rebuild, run migrations, and restart:

```bash
cd /opt/joyno-hr/backend
sudo git pull --ff-only
sudo docker compose -f compose.kvm.yml build
sudo docker compose -f compose.kvm.yml run --rm api npm run migrate
sudo docker compose -f compose.kvm.yml up -d
```

## 3. Cloudflare Pages (Frontend)
1. Create a new Pages project from your GitHub repo.
2. Root directory: `./frontend`
3. Build command:

```bash
npm install && npm run build
```

4. Output directory: `dist`
5. Add environment variable:

- `VITE_API_BASE_URL` = `https://api.example.com`

6. SPA routing is handled via `frontend/public/_redirects`.
7. If Pages requires a deploy command, set:
   - Build command: `npm install`
   - Deploy command: `npm run build`

## Leave-credit release with payroll hidden

The announcement release includes the reviewed HRMS development branch with the same production payroll restrictions: Pay, Attendance and Pay & schedules have no production frontend routes, and payroll APIs remain disabled even if payroll environment flags are true. The KVM Compose file explicitly sets payroll and finalization flags to false. Local development still supports payroll testing.

Announcements use the existing Brevo email helper. The backend requires `BREVO_API_KEY` and `BREVO_FROM_EMAIL` in its private `backend/.env` (optional `BREVO_FROM_NAME`). Recreate the API container after configuring these values. Keep credentials out of Git and the frontend. Without a mail provider, publishing retains the in-app announcement and displays a warning that emails were not sent. Previously published announcements are not automatically resent during deployment.

Cloudflare production follows `main`; pushing a development branch creates no production release. The VPS API must be updated separately. Before a release, back up the existing API image and private configuration, fetch the verified release commit, build the API, verify the database migration list, and restart only the HR API. The shared database already records migrations through 027; do not reapply migrations or recalculate leave/payroll data for this deployment.

Production builds hide the Pay page even if `VITE_PAYROLL_ENABLED=true` is set in Cloudflare.
The production API also disables payroll endpoints. Local development can continue to use
`VITE_PAYROLL_ENABLED=true` and `PAYROLL_ENABLED=true`.

Cloudflare deploys the frontend from `main`. The Hostinger API needs this separate update:

```bash
cd /opt/joyno-hr
git pull --ff-only
cd backend
sudo docker compose -f compose.kvm.yml build api
sudo mkdir -p /opt/joyno-hr-backups
sudo docker compose -f compose.kvm.yml run --rm --no-deps --user root \
  -v /opt/joyno-hr-backups:/backups api node src/applyLeavePolicyUpdate.js /backups
sudo docker compose -f compose.kvm.yml up -d --no-deps api
sudo docker compose -f compose.kvm.yml exec -T api node -e \
  "fetch('http://127.0.0.1:3000/health').then(r => r.text()).then(console.log)"
```

The targeted command backs up leave-policy rows and credit summaries, applies only migration
023 in one transaction, and recalculates employee totals. It preserves historical leave and
payroll records. It does not run the pending local payroll migrations.
The backup path is printed by the command. If the migration is already recorded, it skips it.

New allowances are separate: 5 sick and 3 vacation days after 3 months; 5 SIL days after 1 year.
Bereavement is retired from new requests. Unused SIL is marked as cash-convertible;
automatic cash payment remains pending a decision on timing and payroll handling.
