/**
 * Client-side image pipeline for e-ink sleep screens: draw a source image
 * onto a fixed-size canvas, convert to grayscale, optionally 1-bit dither
 * it, and encode the result as a standard, spec-correct BMP file (either
 * 8bpp grayscale or 1bpp monochrome). BMP is used because it's a simple,
 * universally parseable uncompressed format with no external dependencies
 * needed to write it — the exact bit depth a given CrossPoint fork expects
 * on-device is fork-specific and not something this app can know in
 * advance, so both options are offered.
 */

export type FitMode = "cover" | "contain" | "stretch";
export type DitherMode = "grayscale8" | "monochrome1bit";

export interface ResolutionPreset {
  id: string;
  label: string;
  width: number;
  height: number;
}

export const RESOLUTION_PRESETS: ResolutionPreset[] = [
  { id: "800x480", label: "800 × 480 (common 7.5\" e-ink panel)", width: 800, height: 480 },
  { id: "1072x1448", label: "1072 × 1448 (6\" HD e-reader panel)", width: 1072, height: 1448 },
  { id: "640x384", label: "640 × 384 (compact panel)", width: 640, height: 384 },
  { id: "custom", label: "Custom…", width: 800, height: 480 },
];

/** Draws `image` onto an offscreen canvas at the target size using the given fit mode. */
export function drawImageToCanvas(image: HTMLImageElement, width: number, height: number, fit: FitMode): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable in this browser.");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  const srcRatio = image.width / image.height;
  const dstRatio = width / height;

  let drawWidth = width;
  let drawHeight = height;
  let offsetX = 0;
  let offsetY = 0;

  if (fit === "cover") {
    if (srcRatio > dstRatio) {
      drawHeight = height;
      drawWidth = height * srcRatio;
      offsetX = (width - drawWidth) / 2;
    } else {
      drawWidth = width;
      drawHeight = width / srcRatio;
      offsetY = (height - drawHeight) / 2;
    }
  } else if (fit === "contain") {
    if (srcRatio > dstRatio) {
      drawWidth = width;
      drawHeight = width / srcRatio;
      offsetY = (height - drawHeight) / 2;
    } else {
      drawHeight = height;
      drawWidth = height * srcRatio;
      offsetX = (width - drawWidth) / 2;
    }
  }
  // "stretch" keeps the full-canvas drawWidth/drawHeight/offset defaults.

  ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
  return ctx.getImageData(0, 0, width, height);
}

/** Rec. 601 luma conversion to an 8-bit grayscale buffer. */
export function toGrayscale(imageData: ImageData): Uint8ClampedArray {
  const { data, width, height } = imageData;
  const gray = new Uint8ClampedArray(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return gray;
}

/** Classic Floyd–Steinberg error-diffusion dither down to pure black/white (0 / 255). */
export function ditherFloydSteinberg(gray: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const buffer = Float32Array.from(gray);
  const output = new Uint8Array(width * height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const oldPixel = buffer[idx];
      const newPixel = oldPixel < 128 ? 0 : 255;
      output[idx] = newPixel;
      const error = oldPixel - newPixel;

      if (x + 1 < width) buffer[idx + 1] += error * (7 / 16);
      if (y + 1 < height) {
        if (x > 0) buffer[idx + width - 1] += error * (3 / 16);
        buffer[idx + width] += error * (5 / 16);
        if (x + 1 < width) buffer[idx + width + 1] += error * (1 / 16);
      }
    }
  }

  return output;
}

function buildBmpHeader(width: number, height: number, bitCount: 1 | 8, paletteSize: number, rowBytesPadded: number): Uint8Array {
  const pixelDataOffset = 14 + 40 + paletteSize * 4;
  const imageSize = rowBytesPadded * height;
  const fileSize = pixelDataOffset + imageSize;

  const header = new Uint8Array(pixelDataOffset);
  const view = new DataView(header.buffer);

  // BITMAPFILEHEADER
  header[0] = 0x42; // 'B'
  header[1] = 0x4d; // 'M'
  view.setUint32(2, fileSize, true);
  view.setUint32(6, 0, true); // reserved
  view.setUint32(10, pixelDataOffset, true);

  // BITMAPINFOHEADER
  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true); // positive height => bottom-up row order
  view.setUint16(26, 1, true); // color planes
  view.setUint16(28, bitCount, true);
  view.setUint32(30, 0, true); // BI_RGB, uncompressed
  view.setUint32(34, imageSize, true);
  view.setInt32(38, 2835, true); // ~72 DPI
  view.setInt32(42, 2835, true);
  view.setUint32(46, paletteSize, true);
  view.setUint32(50, paletteSize, true);

  let offset = 54;
  if (bitCount === 1) {
    // Index 0 = black, index 1 = white.
    header.set([0, 0, 0, 0], offset);
    header.set([255, 255, 255, 0], offset + 4);
  } else {
    for (let i = 0; i < 256; i += 1) {
      header.set([i, i, i, 0], offset);
      offset += 4;
    }
  }

  return header;
}

/** Encodes a dithered 0/255 buffer as a 1bpp monochrome BMP. */
export function encodeBmp1Bit(width: number, height: number, pixels: Uint8Array): Uint8Array {
  const rowBytes = Math.ceil(width / 8);
  const rowBytesPadded = Math.ceil(rowBytes / 4) * 4;
  const header = buildBmpHeader(width, height, 1, 2, rowBytesPadded);
  const pixelData = new Uint8Array(rowBytesPadded * height);

  for (let y = 0; y < height; y += 1) {
    const srcRow = height - 1 - y; // BMP rows are bottom-up
    const rowOffset = y * rowBytesPadded;
    for (let x = 0; x < width; x += 1) {
      if (pixels[srcRow * width + x] >= 128) {
        const byteIndex = rowOffset + (x >> 3);
        const bit = 7 - (x % 8);
        pixelData[byteIndex] |= 1 << bit;
      }
    }
  }

  const out = new Uint8Array(header.length + pixelData.length);
  out.set(header, 0);
  out.set(pixelData, header.length);
  return out;
}

/** Encodes an 8-bit grayscale buffer as an 8bpp grayscale-palette BMP. */
export function encodeBmp8BitGrayscale(width: number, height: number, gray: Uint8ClampedArray): Uint8Array {
  const rowBytes = width;
  const rowBytesPadded = Math.ceil(rowBytes / 4) * 4;
  const header = buildBmpHeader(width, height, 8, 256, rowBytesPadded);
  const pixelData = new Uint8Array(rowBytesPadded * height);

  for (let y = 0; y < height; y += 1) {
    const srcRow = height - 1 - y;
    const rowOffset = y * rowBytesPadded;
    for (let x = 0; x < width; x += 1) {
      pixelData[rowOffset + x] = gray[srcRow * width + x];
    }
  }

  const out = new Uint8Array(header.length + pixelData.length);
  out.set(header, 0);
  out.set(pixelData, header.length);
  return out;
}

export function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Failed to decode image file: ${file.name}`));
    };
    img.src = url;
  });
}
