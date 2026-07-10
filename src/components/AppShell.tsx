import { useCallback, useState, type ReactNode } from "react";
import { useDevice } from "../context/DeviceContext";
import { getSerialUnsupportedReason } from "../lib/browserSupport";
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

const isMixedContentRisk = typeof window !== "undefined" && window.location.protocol === "https:";

export function AppShell({ activeSection, onNavigate, children }: AppShellProps) {
  const {
    mode,
    setMode,
    isSupported,
    connectionState,
    deviceLabel,
    connectSerial,
    connectWireless,
    disconnect,
    log,
    logLines,
  } = useDevice();

  const [connectError, setConnectError] = useState<string | null>(null);
  const [hostInput, setHostInput] = useState("");

  const isBusy = connectionState === "connecting" || connectionState === "disconnecting";
  const isConnected = connectionState === "connected";

  const handleSerialToggle = useCallback(async () => {
    setConnectError(null);
    if (isConnected) {
      log("Disconnecting device…");
      await disconnect();
      return;
    }
    log("Requesting Web Serial access…");
    try {
      await connectSerial();
      log("Device connected over USB-C.", "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to connect to serial device.";
      setConnectError(message);
      log(message, "error");
    }
  }, [connectSerial, disconnect, isConnected, log]);

  const handleWirelessConnect = useCallback(async () => {
    setConnectError(null);
    if (isConnected) {
      log("Disconnecting from device…");
      await disconnect();
      return;
    }
    if (!hostInput.trim()) return;
    log(`Opening a WebSocket connection to ${hostInput.trim()}:81…`);
    try {
      await connectWireless(hostInput);
      log("Device reachable over Wi-Fi.", "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to reach device over Wi-Fi.";
      setConnectError(message);
      log(message, "error");
    }
  }, [connectWireless, disconnect, hostInput, isConnected, log]);

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
          <div className="shell__mode-toggle" role="tablist" aria-label="Connection transport">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "serial"}
              className={`shell__mode-button${mode === "serial" ? " shell__mode-button--active" : ""}`}
              disabled={isConnected || isBusy}
              onClick={() => setMode("serial")}
            >
              USB Serial
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "wireless"}
              className={`shell__mode-button${mode === "wireless" ? " shell__mode-button--active" : ""}`}
              disabled={isConnected || isBusy}
              onClick={() => setMode("wireless")}
            >
              Wireless
            </button>
          </div>

          <div className="shell__device-row">
            <span className={`shell__device-dot shell__device-dot--${connectionState}`} />
            <span className="shell__device-state">{connectionState}</span>
          </div>
          {deviceLabel && <span className="shell__device-info">{deviceLabel}</span>}

          {mode === "serial" ? (
            <>
              {!isSupported && <p className="shell__device-warning">{getSerialUnsupportedReason()}</p>}
              {connectError && <p className="shell__device-warning">{connectError}</p>}
              <button
                type="button"
                className="button button--outline shell__device-button"
                disabled={!isSupported || isBusy}
                onClick={handleSerialToggle}
              >
                {isConnected ? "Disconnect" : "Connect Device"}
              </button>
            </>
          ) : (
            <>
              {isMixedContentRisk && (
                <p className="shell__device-warning">
                  This page is loaded over https:// — browsers block a plain ws:// connection to a device on your
                  LAN from an https:// page. Load CrossSwap over http:// or localhost to use Wireless mode.
                </p>
              )}
              <p className="shell__device-hint">
                Uploads only — CrossPoint's web server has no push-firmware or stats endpoint, and its file API
                doesn't send CORS headers, so only the WebSocket upload channel (port 81) works cross-origin.
              </p>
              {!isConnected && (
                <input
                  type="text"
                  inputMode="url"
                  placeholder="device IP or hostname"
                  className="shell__host-input"
                  value={hostInput}
                  onChange={(e) => setHostInput(e.target.value)}
                  disabled={isBusy}
                />
              )}
              {connectError && <p className="shell__device-warning">{connectError}</p>}
              <button
                type="button"
                className="button button--outline shell__device-button"
                disabled={isBusy || (!isConnected && !hostInput.trim())}
                onClick={handleWirelessConnect}
              >
                {isConnected ? "Disconnect" : "Connect Wireless"}
              </button>
            </>
          )}
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
