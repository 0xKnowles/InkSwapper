import { useEffect, useRef } from "react";
import type { LogLine } from "../types";
import "./Terminal.css";

interface TerminalProps {
  lines: LogLine[];
}

const LEVEL_PREFIX: Record<LogLine["level"], string> = {
  info: " ",
  success: "+",
  warn: "!",
  error: "x",
  command: ">",
};

export function Terminal({ lines }: TerminalProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [lines]);

  return (
    <div className="terminal">
      <div className="terminal__titlebar">
        <span className="terminal__dot" />
        <span className="terminal__dot" />
        <span className="terminal__dot" />
        <span className="terminal__title">console — CrossSwap serial link</span>
      </div>
      <div className="terminal__body" ref={scrollRef}>
        {lines.length === 0 ? (
          <div className="terminal__line terminal__line--info">
            <span className="terminal__gutter">[--:--:--]</span>
            <span className="terminal__message">Awaiting first action…</span>
          </div>
        ) : (
          lines.map((line) => (
            <div key={line.id} className={`terminal__line terminal__line--${line.level}`}>
              <span className="terminal__gutter">[{line.timestamp}]</span>
              <span className="terminal__prefix">{LEVEL_PREFIX[line.level]}</span>
              <span className="terminal__message">{line.message}</span>
            </div>
          ))
        )}
        <div className="terminal__cursor" aria-hidden="true">
          ▌
        </div>
      </div>
    </div>
  );
}
