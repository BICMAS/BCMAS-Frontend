import { checkPassword, LOCK_MINUTES, MAX_ATTEMPTS, signInWithCompany } from "@/features/accounts/services/accounts";
import { listTenants } from "@/features/platform/services/mock-platform";
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
 * - an email with an account → that person's own password (the demo one until they change it)
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

  const check = await checkPassword(email, input.password);
  if (check === "locked") {
    return {
      status: "locked",
      redirectTo: "/account-locked",
      message: `Account locked for ${LOCK_MINUTES} minutes after ${MAX_ATTEMPTS} failed attempts.`,
    };
  }
  if (check === "wrong" || (check === "unknown" && input.password !== DEMO_PASSWORD)) {
    return { status: "error", message: "Invalid email or password." };
  }

  return {
    status: "mfa_required",
    redirectTo: "/mfa",
    message: "Additional verification required.",
  };
}

/** Sample data: the email typed on the sign-in page stands in for the Microsoft account. */
export async function mockMicrosoftSignIn(email = ""): Promise<MockAuthResult> {
  await sleep(700);
  if (signInWithCompany(email) === "refused") {
    return { status: "error", message: "Company sign-in is not available for this account." };
  }
  return {
    status: "mfa_required",
    redirectTo: "/mfa",
    message: "Microsoft SSO succeeded. Complete MFA to continue.",
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

export type ProvisionedWorkspace = {
  id: string;
  initials: string;
  name: string;
  role: string;
  meta: string;
  /** Provisioning has finished, so the first admin can enter. */
  ready: boolean;
  adminUserId: string;
};

/**
 * Tenants created on the New Tenant Provisioning page, offered to their first admin.
 * Sample data: the backend returns the workspaces the signed-in person belongs to.
 */
export function provisionedWorkspaces(): ProvisionedWorkspace[] {
  return listTenants()
    .filter((tenant) => tenant.adminUserId)
    .map((tenant) => ({
      id: tenant.organisationId,
      initials: tenant.code.slice(0, 2),
      name: tenant.name,
      role: "HR Admin",
      meta: tenant.status === "Active" ? `${tenant.plan} · new tenant` : tenant.status === "Awaiting Admin" ? "Awaiting account activation" : "Provisioning…",
      ready: tenant.status === "Active",
      adminUserId: tenant.adminUserId!,
    }));
}
