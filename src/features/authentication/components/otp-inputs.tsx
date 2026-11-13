"use client";

import {
  useCallback,
  useRef,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type OtpInputsProps = {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  disabled?: boolean;
  error?: boolean;
  className?: string;
};

/**
 * Six-digit OTP boxes with paste / backspace / arrow support.
 */
export function OtpInputs({
  value,
  onChange,
  length = 6,
  disabled,
  error,
  className,
}: OtpInputsProps) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? "");

  const focusAt = useCallback((index: number) => {
    refs.current[index]?.focus();
    refs.current[index]?.select();
  }, []);

  const setDigit = useCallback(
    (index: number, char: string) => {
      const next = digits.map((d, i) => (i === index ? char : d));
      onChange(next.join("").slice(0, length));
    },
    [digits, length, onChange],
  );

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const pasted = event.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, length);
    if (!pasted) return;
    onChange(pasted.padEnd(value.length, "").slice(0, length) || pasted);
    focusAt(Math.min(pasted.length, length - 1));
  };

  const handleKeyDown = (
    index: number,
    event: KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key === "Backspace") {
      event.preventDefault();
      if (digits[index]) {
        setDigit(index, "");
      } else if (index > 0) {
        setDigit(index - 1, "");
        focusAt(index - 1);
      }
      return;
    }
    if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      focusAt(index - 1);
    }
    if (event.key === "ArrowRight" && index < length - 1) {
      event.preventDefault();
      focusAt(index + 1);
    }
  };

  return (
    <div
      className={cn("flex justify-between gap-2", className)}
      role="group"
      aria-label="One-time passcode"
    >
      {digits.map((digit, index) => (
        <Input
          key={index}
          ref={(el) => {
            refs.current[index] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          maxLength={1}
          disabled={disabled}
          value={digit}
          aria-invalid={error || undefined}
          aria-label={`Digit ${index + 1}`}
          className={cn(
            "h-14 w-12 px-0 text-center text-xl font-bold",
            digit && "border-2 border-navy bg-white shadow-inner",
          )}
          onChange={(e) => {
            const char = e.target.value.replace(/\D/g, "").slice(-1);
            setDigit(index, char);
            if (char && index < length - 1) focusAt(index + 1);
          }}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
        />
      ))}
    </div>
  );
}
