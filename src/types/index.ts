/**
 * Core type definitions for CrossSwap.
 */

/** A single firmware option in the catalog offered on Step 1. */
export interface FirmwareEntry {
  /** Stable machine-readable identifier, used as React key / state value. */
  id: string;
  /** Display name shown in the catalog card. */
  name: string;
  /** GitHub handle / org of the firmware author or maintaining org. */
  author: string;
  /** Short human-readable description of the fork's focus. */
  description: string;
  /** GitHub "owner/repo" slug used to build API requests. */
  githubOwner: string;
  githubRepo: string;
  /** Full https URL to the GitHub repository, for display / linking. */
  repoUrl: string;
  /**
   * Which GitHub Releases API strategy to use when resolving a downloadable
   * asset for this catalog entry.
   *  - "latest-release": GET /repos/{owner}/{repo}/releases/latest
   *  - "tagged-release": GET /repos/{owner}/{repo}/releases/tags/{tag}
   */
  releaseStrategy: "latest-release" | "tagged-release";
  /** Required when releaseStrategy is "tagged-release" (e.g. "nightly"). */
  releaseTag?: string;
}

/** Status of an asynchronously-resolved GitHub release lookup. */
export type ReleaseFetchStatus = "idle" | "loading" | "success" | "error";

/** Minimal shape of a GitHub release asset we care about. */
export interface GitHubReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
  content_type: string;
}

/** Minimal shape of a GitHub release API response we care about. */
export interface GitHubRelease {
  tag_name: string;
  name: string | null;
  html_url: string;
  published_at: string | null;
  assets: GitHubReleaseAsset[];
  prerelease: boolean;
}

/** Result of resolving a FirmwareEntry's release metadata. */
export interface ResolvedRelease {
  status: ReleaseFetchStatus;
  release: GitHubRelease | null;
  error: string | null;
}

/** The three sequential phases of the flashing wizard. */
export type WizardStep = 1 | 2 | 3;

/** Lifecycle state of the Web Serial port connection. */
export type SerialConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "disconnecting"
  | "error";

/** Severity used to color-code terminal log lines. */
export type LogLevel = "info" | "success" | "warn" | "error" | "command";

/** A single timestamped line rendered in the terminal pane. */
export interface LogLine {
  id: number;
  timestamp: string;
  level: LogLevel;
  message: string;
}

/** Progress state for the Step 2 flashing routine. */
export interface FlashProgress {
  /** 0 - 100 */
  percent: number;
  /** Human readable phase label, e.g. "Erasing", "Writing", "Verifying". */
  phase: string;
  /** Bytes written so far, if known. */
  bytesWritten: number;
  /** Total byte size of the firmware image, if known. */
  totalBytes: number;
}

/** Options passed into the flash routine, mirroring esptool-js flags. */
export interface FlashOptions {
  /**
   * Whether to erase the entire flash before writing the new partition.
   * Defaults to false so an OS fork-swap does not scrub user partitions
   * (LittleFS stats, fonts, books) that live outside the firmware slot.
   */
  eraseFlash: boolean;
  /** Baud rate used for the esptool-js flashing session. */
  baudRate: number;
  /** Flash offset address the firmware image is written to. */
  flashAddress: number;
}
