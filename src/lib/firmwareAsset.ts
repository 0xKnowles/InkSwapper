import type { GitHubRelease, GitHubReleaseAsset } from "../types";

/**
 * Picks the best-guess flashable firmware image out of a release's assets.
 * Prefers an unambiguous "firmware.bin"-style name, falls back to the first
 * .bin asset found, since forks don't share one universal artifact naming
 * convention.
 */
export function resolveFirmwareAsset(release: GitHubRelease): GitHubReleaseAsset | null {
  const binAssets = release.assets.filter((asset) => asset.name.toLowerCase().endsWith(".bin"));
  if (binAssets.length === 0) return null;

  const preferred = binAssets.find((asset) => /firmware|merged|crosspoint|app/i.test(asset.name));
  return preferred ?? binAssets[0];
}

/**
 * Downloads a firmware asset's raw bytes for flashing.
 *
 * Note: GitHub release assets are served from objects.githubusercontent.com
 * after a redirect; that endpoint does not always return permissive CORS
 * headers, so this fetch can fail in-browser depending on GitHub's current
 * asset-hosting configuration. Callers should surface fetch failures to the
 * user rather than treat them as fatal bugs in this app.
 */
export async function fetchFirmwareBinary(asset: GitHubReleaseAsset): Promise<Uint8Array> {
  const response = await fetch(asset.browser_download_url);
  if (!response.ok) {
    throw new Error(`Failed to download ${asset.name}: ${response.status} ${response.statusText}`);
  }
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
