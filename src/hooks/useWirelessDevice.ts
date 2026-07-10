import { useCallback, useState } from "react";
import type { ConnectionState, FlashProgress } from "../types";

/**
 * HTTP-based OTA transport for CrossPoint-family devices on the local
 * network. Mirrors the de-facto standard ESP32 Arduino OTA convention
 * (multipart POST to /update) plus a small JSON API for stats and file
 * uploads, matching the CMD_* command surface used over serial. Exact
 * endpoint support is fork-specific — CrossSwap calls these consistently
 * and surfaces whatever the device responds with.
 *
 * A CrossSwap page served over HTTPS cannot fetch a plain http:// device
 * on the local network (mixed-content blocking); this transport is meant
 * to be used from a page loaded over HTTP or from localhost.
 */

export interface UseWirelessDeviceApi {
  connectionState: ConnectionState;
  host: string | null;
  connect: (hostInput: string) => Promise<void>;
  disconnect: () => void;
  exportStats: () => Promise<string>;
  importStats: (json: string) => Promise<string>;
  flash: (bytes: Uint8Array, eraseFlash: boolean, onProgress: (progress: FlashProgress) => void) => Promise<void>;
  uploadFile: (path: string, bytes: Uint8Array, onProgress?: (percent: number, sent: number, total: number) => void) => Promise<void>;
}

function normalizeHost(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, "");
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `http://${trimmed}`;
}

export function useWirelessDevice(): UseWirelessDeviceApi {
  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
  const [host, setHost] = useState<string | null>(null);

  const connect = useCallback(async (hostInput: string) => {
    const base = normalizeHost(hostInput);
    setConnectionState("connecting");
    try {
      const response = await fetch(`${base}/api/status`, { method: "GET" });
      if (!response.ok) {
        throw new Error(`Device responded ${response.status} ${response.statusText}`);
      }
      setHost(base);
      setConnectionState("connected");
    } catch (err) {
      setConnectionState("error");
      const reason = err instanceof Error ? err.message : "Unknown error";
      throw new Error(
        `Could not reach device at ${base} (${reason}). Confirm the device and this browser are on the same ` +
          `network, and that this page was loaded over http:// — an https:// page cannot fetch a plain http:// ` +
          `device on your LAN.`,
      );
    }
  }, []);

  const disconnect = useCallback(() => {
    setHost(null);
    setConnectionState("disconnected");
  }, []);

  const requireHost = useCallback((): string => {
    if (!host) throw new Error("No wireless device connected.");
    return host;
  }, [host]);

  const exportStats = useCallback(async () => {
    const base = requireHost();
    const response = await fetch(`${base}/api/backup`, { method: "GET" });
    if (!response.ok) throw new Error(`Backup request failed: ${response.status} ${response.statusText}`);
    return response.text();
  }, [requireHost]);

  const importStats = useCallback(
    async (json: string) => {
      const base = requireHost();
      const response = await fetch(`${base}/api/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: json,
      });
      if (!response.ok) throw new Error(`Restore request failed: ${response.status} ${response.statusText}`);
      return response.text();
    },
    [requireHost],
  );

  const flash = useCallback(
    (bytes: Uint8Array, eraseFlash: boolean, onProgress: (progress: FlashProgress) => void) =>
      new Promise<void>((resolve, reject) => {
        const base = requireHost();
        const form = new FormData();
        form.append("erase", eraseFlash ? "1" : "0");
        form.append("firmware", new Blob([bytes as BlobPart], { type: "application/octet-stream" }), "firmware.bin");

        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${base}/update`);
        xhr.upload.onprogress = (e) => {
          if (!e.lengthComputable) return;
          onProgress({
            percent: Math.round((e.loaded / e.total) * 100),
            phase: "Uploading firmware over Wi-Fi",
            bytesWritten: e.loaded,
            totalBytes: e.total,
          });
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            onProgress({
              percent: 100,
              phase: "Flash complete",
              bytesWritten: bytes.byteLength,
              totalBytes: bytes.byteLength,
            });
            resolve();
          } else {
            reject(new Error(`Device rejected firmware upload: ${xhr.status} ${xhr.statusText}`));
          }
        };
        xhr.onerror = () => reject(new Error("Network error while uploading firmware over Wi-Fi."));
        xhr.send(form);
      }),
    [requireHost],
  );

  const uploadFile = useCallback(
    (path: string, bytes: Uint8Array, onProgress?: (percent: number, sent: number, total: number) => void) =>
      new Promise<void>((resolve, reject) => {
        const base = requireHost();
        const form = new FormData();
        form.append("path", path);
        form.append(
          "file",
          new Blob([bytes as BlobPart], { type: "application/octet-stream" }),
          path.split("/").pop() ?? "upload.bin",
        );

        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${base}/api/upload`);
        xhr.upload.onprogress = (e) => {
          if (!e.lengthComputable || !onProgress) return;
          onProgress(Math.round((e.loaded / e.total) * 100), e.loaded, e.total);
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Device rejected file upload: ${xhr.status} ${xhr.statusText}`));
        };
        xhr.onerror = () => reject(new Error("Network error while uploading file over Wi-Fi."));
        xhr.send(form);
      }),
    [requireHost],
  );

  return { connectionState, host, connect, disconnect, exportStats, importStats, flash, uploadFile };
}
