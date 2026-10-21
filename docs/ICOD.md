# CPOS TH C9PD / ICOD USB printer

In **Settings → POS devices**, choose **CPOS TH C9PD · ICOD USB** to prepare a new terminal named `CPOS TH C9PD` with device ID `CPOS-TH-C9PD`. Alternatively, edit an existing terminal and select **ICOD Thermal Printer · CPOS TH C9PD (USB)** under Printing; this preserves the terminal's name and device ID.

Open the POS in Chrome through HTTPS (localhost also supports development), connect the printer, and click **Connect ICOD USB** (`เชื่อมต่อ ICOD USB`). Select `ICOD_Thermal_Printer` and grant USB access. The picker matches vendor ID **1155** and product ID **30016** (decimal), corresponding to `USB:1155-30016`. The [WebUSB documentation](https://developer.chrome.com/docs/capabilities/usb) describes the browser and Android permission steps. If another application owns the USB interface, release it before connecting from Chrome.

Choose 80 mm / 576 dots or 58 mm / 384 dots to match the installed paper. Configure the cutter and drawer only if fitted. Click **Save device**, then select this terminal under **Bind POS to this browser**. **Save and test print ICOD** saves the current terminal and receipt settings before creating a test job; it does not create a sale. Verify the actual Thai output, paper width, cutting and drawer on the hardware.

The saved device configuration is shared by the POS installation; USB permission and the exact selected device association belong to the terminal and browser. ICOD associations are separate from Codesoft associations. Printing uses the selected printer only; disconnects, paper faults and partial transfers report failure without switching to another printer.

`127.0.0.1:9100` identifies a separate local print service. Direct USB mode sends ESC/POS commands to the USB bulk endpoint and does not use a TCP port. A regular website cannot send raw TCP directly; Chrome exposes [Direct Sockets](https://developer.chrome.com/docs/iwa/direct-sockets) to Isolated Web Apps. Connecting through the local service requires its documented browser bridge or an appropriate installed helper; a TCP port number alone does not identify an HTTP/WebSocket protocol.
