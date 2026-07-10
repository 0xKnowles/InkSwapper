import { useCallback, useState } from "react";
import type { FirmwareEntry } from "../../types";
import { FIRMWARE_CATALOG } from "../../data/firmwareCatalog";
import { useDevice } from "../../context/DeviceContext";
import { FirmwareCard } from "../FirmwareCard";
import "./Step1SelectConnect.css";

interface Step1Props {
  selectedFirmware: FirmwareEntry | null;
  onSelectFirmware: (entry: FirmwareEntry) => void;
  onComplete: (port: SerialPort, backedUpStats: string) => void;
}

const BACKUP_COMMAND = "CMD_EXPORT_STATS\n";

export function Step1SelectConnect({ selectedFirmware, onSelectFirmware, onComplete }: Step1Props) {
  const { isSupported, connectionState, connect, disconnect, sendCommand, port, log } = useDevice();

  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupDone, setBackupDone] = useState(false);
  const [backedUpStats, setBackedUpStats] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);

  const runBackup = useCallback(async () => {
    setIsBackingUp(true);
    try {
      log(`> ${BACKUP_COMMAND.trim()}`, "command");
      log("Reading stats.json from LittleFS partition…");
      const response = await sendCommand(BACKUP_COMMAND, { idleMs: 600, timeoutMs: 20000 });

      if (!response.trim()) {
        log("No data received for CMD_EXPORT_STATS — device may not support this command yet.", "warn");
      } else {
        log(`Buffered ${response.length} bytes of stats payload.`);
      }

      const backupKey = `crossswap:backup:${Date.now()}`;
      try {
        window.localStorage.setItem(
          backupKey,
          JSON.stringify({ firmware: selectedFirmware?.id, capturedAt: new Date().toISOString(), stats: response }),
        );
        log(`Backup saved safely to local storage (${backupKey}).`, "success");
      } catch {
        log("Could not persist backup to local storage (storage unavailable); continuing in-memory only.", "warn");
      }

      setBackedUpStats(response);
      setBackupDone(true);
    } catch (err) {
      log(err instanceof Error ? err.message : "Backup failed for an unknown reason.", "error");
    } finally {
      setIsBackingUp(false);
    }
  }, [log, selectedFirmware, sendCommand]);

  const handleConnect = useCallback(async () => {
    setConnectError(null);
    log("Requesting Web Serial access…");
    try {
      await connect();
      log("Device connected over USB-C.", "success");
      await runBackup();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to connect to serial device.";
      setConnectError(message);
      log(message, "error");
    }
  }, [connect, log, runBackup]);

  const handleContinue = useCallback(async () => {
    if (!port || !backedUpStats) return;
    const targetPort = port;
    log("Releasing serial link so the flasher can take over the port…");
    await disconnect();
    onComplete(targetPort, backedUpStats);
  }, [backedUpStats, disconnect, log, onComplete, port]);

  const alreadyConnected = connectionState === "connected";

  return (
    <div className="step1">
      <h2 className="step1__heading">Choose a firmware target</h2>
      <p className="step1__subheading">
        Select the CrossPoint fork to install. Release metadata is pulled live from each project's GitHub repository.
      </p>

      <div className="step1__grid">
        {FIRMWARE_CATALOG.map((entry) => (
          <FirmwareCard
            key={entry.id}
            entry={entry}
            selected={selectedFirmware?.id === entry.id}
            onSelect={onSelectFirmware}
          />
        ))}
      </div>

      <div className="step1__connect-panel">
        {!isSupported && (
          <p className="step1__warning">
            This browser does not expose the Web Serial API. Use a Chromium-based browser (Chrome, Edge, Brave) over
            HTTPS or localhost.
          </p>
        )}

        <div className="step1__connect-row">
          {alreadyConnected ? (
            <button
              type="button"
              className="button button--primary"
              disabled={!selectedFirmware || isBackingUp || backupDone}
              onClick={runBackup}
            >
              {isBackingUp ? "Backing up…" : backupDone ? "Backed up" : "Back Up Stats"}
            </button>
          ) : (
            <button
              type="button"
              className="button button--primary"
              disabled={!isSupported || !selectedFirmware || connectionState === "connecting"}
              onClick={handleConnect}
            >
              {connectionState === "connecting" ? "Connecting…" : "Connect via USB-C"}
            </button>
          )}
          <span className={`step1__status step1__status--${connectionState}`}>{connectionState}</span>
        </div>

        {connectError && <p className="step1__error">{connectError}</p>}

        {isBackingUp && <p className="step1__hint">Backing up on-device stats before continuing…</p>}
        {backupDone && !isBackingUp && <p className="step1__hint step1__hint--success">Backup complete and saved.</p>}

        <button type="button" className="button button--outline" disabled={!backupDone} onClick={handleContinue}>
          Continue to Flash →
        </button>
      </div>
    </div>
  );
}
