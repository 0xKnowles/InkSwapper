import { useCallback, useState } from "react";
import type { ConnectionState } from "../types";

/**
 * WebSocket-based transport for CrossPoint-family devices on the local
 * network, matching the real, documented CrossPointWebServer protocol
 * (see docs/webserver-endpoints.md in crosspoint-reader/crosspoint-reader
 * and forks that share its network stack, e.g. uxjulia/CrossInk).
 *
 * This deliberately does NOT use fetch/XHR against the device's HTTP API.
 * That server sends no Access-Control-Allow-Origin header, so a browser
 * blocks CrossSwap (a different origin) from reading any response —
 * confirmed against CrossPointWebServer.cpp, which never sets CORS
 * headers. The WebSocket upload channel on port 81 is documented as the
 * path external clients (e.g. the Calibre desktop plugin) use, and
 * WebSocket connections are not subject to CORS at all, so it works
 * cross-origin without any firmware changes.
 *
 * Two real limitations follow directly from the documented API surface:
 *  - There is no push-based firmware upload endpoint. OTA updates are
 *    device-initiated (the device polls an update server itself), so
 *    wireless firmware flashing from a browser isn't something this
 *    firmware supports today.
 *  - There is no stats export/import endpoint, so wireless backup/restore
 *    isn't available either.
 * Both are surfaced as clear errors rather than silently failing.
 */

const WS_PORT = 81;
const WS_CHUNK_SIZE = 4096;
const WS_MAX_BUFFERED = WS_CHUNK_SIZE * 2;
const CONNECT_TIMEOUT_MS = 8000;

export interface UseWirelessDeviceApi {
  connectionState: ConnectionState;
  host: string | null;
  connect: (hostInput: string) => Promise<void>;
  disconnect: () => void;
  uploadFile: (path: string, bytes: Uint8Array, onProgress?: (percent: number, sent: number, total: number) => void) => Promise<void>;
}

function normalizeHostname(input: string): string {
  const trimmed = input.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  // Strip an explicit port if the user pasted one; the WS upload server always lives on 81.
  return trimmed.split(":")[0].split("/")[0];
}

function wsUrl(hostname: string): string {
  return `ws://${hostname}:${WS_PORT}/`;
}

function splitPath(fullPath: string): { dir: string; filename: string } {
  const normalized = fullPath.startsWith("/") ? fullPath : `/${fullPath}`;
  const lastSlash = normalized.lastIndexOf("/");
  const dir = lastSlash <= 0 ? "/" : normalized.slice(0, lastSlash);
  const filename = normalized.slice(lastSlash + 1);
  return { dir, filename };
}

export function useWirelessDevice(): UseWirelessDeviceApi {
  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
  const [host, setHost] = useState<string | null>(null);

  const connect = useCallback((hostInput: string) => {
    const hostname = normalizeHostname(hostInput);
    setConnectionState("connecting");

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(wsUrl(hostname));

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        ws.close();
        setConnectionState("error");
        reject(new Error(`Timed out reaching ${hostname}:${WS_PORT}. Confirm the IP/hostname and that the device is on the same network.`));
      }, CONNECT_TIMEOUT_MS);

      ws.onopen = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        ws.close();
        setHost(hostname);
        setConnectionState("connected");
        resolve();
      };

      ws.onerror = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        setConnectionState("error");
        reject(
          new Error(
            `Could not open a WebSocket connection to ${hostname}:${WS_PORT}. Confirm the device and this browser ` +
              `are on the same network, and that this page was loaded over http:// or localhost — an https:// page ` +
              `cannot open a plain ws:// connection to a device on your LAN.`,
          ),
        );
      };
    });
  }, []);

  const disconnect = useCallback(() => {
    setHost(null);
    setConnectionState("disconnected");
  }, []);

  const uploadFile = useCallback(
    (path: string, bytes: Uint8Array, onProgress?: (percent: number, sent: number, total: number) => void) => {
      if (!host) throw new Error("No wireless device connected.");
      const { dir, filename } = splitPath(path);
      const total = bytes.byteLength;

      return new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(wsUrl(host));
        ws.binaryType = "arraybuffer";

        let settled = false;
        const fail = (err: Error) => {
          if (settled) return;
          settled = true;
          ws.close();
          reject(err);
        };

        ws.onopen = () => {
          ws.send(`START:${filename}:${total}:${dir}`);
        };

        ws.onmessage = async (event) => {
          const msg = String(event.data);

          if (msg === "READY") {
            try {
              let offset = 0;
              while (offset < total && ws.readyState === WebSocket.OPEN) {
                const chunkEnd = Math.min(offset + WS_CHUNK_SIZE, total);
                const chunk = bytes.subarray(offset, chunkEnd);

                while (ws.bufferedAmount > WS_MAX_BUFFERED && ws.readyState === WebSocket.OPEN) {
                  await new Promise((r) => setTimeout(r, 5));
                }
                if (ws.readyState !== WebSocket.OPEN) {
                  throw new Error("WebSocket closed during upload.");
                }

                ws.send(chunk as Uint8Array<ArrayBuffer>);
                offset = chunkEnd;
                onProgress?.(Math.round((offset / total) * 100), offset, total);
              }
            } catch (err) {
              fail(err instanceof Error ? err : new Error("Upload failed while sending data."));
            }
          } else if (msg.startsWith("PROGRESS:")) {
            // Server-side confirmation; local send-progress above already drives the UI.
          } else if (msg === "DONE") {
            settled = true;
            onProgress?.(100, total, total);
            ws.close();
            resolve();
          } else if (msg.startsWith("ERROR:")) {
            fail(new Error(msg.slice("ERROR:".length)));
          }
        };

        ws.onerror = () => fail(new Error("WebSocket error during upload."));
        ws.onclose = () => {
          if (!settled) fail(new Error("Connection closed before the device confirmed the upload."));
        };
      });
    },
    [host],
  );

  return { connectionState, host, connect, disconnect, uploadFile };
}
