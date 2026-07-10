import { Fragment } from "react";
import type { WizardStep } from "../types";
import "./StepHeader.css";

const STEPS: { id: WizardStep; label: string }[] = [
  { id: 1, label: "Choose Firmware & Connect" },
  { id: 2, label: "Flash Firmware Partition" },
  { id: 3, label: "Restore Data & Finalize" },
];

interface StepHeaderProps {
  currentStep: WizardStep;
}

export function StepHeader({ currentStep }: StepHeaderProps) {
  return (
    <div className="step-header">
      {STEPS.map((step, index) => {
        const state = step.id === currentStep ? "active" : step.id < currentStep ? "done" : "pending";
        return (
          <Fragment key={step.id}>
            <div className={`step-header__item step-header__item--${state}`}>
              <span className="step-header__badge">{step.id < currentStep ? "✓" : step.id}</span>
              <span className="step-header__label">{step.label}</span>
            </div>
            {index < STEPS.length - 1 && <div className="step-header__connector" />}
          </Fragment>
        );
      })}
    </div>
  );
}
