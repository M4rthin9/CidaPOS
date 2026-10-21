# CPOS Print Bridge V2.4.3

This integration uses the endpoints reported by the installed CPOS helper on the C9PD, rather than another vendor's PrintBridge API:

- Base URL: `http://127.0.0.1:9100`
- `GET /status` — reported service name: `cpos-helper`; `running: true`, `connected: true`, `health: ready`, `printableDot: 576`, `queuedJob: 0`, `status: 4`, `drawerMode: both`
- `POST /raw` — raw ESC/POS bytes, sent as `application/octet-stream`
- The helper also advertises `POST /cgi-bin/epos/service.cgi`; this integration uses `/raw`.

On the CPOS machine, start CPOS Print Bridge, select its default USB output and wait for Ready. The reported output during setup was `USB:1137-85 Ready`. Output selection belongs to the bridge and is independent of the POS's direct WebUSB ICOD preset (`1155:30016`).

Open POS settings → อุปกรณ์ POS → **CPOS TH C9PD · Print Bridge**, save the terminal, and bind this browser to that terminal. Select **CPOS Print Bridge V2.4.3** as the printing adapter if editing an existing terminal. Choose 80 mm or 58 mm paper, check the bridge, then use **บันทึกและทดสอบพิมพ์ CPOS**. Test printing does not create sales.

The browser sends directly to the bridge on the same device. The hosted Cloudflare Worker never connects to its own localhost. Chrome must permit local network access, and the bridge must permit the POS origin (`https://poscida.dpdns.org`) through CORS, including OPTIONS for binary POST requests. If a local-network or CORS request fails, the POS reports the error; it does not bypass browser permissions or treat an opaque response as successful printing.

Receipts reuse the existing raster renderer to preserve Thai text, logos, QR codes, item alignment and notes. Each receipt is one binary POST. The status endpoint is checked first; explicit negative status flags and HTTP errors stop the job. A successful request means the bridge accepted the job, not proof that paper physically emerged. Failed or timed-out requests never automatically fall back or retry because the bridge may already have printed the receipt. Check the printer and bridge before manually retrying.

Verification: browser tests simulate the reported helper API, assert binary receipt bytes, 58/80 mm widths, Thai raster rendering, cash-only drawer pulses, settings persistence, status failures and failed or interrupted POSTs. Physical printing must still be checked on the CPOS machine.
