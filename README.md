# CrossSwap

CrossSwap is a client-side OS swapper and backup utility for ESP32-C3
e-reader devices running CrossPoint and its forks. It runs entirely in the
browser: it resolves firmware releases live from GitHub, flashes the
selected firmware over the Web Serial API using `esptool-js`, and streams a
stats backup off and back onto the device around the flash.

## Wizard flow

1. **Choose Firmware & Connect** — pick one of the eight cataloged
   CrossPoint-family forks, connect over USB-C via the native Web Serial
   device picker, and back up on-device stats (`CMD_EXPORT_STATS`) before
   anything is touched.
2. **Flash Firmware Partition** — downloads the resolved GitHub release's
   `.bin` asset and writes it to the device's app partition with
   `esptool-js`. "Erase Flash" defaults to **off** so a fork swap never
   scrubs partitions outside the firmware image.
3. **Restore Data & Finalize** — re-opens the same authorized serial port on
   the freshly flashed firmware and streams the Step 1 backup back onto the
   device (`CMD_IMPORT_STATS:[JSON]`).

Every phase logs timestamped status lines to the live terminal pane at the
bottom of the interface.

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

## Development

```bash
npm install
npm run dev      # start the dev server
npm run lint      # oxlint
npm run build     # typecheck (tsc -b) + production build
```

## Requirements

- A Chromium-based browser (Chrome, Edge, Brave) that supports the
  [Web Serial API](https://wicg.github.io/serial/), served over HTTPS or
  `localhost`.
- GitHub release assets must include a downloadable `.bin` firmware image
  for Step 2 to resolve a flashable target automatically.
