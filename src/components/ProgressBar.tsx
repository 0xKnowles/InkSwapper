import "./ProgressBar.css";

interface ProgressBarProps {
  percent: number;
  phase: string;
}

export function ProgressBar({ percent, phase }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="progress">
      <div className="progress__meta">
        <span>{phase}</span>
        <span className="progress__percent">{clamped}%</span>
      </div>
      <div
        className="progress__track"
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="progress__fill" style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}
