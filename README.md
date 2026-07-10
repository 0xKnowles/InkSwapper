# CrossSwap

CrossSwap is a client-side dashboard/manager for ESP32-C3 e-reader devices
(Xteink X3 / X4) running CrossPoint and its forks. It runs entirely in the
browser and is responsive down to mobile: it resolves firmware releases live
from GitHub, flashes the selected firmware over USB serial (`esptool-js`),
streams a stats backup off and back onto the device around the flash, and
lets you design and upload custom sleep-screen artwork over USB or Wi-Fi.

## Sections

- **Dashboard** — connection status, quick links into the other tools, and a
  local history of stats backups.
- **Flash OS** — a guided 3-step wizard: back up on-device stats
  (`CMD_EXPORT_STATS`), flash the selected firmware ("Erase Flash" defaults
  to **off** so a fork swap never scrubs partitions outside the firmware
  image), then restore the backup (`CMD_IMPORT_STATS:[JSON]`). **USB Serial
  only** — see below.
- **Sleep Screens** — upload artwork, fit/crop it to the Xteink X3 (528×792)
  or X4 (480×800) portrait panel, dither it (grayscale or 1-bit
  Floyd–Steinberg), and upload the resulting BMP to `/sleep` on the device.
  Works over **USB Serial or Wireless**.

Every phase logs timestamped status lines to the live terminal pane, which
collapses to a single line on mobile.

## Connecting: USB Serial vs. Wireless

CrossSwap talks to the device over one of two transports, switchable from
the sidebar (disconnect first to switch). These were verified against the
real, open-source CrossPoint web server (`CrossPointWebServer.cpp` and
`docs/webserver-endpoints.md`, shared by crosspoint-reader and its forks
such as uxjulia/CrossInk), not guessed:

- **USB Serial** — uses the Web Serial API. Solid support on desktop
  Chromium browsers. On Android, native USB serial support is very new
  (Chrome 148 beta+, a limited set of devices) and not yet reliable. This
  is the only transport the Flash OS wizard can use — see below.
- **Wireless** — enter the device's local IP or hostname; CrossSwap opens a
  WebSocket to `ws://<host>:81/`, the same upload channel the device's own
  file manager and its Calibre plugin use. Uploads (e.g. sleep screens) are
  chunked over this socket with real progress and completion confirmation.

  **Why not plain HTTP fetch?** CrossPoint's web server (`/api/status`,
  `/api/files`, `/upload`, etc.) never sends `Access-Control-Allow-Origin`,
  so a browser blocks CrossSwap — a different origin — from reading any
  response over `fetch`/`XHR`. WebSocket connections aren't subject to CORS
  at all, which is exactly why the real firmware's own upload workflow uses
  one instead of a REST call.

  **Why the Flash OS wizard is Serial-only:** the real web server has no
  endpoint for a browser to push a firmware image — OTA is device-initiated
  (it polls an update server itself) — and no stats export/import endpoint
  either. Wireless mode is genuinely limited to file uploads today; the app
  says so upfront rather than failing silently mid-wizard.

  **Mixed content note:** a CrossSwap page loaded over `https://` cannot
  open a plain `ws://` connection to a device on your LAN — load CrossSwap
  over `http://` or `localhost` to use Wireless mode.

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
