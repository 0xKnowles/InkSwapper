import { useCallback, useMemo, useState } from "react";
import { useDevice } from "../../context/DeviceContext";
import type { Section } from "../AppShell";
import "./Dashboard.css";

interface BackupRecord {
  key: string;
  firmware: string | null;
  capturedAt: string | null;
  byteLength: number;
}

const BACKUP_KEY_PREFIX = "crossswap:backup:";

function loadBackups(): BackupRecord[] {
  const records: BackupRecord[] = [];
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (!key || !key.startsWith(BACKUP_KEY_PREFIX)) continue;
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as { firmware?: string; capturedAt?: string; stats?: string };
      records.push({
        key,
        firmware: parsed.firmware ?? null,
        capturedAt: parsed.capturedAt ?? null,
        byteLength: parsed.stats?.length ?? 0,
      });
    } catch {
      // Skip malformed entries rather than letting a bad record break the dashboard.
    }
  }
  return records.sort((a, b) => b.key.localeCompare(a.key));
}

interface DashboardProps {
  onNavigate: (section: Section) => void;
}

export function Dashboard({ onNavigate }: DashboardProps) {
  const { connectionState, port } = useDevice();
  const [backups, setBackups] = useState<BackupRecord[]>(() => loadBackups());

  const deviceInfo = useMemo(() => {
    if (!port) return null;
    const info = port.getInfo();
    if (info.usbVendorId === undefined || info.usbProductId === undefined) return null;
    const hex = (n: number) => n.toString(16).padStart(4, "0").toUpperCase();
    return `VID:${hex(info.usbVendorId)} · PID:${hex(info.usbProductId)}`;
  }, [port]);

  const handleDeleteBackup = useCallback((key: string) => {
    window.localStorage.removeItem(key);
    setBackups((prev) => prev.filter((b) => b.key !== key));
  }, []);

  return (
    <div className="dashboard">
      <h2 className="section-heading">Dashboard</h2>
      <p className="section-subheading">
        Overview of your connected CrossPoint-family device and quick access to CrossSwap's tools.
      </p>

      <div className="dashboard__status section-panel">
        <div>
          <p className="dashboard__status-label">Serial link</p>
          <p className={`dashboard__status-value dashboard__status-value--${connectionState}`}>{connectionState}</p>
        </div>
        <div>
          <p className="dashboard__status-label">Device</p>
          <p className="dashboard__status-value">{deviceInfo ?? "—"}</p>
        </div>
      </div>

      <div className="dashboard__grid">
        <button type="button" className="dashboard__card" onClick={() => onNavigate("flash-os")}>
          <span className="dashboard__card-title">Flash OS</span>
          <span className="dashboard__card-body">
            Swap between CrossPoint-family firmware forks in a guided 3-step wizard: back up, flash, restore.
          </span>
          <span className="dashboard__card-cta">Open wizard →</span>
        </button>

        <button type="button" className="dashboard__card" onClick={() => onNavigate("sleep-screens")}>
          <span className="dashboard__card-title">Sleep Screens</span>
          <span className="dashboard__card-body">
            Design custom sleep-screen artwork, dither it for e-ink, and upload it straight to /sleep.
          </span>
          <span className="dashboard__card-cta">Open editor →</span>
        </button>
      </div>

      <div className="dashboard__backups section-panel">
        <h3 className="dashboard__backups-title">Recent backups</h3>
        {backups.length === 0 ? (
          <p className="dashboard__empty">
            No backups yet — running the Flash OS wizard's Step 1 saves a stats backup here.
          </p>
        ) : (
          <ul className="dashboard__backups-list">
            {backups.map((b) => (
              <li key={b.key} className="dashboard__backup-row">
                <span className="dashboard__backup-firmware">{b.firmware ?? "unknown firmware"}</span>
                <span className="dashboard__backup-meta">
                  {b.capturedAt ? new Date(b.capturedAt).toLocaleString() : "unknown time"} · {b.byteLength} bytes
                </span>
                <button
                  type="button"
                  className="dashboard__backup-delete"
                  onClick={() => handleDeleteBackup(b.key)}
                  aria-label="Delete backup"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
