import { useCallback, useState } from "react";
import { ESPLoader, Transport, type IEspLoaderTerminal } from "esptool-js";
import type { FlashOptions, FlashProgress } from "../types";

/**
 * Default offset for the CrossPoint application partition on the ESP32-C3
 * partition table (bootloader at 0x0, partition table at 0x8000, app at
 * 0x10000). Only the app partition is rewritten during an OS fork-swap.
 */
export const CROSSPOINT_APP_PARTITION_OFFSET = 0x10000;

export interface FlashRoutineArgs {
  port: SerialPort;
  firmware: Uint8Array;
  options: FlashOptions;
  onProgress: (progress: FlashProgress) => void;
  onLog: (message: string) => void;
}

export interface UseFirmwareFlasherApi {
  isFlashing: boolean;
  flash: (args: FlashRoutineArgs) => Promise<void>;
}

/**
 * Thin, typed wrapper around esptool-js's ESPLoader that drives a single
 * connect -> (optional erase) -> write -> reset flashing routine and
 * reports live progress back to the Step 2 UI.
 */
export function useFirmwareFlasher(): UseFirmwareFlasherApi {
  const [isFlashing, setIsFlashing] = useState(false);

  const flash = useCallback(async ({ port, firmware, options, onProgress, onLog }: FlashRoutineArgs) => {
    setIsFlashing(true);

    const terminal: IEspLoaderTerminal = {
      clean: () => {},
      write: (data: string) => onLog(data),
      writeLine: (data: string) => onLog(data),
    };

    const transport = new Transport(port, true);

    try {
      const loader = new ESPLoader({
        transport,
        baudrate: options.baudRate,
        terminal,
      });

      onProgress({
        percent: 0,
        phase: "Connecting to bootloader",
        bytesWritten: 0,
        totalBytes: firmware.byteLength,
      });

      const chipDescription = await loader.main();
      onLog(`Detected chip: ${chipDescription}`);

      onProgress({
        percent: 5,
        phase: options.eraseFlash ? "Erasing then writing" : "Writing firmware",
        bytesWritten: 0,
        totalBytes: firmware.byteLength,
      });

      await loader.writeFlash({
        fileArray: [{ data: firmware, address: options.flashAddress }],
        flashMode: "keep",
        flashFreq: "keep",
        flashSize: "keep",
        // Mirrors the wizard's "Erase Flash" toggle, which defaults to false
        // so a fork swap never scrubs partitions outside the app image.
        eraseAll: options.eraseFlash,
        compress: true,
        reportProgress: (_fileIndex, written, total) => {
          const percent = total > 0 ? Math.min(100, Math.round((written / total) * 100)) : 0;
          onProgress({ percent, phase: "Writing firmware", bytesWritten: written, totalBytes: total });
        },
      });

      onProgress({
        percent: 100,
        phase: "Flash complete",
        bytesWritten: firmware.byteLength,
        totalBytes: firmware.byteLength,
      });

      await loader.after("hard_reset");
    } finally {
      try {
        await transport.disconnect();
      } catch {
        // Port may already be closed by a hard reset; safe to ignore.
      }
      setIsFlashing(false);
    }
  }, []);

  return { isFlashing, flash };
}
