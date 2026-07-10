import { useCallback, useEffect, useRef, useState } from "react";
import { useDevice } from "../../context/DeviceContext";
import {
  RESOLUTION_PRESETS,
  drawImageToCanvas,
  toGrayscale,
  ditherFloydSteinberg,
  encodeBmp1Bit,
  encodeBmp8BitGrayscale,
  loadImageFromFile,
  type FitMode,
  type DitherMode,
} from "../../lib/imageEncoding";
import { formatBytes } from "../../lib/firmwareAsset";
import { ProgressBar } from "../ProgressBar";
import "./SleepScreenEditor.css";

function sanitizeFilename(name: string): string {
  const trimmed = name.trim().replace(/\.[^./]+$/, "");
  const safe = trimmed.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return safe || "sleep-screen";
}

export function SleepScreenEditor() {
  const { connectionState, uploadFile, log } = useDevice();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [sourceImage, setSourceImage] = useState<HTMLImageElement | null>(null);
  const [sourceFileName, setSourceFileName] = useState<string | null>(null);

  const [presetId, setPresetId] = useState<string>(RESOLUTION_PRESETS[0].id);
  const [customWidth, setCustomWidth] = useState(480);
  const [customHeight, setCustomHeight] = useState(800);
  const [fitMode, setFitMode] = useState<FitMode>("cover");
  const [ditherMode, setDitherMode] = useState<DitherMode>("monochrome1bit");
  const [filename, setFilename] = useState("sleep-screen");

  const [encodedBytes, setEncodedBytes] = useState<Uint8Array | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [processError, setProcessError] = useState<string | null>(null);

  const [isUploading, setIsUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadDone, setUploadDone] = useState(false);

  const preset = RESOLUTION_PRESETS.find((p) => p.id === presetId) ?? RESOLUTION_PRESETS[0];
  const targetWidth = presetId === "custom" ? customWidth : preset.width;
  const targetHeight = presetId === "custom" ? customHeight : preset.height;

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const img = await loadImageFromFile(file);
      setSourceImage(img);
      setSourceFileName(file.name);
      setFilename(sanitizeFilename(file.name));
      setUploadDone(false);
    } catch (err) {
      setProcessError(err instanceof Error ? err.message : "Failed to load image.");
    }
  }, []);

  useEffect(() => {
    if (!sourceImage || targetWidth <= 0 || targetHeight <= 0) return;
    setProcessError(null);
    try {
      const imageData = drawImageToCanvas(sourceImage, targetWidth, targetHeight, fitMode);
      const gray = toGrayscale(imageData);

      let bytes: Uint8Array;
      let previewPixels: Uint8ClampedArray;

      if (ditherMode === "monochrome1bit") {
        const dithered = ditherFloydSteinberg(gray, targetWidth, targetHeight);
        bytes = encodeBmp1Bit(targetWidth, targetHeight, dithered);
        previewPixels = Uint8ClampedArray.from(dithered);
      } else {
        bytes = encodeBmp8BitGrayscale(targetWidth, targetHeight, gray);
        previewPixels = gray;
      }

      setEncodedBytes(bytes);
      setDimensions({ width: targetWidth, height: targetHeight });

      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          const rgba = ctx.createImageData(targetWidth, targetHeight);
          for (let i = 0, p = 0; p < previewPixels.length; i += 4, p += 1) {
            rgba.data[i] = previewPixels[p];
            rgba.data[i + 1] = previewPixels[p];
            rgba.data[i + 2] = previewPixels[p];
            rgba.data[i + 3] = 255;
          }
          ctx.putImageData(rgba, 0, 0);
        }
      }
    } catch (err) {
      setProcessError(err instanceof Error ? err.message : "Failed to process image.");
    }
  }, [sourceImage, targetWidth, targetHeight, fitMode, ditherMode]);

  const handleUpload = useCallback(async () => {
    if (!encodedBytes) return;
    setIsUploading(true);
    setUploadError(null);
    setUploadPercent(0);
    setUploadDone(false);

    const path = `/sleep/${sanitizeFilename(filename)}.bmp`;
    try {
      await uploadFile({
        path,
        bytes: encodedBytes,
        onProgress: (percent) => setUploadPercent(percent),
      });
      setUploadDone(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed for an unknown reason.";
      setUploadError(message);
      log(message, "error");
    } finally {
      setIsUploading(false);
    }
  }, [encodedBytes, filename, log, uploadFile]);

  const isConnected = connectionState === "connected";

  return (
    <div className="sleep-editor section-panel">
      <h2 className="section-heading">Sleep Screens</h2>
      <p className="section-subheading">
        Design custom sleep-screen artwork sized for the Xteink X3 or X4's portrait e-ink panel, dither it, and
        upload it directly to the device's /sleep directory.
      </p>

      <div className="sleep-editor__layout">
        <div className="sleep-editor__controls">
          <label className="sleep-editor__field">
            <span className="sleep-editor__label">Source image</span>
            <input type="file" accept="image/*" onChange={handleFileChange} className="sleep-editor__file-input" />
            {sourceFileName && <span className="sleep-editor__hint">Loaded: {sourceFileName}</span>}
          </label>

          <label className="sleep-editor__field">
            <span className="sleep-editor__label">Target device</span>
            <select
              className="sleep-editor__select"
              value={presetId}
              onChange={(e) => setPresetId(e.target.value)}
            >
              {RESOLUTION_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>

          {presetId === "custom" && (
            <div className="sleep-editor__dimension-row">
              <label className="sleep-editor__field sleep-editor__field--inline">
                <span className="sleep-editor__label">Width</span>
                <input
                  type="number"
                  min={16}
                  max={4096}
                  value={customWidth}
                  onChange={(e) => setCustomWidth(Number(e.target.value))}
                  className="sleep-editor__number-input"
                />
              </label>
              <label className="sleep-editor__field sleep-editor__field--inline">
                <span className="sleep-editor__label">Height</span>
                <input
                  type="number"
                  min={16}
                  max={4096}
                  value={customHeight}
                  onChange={(e) => setCustomHeight(Number(e.target.value))}
                  className="sleep-editor__number-input"
                />
              </label>
            </div>
          )}

          <label className="sleep-editor__field">
            <span className="sleep-editor__label">Fit mode</span>
            <select className="sleep-editor__select" value={fitMode} onChange={(e) => setFitMode(e.target.value as FitMode)}>
              <option value="cover">Cover (fill, may crop)</option>
              <option value="contain">Contain (fit, may letterbox)</option>
              <option value="stretch">Stretch (fill exactly)</option>
            </select>
          </label>

          <label className="sleep-editor__field">
            <span className="sleep-editor__label">Color mode</span>
            <select
              className="sleep-editor__select"
              value={ditherMode}
              onChange={(e) => setDitherMode(e.target.value as DitherMode)}
            >
              <option value="monochrome1bit">1-bit monochrome (Floyd–Steinberg dither)</option>
              <option value="grayscale8">8-bit grayscale</option>
            </select>
          </label>

          <label className="sleep-editor__field">
            <span className="sleep-editor__label">Filename</span>
            <div className="sleep-editor__filename-row">
              <input
                type="text"
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                className="sleep-editor__text-input"
              />
              <span className="sleep-editor__filename-suffix">.bmp</span>
            </div>
            <span className="sleep-editor__hint">Uploads to /sleep/{sanitizeFilename(filename)}.bmp</span>
          </label>

          {processError && <p className="sleep-editor__error">{processError}</p>}

          {encodedBytes && dimensions && (
            <p className="sleep-editor__hint">
              Encoded: {dimensions.width}×{dimensions.height}, {ditherMode === "monochrome1bit" ? "1bpp" : "8bpp"} BMP,{" "}
              {formatBytes(encodedBytes.byteLength)}
            </p>
          )}

          {!isConnected && (
            <p className="sleep-editor__hint">Connect a device from the sidebar to enable uploading.</p>
          )}

          {isUploading && <ProgressBar percent={uploadPercent} phase="Uploading to /sleep" />}
          {uploadError && <p className="sleep-editor__error">{uploadError}</p>}
          {uploadDone && !isUploading && <p className="sleep-editor__success">Uploaded successfully.</p>}

          <button
            type="button"
            className="button button--primary"
            disabled={!encodedBytes || !isConnected || isUploading}
            onClick={handleUpload}
          >
            {isUploading ? "Uploading…" : "Upload to /sleep"}
          </button>
        </div>

        <div className="sleep-editor__preview">
          <span className="sleep-editor__label">Preview</span>
          <div className="sleep-editor__canvas-frame">
            {sourceImage ? (
              <canvas ref={canvasRef} className="sleep-editor__canvas" />
            ) : (
              <div className="sleep-editor__canvas-placeholder">Upload an image to see a preview</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
