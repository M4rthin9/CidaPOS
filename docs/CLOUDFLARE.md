# Cloudflare D1 + R2

The POS runtime uses Cloudflare Workers (OpenNext), D1 database `cida-pos`, and private R2 bucket `cida-pos-private`. Source and deployments contain no API tokens or R2 S3 keys. GitHub contains code, the 91-menu seed and D1 migrations; users, sales, audit data, credentials and export files stay private.

Production URL: **https://poscida.dpdns.org**. Wrangler manages its Custom Domain and DNS record. HTTPS redirect is enabled in the Cloudflare zone, session cookies are Secure/HttpOnly/SameSite=Strict, and the `workers.dev` endpoint and preview URLs are disabled. Keep the Custom Domain and `APP_ORIGIN` in `wrangler.jsonc` aligned when changing the hostname.

## Local and cloud environments

`npm run dev` uses local D1/R2 data in `.wrangler/state/`. `npm run db:migrate` applies local D1 migrations; `npm run db:seed` initializes accounts, terminal and spreadsheet menus without replacing existing passwords or edited prices. `npm run cf:preview` runs the compiled Worker locally. Both use the same local bindings.

Put account deployment credentials in ignored `.env.cloudflare.local`:

```dotenv
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_API_TOKEN=your-scoped-api-token
```

The setup helper needs D1 and R2 edit permissions. Deployment also needs Workers Scripts edit. R2 S3 keys are only used by the one-time remote import helper, never by the deployed application. Keep them in the same ignored file when importing:

```dotenv
R2_ACCESS_KEY_ID=your-r2-access-key
R2_SECRET_ACCESS_KEY=your-r2-secret-key
```

Run `npm run cf:setup`, then `npm run db:migrate:remote`. The setup helper updates the non-secret database ID in `wrangler.jsonc`. For a **new empty** database, generate seed SQL using `npm run db:seed:sql` and apply `.wrangler/seed.sql` with `node scripts/cloudflare-command.mjs d1 execute cida-pos --remote --file .wrangler/seed.sql`. Imported databases already contain their accounts and menus.

Build with `npm run cf:build`; inspect with `node scripts/cloudflare-command.mjs deploy --dry-run`. Set `APP_ORIGIN` to the actual HTTPS POS URL in Wrangler `vars` before `npm run cf:deploy`. `COOKIE_SECURE` is true in the deployed Worker. Do not put account credentials or seed passwords in `vars`.

OpenNext automatically copies Next `.env` files into build output. `cf:build` strips those generated copies and clears bundled environment defaults; runtime values come from Wrangler bindings. The deployment helper refuses to upload output containing local credential values or copied environment files. Always build through `npm run cf:build`.

## Deploy from GitHub

The production path is `GitHub main → GitHub Actions → Cloudflare Worker cida-pos → https://poscida.dpdns.org`. The workflow in `.github/workflows/deploy.yml` downloads the repository with checkout, installs locked dependencies on Node.js 22, generates model types, runs domain and isolated D1/R2 tests, and builds the OpenNext Worker. A successful build uploads both server code and static assets to the existing Worker and verifies the live login page, hosted bundles, Thai font, iMin SDK and API authentication/origin checks.

Pushes to `main` deploy automatically. To redeploy the current main branch, select **Actions → Deploy POS to Cloudflare → Run workflow → main**. Deployment jobs run one at a time. Failed tests or builds stop before upload, retaining the previous deployed version. Each deployment message includes its GitHub commit SHA.

