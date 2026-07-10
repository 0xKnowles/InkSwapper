import { useCallback, useState } from "react";
import type { FirmwareEntry } from "../../types";
import { useDevice } from "../../context/DeviceContext";
import "./Step3Restore.css";

interface Step3Props {
  firmware: FirmwareEntry;
  backedUpStats: string;
  onFinish: () => void;
}

export function Step3Restore({ firmware, backedUpStats, onFinish }: Step3Props) {
  const { connectionState, restoreStats, disconnect, log } = useDevice();

  const [isRestoring, setIsRestoring] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [deviceResponse, setDeviceResponse] = useState<string | null>(null);

  const handleRestore = useCallback(async () => {
    setIsRestoring(true);
    setRestoreError(null);

    try {
      const response = await restoreStats(backedUpStats);
      setDeviceResponse(response);
      log(response.trim() ? `Device responded: ${response.trim()}` : "Device acknowledged import (no payload returned).");

      log("Restore complete — CrossSwap finished successfully.", "success");
      setIsDone(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Restore failed for an unknown reason.";
      setRestoreError(message);
      log(message, "error");
    } finally {
      setIsRestoring(false);
    }
  }, [backedUpStats, log, restoreStats]);

  const handleFinish = useCallback(async () => {
    await disconnect();
    onFinish();
  }, [disconnect, onFinish]);

  return (
    <div className="step3">
      <h2 className="step3__heading">Restore data onto {firmware.name}</h2>
      <p className="step3__subheading">
        Reconnects to the device now running the new firmware and streams the Step 1 backup back onto its data
        partition.
      </p>

      <div className="step3__panel">
        <p className="step3__line">
          Backup payload ready: <strong>{backedUpStats.length}</strong> bytes buffered from Step 1.
        </p>
        <p className={`step3__status step3__status--${connectionState}`}>Connection: {connectionState}</p>
      </div>

      {restoreError && <p className="step3__error">{restoreError}</p>}
      {deviceResponse !== null && isDone && <p className="step3__hint">Last device response captured in the console below.</p>}

      {!isDone ? (
        <button type="button" className="button button--primary" disabled={isRestoring} onClick={handleRestore}>
          {isRestoring ? "Restoring…" : "Reconnect & Restore"}
        </button>
      ) : (
        <div className="step3__done">
          <p className="step3__done-message">✓ CrossSwap finished successfully.</p>
          <button type="button" className="button button--outline" onClick={handleFinish}>
            Start Over
          </button>
        </div>
      )}
    </div>
  );
}
