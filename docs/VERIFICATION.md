# Verification record

## Production domain and HTTPS — 2026-10-07

- Deployed Worker `cida-pos` to the active Cloudflare Custom Domain `https://poscida.dpdns.org`, using the existing remote D1 database and private R2 bucket. Enabled HTTP-to-HTTPS redirect, set the exact production origin and secure cookies, and disabled workers.dev and preview URLs. DNS resolves via Cloudflare and the TLS certificate is active.
- Live Chrome checks passed for HTTPS login, authenticated POS/catalog (91 active spreadsheet menus and three active categories), D1 health, seven-day reports, dashboard, private R2 logo and historical reset archive download. Session cookies are Secure, HttpOnly and SameSite=Strict. No sales, refunds, resets or printing were executed, and no paid plan or subscription setting was changed.
- The pre-deployment scan caught OpenNext's generated copies of local environment files before upload. The build now removes those generated copies and bundled environment defaults; deployment checks reject copied environment files or local credential values. Full OpenNext production build, TypeScript and output credential scans passed.

## Cloudflare D1 and private R2 migration — 2026-10-07

- Replaced the PostgreSQL runtime with native D1 queries and atomic, revision-checked batches. Read operations check their revision; conflicting writes retry without partial commits. SQLite triggers preserve monetary constraints, immutable audit/payment/closing records and order/item snapshots. Packed inserts/updates and cached transaction reads keep 100-line checkout/refund and sales reset within the tested Free query budget.
- Created Cloudflare D1 `cida-pos` and private R2 `cida-pos-private`. Applied both D1 migrations locally and remotely. Exported the PostgreSQL source in a read-only repeatable-read transaction to an ignored backup with a SHA-256 sidecar; copied it to both local and remote D1, verifying every model field. Preserved 4 users, 97 products, 4 categories, 136 audit records, existing counters, print jobs, sessions, retired checkout key and prior reset history. The source had zero active orders at export; its historical reset payload was copied into verified R2 storage. The PostgreSQL source was not reset or modified.
- Product/receipt images use authenticated R2 media routes; reset downloads require Super Admin and verify the saved checksum. R2 failure blocks reset, and a concurrent checkout during archive upload cancels reset and removes its unused archive.
- Fifteen domain tests and six isolated D1/R2 integration tests passed. Twenty Chrome browser checks passed on the compiled Worker for charts, live reports, A4 pagination, category-only 58 mm printing, iMin fallback, reset permissions, R2 media access and imported archive download. Printing/reset mutations in browser checks were mocked; financial integration ran only in disposable emulators.
- TypeScript and OpenNext/Next.js production builds passed. Wrangler dry-run produced the expected D1/R2/assets bindings; npm audit reported zero vulnerabilities. Public Worker deployment and actual Free-plan authentication CPU behavior remain to be validated before production; no paid subscription was enabled.

## Dedicated Super Admin sales reset menu — 2026-10-07

- Added a Super Admin-only sidebar menu and `/admin/sales-reset` page, retaining the existing Settings entry. The preview shows all eight record counts before preparation; the server redirects other roles and the API rejects them.
- Reset continues to require the account password, a reason, exact `RESET ALL SALES` confirmation and a current preview. It archives sales before clearing them and preserves menus, users and settings.
- Two browser tests passed for menu access, scope preview, confirmation, mocked submission, archive history, printing blockers and cashier denial. Two isolated PostgreSQL integration tests, TypeScript and the production build passed. No sales reset was executed in the configured POS database.

## Dashboard and report printing upgrade — 2026-10-07

- Added daily net-sales trends for 7/30 calendar days, sortable category bar comparisons for revenue/quantity, and category revenue shares with exact amounts and percentages. Trend points respect saved opening times, omit voided orders, subtract refunds and include zero-sale dates. The selected day's summary and trend use one repeatable-read transaction.
- Back-office printing uses a standalone A4 portrait document with selected dates/filters, data timestamp, category/payment/adjustment tables, top products, signatures and page numbers. The selected-category preview generated a one-page A4 PDF; a 72-category long-name fixture generated a four-page A4 PDF with repeatable table headers and rows kept together. Screen-only navigation and charts are hidden in printed output.
- POS daily report screen and thermal printout now contain category amounts and the daily grand total. Printed report excludes quantities, payment methods, adjustments, cashier and terminal details. Refund/void/discount effects remain in net totals; iMin-first printing and computer fallback are retained.
- Fifteen domain tests and two isolated PostgreSQL integration tests passed. Six report browser tests cover charts, mobile layout, live trend/API reconciliation, rejecting an unsupported trend length, stale responses, filtered A4 printing, multi-page printing and the cashier's category-only receipt while preserving the cart. Ten printer fallback tests also passed against the updated cashier screen.
- Report browser print mutations were mocked; they created no live sales or printer jobs. Hardware printing still requires device validation.

