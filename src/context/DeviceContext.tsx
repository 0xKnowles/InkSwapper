import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { useWebSerial } from "../hooks/useWebSerial";
import { useWirelessDevice } from "../hooks/useWirelessDevice";
import { useFirmwareFlasher, CROSSPOINT_APP_PARTITION_OFFSET } from "../hooks/useFirmwareFlasher";
import { useTerminalLog } from "../hooks/useTerminalLog";
import { uploadFileToDevice } from "../lib/fileTransfer";
import type { ConnectionState, DeviceFileEntry, FlashProgress, LogLevel, LogLine, TransportMode } from "../types";

export interface FlashArgs {
  bytes: Uint8Array;
  eraseFlash: boolean;
  onProgress: (progress: FlashProgress) => void;
}

export interface UploadArgs {
  path: string;
  bytes: Uint8Array;
  onProgress?: (percent: number, sent: number, total: number) => void;
}

export interface DeviceContextValue {
  mode: TransportMode;
  setMode: (mode: TransportMode) => void;

  isSupported: boolean;
  connectionState: ConnectionState;
  deviceLabel: string | null;
  /**
   * False in wireless mode: real CrossPoint firmware exposes no push-OTA or
   * stats export/import endpoint over the network, only device-initiated
   * update checks and a file-upload channel. The Flash OS wizard needs
   * USB serial.
   */
  supportsFlashWizard: boolean;
  /**
   * Always true: file ops work over USB Serial via CrossSwap's own
   * commands, and over Wireless via the device's real /api/files, /move,
   * /mkdir endpoints IF the firmware sends CORS headers for them (stock
   * CrossPointWebServer.cpp doesn't — see crossink-cors.patch). Wireless
   * attempts surface a clear CORS-shaped error rather than being blocked
   * up front, since we can't know in advance whether a given device has
   * been patched.
   */
  supportsFileOps: boolean;

  connectSerial: (existingPort?: SerialPort) => Promise<void>;
  connectWireless: (host: string) => Promise<void>;
  disconnect: () => Promise<void>;

  backupStats: () => Promise<string>;
  restoreStats: (json: string) => Promise<string>;
  flash: (args: FlashArgs) => Promise<void>;
  uploadFile: (args: UploadArgs) => Promise<void>;
  listFiles: (path: string) => Promise<DeviceFileEntry[]>;
  moveFile: (from: string, to: string) => Promise<string>;
  makeDirectory: (path: string) => Promise<string>;

  log: (message: string, level?: LogLevel) => void;
  logLines: LogLine[];
  clearLog: () => void;
}

const DeviceContext = createContext<DeviceContextValue | null>(null);

function formatSerialLabel(port: SerialPort | null): string | null {
  if (!port) return null;
  const info = port.getInfo();
  if (info.usbVendorId === undefined || info.usbProductId === undefined) return null;
  const hex = (n: number) => n.toString(16).padStart(4, "0").toUpperCase();
  return `VID:${hex(info.usbVendorId)} PID:${hex(info.usbProductId)}`;
}

/**
 * Hosts CrossSwap's single device connection — either USB serial or
 * wireless (Wi-Fi/OTA) — behind one transport-agnostic action surface
 * (backupStats / restoreStats / flash / uploadFile). Dashboard, the Flash
 * OS wizard, and the Sleep Screens editor all consume this instead of
 * knowing which physical transport is active.
 */
