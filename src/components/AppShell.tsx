import { useCallback, useState, type ReactNode } from "react";
import { useDevice } from "../context/DeviceContext";
import { Terminal } from "./Terminal";
import "./AppShell.css";

export type Section = "dashboard" | "flash-os" | "sleep-screens";

const NAV_ITEMS: { id: Section; label: string; hint: string }[] = [
  { id: "dashboard", label: "Dashboard", hint: "Overview & device status" },
  { id: "flash-os", label: "Flash OS", hint: "Swap firmware in 3 steps" },
  { id: "sleep-screens", label: "Sleep Screens", hint: "Design & upload artwork" },
];

interface AppShellProps {
  activeSection: Section;
  onNavigate: (section: Section) => void;
  children: ReactNode;
}

function formatDeviceInfo(port: SerialPort | null): string | null {
  if (!port) return null;
  const info = port.getInfo();
  if (info.usbVendorId === undefined || info.usbProductId === undefined) return null;
  const hex = (n: number) => n.toString(16).padStart(4, "0").toUpperCase();
  return `VID:${hex(info.usbVendorId)} PID:${hex(info.usbProductId)}`;
}

export function AppShell({ activeSection, onNavigate, children }: AppShellProps) {
  const { isSupported, connectionState, port, connect, disconnect, log, logLines } = useDevice();
  const [connectError, setConnectError] = useState<string | null>(null);

  const handleConnectToggle = useCallback(async () => {
    setConnectError(null);
    if (connectionState === "connected") {
      log("Disconnecting device…");
      await disconnect();
      return;
    }
    log("Requesting Web Serial access…");
    try {
      await connect();
      log("Device connected over USB-C.", "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to connect to serial device.";
      setConnectError(message);
      log(message, "error");
    }
  }, [connect, connectionState, disconnect, log]);

  const deviceInfo = formatDeviceInfo(port);

  return (
    <div className="shell">
      <aside className="shell__sidebar">
        <div className="shell__brand">
          <span className="shell__brand-title">CrossSwap</span>
          <span className="shell__brand-badge">ESP32-C3</span>
        </div>

        <nav className="shell__nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`shell__nav-item${activeSection === item.id ? " shell__nav-item--active" : ""}`}
              onClick={() => onNavigate(item.id)}
            >
              <span className="shell__nav-label">{item.label}</span>
              <span className="shell__nav-hint">{item.hint}</span>
            </button>
          ))}
        </nav>

        <div className="shell__device">
          <div className="shell__device-row">
            <span className={`shell__device-dot shell__device-dot--${connectionState}`} />
            <span className="shell__device-state">{connectionState}</span>
          </div>
          {deviceInfo && <span className="shell__device-info">{deviceInfo}</span>}
          {!isSupported && <p className="shell__device-warning">Web Serial unsupported in this browser.</p>}
          {connectError && <p className="shell__device-warning">{connectError}</p>}
          <button
            type="button"
            className="button button--outline shell__device-button"
            disabled={!isSupported || connectionState === "connecting" || connectionState === "disconnecting"}
            onClick={handleConnectToggle}
          >
            {connectionState === "connected" ? "Disconnect" : "Connect Device"}
          </button>
        </div>
      </aside>

      <div className="shell__main">
        <div className="shell__content">{children}</div>
        <div className="shell__terminal">
          <Terminal lines={logLines} />
        </div>
      </div>
    </div>
  );
}
