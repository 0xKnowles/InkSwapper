import { useCallback, useState } from "react";
import type { FirmwareEntry, FlashProgress, LogLevel } from "../../types";
import { useGitHubRelease } from "../../hooks/useGitHubRelease";
import { useFirmwareFlasher, CROSSPOINT_APP_PARTITION_OFFSET } from "../../hooks/useFirmwareFlasher";
import { resolveFirmwareAsset, fetchFirmwareBinary, formatBytes } from "../../lib/firmwareAsset";
import { ProgressBar } from "../ProgressBar";
import "./Step2Flash.css";

interface Step2Props {
  firmware: FirmwareEntry;
  port: SerialPort;
  onComplete: (port: SerialPort) => void;
  log: (message: string, level?: LogLevel) => void;
}

const IDLE_PROGRESS: FlashProgress = { percent: 0, phase: "Idle", bytesWritten: 0, totalBytes: 0 };

export function Step2Flash({ firmware, port, onComplete, log }: Step2Props) {
  const { status: releaseStatus, release, error: releaseError } = useGitHubRelease(firmware);
  const { isFlashing, flash } = useFirmwareFlasher();

  const [eraseFlash, setEraseFlash] = useState(false);
  const [progress, setProgress] = useState<FlashProgress>(IDLE_PROGRESS);
  const [flashError, setFlashError] = useState<string | null>(null);
  const [isDone, setIsDone] = useState(false);

  const asset = release ? resolveFirmwareAsset(release) : null;

  const handleFlash = useCallback(async () => {
    if (!release || !asset) return;
    setFlashError(null);
    setIsDone(false);

    try {
      log(`Downloading ${asset.name} (${formatBytes(asset.size)}) from ${firmware.name} release ${release.tag_name}…`);
      const firmwareBytes = await fetchFirmwareBinary(asset);
      log(`Firmware image downloaded: ${formatBytes(firmwareBytes.byteLength)}.`, "success");

      log(
        eraseFlash
          ? "Erase Flash is ENABLED — full chip erase will run before writing."
          : "Erase Flash is disabled (default) — only the app partition will be rewritten.",
        eraseFlash ? "warn" : "info",
      );

      log("Starting esptool-js flash routine…", "command");
      await flash({
        port,
        firmware: firmwareBytes,
        options: { eraseFlash, baudRate: 115200, flashAddress: CROSSPOINT_APP_PARTITION_OFFSET },
        onProgress: setProgress,
        onLog: (message) => log(message),
      });

      log(`${firmware.name} flashed successfully.`, "success");
      setIsDone(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Flashing failed for an unknown reason.";
      setFlashError(message);
      log(message, "error");
    }
  }, [asset, eraseFlash, firmware.name, flash, log, port, release]);

  const handleContinue = useCallback(() => {
    onComplete(port);
  }, [onComplete, port]);

  return (
    <div className="step2">
      <h2 className="step2__heading">Flash {firmware.name} to device</h2>
      <p className="step2__subheading">
        The firmware image is downloaded directly from the resolved GitHub release and written using esptool-js.
      </p>

      <div className="step2__release-panel">
        {releaseStatus === "loading" && <p className="step2__hint">Resolving latest release…</p>}
        {releaseStatus === "error" && <p className="step2__error">{releaseError}</p>}
        {releaseStatus === "success" && release && (
          <>
            <p className="step2__release-line">
              Release <strong>{release.tag_name}</strong> · {release.assets.length} asset(s)
            </p>
            {asset ? (
              <p className="step2__release-line">
                Target image: <code>{asset.name}</code> ({formatBytes(asset.size)})
              </p>
            ) : (
              <p className="step2__error">No .bin asset found in this release — cannot flash automatically.</p>
            )}
          </>
        )}
      </div>

      <label className="step2__erase-toggle">
        <input type="checkbox" checked={eraseFlash} onChange={(e) => setEraseFlash(e.target.checked)} />
        <span>
          Erase Flash before writing
          <span className="step2__erase-default"> (default: off)</span>
        </span>
      </label>
      <p className="step2__erase-warning">
        Leave this disabled for a normal fork swap — enabling it wipes the entire chip, including LittleFS partitions
        holding books, fonts, and stats.
      </p>

      <ProgressBar percent={progress.percent} phase={progress.phase} />

      {flashError && <p className="step2__error">{flashError}</p>}

      <div className="step2__actions">
        <button
          type="button"
          className="button button--primary"
          disabled={!asset || isFlashing || isDone}
          onClick={handleFlash}
        >
          {isFlashing ? "Flashing…" : isDone ? "Flashed" : "Begin Flash"}
        </button>
        <button type="button" className="button button--outline" disabled={!isDone} onClick={handleContinue}>
          Continue to Restore →
        </button>
      </div>
    </div>
  );
}
