import { useCallback, useState } from "react";
import type { FirmwareEntry, WizardStep } from "../../types";
import { useDevice } from "../../context/DeviceContext";
import { StepHeader } from "../StepHeader";
import { Step1SelectConnect } from "../steps/Step1SelectConnect";
import { Step2Flash } from "../steps/Step2Flash";
import { Step3Restore } from "../steps/Step3Restore";

interface WizardState {
  step: WizardStep;
  selectedFirmware: FirmwareEntry | null;
  backedUpStats: string | null;
}

const INITIAL_STATE: WizardState = {
  step: 1,
  selectedFirmware: null,
  backedUpStats: null,
};

/**
 * Guided 3-step OS swap flow: back up on-device stats, flash the selected
 * firmware, then restore the backup. Reuses the app-wide device connection
 * from DeviceContext rather than owning its own transport.
 */
export function FlashOSWizard() {
  const { log, clearLog } = useDevice();
  const [state, setState] = useState<WizardState>(INITIAL_STATE);

  const handleSelectFirmware = useCallback((entry: FirmwareEntry) => {
    setState((prev) => ({ ...prev, selectedFirmware: entry }));
  }, []);

  const handleStep1Complete = useCallback(
    (backedUpStats: string) => {
      log("Advancing to Step 2: Flash Firmware Partition.");
      setState((prev) => ({ ...prev, step: 2, backedUpStats }));
    },
    [log],
  );

  const handleStep2Complete = useCallback(() => {
    log("Advancing to Step 3: Restore Data & Finalize.");
    setState((prev) => ({ ...prev, step: 3 }));
  }, [log]);

  const handleFinish = useCallback(() => {
    log("Flash OS session reset. Ready for another swap.");
    setState(INITIAL_STATE);
    clearLog();
  }, [clearLog, log]);

  return (
    <div className="flashos section-panel">
      <StepHeader currentStep={state.step} />

      {state.step === 1 && (
        <Step1SelectConnect
          selectedFirmware={state.selectedFirmware}
          onSelectFirmware={handleSelectFirmware}
          onComplete={handleStep1Complete}
        />
      )}

      {state.step === 2 && state.selectedFirmware && (
        <Step2Flash firmware={state.selectedFirmware} onComplete={handleStep2Complete} />
      )}

      {state.step === 3 && state.selectedFirmware && state.backedUpStats !== null && (
        <Step3Restore firmware={state.selectedFirmware} backedUpStats={state.backedUpStats} onFinish={handleFinish} />
      )}
    </div>
  );
}
