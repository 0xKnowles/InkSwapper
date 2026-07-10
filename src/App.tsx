import { useCallback, useState } from "react";
import type { FirmwareEntry, WizardStep } from "./types";
import { useTerminalLog } from "./hooks/useTerminalLog";
import { StepHeader } from "./components/StepHeader";
import { Terminal } from "./components/Terminal";
import { Step1SelectConnect } from "./components/steps/Step1SelectConnect";
import { Step2Flash } from "./components/steps/Step2Flash";
import { Step3Restore } from "./components/steps/Step3Restore";
import "./App.css";

interface WizardState {
  step: WizardStep;
  selectedFirmware: FirmwareEntry | null;
  devicePort: SerialPort | null;
  backedUpStats: string | null;
}

const INITIAL_STATE: WizardState = {
  step: 1,
  selectedFirmware: null,
  devicePort: null,
  backedUpStats: null,
};

function App() {
  const [state, setState] = useState<WizardState>(INITIAL_STATE);
  const { lines, log, clear } = useTerminalLog();

  const handleSelectFirmware = useCallback((entry: FirmwareEntry) => {
    setState((prev) => ({ ...prev, selectedFirmware: entry }));
  }, []);

  const handleStep1Complete = useCallback(
    (port: SerialPort, backedUpStats: string) => {
      log("Advancing to Step 2: Flash Firmware Partition.");
      setState((prev) => ({ ...prev, step: 2, devicePort: port, backedUpStats }));
    },
    [log],
  );

  const handleStep2Complete = useCallback(
    (port: SerialPort) => {
      log("Advancing to Step 3: Restore Data & Finalize.");
      setState((prev) => ({ ...prev, step: 3, devicePort: port }));
    },
    [log],
  );

  const handleFinish = useCallback(() => {
    log("Session reset. Ready for another swap.");
    setState(INITIAL_STATE);
    clear();
  }, [clear, log]);

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__title-row">
          <h1 className="app__title">CrossSwap</h1>
          <span className="app__badge">ESP32-C3</span>
        </div>
        <p className="app__tagline">OS swapper &amp; backup utility for CrossPoint-family e-reader firmware.</p>
      </header>

      <main className="app__main">
        <StepHeader currentStep={state.step} />

        <div className="app__panel">
          {state.step === 1 && (
            <Step1SelectConnect
              selectedFirmware={state.selectedFirmware}
              onSelectFirmware={handleSelectFirmware}
              onComplete={handleStep1Complete}
              log={log}
            />
          )}

          {state.step === 2 && state.selectedFirmware && state.devicePort && (
            <Step2Flash
              firmware={state.selectedFirmware}
              port={state.devicePort}
              onComplete={handleStep2Complete}
              log={log}
            />
          )}

          {state.step === 3 && state.selectedFirmware && state.devicePort && state.backedUpStats !== null && (
            <Step3Restore
              firmware={state.selectedFirmware}
              port={state.devicePort}
              backedUpStats={state.backedUpStats}
              onFinish={handleFinish}
              log={log}
            />
          )}
        </div>

        <Terminal lines={lines} />
      </main>

      <footer className="app__footer">
        <span>CrossSwap runs entirely client-side. Nothing is uploaded off this device.</span>
      </footer>
    </div>
  );
}

export default App;
