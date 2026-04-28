# PhD Defense Prep — Cloudflare D1 Deployment Guide

## What you have
- `index.html` — Full single-page app (quiz engine, study plan, committee profiles, ESC guidelines, anti-overstudying)
- `wrangler.toml` — Cloudflare Pages configuration  
- `schema.sql` — D1 SQLite database schema
- `functions/api/[[route]].js` — Pages Functions API (handles all /api/* routes)

---

## Step 1 — Install Wrangler CLI

```bash
npm install -g wrangler
wrangler login
```
> Opens browser for Cloudflare account login. If no account: create one free at cloudflare.com

---

## Step 2 — Create the D1 database

```bash
wrangler d1 create phd-defense-db
```

**Copy the `database_id` from the output**, it looks like:
```
✅ Successfully created DB 'phd-defense-db'
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Open `wrangler.toml` and replace `REPLACE_WITH_YOUR_D1_DATABASE_ID` with the actual ID.

---

## Step 3 — Run the database schema

```bash
wrangler d1 execute phd-defense-db --file=schema.sql
```

Verify it worked:
```bash
wrangler d1 execute phd-defense-db --command="SELECT name FROM sqlite_master WHERE type='table';"
```

---

## Step 4 — Push to GitHub and connect to Cloudflare Pages

1. Create a GitHub repo (private) and push all 4 files:
   ```
   index.html
   wrangler.toml
   schema.sql
   functions/api/[[route]].js
   ```

2. Go to **Cloudflare Dashboard → Workers & Pages → Create → Connect to Git**

3. Select your repo. Build settings:
   - Framework preset: **None**
   - Build command: *(leave blank)*
   - Build output directory: `.`

4. After first deploy, go to **Settings → Functions → D1 database bindings**:
   - Variable name: `DB`
   - D1 database: `phd-defense-db`

5. Re-deploy (or push a small commit) to activate the binding.

---

## Step 5 — You're live!

Visit your `*.pages.dev` URL. All quiz answers, study sessions, and reading progress save to D1 automatically.

---

## Fallback behavior

If the API is unavailable, all data falls back to localStorage automatically. No data is lost — just sync when back online.

---

## Quiz summary

- **65+ questions** across: Thesis Core, Senescence, Mitochondrial Dynamics, mtDNA & Biomarker, Cardio-Oncology Field, iPSC Methodology, ESC Guidelines 2022, Clinical Application, Committee-specific (×6), Key Papers, Methodology
- **SM-2 spaced repetition**: cards due today shown first; mastered cards recede
- **Anti-overstudying**: daily study meter, 4-hour limit, efficiency labels
- **Target**: 90% accuracy per category before May 21

## Files

| File | Purpose |
|------|---------|
| `index.html` | Full frontend app |
| `wrangler.toml` | Cloudflare Pages + D1 config |
| `schema.sql` | Database tables |
| `functions/api/[[route]].js` | API endpoints |
