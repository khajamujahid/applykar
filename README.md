# Applykar

Personal job search for one owner. It ingests public career-page JSON from Greenhouse, Lever, Ashby, SmartRecruiters, and Workable, scores roles against a profile, and can submit Greenhouse, Lever, and Ashby applications from saved answers only.

LinkedIn and Indeed are not ingested and are not submitted by the server. The Chrome extension can save a page you already have open and autofill it. You submit that page yourself.

## Local setup

```bash
pnpm install
cp .env.example .env.local
pnpm db:migrate
pnpm db:seed
pnpm ingest -- --slugs=netlify,figma,sonarsource,notion,huggingface --limit=8
pnpm dev
```

The app listens on [http://127.0.0.1:4317](http://127.0.0.1:4317).

Sign-in is Google OAuth, limited to `ALLOWED_EMAILS`. There is no public sign-up.

## Environment

| Name | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres with pgvector. Use Neon’s pooled URL on Vercel. |
| `AUTH_SECRET` | yes | Auth.js session secret. |
| `AUTH_URL` | yes | Public origin, including the extension and Google redirects. |
| `AUTH_GOOGLE_ID` | yes, to sign in | Google OAuth client id. |
| `AUTH_GOOGLE_SECRET` | yes, to sign in | Google OAuth client secret. |
| `ALLOWED_EMAILS` | yes | Comma-separated Google accounts that may sign in. |
| `MCP_BEARER_TOKEN` | for MCP | Bearer token for `POST /api/mcp`. |
| `CRON_SECRET` | for cron | Vercel Cron sends `Authorization: Bearer`. |
| `APPLY_SUBMIT` | worker | `1` submits forms. `0` fills them and stops. |
| `APPLY_CONCURRENCY` | worker | Parallel browser contexts. Default 3. |
| `INBOX_DOMAIN` | optional | Profile addresses become `{name}@domain`. |
| `INBOX_WEBHOOK_SECRET` | optional | `POST /api/inbox/webhook`. |
| `INBOX_IMAP_HOST` `INBOX_IMAP_USER` `INBOX_IMAP_PASSWORD` | optional | Generic IMAP poll. |
| `OPENAI_API_KEY` | optional | Embeddings and gap-fill enrichment. Set `LLM_ENRICH=true` to allow the model pass. |
| `ADZUNA_APP_ID` `ADZUNA_APP_KEY` `USAJOBS_API_KEY` `JSEARCH_API_KEY` | optional | Extra public job sources. |

Google redirect URIs:

- `{AUTH_URL}/api/auth/callback/google`
- `{AUTH_URL}/api/auth/callback/gmail` if you connect Gmail (`gmail.readonly`)

Gmail is read-only. Applykar uses it for confirmations, codes, interview mail, and rejections.

## Companies

Boards live in `data/companies.json` as `{ "name", "slug", "source" }`. `source` is `greenhouse`, `lever`, `ashby`, `smartrecruiters`, or `workable`. Add a row and run `pnpm db:seed`.

## Apply worker

Vercel cannot run the browser. GitHub Actions runs `pnpm apply:worker -- --once` every 10 minutes (`.github/workflows/apply-worker.yml`) on the free public-runner minutes. The workflow needs a repository secret named `DATABASE_URL` (the Neon pooled URL). `APPLY_SUBMIT=1` submits. Set it to `0` to fill forms and stop.

You can also run it on any machine with Playwright:

```bash
pnpm exec playwright install chromium
pnpm apply:worker
```

The worker claims queued Greenhouse, Lever, and Ashby items, fills known questions from saved answers and the owner name and email, uploads the resume text, reads a verification code from the inbox when the form asks, screenshots the result, and stores the confirmation as proof. A required question with no saved answer is left blank and the application is not submitted. It does not invent answers, and it does not click submit when a CAPTCHA is on the page. It does not submit on LinkedIn or Indeed.

`pnpm exec tsx scripts/apply-dry-run.ts` fills one live Greenhouse, Lever, and Ashby posting and does not submit. Proof screenshots land in `data/proofs/`.

## Chrome extension

1. `pnpm extension:zip`
2. Chrome → `chrome://extensions` → Developer mode → Load unpacked.
3. Choose the `extension` folder, or unzip `extension/applykar-extension.zip` and choose that folder.
4. In Applykar Settings, create a pairing token.
5. Open the extension popup, set the app URL (`http://127.0.0.1:4317` locally), paste the token, and pair.

On a job posting the page shows **Apply with Applykar** and **Autofill this page**.

- Apply sends the URL, title, company, location, and description to `POST /api/extension/capture`.
- Greenhouse, Lever, and Ashby are queued for the worker. A toast reports that.
- Every other site, including LinkedIn and Indeed, is only saved. Autofill writes saved answers into the open form and leaves unknown fields blank. You click submit.

The popup shows the pairing state, the active profile, and recent applications.

## MCP

Point a client at `POST {AUTH_URL}/api/mcp` with header `Authorization: Bearer $MCP_BEARER_TOKEN` and `Accept: application/json, text/event-stream`.

Tools: `search_jobs`, `get_job`, `list_saved`, `save_job`, `hide_job`, `queue_application`, `list_applications`, `update_application_status`, `get_profile`, `update_profile_answers`, `list_profiles`, `set_active_profile`, `get_verification_code`, `trigger_ingest`.

The server lets an AI client operate this account. It does not call other job products.

## Deploy

```bash
pnpm db:migrate   # against the Neon DATABASE_URL
```

Set the env vars above in the Vercel project. Ingestion cron hits `/api/cron/ingest` once a day at 11:00 UTC, which is the Hobby limit. On Pro, change `vercel.json` to `0 */6 * * *`. Submitting applications is the GitHub Actions worker, not a Vercel function. IMAP stays off until `INBOX_IMAP_HOST`, `INBOX_IMAP_USER`, and `INBOX_IMAP_PASSWORD` are set. `imapflow` is a dependency.

## Tests

```bash
pnpm test
pnpm test:e2e
```
