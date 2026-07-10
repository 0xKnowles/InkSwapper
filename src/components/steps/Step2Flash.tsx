import { useCallback, useRef, useState } from "react";
import type { FirmwareEntry, FlashProgress } from "../../types";
import { useGitHubRelease } from "../../hooks/useGitHubRelease";
import { useFirmwareFlasher, CROSSPOINT_APP_PARTITION_OFFSET } from "../../hooks/useFirmwareFlasher";
import { useDevice } from "../../context/DeviceContext";
import { resolveFirmwareAsset, fetchFirmwareBinary, formatBytes } from "../../lib/firmwareAsset";
import { ProgressBar } from "../ProgressBar";
import "./Step2Flash.css";

interface Step2Props {
  firmware: FirmwareEntry;
  port: SerialPort;
  onComplete: (port: SerialPort) => void;
}

interface FirmwareSource {
  kind: "github" | "custom";
  label: string;
  bytes: Uint8Array;
}

const IDLE_PROGRESS: FlashProgress = { percent: 0, phase: "Idle", bytesWritten: 0, totalBytes: 0 };

export function Step2Flash({ firmware, port, onComplete }: Step2Props) {
  const { status: releaseStatus, release, error: releaseError } = useGitHubRelease(firmware);
  const { isFlashing, flash } = useFirmwareFlasher();
  const { log } = useDevice();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [eraseFlash, setEraseFlash] = useState(false);
  const [progress, setProgress] = useState<FlashProgress>(IDLE_PROGRESS);
  const [flashError, setFlashError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [source, setSource] = useState<FirmwareSource | null>(null);

  const asset = release ? resolveFirmwareAsset(release) : null;

  const handleDownloadFromGithub = useCallback(async () => {
    if (!release || !asset) return;
    setDownloadError(null);
    setIsDownloading(true);
    try {
      log(`Downloading ${asset.name} (${formatBytes(asset.size)}) from ${firmware.name} release ${release.tag_name}…`);
      const firmwareBytes = await fetchFirmwareBinary(asset);
      log(`Firmware image downloaded: ${formatBytes(firmwareBytes.byteLength)}.`, "success");
      setSource({ kind: "github", label: `${asset.name} (${release.tag_name})`, bytes: firmwareBytes });
    } catch {
      const message =
        "GitHub could not be fetched directly from the browser (release assets don't send CORS headers). " +
        "Download the .bin from the release page and use \"Upload custom .bin\" below instead.";
      setDownloadError(message);
      log(message, "error");
    } finally {
      setIsDownloading(false);
    }
  }, [asset, firmware.name, log, release]);

  const handleCustomFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      setSource({ kind: "custom", label: `${file.name} (${formatBytes(bytes.byteLength)})`, bytes });
      log(`Loaded local firmware image: ${file.name} (${formatBytes(bytes.byteLength)}).`, "success");
    },
    [log],
  );

  const handleFlash = useCallback(async () => {
    if (!source) return;
    setFlashError(null);
    setIsDone(false);

    try {
      log(
        eraseFlash
          ? "Erase Flash is ENABLED — full chip erase will run before writing."
          : "Erase Flash is disabled (default) — only the app partition will be rewritten.",
        eraseFlash ? "warn" : "info",
      );

      log(`Starting esptool-js flash routine with ${source.label}…`, "command");
      await flash({
        port,
        firmware: source.bytes,
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
  }, [eraseFlash, firmware.name, flash, log, port, source]);

  const handleContinue = useCallback(() => {
    onComplete(port);
  }, [onComplete, port]);

  return (
    <div className="step2">
      <h2 className="step2__heading">Flash {firmware.name} to device</h2>
      <p className="step2__subheading">
        Write the firmware image using esptool-js — either fetched from the resolved GitHub release, or uploaded
        directly from your machine.
      </p>

      <div className="step2__source-panel">
        <h3 className="step2__source-title">Option A — GitHub release</h3>
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
              <p className="step2__error">No .bin asset found in this release.</p>
            )}
            <div className="step2__source-actions">
              <button
                type="button"
                className="button button--outline"
                disabled={!asset || isDownloading}
                onClick={handleDownloadFromGithub}
              >
                {isDownloading ? "Downloading…" : "Download from GitHub"}
              </button>
              <a className="step2__release-link" href={release.html_url} target="_blank" rel="noreferrer">
                Open release page ↗
              </a>
            </div>
            {downloadError && <p className="step2__error">{downloadError}</p>}
          </>
        )}

        <h3 className="step2__source-title step2__source-title--spaced">Option B — Upload a custom .bin</h3>
        <p className="step2__hint">
          Use this if the browser can't fetch the release asset directly, or to flash a locally built image.
        </p>
        <div className="step2__source-actions">
          <input
            ref={fileInputRef}
            type="file"
            accept=".bin"
            className="step2__file-input"
            onChange={handleCustomFile}
          />
        </div>

        {source && (
          <p className="step2__release-line step2__source-selected">
            Selected source ({source.kind === "github" ? "GitHub" : "custom upload"}): <code>{source.label}</code>
          </p>
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
          disabled={!source || isFlashing || isDone}
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