## Automatic computer printing fallback — 2026-10-07

- iMin stays the default. Missing SDK, disconnected printer, failed local-service connection and pre-print connection/status timeouts automatically open the existing computer receipt-print window, retaining the 58 mm layout.
- Ten Chrome tests passed using injected printer states and mocked print-job APIs: missing SDK, offline printer, disconnected service, connection timeout, status timeout, cancelled computer printing, healthy iMin, paper-out, failure during bitmap printing and disconnect after printing. Both customer receipts and daily reports were covered. Success was recorded only after operator print confirmation; cancellation recorded failure. No sales or actual printer jobs were created by these tests.
- Fourteen domain tests and the Next.js production build passed, including TypeScript. The existing checkout browser fixtures now inject printer readiness/paper-out explicitly so they continue testing checkout recovery independently of a local printer service.
- Physical iMin and computer printer hardware were unavailable for this verification.

## Spreadsheet menu replacement — 2026-10-07

- Imported every priced row from the supplied workbooks: อาหารร้านนอก 58, อาหารหน้าร้าน 16, อาหารอีสาน 17. Matched all 91 database names, category assignments and integer-satang prices against the workbook data.
- Replaced the bundled demo seed with portable `prisma/menu-data.json`. Deleted the 17 demo products and 20 demo modifiers in the configured POS database. Saved the previous catalog in ignored `backups/` and recorded `MENU_SEED_REPLACE` in audit.
- Compared the complete existing orders, order items, payments, adjustments and manually created products before and after import: unchanged. Four empty legacy categories were deleted; the category containing six inactive manually created test menus was retained inactive.
- Fourteen domain tests and two PostgreSQL integration tests passed. Menu integration verifies deletion, immutable historical snapshots, custom-menu preservation, exact prices, repeat seeding without duplicates and preservation of later price edits. Integration tests used the separate `cida_pos_test` database.
- TypeScript and the Next.js production build passed. A read-only Chrome check confirmed all three category buttons and all 91 Thai menu names on the cashier page; the 390px layout had no horizontal overflow. No checkout or sales reset was performed in the configured POS database during this import.

The earlier verification record below describes the original demo catalog and prior development checks.

Tests run locally against the implemented application:

- Strict TypeScript check.
- Next.js production build.
- The same three browser acceptance workflows passed against the built standalone production server, not only the development server.
- Financial unit tests: 110/200/90 workflow, discounts with exact satang allocation, split-payment validation, rejected underpayment, Bangkok business dates, half-open 10:00/14:00 boundaries, dynamic categories, void/refund reporting, Thai grapheme wrapping and cashier permissions.
- PostgreSQL integration in a separate `cida_pos_test` database: two concurrent identical checkouts result in one order; changed payload with reused key fails; unauthorized discount fails; underpayment rolls back; historical names/prices survive product edits; reprint does not add revenue; print failure leaves completed sale; over-refund fails; concurrent refunds cannot exceed the remaining balance; void cannot run twice; closing demands variance note; closing freezes checkout and adjustments; reopening retains previous close revisions; audit/payment/item snapshot database immutability; immutable cutoff snapshots retain their saved values after later refunds.
- Google Chrome browser workflows at 1366×768: login, category selection, double product tap, water, restored cart after reload, cash 200, change 90, transaction saved, cart reset, failed physical printer connection retained in durable job list, injected SDK reprint reports success without adding an order, cashier forbidden settings access.
- Lost response simulation: checkout is committed, network response discarded, browser refreshed, original key retried, total order count increases by exactly one.
- Back-office pages render; receipt footer edits appear immediately in preview; 390px mobile viewport has no horizontal overflow.
- Product price editing preserves modifier IDs, restores the original demo price after testing and records PRICE_CHANGE in audit.
- npm audit reports zero vulnerabilities after dependency overrides.

Browser tests use demo accounts and create real **development** orders. They must not run against production. Screenshot artifacts are generated under ignored `test-results/`.

Temporary local account passwords were rotated after validation and all old sessions revoked. Current account access is in the ignored `.local-access.txt`. Preview processes are stopped at handoff; start the local database and application using README.md.

Not verified: physical iMin printing, Thai shaping on its firmware, SDK/plugin installation on that device, cutter/drawer, hardware speed, multi-terminal load, HTTPS-to-local-printer compatibility, Docker runtime and network kitchen transports. These require the organization's deployment environment and hardware. See IMIN.md for acceptance procedure.