export function DeviceProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<TransportMode>("serial");
  const serial = useWebSerial({ baudRate: 115200 });
  const wireless = useWirelessDevice();
  const { flash: flashSerial } = useFirmwareFlasher();
  const { lines, log, clear } = useTerminalLog();

  // Survives the disconnect() call that flash() issues before esptool-js
  // takes ownership of the port, so restoreStats() can re-open the same port.
  const lastPortRef = useRef<SerialPort | null>(null);

  const setMode = useCallback(
    (next: TransportMode) => {
      if (serial.connectionState === "connected" || wireless.connectionState === "connected") {
        log("Disconnect the current device before switching transport mode.", "warn");
        return;
      }
      setModeState(next);
    },
    [log, serial.connectionState, wireless.connectionState],
  );

  const connectSerial = useCallback(
    async (existingPort?: SerialPort) => {
      const port = await serial.connect(existingPort);
      lastPortRef.current = port;
    },
    [serial],
  );

  const connectWireless = useCallback(
    async (host: string) => {
      await wireless.connect(host);
    },
    [wireless],
  );

  const disconnect = useCallback(async () => {
    if (mode === "serial") {
      await serial.disconnect();
    } else {
      wireless.disconnect();
    }
  }, [mode, serial, wireless]);

  const backupStats = useCallback(async () => {
    if (mode !== "serial") {
      throw new Error(
        "Wireless stats backup isn't available: CrossPoint's web server has no export endpoint (only a generic " +
          "file upload channel). Switch to USB Serial for this step.",
      );
    }
    log("> CMD_EXPORT_STATS", "command");
    log("Reading stats.json from LittleFS partition…");
    return serial.sendCommand("CMD_EXPORT_STATS\n", { idleMs: 600, timeoutMs: 20000 });
  }, [log, mode, serial]);

  const restoreStats = useCallback(
    async (json: string) => {
      if (mode !== "serial") {
        throw new Error(
          "Wireless stats restore isn't available: CrossPoint's web server has no import endpoint. Switch to USB " +
            "Serial for this step.",
        );
      }
      if (serial.connectionState !== "connected") {
        const port = lastPortRef.current;
        if (!port) throw new Error("No previously connected serial port to restore onto.");
        log("Re-opening the port on the freshly updated firmware layer…");
        await connectSerial(port);
        log("Device reconnected.", "success");
      }
      log("> CMD_IMPORT_STATS:[JSON]", "command");
      log("Piping backed-up stats back onto the partition…");
      return serial.sendCommand(`CMD_IMPORT_STATS:${json}\n`, { idleMs: 600, timeoutMs: 20000 });
    },
    [connectSerial, log, mode, serial],
  );

  const flash = useCallback(
    async ({ bytes, eraseFlash, onProgress }: FlashArgs) => {
      if (mode !== "serial") {
        throw new Error(
          "Wireless firmware flashing isn't available: CrossPoint devices only update by connecting out to an " +
            "update server themselves — there's no endpoint for a browser to push a firmware image to. Use USB " +
            "Serial to flash, or check the device's own Settings screen for on-device OTA.",
        );
      }

      log(
        eraseFlash
          ? "Erase Flash is ENABLED — full chip erase will run before writing."
          : "Erase Flash is disabled (default) — only the app partition will be rewritten.",
        eraseFlash ? "warn" : "info",
      );

      const port = lastPortRef.current ?? serial.port;
      if (!port) throw new Error("No serial port available to flash. Connect a device first.");

      if (serial.connectionState === "connected") {
        log("Releasing the serial link so the flasher can take exclusive ownership of the port…");
        await serial.disconnect();
      }

      log("Starting esptool-js flash routine…", "command");
      await flashSerial({
        port,
        firmware: bytes,
        options: { eraseFlash, baudRate: 115200, flashAddress: CROSSPOINT_APP_PARTITION_OFFSET },
        onProgress,
        onLog: (message) => log(message),
      });
    },
    [flashSerial, log, mode, serial],
  );

  const uploadFile = useCallback(
    async ({ path, bytes, onProgress }: UploadArgs) => {
      if (mode === "serial") {
        await uploadFileToDevice({ path, bytes, sendCommand: serial.sendCommand, onProgress, log });
        return;
      }
      log(`Uploading ${path} over the WebSocket upload channel (port 81)…`, "command");
      await wireless.uploadFile(path, bytes, onProgress);
      log(`Upload complete: ${path}`, "success");
    },
    [log, mode, serial, wireless],
  );

  const listFiles = useCallback(
    async (path: string): Promise<DeviceFileEntry[]> => {
      if (mode === "wireless") {
        log(`GET /api/files?path=${path}`, "command");
        return wireless.listFiles(path);
      }
      log(`> CMD_LIST_FILES:${path}`, "command");
      const response = await serial.sendCommand(`CMD_LIST_FILES:${path}\n`, { idleMs: 600, timeoutMs: 20000 });
      try {
        const parsed = JSON.parse(response.trim());
        if (!Array.isArray(parsed)) throw new Error("not an array");
        return parsed as DeviceFileEntry[];
      } catch {
        throw new Error(`Device returned an unexpected response to CMD_LIST_FILES: ${response.slice(0, 200)}`);
      }
    },
    [log, mode, serial, wireless],
  );

  const moveFile = useCallback(
    async (from: string, to: string): Promise<string> => {
      if (mode === "wireless") {
        log(`POST /move (${from})`, "command");
        return wireless.moveFile(from, to);
      }
      log(`> CMD_MOVE_FILE:${from}:${to}`, "command");
      return serial.sendCommand(`CMD_MOVE_FILE:${from}:${to}\n`, { idleMs: 500, timeoutMs: 10000 });
    },
    [log, mode, serial, wireless],
  );

  const makeDirectory = useCallback(
    async (path: string): Promise<string> => {
      if (mode === "wireless") {
        log(`POST /mkdir (${path})`, "command");
        return wireless.makeDirectory(path);
      }
      log(`> CMD_MKDIR:${path}`, "command");
      return serial.sendCommand(`CMD_MKDIR:${path}\n`, { idleMs: 500, timeoutMs: 10000 });
    },
    [log, mode, serial, wireless],
  );

  const connectionState = mode === "serial" ? serial.connectionState : wireless.connectionState;
  const deviceLabel = mode === "serial" ? formatSerialLabel(serial.port) : wireless.host;
  const isSupported = mode === "serial" ? serial.isSupported : true;
  const supportsFlashWizard = mode === "serial";
  const supportsFileOps = true;

  const value = useMemo<DeviceContextValue>(
    () => ({
      mode,
      setMode,
      isSupported,
      connectionState,
      deviceLabel,
      supportsFlashWizard,
      supportsFileOps,
      connectSerial,
      connectWireless,
      disconnect,
      backupStats,
      restoreStats,
      flash,
      uploadFile,
      listFiles,
      moveFile,
      makeDirectory,
      log,
      logLines: lines,
      clearLog: clear,
    }),
    [
      backupStats,
      clear,
      connectSerial,
      connectWireless,
      connectionState,
      deviceLabel,
      disconnect,
      flash,
      isSupported,
      listFiles,
      lines,
      log,
      makeDirectory,
      mode,
      moveFile,
      restoreStats,
      setMode,
      supportsFileOps,
      supportsFlashWizard,
      uploadFile,
    ],
  );

  return <DeviceContext.Provider value={value}>{children}</DeviceContext.Provider>;
}

export function useDevice(): DeviceContextValue {
  const ctx = useContext(DeviceContext);
  if (!ctx) {
    throw new Error("useDevice must be used within a DeviceProvider");
  }
  return ctx;
}
