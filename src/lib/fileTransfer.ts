import type { CollectOptions } from "../hooks/useWebSerial";
import type { LogLevel } from "../types";

/**
 * CrossSwap's own chunked file-upload convention layered on top of the
 * text-mode serial link: a begin/chunk/end command sequence with each
 * binary chunk base64-encoded so it survives the TextEncoderStream pipe.
 * Firmware support for these commands is fork-specific; CrossSwap emits
 * them consistently and surfaces whatever the device responds with.
 */

const CHUNK_SIZE_BYTES = 3000;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export interface UploadFileArgs {
  path: string;
  bytes: Uint8Array;
  sendCommand: (command: string, opts?: CollectOptions) => Promise<string>;
  onProgress?: (percent: number, bytesSent: number, totalBytes: number) => void;
  log: (message: string, level?: LogLevel) => void;
}

export async function uploadFileToDevice({ path, bytes, sendCommand, onProgress, log }: UploadFileArgs): Promise<void> {
  const total = bytes.byteLength;

  log(`> CMD_UPLOAD_BEGIN:${path}:${total}`, "command");
  const beginResponse = await sendCommand(`CMD_UPLOAD_BEGIN:${path}:${total}\n`, { idleMs: 500, timeoutMs: 10000 });
  if (beginResponse.trim()) log(`Device: ${beginResponse.trim()}`);

  const totalChunks = Math.max(1, Math.ceil(total / CHUNK_SIZE_BYTES));

  for (let i = 0; i < totalChunks; i += 1) {
    const start = i * CHUNK_SIZE_BYTES;
    const chunk = bytes.subarray(start, start + CHUNK_SIZE_BYTES);
    const encoded = bytesToBase64(chunk);

    await sendCommand(`CMD_UPLOAD_CHUNK:${encoded}\n`, { idleMs: 200, timeoutMs: 8000 });

    const sent = Math.min(total, start + chunk.length);
    const percent = Math.round((sent / total) * 100);
    onProgress?.(percent, sent, total);

    if (i % 10 === 0 || i === totalChunks - 1) {
      log(`Uploaded ${sent}/${total} bytes (${percent}%).`);
    }
  }

  log("> CMD_UPLOAD_END", "command");
  const endResponse = await sendCommand(`CMD_UPLOAD_END:${total}\n`, { idleMs: 500, timeoutMs: 10000 });
  if (endResponse.trim()) log(`Device: ${endResponse.trim()}`);

  log(`Upload complete: ${path}`, "success");
}
