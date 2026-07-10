import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useWebSerial } from "../hooks/useWebSerial";
import { useTerminalLog } from "../hooks/useTerminalLog";
import type { LogLevel, LogLine } from "../types";

export interface DeviceContextValue {
  isSupported: boolean;
  connectionState: ReturnType<typeof useWebSerial>["connectionState"];
  port: SerialPort | null;
  connect: (existingPort?: SerialPort) => Promise<SerialPort>;
  disconnect: () => Promise<void>;
  write: (text: string) => Promise<void>;
  sendCommand: ReturnType<typeof useWebSerial>["sendCommand"];
  log: (message: string, level?: LogLevel) => void;
  logLines: LogLine[];
  clearLog: () => void;
}

const DeviceContext = createContext<DeviceContextValue | null>(null);

/**
 * Hosts the single, app-wide Web Serial connection and terminal log so every
 * section (Dashboard, Flash OS wizard, Sleep Screens) shares one live device
 * link instead of reconnecting independently.
 */
export function DeviceProvider({ children }: { children: ReactNode }) {
  const serial = useWebSerial({ baudRate: 115200 });
  const { lines, log, clear } = useTerminalLog();

  const value = useMemo<DeviceContextValue>(
    () => ({
      isSupported: serial.isSupported,
      connectionState: serial.connectionState,
      port: serial.port,
      connect: serial.connect,
      disconnect: serial.disconnect,
      write: serial.write,
      sendCommand: serial.sendCommand,
      log,
      logLines: lines,
      clearLog: clear,
    }),
    [serial.isSupported, serial.connectionState, serial.port, serial.connect, serial.disconnect, serial.write, serial.sendCommand, log, lines, clear],
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
