import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getMockUser } from "@/config/mock-users";
import { resetProvisionedTenants } from "@/config/provisioned-tenants";
import { ActivateAccountForm } from "@/features/authentication/components/activate-account-form";
import { mockSignIn } from "@/features/authentication/services/mock-auth";
import { FirstAdminDialog } from "@/features/platform/components/first-admin-dialog";
import { listAuditEvents, PLAN_ENTITLEMENTS, provisionTenant, PROVISIONING_SECONDS, resetPlatform, tenantById } from "@/features/platform/services/mock-platform";

import { UserManagementView } from "../components/user-management-view";
import {
  accountById,
  cancelActivationCode,
  changeAccessRole,
  checkPassword,
  CODE_HOURS,
  completeActivation,
  completePasswordReset,
  correctEmail,
  inviteUser,
  listAccountEvents,
  listAccounts,
  newActivationCode,
  platformCanHelp,
  reactivateAccount,
  resetAccounts,
  resetSignIn,
  signedInAccount,
  signInWithCompany,
  startActivation,
  startPasswordReset,
  suspendAccount,
  unlockAccount,
  type SetupMethod,
} from "../services/accounts";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), usePathname: () => "/", useSearchParams: () => new URLSearchParams() }));

const session = vi.hoisted(() => ({ userId: "user-sarah" }));
vi.mock("@/stores/session-store", async () => {
  const { getMockUser: user } = await import("@/config/mock-users");
  const state = () => ({ user: user(session.userId), userId: session.userId });
  return {
    useSessionStore: Object.assign(<T,>(selector: (s: ReturnType<typeof state>) => T) => selector(state()), {
      persist: { onFinishHydration: () => () => {}, hasHydrated: () => true },
      getState: state,
    }),
  };
});

const sarah = getMockUser("user-sarah");
const alex = getMockUser("user-alex");
const PASSWORD = "Str0ng-enough-one!";
const invite = (email = "ada@gec.example") => inviteUser({ organisationId: "org-gec", name: "Ada Obi", email, accessRole: "HRBP" }, sarah);

async function activate(email: string, code: string, password = PASSWORD) {
  const started = await startActivation(email, code);
  if (!started.ok) return started;
  return completeActivation({ email, code, emailCode: started.demoCode, password });
}

const tenant = (setupMethod?: SetupMethod, slug = "acme") =>
  provisionTenant(
    { legalName: "Acme Logistics", slug, plan: "Standard", entitlements: [...PLAN_ENTITLEMENTS.Standard], adminName: "Ngozi Eze", adminEmail: `ngozi@${slug}.example`, setupMethod },
    "Alex Root",
  );

function later(ms: number) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.now() + ms);
}

