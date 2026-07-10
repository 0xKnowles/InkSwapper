import type { FirmwareEntry } from "../types";

/**
 * Static catalog of CrossPoint-family firmware targets offered on Step 1.
 * Release metadata (tag, assets, publish date) is resolved live from the
 * GitHub Releases API at runtime via useGitHubRelease - nothing here is
 * a stand-in for real repository data.
 */
export const FIRMWARE_CATALOG: FirmwareEntry[] = [
  {
    id: "crosspoint-stable",
    name: "CrossPoint (Stable)",
    author: "crosspoint-reader",
    description:
      "The mainline CrossPoint release channel. Tracks the latest tagged GitHub release for day-to-day reading use.",
    githubOwner: "crosspoint-reader",
    githubRepo: "crosspoint-reader",
    repoUrl: "https://github.com/crosspoint-reader/crosspoint-reader",
    releaseStrategy: "latest-release",
  },
  {
    id: "crosspoint-nightly",
    name: "CrossPoint (Nightly)",
    author: "crosspoint-reader",
    description:
      "Bleeding-edge builds cut directly from the nightly tag / workflow artifact. May be unstable.",
    githubOwner: "crosspoint-reader",
    githubRepo: "crosspoint-reader",
    repoUrl: "https://github.com/crosspoint-reader/crosspoint-reader",
    releaseStrategy: "tagged-release",
    releaseTag: "nightly",
  },
  {
    id: "crossink",
    name: "CrossInk",
    author: "uxjulia",
    description:
      "Advanced typography, focus-reading modes, and deep stats overlays for power readers.",
    githubOwner: "uxjulia",
    githubRepo: "CrossInk",
    repoUrl: "https://github.com/uxjulia/CrossInk",
    releaseStrategy: "latest-release",
  },
  {
    id: "biscuit",
    name: "Biscuit",
    author: "yattsu",
    description:
      "A minimalist client workflow with streamlined reader infrastructure and a lean UI.",
    githubOwner: "yattsu",
    githubRepo: "biscuit",
    repoUrl: "https://github.com/yattsu/biscuit",
    releaseStrategy: "latest-release",
  },
  {
    id: "cpr-vcodex",
    name: "CPR-vCodex",
    author: "franssjz",
    description:
      "Habit analytics, reading heatmaps, flashcards, and stability patches on top of CrossPoint.",
    githubOwner: "franssjz",
    githubRepo: "cpr-vcodex",
    repoUrl: "https://github.com/franssjz/cpr-vcodex",
    releaseStrategy: "latest-release",
  },
  {
    id: "crosspet",
    name: "CrossPet",
    author: "trilwu",
    description:
      "An integrated Tamagotchi-style virtual chicken companion, Pomodoro timer, and SM-2 flashcard deck utility.",
    githubOwner: "trilwu",
    githubRepo: "crosspet",
    repoUrl: "https://github.com/trilwu/crosspet",
    releaseStrategy: "latest-release",
  },
  {
    id: "crosslink",
    name: "CrossLink",
    author: "DaisonChun",
    description:
      "Specialized network syncing and multi-device cross-linking for shared libraries and progress.",
    githubOwner: "DaisonChun",
    githubRepo: "crosslink",
    repoUrl: "https://github.com/DaisonChun/crosslink",
    releaseStrategy: "latest-release",
  },
  {
    id: "aves-o3",
    name: "AvesO3",
    author: "SiliconAves",
    description:
      "Alternative micro-kernel optimizations for the ESP32-C3, tuned for lower power draw and faster wake.",
    githubOwner: "SiliconAves",
    githubRepo: "AvesO3",
    repoUrl: "https://github.com/SiliconAves/AvesO3",
    releaseStrategy: "latest-release",
  },
];
