# AcadCode — Vercel Deployment Guide
> Full-stack on Vercel's free Hobby plan. No external services needed.

---

## Stack
| Layer    | Tech                                |
|----------|-------------------------------------|
| Hosting  | Vercel (Hobby / free)               |
| Backend  | Node.js Serverless Functions        |
| Database | Vercel Postgres (Neon) — free tier  |
| Frontend | Static `index.html`                 |

---

## Step 1 — Install Vercel CLI & log in

```bash
npm i -g vercel
vercel login
```

---

## Step 2 — Link your project

Inside the project folder:

```bash
vercel link
```

Follow the prompts — create a new project or link to an existing one.

---

## Step 3 — Create a Vercel Postgres database

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Click **Storage** in the top nav → **Create Database**
3. Choose **Postgres** → give it a name (e.g. `acadcode-db`)
4. On the next screen, click **Connect to Project** and select your project
5. Vercel automatically injects `POSTGRES_URL` and related env vars

---

## Step 4 — Run the schema

### Option A — Vercel Dashboard (easiest, no tools needed)
1. Go to **Storage** → your database → **Query** tab
2. Paste the entire contents of `db/schema.sql`
3. Click **Run Query**

### Option B — psql locally
```bash
vercel env pull .env.local          # pulls POSTGRES_URL into your local env
source .env.local
psql "$POSTGRES_URL" -f db/schema.sql
```

---

## Step 5 — Deploy

```bash
vercel --prod
```

That's it. Your app is live.

---

## Local development

```bash
vercel env pull .env.local    # one-time: pulls DB creds to local env
vercel dev                    # starts local server on http://localhost:3000
```

`vercel dev` runs your serverless functions locally and serves `index.html`
with the same routing as production.

---

## File reference

| File                       | Purpose                                    |
|----------------------------|--------------------------------------------|
| `index.html`               | Entire frontend (static)                   |
| `api/_helpers.js`          | Shared DB, auth, CORS helpers              |
| `api/login.js`             | POST /api/login                            |
| `api/register.js`          | POST /api/register                         |
| `api/logout.js`            | POST /api/logout                           |
| `api/me.js`                | GET  /api/me                               |
| `api/submit.js`            | POST /api/submit                           |
| `api/leaderboard.js`       | GET  /api/leaderboard                      |
| `db/schema.sql`            | PostgreSQL schema — run once               |
| `vercel.json`              | Security headers config                    |
| `.env.local`               | Local env template (populated by CLI)      |

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `Error: POSTGRES_URL is not set` | Run `vercel env pull .env.local` and restart `vercel dev` |
| 500 on first deploy | Check Storage → your DB → Logs; schema may not have been run |
| Login returns 401 after deploy | Re-run the schema — table may be missing |
| `vercel dev` works but prod fails | Confirm the DB is connected to the project in the dashboard |

---

## Vercel Postgres free tier limits

| Resource        | Limit              |
|-----------------|--------------------|
| Storage         | 256 MB             |
| Compute hours   | 60 hrs / month     |
| Rows written    | 100k / month       |
| Rows read       | 100k / month       |

More than enough for a school quiz app.
