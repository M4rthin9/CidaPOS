# iMin deployment and hardware acceptance

The supplied information identifies iMin only. No model, Android/ROM version, physical device, printer plugin or native wrapper was available. This project is a Node web server with a client-side manufacturer SDK adapter; it is not a verified Android APK.

Official references:
- [iMin printer / SDK version compatibility](https://oss-sg.imin.sg/docs/en/Printer.html)
- [JavaScript printing API](https://oss-sg.imin.sg/docs/print/JSPrinterSDK_.html)
- [Manufacturer browser demo](https://mp.imin.sg/JSPrinter/index.html)

The manufacturer demo's MIT licensed `imin-printer.js` v1.5.0 is vendored at `public/vendor/imin-printer.min.js` with its original license header. Download SHA-256: `20117b5d6e44afead224298fcacbea38c3e7d5407e62f29e75e93ad5bf6b29ca`. No proprietary POS2U content is included. `scripts/fetch-assets.mjs` can fetch original assets; inspect upstream changes before replacing a tested SDK.

The SDK opens a connection to `ws://127.0.0.1:8081/websocket` on the **terminal**, not the POS server. Bitmap upload uses the device's local HTTP `/upload` service. iMin's supported service/plugin or compatible native wrapper must provide these endpoints. V1 hardware may need iMinprinterplugin; V2 requirements depend on the device ROM. Open the manufacturer's demo on the actual terminal and verify its direct printing before installing this POS.

Use admin → settings → POS devices to choose USB/SPI/Bluetooth according to the actual model. The adapter supports both the current Promise status API and callback-based injected bridges. It serializes status queries with print operations because this SDK has a single status callback slot. It awaits bitmap upload before subsequent print commands.

When SDK discovery, local-service connection or the initial status check fails, or iMin reports disconnected status (-1 or 1), receipts and daily reports automatically open the computer receipt-print window. SDK loading and local-service connection each time out after three seconds; status checks time out after 2.5 seconds. The fallback retains the configured paper layout and requires the operator to print and confirm actual output before the claimed job is marked successful. Cancelling leaves a failed, recoverable job. Paper-out/open-head errors stay on the iMin path. Failures after receipt commands start never automatically print another copy on the computer, because iMin may already have produced part or all of the receipt. See the [manufacturer status definitions](https://oss-sg.imin.sg/docs/en/JSPrinterSDK.html).

The shop's default is 80 mm paper with a 576-dot printable width. The [manufacturer API](https://oss-sg.imin.sg/docs/en/JSPrinterSDK.html) specifies page format 0 for 80 mm and 1 for 58 mm; the adapter selects the format from the saved profile. Existing standard 58 mm settings are upgraded once by migration 0003. Narrower 58 mm (384 dots) and 48 mm layout profiles remain selectable. Set actual dot width, font size and margins from test prints. Cutting/drawer calls require both configured device capability and corresponding SDK method. Merely having an SDK method does not establish that hardware has a cutter or drawer.

Receipts use locally hosted Sarabun; no runtime Google font download is required. Customer receipts and daily reports render shaped text in centered bitmap blocks at the configured width. Kitchen tickets can use native text or enable Thai bitmap blocks. Logos are resized, thresholded to monochrome and kept in saved configuration. Status `PRINTED` means commands were accepted and the subsequent SDK status reported ready; this API does not supply proof that the full paper physically exited. Uncertain power-loss jobs need operator reconciliation.

Modern Chrome/WebView is required (ES2022, native dialog, Intl.Segmenter). Legacy Edge 92 in the development host could not run current Next development JavaScript; Chrome 154 was used for browser acceptance. Validate the exact iMin WebView/browser version. An HTTPS page may block the SDK's local insecure WebSocket/HTTP endpoints. For HTTPS production, deploy a compatible secure local bridge or approved native wrapper; do not weaken browser security globally. LAN HTTP can be used in an isolated deployment with `COOKIE_SECURE=false` and matching `APP_ORIGIN`, subject to the organization's network policy.

Hardware checklist (pending physical device):
1. Record model, Android, ROM, service version and actual connection type.
2. Set terminal/printer ID, usable width, paper profile, feed, cutter and drawer.
3. Test Thai organization name, vowels/marks, long food names and price wrapping.
4. Sell chicken basil twice (50 each) + water (10). Total 110, cash 200, change 90.
5. Confirm exactly one saved order, unique queue, automatic direct receipt and empty cart.
6. Disconnect printer or remove paper; complete payment and verify stored sale survives.
7. Reconnect and print a marked copy. Confirm no additional order/revenue and REPRINT audit.
8. Interrupt power after commit and before printing; recover the pending/uncertain job explicitly.
9. Test narrow profile, logos, QR, bold, largest queue font, drawer and cutter where supported.
10. Load-test sustained throughput on the actual terminal. Sub-100ms tap and print timings have not been measured on iMin.

Divider blocks are rendered as 2-dot bitmap rules spanning the configured printable width minus the configured margins. They do not rely on a font-dependent count of hyphens. The 80 mm profile uses 576 dots / 72 mm of printable width; the physical unprintable paper margins remain.

The laptop adapter opens a receipt-only print dialog and uses the operating system's installed receipt-printer driver. It renders Thai text, full-width divider rules, logos, QR codes and Code 128 barcodes locally. Choose the matching roll width, 100% scale, no margins and no browser headers/footers. The operator must explicitly confirm that paper printed before the job is marked PRINTED; canceling records an unsuccessful job. Browser printing cannot verify cutter/drawer capabilities or physical printer status.

Cashier daily reports are printed from POS → รายงานประจำวัน → พิมพ์ 80 มม. The button and job use the current saved printer profile. Bill reprints also use the current physical printer profile while retaining the original business information, item prices and payment totals. Their receipt layout contains the organization/date, category names with net daily amounts and a daily grand total. Active categories with no sales print zero. Payment-method, item-count and adjustment detail is reserved for the back-office A4 report. The server saves the complete daily totals snapshot in the print job for durable recovery; changing the report layout does not alter sales or financial calculations.

Network kitchen printers have a routing schema and kitchen receipt renderer; the network transport deliberately reports unavailable until a real network bridge is implemented. Local iMin kitchen routes can use the same configured printer ID.
