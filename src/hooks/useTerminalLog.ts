import { useCallback, useRef, useState } from "react";
import type { LogLevel, LogLine } from "../types";

function timestamp(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

export interface UseTerminalLogApi {
  lines: LogLine[];
  log: (message: string, level?: LogLevel) => void;
  clear: () => void;
}

/**
 * Append-only, timestamped log buffer feeding the terminal pane. Every
 * structural phase of the wizard pipes its status strings through `log`.
 */
export function useTerminalLog(): UseTerminalLogApi {
  const [lines, setLines] = useState<LogLine[]>([]);
  const idRef = useRef(0);

  const log = useCallback((message: string, level: LogLevel = "info") => {
    idRef.current += 1;
    const entry: LogLine = {
      id: idRef.current,
      timestamp: timestamp(),
      level,
      message,
    };
    setLines((prev) => [...prev, entry]);
  }, []);

  const clear = useCallback(() => setLines([]), []);

  return { lines, log, clear };
}
