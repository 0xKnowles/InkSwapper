import { useEffect, useRef, useState } from "react";
import type { FirmwareEntry, GitHubRelease, ResolvedRelease } from "../types";

const GITHUB_API_ROOT = "https://api.github.com";

/**
 * Resolves the correct GitHub Releases API endpoint for a catalog entry
 * based on its declared releaseStrategy.
 */
function buildReleaseUrl(entry: FirmwareEntry): string {
  const base = `${GITHUB_API_ROOT}/repos/${entry.githubOwner}/${entry.githubRepo}/releases`;
  if (entry.releaseStrategy === "tagged-release") {
    const tag = entry.releaseTag ?? "nightly";
    return `${base}/tags/${encodeURIComponent(tag)}`;
  }
  return `${base}/latest`;
}

/**
 * Fetches live release metadata (tag, publish date, downloadable assets)
 * for a single firmware catalog entry directly from the GitHub REST API.
 * Re-fetches whenever the target entry changes.
 */
export function useGitHubRelease(entry: FirmwareEntry | null): ResolvedRelease {
  const [state, setState] = useState<ResolvedRelease>({
    status: "idle",
    release: null,
    error: null,
  });

  // Guards against a slow, stale request clobbering a newer selection's result.
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!entry) {
      setState({ status: "idle", release: null, error: null });
      return;
    }

    const thisRequestId = ++requestIdRef.current;
    const controller = new AbortController();

    setState({ status: "loading", release: null, error: null });

    (async () => {
      try {
        const response = await fetch(buildReleaseUrl(entry), {
          signal: controller.signal,
          headers: { Accept: "application/vnd.github+json" },
        });

        if (!response.ok) {
          throw new Error(
            `GitHub API responded ${response.status} ${response.statusText} for ${entry.githubOwner}/${entry.githubRepo}`,
          );
        }

        const release = (await response.json()) as GitHubRelease;

        if (requestIdRef.current !== thisRequestId) return;
        setState({ status: "success", release, error: null });
      } catch (err) {
        if (requestIdRef.current !== thisRequestId) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setState({
          status: "error",
          release: null,
          error: err instanceof Error ? err.message : "Unknown error resolving release",
        });
      }
    })();

    return () => controller.abort();
  }, [entry]);

  return state;
}
