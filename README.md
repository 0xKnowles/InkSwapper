# CrossSwap

CrossSwap is a client-side dashboard/manager for ESP32-C3 e-reader devices
(Xteink X3 / X4) running CrossPoint and its forks. It runs entirely in the
browser and is responsive down to mobile: it resolves firmware releases live
from GitHub, flashes the selected firmware over **USB serial** (`esptool-js`)
or **wireless OTA**, streams a stats backup off and back onto the device
around the flash, and lets you design and upload custom sleep-screen artwork.

## Sections

- **Dashboard** — connection status, quick links into the other tools, and a
  local history of stats backups.
- **Flash OS** — a guided 3-step wizard: back up on-device stats
  (`CMD_EXPORT_STATS`), flash the selected firmware ("Erase Flash" defaults
  to **off** so a fork swap never scrubs partitions outside the firmware
  image), then restore the backup (`CMD_IMPORT_STATS:[JSON]`).
- **Sleep Screens** — upload artwork, fit/crop it to the Xteink X3 (528×792)
  or X4 (480×800) portrait panel, dither it (grayscale or 1-bit
  Floyd–Steinberg), and upload the resulting BMP to `/sleep` on the device.

Every phase logs timestamped status lines to the live terminal pane, which
collapses to a single line on mobile.

## Connecting: USB Serial vs. Wireless

CrossSwap talks to the device over one of two transports, switchable from
the sidebar (disconnect first to switch):

- **USB Serial** — uses the Web Serial API. Solid support on desktop
  Chromium browsers. On Android, native USB serial support is very new
  (Chrome 148 beta+, a limited set of devices) and not yet reliable —
  **Wireless is the recommended path for flashing from a phone.**
- **Wireless (OTA)** — enter the device's local IP or hostname; CrossSwap
  talks to it over plain HTTP on your LAN. Firmware flashing POSTs a
  multipart body to `/update` (the standard ESP32 Arduino OTA convention);
  stats backup/restore and sleep-image uploads use a small JSON/multipart
  API (`/api/status`, `/api/backup`, `/api/restore`, `/api/upload`). Exact
  endpoint support depends on the fork's firmware.
  **Mixed content note:** a CrossSwap page loaded over `https://` cannot
  fetch a plain `http://` device on your LAN — load CrossSwap over `http://`
  or `localhost` to use Wireless mode.

## Firmware catalog

| Fork | Author | Repository |
| --- | --- | --- |
| CrossPoint (Stable) | crosspoint-reader | github.com/crosspoint-reader/crosspoint-reader |
| CrossPoint (Nightly) | crosspoint-reader | github.com/crosspoint-reader/crosspoint-reader (`nightly` tag) |
| CrossInk | uxjulia | github.com/uxjulia/CrossInk |
| Biscuit | yattsu | github.com/yattsu/biscuit |
| CPR-vCodex | franssjz | github.com/franssjz/cpr-vcodex |
| CrossPet | trilwu | github.com/trilwu/crosspet |
| CrossLink | DaisonChun | github.com/DaisonChun/crosslink |
| AvesO3 | SiliconAves | github.com/SiliconAves/AvesO3 |

Step 2 offers two firmware sources: downloading the resolved GitHub release
asset directly (works when the browser can fetch it — GitHub's release-asset
host doesn't always send CORS headers) or uploading a local `.bin` file,
which always works.

## Development

```bash
npm install
npm run dev      # start the dev server
npm run lint      # oxlint
npm run build     # typecheck (tsc -b) + production build
```

## Requirements

- USB Serial mode: a Chromium-based browser (Chrome, Edge, Brave) that
  supports the [Web Serial API](https://wicg.github.io/serial/), served
  over HTTPS or `localhost`.
- Wireless mode: any modern browser, same Wi-Fi network as the device, and
  CrossSwap itself loaded over `http://`/`localhost` (see mixed-content
  note above).
- GitHub release assets must include a downloadable `.bin` firmware image
  for Step 2 to resolve a flashable target automatically.
