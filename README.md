# Velebit Console

A private, single-user business console for **Velebit Consulting FZCO** — clients, deals,
broker-dealer referrals, invoicing (with a pixel-locked branded invoice template),
accounting, UAE Corporate Tax / VAT tracking, and a recoverable Bin, all backed by Supabase.

This is not a multi-tenant SaaS product. It is built for one company's internal use.

## Stack

- **React 19** + **Vite 8**, single-page app
- The entire UI lives in one file: `src/App.jsx` (this is intentional — see "A note on
  architecture" below, not an oversight to "fix")
- **Supabase**: Postgres (a single `kv_store` key/value table), Auth, and two Storage buckets
  (`attachments`, `backups`)
- **Recharts** for the dashboard chart, **lucide-react** for icons
- **oxlint** for linting
- Deployed via **Netlify**, connected to this GitHub repo

## Local development

```bash
npm install
npm run dev       # starts the Vite dev server
npm run build     # production build to dist/
npm run preview   # serve the production build locally
npm run lint       # oxlint src/App.jsx
```

## Environment variables

**None are required to build or run this app locally.** The Supabase project URL and anon
key are intentionally hardcoded in `src/App.jsx` (the anon key is a public, RLS-protected
key that ships in every client bundle by design — this is normal for a Supabase browser
client, not a leaked secret).

The one place environment variables *are* used is server-side, outside this build:

- **`supabase/functions/backup-data/index.ts`** (a Supabase Edge Function) reads
  `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from its own Supabase-managed environment.
  These are configured in the Supabase project's Edge Function settings, never in this repo.
- **`.github/workflows/supabase-keepalive.yml`** pings the Supabase REST API on a schedule
  so the free-tier project doesn't pause from inactivity. It uses the same public anon key
  (hardcoded there too, for the same reason).

## Supabase dependencies

- **`kv_store` table** — one row per top-level dataset, keyed by name (`velebit:clients`,
  `velebit:deals`, `velebit:referrals`, `velebit:invoices`, `velebit:txns`, `velebit:trash`,
  `velebit:settings`). Each row's `value` column holds that dataset's entire JSON array/object.
  There is no relational schema beyond this — every record shape lives in the JSON itself.
- **`attachments` bucket** (private) — client/deal/invoice file attachments, uploaded and
  read directly from the browser under an authenticated session. Storage paths follow
  `{clients|deals|invoices}/{recordId}/{attachmentId}-{filename}`. Max 25 MB per file, max
  20 attachments per record, extension allow-list (pdf, png, jpg, jpeg, webp, doc, docx,
  xls, xlsx, csv, txt).
- **`backups` bucket** (private) — automatic weekly JSON backups, written by the
  `backup-data` Edge Function using the service-role key (the browser can only read this
  bucket, never write to it directly, other than triggering the function via "Backup now").
  The function keeps the most recent 12 backups and prunes older ones. The schedule itself
  (a `pg_cron` job calling the function weekly) is a database-side config, not code deployed
  from this repo — see `supabase/backup_schedule.sql` for the exact, verified job definition
  (redacted of its auth token) so it can be reproduced on a new Supabase project if ever
  needed.

## Backup behavior, at a glance

- A backup (manual "Export backup" or the automatic weekly one) is a single JSON file
  containing every `kv_store` dataset, **plus each record's attachment metadata**
  (filename, size, type, Storage path) — **not the attachment files themselves**.
- Attachment binaries always stay in the `attachments` Storage bucket. Restoring a backup
  reconnects a record to its attachments only if those Storage objects still exist; it
  never embeds file contents into the JSON.
- Restoring a backup writes each dataset back individually and is designed to fail closed:
  a failed read is never silently treated as "no data" and saved back as empty.

## Two things future changes must respect

**1. The invoice renderer is intentionally locked.**
`buildInvoiceHTMLv3` (and the `INVOICE_BG_DARK` / `INVOICE_BG_LIGHT` background constants it
uses) generates the exact HTML/CSS for the printed and downloaded invoice — coordinates,
fonts, banking block, totals, footer, the works. It took a long time to get pixel-perfect
against the real Velebit template and **must not be casually refactored, reformatted, or
"cleaned up"** — including whitespace-only changes — without explicitly re-verifying the
rendered output is unchanged (a before/after SHA-256 comparison of its output for a fixed
sample invoice is the standard way this has been verified across past changes).

**2. `kv_store` must never be bulk-rewritten.**
Every dataset is loaded fail-closed (a failed read blocks all saves for that session rather
than risking an empty array getting written back over real data) and restores are
coordinated with rollback protection. Any tooling, script, or migration touching
`kv_store` directly should treat this the same way: never overwrite a key with a fallback
value just because a read failed, and never touch Storage objects except the specific
paths a record's own `attachments` metadata names.

## A note on architecture

`src/App.jsx` is a large single file by design, not by neglect — it was kept this way
deliberately across many iterative phases to avoid the churn and regression risk of
restructuring a small, actively-changing, single-user app into a multi-file/router
architecture. If you do eventually split it up, do so as its own dedicated, carefully
tested pass — not as a side effect of an unrelated feature or bugfix.

## Deployment

Netlify is connected directly to this GitHub repository. Pushing to a non-`main` branch
triggers a branch/preview deploy; `main` is the production branch. Promoting a branch to
production is a manual decision (merge to `main`), not automatic on every push.
