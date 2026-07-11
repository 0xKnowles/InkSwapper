import { useCallback, useState } from "react";
import type { ConnectionState, DeviceFileEntry } from "../types";

/**
 * Transport for CrossPoint-family devices on the local network, matching
 * the real, documented CrossPointWebServer protocol (see
 * docs/webserver-endpoints.md in crosspoint-reader/crosspoint-reader and
 * forks that share its network stack, e.g. uxjulia/CrossInk).
 *
 * Uploads (connect + uploadFile) go over the WebSocket channel on port 81.
 * That's deliberate: stock CrossPointWebServer.cpp never sends
 * Access-Control-Allow-Origin, so a browser blocks fetch/XHR reads
 * cross-origin, but WebSocket connections aren't subject to CORS at all —
 * confirmed against source, and it's the same channel the device's own
 * file manager and Calibre plugin use.
 *
 * File operations (listFiles/moveFile/makeDirectory) DO use fetch against
 * the real /api/files, /move, /mkdir endpoints, which only works if the
 * device firmware has been patched to send CORS headers (see the
 * crossink-cors.patch drafted alongside this app — stock firmware will
 * fail these with a clear CORS-shaped error). GET and simple-content-type
 * POST (form-urlencoded here) don't trigger a CORS preflight, so no
 * OPTIONS handling is needed on the firmware side beyond the header.
 *
 * Firmware flashing and stats backup/restore remain unavailable over
 * Wireless regardless of any CORS patch: there is no push-based firmware
 * upload endpoint (OTA is device-initiated) and no stats export/import
 * endpoint in the documented API at all.
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
  listFiles: (path: string) => Promise<DeviceFileEntry[]>;
  moveFile: (from: string, to: string) => Promise<string>;
  makeDirectory: (path: string) => Promise<string>;
}

function normalizeHostname(input: string): string {
  const trimmed = input.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  // Strip an explicit port if the user pasted one; the WS upload server always lives on 81.
  return trimmed.split(":")[0].split("/")[0];
}

function wsUrl(hostname: string): string {
  return `ws://${hostname}:${WS_PORT}/`;
}

function httpBase(hostname: string): string {
  return `http://${hostname}`;
}

const CORS_HINT =
  "this needs the device firmware to send CORS headers for this endpoint — see the crossink-cors.patch. Use USB Serial, or apply the patch and reflash.";

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

  const requireHost = useCallback((): string => {
    if (!host) throw new Error("No wireless device connected.");
    return host;
  }, [host]);

  const listFiles = useCallback(
    async (path: string): Promise<DeviceFileEntry[]> => {
      const base = httpBase(requireHost());
      let response: Response;
      try {
        response = await fetch(`${base}/api/files?path=${encodeURIComponent(path)}`);
      } catch (err) {
        throw new Error(
          `Could not read ${path} over Wireless (${err instanceof Error ? err.message : "network error"}) — ${CORS_HINT}`,
        );
      }
      if (!response.ok) {
        throw new Error(`Device responded ${response.status} ${response.statusText} listing ${path}.`);
      }
      const data = await response.json();
      if (!Array.isArray(data)) {
        throw new Error(`Device returned an unexpected file listing format for ${path}.`);
      }
      return data as DeviceFileEntry[];
    },
    [requireHost],
  );

  const moveFile = useCallback(
    async (from: string, to: string): Promise<string> => {
      const base = httpBase(requireHost());
      const { dir: destFolder } = splitPath(to);
      let response: Response;
      try {
        response = await fetch(`${base}/move`, {
          method: "POST",
          body: new URLSearchParams({ path: from, dest: destFolder }),
        });
      } catch (err) {
        throw new Error(
          `Could not move ${from} over Wireless (${err instanceof Error ? err.message : "network error"}) — ${CORS_HINT}`,
        );
      }
      const text = await response.text();
      if (!response.ok) throw new Error(text || `Move failed: ${response.status} ${response.statusText}`);
      return text;
    },
    [requireHost],
  );

  const makeDirectory = useCallback(
    async (path: string): Promise<string> => {
      const base = httpBase(requireHost());
      const { dir: parent, filename: name } = splitPath(path);
      let response: Response;
      try {
        response = await fetch(`${base}/mkdir`, {
          method: "POST",
          body: new URLSearchParams({ name, path: parent }),
        });
      } catch (err) {
        throw new Error(
          `Could not create ${path} over Wireless (${err instanceof Error ? err.message : "network error"}) — ${CORS_HINT}`,
        );
      }
      const text = await response.text();
      if (!response.ok) throw new Error(text || `Create folder failed: ${response.status} ${response.statusText}`);
      return text;
    },
    [requireHost],
  );

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

  return { connectionState, host, connect, disconnect, uploadFile, listFiles, moveFile, makeDirectory };
}