beforeEach(() => {
  resetPlatform();
  resetProvisionedTenants();
  resetAccounts();
  session.userId = "user-sarah";
  push.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("Activation", () => {
  it("needs the admin's code and the emailed code, then the person's own password works", async () => {
    const setup = await invite();
    expect(setup.code).toMatch(/^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
    expect(accountById(setup.accountId)!.status).toBe("Invited");
    expect(await checkPassword("ada@gec.example", PASSWORD)).toBe("wrong");
    // Typed in lower case without dashes.
    expect(await activate("ADA@gec.example", setup.code!.toLowerCase().replace(/-/g, ""))).toEqual({ ok: true });
    expect(accountById(setup.accountId)!.status).toBe("Active");
    expect(getMockUser(setup.accountId)).toMatchObject({ name: "Ada Obi", portal: "hr_ld_admin", organisationId: "org-gec" });
    expect(await checkPassword("ada@gec.example", PASSWORD)).toBe("ok");
    expect(signedInAccount()!.id).toBe(setup.accountId);
    expect((await mockSignIn({ email: "ada@gec.example", password: "Password123!" })).status).toBe("error");
    // One use.
    expect((await startActivation("ada@gec.example", setup.code!)).ok).toBe(false);
  });

  it("never stores the code or password as text", async () => {
    const setup = await invite();
    await activate("ada@gec.example", setup.code!);
    const stored = JSON.stringify({ ...window.sessionStorage });
    expect(stored).not.toContain(setup.code!);
    expect(stored).not.toContain(setup.code!.replace(/-/g, ""));
    expect(stored).not.toContain(PASSWORD);
  });

  it("gives the same answer for a wrong email, a wrong code and an expired code", async () => {
    const setup = await invite();
    const messages = [await startActivation("nobody@x.example", setup.code!), await startActivation("ada@gec.example", "AAAA-AAAA-AAAA")];
    later(CODE_HOURS * 3_600_000 + 1000);
    messages.push(await startActivation("ada@gec.example", setup.code!));
    expect(new Set(messages.map((m) => (m.ok ? "ok" : m.message))).size).toBe(1);
    expect(messages[0]!.ok).toBe(false);
    expect(accountById(setup.accountId)!.status).toBe("Code expired");
  });

  it("cancels a code after five wrong attempts, even when they arrive together", async () => {
    const setup = await invite();
    await Promise.all(Array.from({ length: 5 }, () => startActivation("ada@gec.example", "AAAA-AAAA-AAAA")));
    expect((await startActivation("ada@gec.example", setup.code!)).ok).toBe(false);
    expect(listAccountEvents("org-gec")[0]!.summary).toMatch(/cancelled for Ada Obi/);
  });

  it("cancels the emailed code after five wrong attempts and after ten minutes", async () => {
    const setup = await invite();
    const started = await startActivation("ada@gec.example", setup.code!);
    if (!started.ok) throw new Error("not started");
    const wrong = started.demoCode === "000000" ? "111111" : "000000";
    const input = { email: "ada@gec.example", code: setup.code!, password: PASSWORD };
    for (let i = 0; i < 5; i += 1) expect((await completeActivation({ ...input, emailCode: wrong })).ok).toBe(false);
    expect((await completeActivation({ ...input, emailCode: started.demoCode })).ok).toBe(false);
    const again = await startActivation("ada@gec.example", setup.code!);
    if (!again.ok) throw new Error("not started");
    later(10 * 60_000 + 1000);
    expect((await completeActivation({ ...input, emailCode: again.demoCode })).ok).toBe(false);
  });

  it("replaces or cancels the old code, and correcting the email does too", async () => {
    const first = await invite();
    const second = await newActivationCode(first.accountId, sarah);
    expect((await startActivation("ada@gec.example", first.code!)).ok).toBe(false);
    expect((await startActivation("ada@gec.example", second.code!)).ok).toBe(true);
    const third = await correctEmail(first.accountId, "ada.obi@gec.example", sarah);
    expect((await startActivation("ada@gec.example", second.code!)).ok).toBe(false);
    expect((await startActivation("ada.obi@gec.example", third.code!)).ok).toBe(true);
    await cancelActivationCode(first.accountId, sarah);
    expect((await startActivation("ada.obi@gec.example", third.code!)).ok).toBe(false);
  });
});

describe("Who can do what", () => {
  it("only the tenant's own Organisation Admin manages its accounts", async () => {
    for (const id of ["user-priya", "user-michael", "user-james", "user-alex"]) {
      await expect(inviteUser({ organisationId: "org-gec", name: "X Y", email: "x@y.example", accessRole: "Employee" }, getMockUser(id))).rejects.toThrow(/Only an Organisation Admin/);
      await expect(suspendAccount("user-james", getMockUser(id))).rejects.toThrow(/cannot manage/);
    }
    const other = { ...sarah, id: "other", organisationId: "org-ths" };
    await expect(resetSignIn("user-james", other)).rejects.toThrow(/cannot manage/);
    await expect(changeAccessRole("user-james", "HRBP", other)).rejects.toThrow(/cannot manage/);
  });

  it("keeps the last working admin and blocks changes to your own account", async () => {
    await expect(suspendAccount("user-sarah", sarah)).rejects.toThrow(/your own account/);
    const second = await inviteUser({ organisationId: "org-gec", name: "Bola Ade", email: "bola@gec.example", accessRole: "Organisation Admin" }, sarah);
    const bola = { ...sarah, id: second.accountId, name: "Bola Ade" };
    // Not activated yet, so Sarah is still the last working admin.
    await expect(suspendAccount("user-sarah", bola)).rejects.toThrow(/last working/);
    await expect(changeAccessRole("user-sarah", "Employee", bola)).rejects.toThrow(/last working/);
    await expect(resetSignIn("user-sarah", bola)).rejects.toThrow(/last working/);
    await activate("bola@gec.example", second.code!);
    await suspendAccount("user-sarah", bola);
    expect(accountById("user-sarah")!.status).toBe("Suspended");
  });

  it("refuses duplicate emails without revealing other customers' accounts", async () => {
    await expect(invite("James.Miller@gec.example")).rejects.toThrow(/already has an account here/);
    await tenant();
    await expect(invite("ngozi@acme.example")).rejects.toThrow("That email cannot be used. Contact BICMAS support.");
    await invite();
    await expect(
      provisionTenant({ legalName: "Beta", slug: "beta", plan: "Standard", entitlements: ["Reports"], adminName: "A B", adminEmail: "ada@gec.example" }, "Alex Root"),
    ).rejects.toThrow(/already has a BICMAS account/);
  });
});

describe("Account changes", () => {
  it("stops a suspended person signing in, and lets them back after reactivation", async () => {
    await suspendAccount("user-james", sarah);
    expect((await mockSignIn({ email: "james.miller@gec.example", password: "Password123!" })).status).toBe("error");
    await reactivateAccount("user-james", sarah);
    expect((await mockSignIn({ email: "james.miller@gec.example", password: "Password123!" })).status).toBe("mfa_required");
  });

  it("locks after five wrong passwords, and an admin can unlock", async () => {
    for (let i = 0; i < 4; i += 1) expect(await checkPassword("james.miller@gec.example", "nope")).toBe("wrong");
    expect(await checkPassword("james.miller@gec.example", "nope")).toBe("locked");
    expect(await checkPassword("james.miller@gec.example", "Password123!")).toBe("locked");
    expect(accountById("user-james")!.status).toBe("Locked");
    await unlockAccount("user-james", sarah);
    expect(await checkPassword("james.miller@gec.example", "Password123!")).toBe("ok");
  });

  it("ends access on reset until the person activates again", async () => {
    const setup = await resetSignIn("user-james", sarah);
    expect(accountById("user-james")!.status).toBe("Reset pending");
    expect(await checkPassword("james.miller@gec.example", "Password123!")).toBe("wrong");
    expect(await activate("james.miller@gec.example", setup.code!)).toEqual({ ok: true });
    expect(await checkPassword("james.miller@gec.example", "Password123!")).toBe("wrong");
    expect(await checkPassword("james.miller@gec.example", PASSWORD)).toBe("ok");
  });

  it("resets a forgotten password with an emailed code and MFA, and unlocks", async () => {
    expect(await startPasswordReset("nobody@x.example")).toEqual({ demoCode: null });
    for (let i = 0; i < 5; i += 1) await checkPassword("james.miller@gec.example", "nope");
    const { demoCode } = await startPasswordReset("james.miller@gec.example");
    const input = { email: "james.miller@gec.example", emailCode: demoCode!, password: PASSWORD };
    expect((await completePasswordReset({ ...input, mfaCode: "000000" })).ok).toBe(false);
    expect((await completePasswordReset({ ...input, mfaCode: "123456" })).ok).toBe(true);
    expect(await checkPassword("james.miller@gec.example", PASSWORD)).toBe("ok");
    expect((await completePasswordReset({ ...input, mfaCode: "123456" })).ok).toBe(false);
  });

  it("records every change, never a code", async () => {
    const setup = await invite();
    await changeAccessRole("user-james", "Line Manager", sarah);
    const text = listAccountEvents("org-gec").map((e) => e.summary).join("\n");
    expect(text).toContain("Invited Ada Obi as HRBP");
    expect(text).toContain("Changed James Miller from Employee to Line Manager");
    expect(text).not.toContain(setup.code!);
  });
});

describe("First admin of a tenant", () => {
  it("keeps the tenant waiting until they activate", async () => {
    const record = await tenant();
    expect(record.setup.code).toBeTruthy();
    later((PROVISIONING_SECONDS + 1) * 1000);
    expect(tenantById(record.id)!.status).toBe("Awaiting Admin");
    await activate("ngozi@acme.example", record.setup.code!);
    expect(tenantById(record.id)!.status).toBe("Active");
    expect(JSON.stringify(listAuditEvents())).not.toContain(record.setup.code!);
  });

  it("is helped by the platform only while the tenant has no other working admin", async () => {
    const record = await tenant();
    const id = record.adminUserId!;
    const next = await newActivationCode(id, alex);
    await activate("ngozi@acme.example", next.code!);
    expect(platformCanHelp(id)).toBe(true);
    const ngozi = getMockUser(id);
    const second = await inviteUser({ organisationId: "org-acme", name: "Tunde Ola", email: "tunde@acme.example", accessRole: "Organisation Admin" }, ngozi);
    await activate("tunde@acme.example", second.code!);
    expect(platformCanHelp(id)).toBe(false);
    await expect(resetSignIn(id, alex)).rejects.toThrow(/cannot manage/);
    await expect(newActivationCode(second.accountId, alex)).rejects.toThrow();
  });

  it("uses company sign-in without a code or password when the tenant chose it", async () => {
    const record = await tenant("sso");
    expect(record.setup.code).toBeNull();
    expect(await checkPassword("ngozi@acme.example", "Password123!")).toBe("wrong");
    expect(await startPasswordReset("ngozi@acme.example")).toEqual({ demoCode: null });
    expect(signInWithCompany("ngozi@acme.example")).toBe("ok");
    expect(accountById(record.adminUserId!)!.status).toBe("Active");
    expect(signInWithCompany("james.miller@gec.example")).toBe("refused");
  });

  it("shows the Super Admin a new code once, on request", async () => {
    session.userId = "user-alex";
    const record = await tenant();
    render(<FirstAdminDialog tenant={record} onClose={() => {}} />);
    expect(screen.queryByTestId("activation-code")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "New code" }));
    const code = (await screen.findByTestId("activation-code")).textContent!;
    expect((await startActivation("ngozi@acme.example", code)).ok).toBe(true);
    expect((await startActivation("ngozi@acme.example", record.setup.code!)).ok).toBe(false);
  });
});

describe("Screens", () => {
  it("invites from User Management and shows the code once", async () => {
    const user = userEvent.setup();
    render(<UserManagementView />);
    expect(screen.getByText("Sarah Jenkins (you)")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Actions for Sarah Jenkins" })).toBeNull();
    await user.click(screen.getByRole("button", { name: /Invite user/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByLabelText(/password/i)).toBeNull();
    await user.type(within(dialog).getByLabelText("Full name"), "Ada Obi");
    await user.type(within(dialog).getByLabelText("Work email"), "ada@gec.example");
    await user.selectOptions(within(dialog).getByLabelText("Access role"), "Line Manager");
    await user.click(within(dialog).getByRole("button", { name: "Create account" }));
    expect(await screen.findByTestId("activation-code")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Copy link/ })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByTestId("activation-code")).toBeNull());
    expect(listAccounts("org-gec").find((a) => a.name === "Ada Obi")).toMatchObject({ accessRole: "Line Manager", status: "Invited" });
  });

  it("is closed to other roles", () => {
    session.userId = "user-priya";
    render(<UserManagementView />);
    expect(screen.getByText(/available to the Organisation Admin/)).toBeTruthy();
  });

  it("activates on the Activate Account page", async () => {
    const setup = await invite();
    const user = userEvent.setup();
    render(<ActivateAccountForm />);
    await user.type(screen.getByLabelText("Work Email"), "ada@gec.example");
    await user.type(screen.getByLabelText("Activation code"), setup.code!);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    const code = (await screen.findByRole("note")).textContent!.match(/\d{6}/)![0];
    await user.type(screen.getByLabelText("Code from your email"), code);
    await user.type(screen.getByLabelText("Set Password"), PASSWORD);
    await user.type(screen.getByLabelText("Confirm Password"), PASSWORD);
    await user.click(screen.getByRole("button", { name: "Complete Activation" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/mfa"));
    expect(accountById(setup.accountId)!.status).toBe("Active");
  });
});
