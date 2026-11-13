"use client";

import { Loader2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";

type MicrosoftSsoButtonProps = {
  loading?: boolean;
  disabled?: boolean;
  onClick?: () => void;
};

function MicrosoftGlyph() {
  return (
    <svg
      aria-hidden
      className="size-5"
      viewBox="0 0 21 21"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}

/**
 * Microsoft SSO affordance — mock only (no real IdP).
 */
export function MicrosoftSsoButton({
  loading,
  disabled,
  onClick,
}: MicrosoftSsoButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      className="mb-6 h-auto w-full gap-3 py-3 font-semibold"
      disabled={disabled || loading}
      onClick={onClick}
    >
      {loading ? (
        <Loader2Icon className="size-5 animate-spin" />
      ) : (
        <MicrosoftGlyph />
      )}
      <span>Sign in with Microsoft</span>
    </Button>
  );
}
