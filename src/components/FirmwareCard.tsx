import type { FirmwareEntry } from "../types";
import { useGitHubRelease } from "../hooks/useGitHubRelease";
import "./FirmwareCard.css";

interface FirmwareCardProps {
  entry: FirmwareEntry;
  selected: boolean;
  onSelect: (entry: FirmwareEntry) => void;
}

export function FirmwareCard({ entry, selected, onSelect }: FirmwareCardProps) {
  const { status, release, error } = useGitHubRelease(entry);

  return (
    <button
      type="button"
      className={`firmware-card${selected ? " firmware-card--selected" : ""}`}
      onClick={() => onSelect(entry)}
      aria-pressed={selected}
    >
      <div className="firmware-card__top">
        <span className="firmware-card__name">{entry.name}</span>
        <span className="firmware-card__author">{entry.author}</span>
      </div>
      <p className="firmware-card__description">{entry.description}</p>
      <div
        className={`firmware-card__release${
          status === "success" ? " firmware-card__release--success" : status === "error" ? " firmware-card__release--error" : ""
        }`}
      >
        <span className="firmware-card__dot" />
        {status === "idle" && "—"}
        {status === "loading" && "Resolving release…"}
        {status === "success" && release && `${release.tag_name} · ${release.assets.length} asset(s)`}
        {status === "error" && (error ?? "Release lookup failed")}
      </div>
    </button>
  );
}
