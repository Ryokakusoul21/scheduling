"use client";

import { useRef } from "react";
import { cn } from "cn";

const LENGTH = 6;

/** Six single-digit boxes: auto-advance, backspace and arrow keys, and paste of a full code. */
export function OtpInput({
  value,
  onChange,
  label,
  invalid,
  disabled,
  describedBy,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  invalid?: boolean;
  disabled?: boolean;
  describedBy?: string;
  autoFocus?: boolean;
}) {
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length: LENGTH }, (_, i) => value[i] ?? "");

  const focus = (i: number) => boxes.current[Math.min(Math.max(i, 0), LENGTH - 1)]?.focus();

  /** Replaces digits from box `from` onward, then moves focus past the last one written. */
  function write(from: number, input: string) {
    const clean = input.replace(/\D/g, "");
    if (!clean) return;
    const next = digits.slice();
    [...clean].slice(0, LENGTH - from).forEach((d, k) => (next[from + k] = d));
    onChange(next.join("").slice(0, LENGTH));
    focus(from + clean.length);
  }

  function onKeyDown(i: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace") {
      e.preventDefault();
      const next = digits.slice();
      if (next[i]) {
        next[i] = "";
      } else if (i > 0) {
        next[i - 1] = "";
        focus(i - 1);
      }
      onChange(next.join(""));
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      focus(e.key === "ArrowLeft" ? i - 1 : i + 1);
    }
  }

  return (
    <div role="group" aria-label={label} aria-describedby={describedBy} className="flex gap-2">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => void (boxes.current[i] = el)}
          value={d}
          disabled={disabled}
          autoFocus={autoFocus && i === 0}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          aria-label={`Digit ${i + 1} of ${LENGTH}`}
          aria-invalid={invalid}
          onChange={(e) => write(i, e.target.value.slice(-1))}
          onKeyDown={(e) => onKeyDown(i, e)}
          onPaste={(e) => {
            e.preventDefault();
            write(0, e.clipboardData.getData("text"));
          }}
          onFocus={(e) => e.target.select()}
          className={cn(
            "size-12 rounded-lg border bg-transparent text-center font-mono text-xl font-semibold outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 motion-reduce:transition-none dark:bg-input/30",
            invalid ? "border-destructive ring-3 ring-destructive/20" : "border-input",
          )}
        />
      ))}
    </div>
  );
}
