import { CheckCircle2Icon, CircleIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type PasswordStrengthProps = {
  password: string;
};

function scorePassword(password: string) {
  let score = 0;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  if (password.length >= 16 || (/\d/.test(password) && score >= 2)) score += 1;
  return Math.min(score, 4);
}

const requirements = [
  {
    id: "length",
    label: "At least 12 characters long",
    test: (p: string) => p.length >= 12,
  },
  {
    id: "case",
    label: "Contains uppercase & lowercase letters",
    test: (p: string) => /[a-z]/.test(p) && /[A-Z]/.test(p),
  },
  {
    id: "symbol",
    label: "Contains at least one symbol (!@#$%)",
    test: (p: string) => /[^A-Za-z0-9]/.test(p),
  },
] as const;

/**
 * Strength meter + requirement checklist for reset / activate flows.
 */
export function PasswordStrength({ password }: PasswordStrengthProps) {
  const score = scorePassword(password);
  const strengthLabel =
    score <= 1 ? "Weak" : score === 2 ? "Fair" : score === 3 ? "Strong" : "Excellent";

  return (
    <div className="space-y-3">
      <div className="mt-1 space-y-2">
        <div className="flex h-1 gap-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-1 flex-1 rounded-full",
                i < score ? "bg-green-lime" : "bg-slate-200",
              )}
            />
          ))}
        </div>
        {password ? (
          <p className="flex items-center gap-1 text-[10px] font-bold tracking-wider text-green-deep uppercase">
            <CheckCircle2Icon className="size-3" aria-hidden />
            {strengthLabel}
          </p>
        ) : null}
      </div>

      <div className="space-y-2 rounded-lg border border-border-slate bg-slate-50 p-4">
        <p className="mb-1 text-[10px] font-bold tracking-[0.1em] text-slate-400 uppercase">
          Requirements
        </p>
        {requirements.map((req) => {
          const met = req.test(password);
          return (
            <div
              key={req.id}
              className="flex items-center gap-2 text-[11px] text-slate-600"
            >
              {met ? (
                <CheckCircle2Icon
                  className="size-3.5 text-green-deep"
                  aria-hidden
                />
              ) : (
                <CircleIcon className="size-2 text-slate-300" aria-hidden />
              )}
              <span className={cn(met && "text-navy")}>{req.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
