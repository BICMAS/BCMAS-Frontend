import { sleep } from "@/lib/utils";

export type MockAuthResult =
  | { status: "success"; redirectTo: string; message?: string }
  | { status: "mfa_required"; redirectTo: string; message?: string }
  | { status: "locked"; redirectTo: string; message: string }
  | { status: "error"; message: string; redirectTo?: string };

const DEMO_PASSWORD = "Password123!";

/**
 * Mock authentication flows for UI development.
 * Special emails:
 * - locked@example.com → account locked
 * - wrong password → error
 * - any other valid form → MFA then workspaces
 */
export async function mockSignIn(input: {
  email: string;
  password: string;
}): Promise<MockAuthResult> {
  await sleep(900);

  const email = input.email.trim().toLowerCase();

  if (email === "locked@example.com") {
    return {
      status: "locked",
      redirectTo: "/account-locked",
      message: "Account locked after multiple failed attempts.",
    };
  }

  if (input.password !== DEMO_PASSWORD) {
    return {
      status: "error",
      message: "Invalid email or password. Demo password: Password123!",
    };
  }

  return {
    status: "mfa_required",
    redirectTo: "/mfa",
    message: "Additional verification required.",
  };
}

export async function mockMicrosoftSignIn(): Promise<MockAuthResult> {
  await sleep(700);
  return {
    status: "mfa_required",
    redirectTo: "/mfa",
    message: "Microsoft SSO succeeded. Complete MFA to continue.",
  };
}

export async function mockForgotPassword(email: string): Promise<MockAuthResult> {
  await sleep(800);
  return {
    status: "success",
    redirectTo: "/forgot-password",
    message: `If an account exists for ${email}, you will receive a reset link shortly.`,
  };
}

export async function mockResetPassword(): Promise<MockAuthResult> {
  await sleep(900);
  return {
    status: "success",
    redirectTo: "/login",
    message: "Password updated. You can sign in with your new password.",
  };
}

export async function mockVerifyMfa(code: string): Promise<MockAuthResult> {
  await sleep(800);

  if (code !== "123456") {
    return {
      status: "error",
      message: "Invalid authentication code. Demo code: 123456",
    };
  }

  return {
    status: "success",
    redirectTo: "/workspaces",
    message: "Verification successful.",
  };
}

export async function mockResendMfaCode(): Promise<MockAuthResult> {
  await sleep(600);
  return {
    status: "success",
    redirectTo: "/mfa",
    message: "A new code has been sent to your authenticator app.",
  };
}

export async function mockActivateAccount(): Promise<MockAuthResult> {
  await sleep(1000);
  return {
    status: "success",
    redirectTo: "/workspaces",
    message: "Account activated. Select a workspace to continue.",
  };
}

export async function mockAcceptInvite(): Promise<MockAuthResult> {
  await sleep(700);
  return {
    status: "success",
    redirectTo: "/activate",
    message: "Invitation accepted. Complete your profile.",
  };
}

export async function mockDeclineInvite(): Promise<MockAuthResult> {
  await sleep(500);
  return {
    status: "success",
    redirectTo: "/login",
    message: "Invitation declined.",
  };
}

export async function mockSelectWorkspace(workspaceId: string): Promise<MockAuthResult> {
  await sleep(600);

  if (workspaceId === "denied") {
    return {
      status: "error",
      message: "You do not have access to this workspace.",
    };
  }

  const destinations: Record<string, string> = {
    gec: "/org",
    ths: "/manager",
    bicmas: "/platform",
  };

  return {
    status: "success",
    redirectTo: destinations[workspaceId] ?? "/org",
    message: "Workspace selected.",
  };
}

export const mockWorkspaces = [
  {
    id: "gec",
    initials: "GE",
    name: "Global Enterprise Corp",
    role: "Super Administrator",
    meta: "124 active roles",
    active: true,
  },
  {
    id: "ths",
    initials: "TH",
    name: "TechHub Solutions",
    role: "Department Manager",
    meta: "42 active roles",
    active: false,
  },
  {
    id: "bicmas",
    initials: "BI",
    name: "BICMAS Internal",
    role: "Platform Admin",
    meta: "8 active roles",
    active: false,
  },
] as const;

export const DEMO_AUTH_HINT =
  "Demo: use any email with password Password123! then MFA code 123456. locked@example.com triggers lockout.";