Repository Actions secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` authorize only the deployment step. Their values are encrypted through GitHub's repository public key and do not appear in source or build files. Runtime uses D1/R2 bindings; R2 S3 credentials and staff passwords are not supplied to CI. Review and apply schema migrations separately before deploying changes that require them; this workflow never seeds or resets production sales.

Cloudflare's native Workers Builds API does not accept the supplied account-owned token (HTTP 401, Invalid token). GitHub Actions provides automatic deployment to the same Worker with the authorized credentials. Avoid enabling a second automatic deployment system for the same main branch.

Cloudflare hosts the built application and assets. GitHub supplies source at build time; the Worker does not download repository files for each customer request. Sales and uploaded media persist independently in D1 and private R2.

References: [Cloudflare GitHub Actions](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/), [Workers Builds API authentication](https://developers.cloudflare.com/workers/ci-cd/builds/api-reference/), [encrypted GitHub Actions secrets](https://docs.github.com/en/rest/actions/secrets).

## PostgreSQL migration

The source is exported by `node scripts/export-postgresql.mjs` using a read-only repeatable-read transaction. It writes a private JSON backup plus SHA-256 sidecar under ignored `backups/`. The original database is not changed.

`npx tsx scripts/import-d1.ts backups/<export>.json` imports locally; append `--remote` to copy to Cloudflare. The importer rejects a non-empty destination, verifies the source checksum, preserves all primary keys and counters, moves embedded images and historical reset payloads into private R2, commits the data in one guarded batch, and compares every model field after import. Date values are stored as UTC epoch milliseconds; JSON and booleans retain their types. Never commit the export or generated seed SQL.

Only switch a production terminal after reconciling counts, category totals, receipt counters, archive downloads and printing. Keep PostgreSQL as a rollback source until acceptance is complete. New sales recorded in D1 are not automatically written back to PostgreSQL.

## Financial integrity

Prisma is used for generated types; its D1 adapter is not used. Every write stages SQL and commits a revision assertion plus all changes in one native D1 `batch()`. Conflicting operations retry; all partial changes roll back. Read-only operations verify their revision. Direct administrative SQL changes advance the revision through triggers too.

SQLite triggers protect audit, payment, adjustment, closing and snapshot records; order/item snapshots only allow their intended refund/status fields. Financial deletes are permitted solely in a reset batch that references an R2 archive record. The reset checks password, current role, exact confirmation, reason, preview and printing state; the archive is uploaded and read back with a matching checksum before ledger deletion. A concurrent checkout invalidates the reset; failed archive uploads leave sales intact. Receipt counters and retired checkout keys prevent reuse.

## Storage and recovery

Menu images and receipt logos use authenticated `/api/media/...` URLs. R2 has no public bucket URL. Archives can only be downloaded via the Super Admin reset API. Financial archive data is retained in R2 and its D1 metadata contains a SHA-256 checksum. Do not configure a deletion lifecycle on `sales-archives/` without an approved retention policy.

D1 Time Travel provides 7 days on Free and 30 days on Paid. Export D1 regularly using `node scripts/cloudflare-command.mjs d1 export cida-pos --remote --output backups/d1-backup.sql`. Maintain a separate copy of R2 objects and test restoration of both resources into an empty environment. Deleting a database or its bucket is not a reset operation.

## Free-tier limits (checked 2026-10-07)

D1 Free permits 500 MB per database (5 GB total), 5 million rows read/day and 100,000 rows written/day. Worker D1 invocations allow 50 queries on Free. Inserts and updates are packed for 100-line checkout/refund operations; integration tests check the query budget. Reports use indexed filters and eager-load related records in groups. Monitor reads/writes and database growth; reports and indexes also consume usage.

R2 Standard includes 10 GB-month of storage, 1 million Class A operations and 10 million Class B operations/month, with no egress charge. Infrequent Access is excluded from that allowance. R2 can bill overages; no paid-plan upgrade is performed by these setup scripts.

Workers Free includes 100,000 requests/day and 10 ms CPU/request. The current bcrypt password verification must be checked against the actual account CPU allowance before production; D1/R2 free allowances do not imply that all Next.js/authentication requests fit the Workers Free CPU limit. Preserve password security when addressing CPU limits.

HTTPS login, authenticated D1/catalog/report reads and dashboard rendering succeeded on the deployed account on 2026-10-07. This verifies those requests on the current account, not sustained usage against all Free allowances. No subscription or CPU allowance was changed.

Sources: [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [atomic D1 batches](https://developers.cloudflare.com/d1/worker-api/d1-database/), [R2 pricing](https://developers.cloudflare.com/r2/pricing/), [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [OpenNext](https://opennext.js.org/cloudflare/get-started).
