import { useCallback, useEffect, useRef, useState } from "react";
import type { ConnectionState } from "../types";

export interface UseWebSerialOptions {
  /** Baud rate used both for the initial CrossPoint stats handshake and esptool-js sessions. */
  baudRate?: number;
  /** Invoked with every raw decoded text chunk received from the device, in order. */
  onData?: (chunk: string) => void;
}

export interface CollectOptions {
  /** Resolve once no new data has arrived for this many ms (default 400). */
  idleMs?: number;
  /** Hard ceiling in ms in case the device never goes idle (default 15000). */
  timeoutMs?: number;
}

export interface UseWebSerialApi {
  /** Whether the browser exposes navigator.serial at all. */
  isSupported: boolean;
  connectionState: ConnectionState;
  /** The raw underlying SerialPort, exposed so esptool-js's Transport can bind to it directly. */
  port: SerialPort | null;
  /**
   * Opens a serial connection. If `existingPort` is supplied (e.g. the same
   * SerialPort object obtained earlier in the wizard), it is re-opened
   * directly without showing the native chooser again. Otherwise this
   * prompts the browser's "select a device" dialog.
   */
  connect: (existingPort?: SerialPort) => Promise<SerialPort>;
  /** Cleanly tears down reader/writer locks and closes the port. */
  disconnect: () => Promise<void>;
  /** Writes a raw text string to the device. */
  write: (text: string) => Promise<void>;
  /** Writes a command then resolves with everything received until the line goes idle. */
  sendCommand: (command: string, opts?: CollectOptions) => Promise<string>;
}

/**
 * Self-contained Web Serial engine for CrossSwap.
 *
 * Owns the SerialPort lifecycle end to end: requesting the device, opening the
 * port, wiring TextEncoderStream/TextDecoderStream pipes for line-based I/O,
 * running a non-blocking async read loop, and tearing everything down safely
 * on disconnect. Consumers subscribe to decoded chunks via `onData` and/or use
 * `sendCommand` for simple request/response exchanges (e.g. CMD_EXPORT_STATS).
 */
export function useWebSerial(options: UseWebSerialOptions = {}): UseWebSerialApi {
  const { baudRate = 115200, onData } = options;

  const isSupported = typeof navigator !== "undefined" && "serial" in navigator;

  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
  const [port, setPort] = useState<SerialPort | null>(null);

  const readerRef = useRef<ReadableStreamDefaultReader<string> | null>(null);
  const writerRef = useRef<WritableStreamDefaultWriter<string> | null>(null);
  const readablePipeRef = useRef<Promise<void> | null>(null);
  const writablePipeRef = useRef<Promise<void> | null>(null);
  const readLoopAbortRef = useRef(false);
  const listenersRef = useRef<Set<(chunk: string) => void>>(new Set());

  // Keep the latest onData subscribed without tearing down the read loop on every render.
  useEffect(() => {
    if (!onData) return;
    const listeners = listenersRef.current;
    listeners.add(onData);
    return () => {
      listeners.delete(onData);
    };
  }, [onData]);

  const runReadLoop = useCallback(async (activePort: SerialPort) => {
    const decoder = new TextDecoderStream();
    readablePipeRef.current = activePort.readable!
      .pipeTo(decoder.writable as WritableStream<Uint8Array>)
      .catch(() => {
      // Expected when we deliberately cancel the reader during disconnect().
    });

    const reader = decoder.readable.getReader();
    readerRef.current = reader;
    readLoopAbortRef.current = false;

    try {
      // Runs until the port is closed or disconnect() flips the abort flag.
      // Each await yields back to the event loop, so this never blocks the UI thread.
      while (!readLoopAbortRef.current) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          for (const listener of listenersRef.current) listener(value);
        }
      }
    } catch {
      if (!readLoopAbortRef.current) {
        setConnectionState("error");
      }
    } finally {
      reader.releaseLock();
    }
  }, []);

  const connect = useCallback(async (existingPort?: SerialPort) => {
    if (!isSupported) {
      throw new Error("Web Serial API is not supported in this browser.");
    }

    setConnectionState("connecting");
    try {
      const selectedPort = existingPort ?? (await navigator.serial.requestPort());
      await selectedPort.open({ baudRate });

      const encoder = new TextEncoderStream();
      writablePipeRef.current = encoder.readable.pipeTo(selectedPort.writable!).catch(() => {
        // Expected when we deliberately close the writer during disconnect().
      });
      writerRef.current = encoder.writable.getWriter();

      setPort(selectedPort);
      setConnectionState("connected");
      void runReadLoop(selectedPort);
      return selectedPort;
    } catch (err) {
      setConnectionState("error");
      throw err;
    }
  }, [baudRate, isSupported, runReadLoop]);

  const disconnect = useCallback(async () => {
    setConnectionState("disconnecting");
    readLoopAbortRef.current = true;

    try {
      await readerRef.current?.cancel();
    } catch {
      // Port may already be gone; safe to ignore.
    }
    readerRef.current = null;

    try {
      await writerRef.current?.close();
    } catch {
      // Writer may already be closed; safe to ignore.
    }
    writerRef.current = null;

    try {
      await readablePipeRef.current;
    } catch {
      // noop
    }
    try {
      await writablePipeRef.current;
    } catch {
      // noop
    }

    try {
      await port?.close();
    } catch {
      // noop
    }

    setPort(null);
    setConnectionState("disconnected");
  }, [port]);

  const write = useCallback(async (text: string) => {
    if (!writerRef.current) {
      throw new Error("Cannot write: serial port is not connected.");
    }
    await writerRef.current.write(text);
  }, []);

  const sendCommand = useCallback(
    async (command: string, opts: CollectOptions = {}): Promise<string> => {
      const { idleMs = 400, timeoutMs = 15000 } = opts;
      let buffer = "";

      const collected = new Promise<string>((resolve) => {
        let idleTimer: ReturnType<typeof setTimeout>;

        const finish = () => {
          clearTimeout(idleTimer);
          clearTimeout(hardTimer);
          listenersRef.current.delete(onChunk);
          resolve(buffer);
        };

        const hardTimer = setTimeout(finish, timeoutMs);

        function onChunk(chunk: string) {
          buffer += chunk;
          clearTimeout(idleTimer);
          idleTimer = setTimeout(finish, idleMs);
        }

        listenersRef.current.add(onChunk);
        idleTimer = setTimeout(finish, idleMs);
      });

      await write(command);
      return collected;
    },
    [write],
  );

  useEffect(() => {
    return () => {
      readLoopAbortRef.current = true;
    };
  }, []);

  return { isSupported, connectionState, port, connect, disconnect, write, sendCommand };
}
