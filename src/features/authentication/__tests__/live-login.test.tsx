import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The session is kept in localStorage, which this test environment lacks.
vi.hoisted(() => {
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v), removeItem: (k: string) => data.delete(k), clear: () => data.clear(), key: () => null, length: 0 },
  });
});

import { useSessionStore } from "@/stores/session-store";

import { LoginForm } from "../components/login-form";

const push = vi.fn();
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), message: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const USER = {
  id: "live-u1",
  name: "Ada Obi",
  email: "ada@acme.example",
  roleLabel: "HRBP",
  portal: "hr_ld_admin",
  jobTitle: "HRBP",
  avatarUrl: "",
  organisationId: "o1",
  organisationName: "Acme Logistics",
  unreadNotifications: 0,
};

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_AUTH_MODE", "live");
  push.mockReset();
  useSessionStore.getState().clearLiveUser();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function signIn(email: string, password: string) {
  const user = userEvent.setup();
  render(<LoginForm />);
  await user.type(screen.getByLabelText("Work Email"), email);
  await user.type(screen.getByLabelText("Password"), password);
  await user.click(screen.getByRole("button", { name: "Sign In" }));
}

describe("Sign-in with the BCMS backend", () => {
  it("signs in, remembers the real person and opens their home page", async () => {
    const api = vi.fn(async () => Response.json({ user: USER }));
    vi.stubGlobal("fetch", api);
    await signIn("ada@acme.example", "Correct-horse-1!");
    await waitFor(() => expect(push).toHaveBeenCalledWith("/roles"));
    const [url, init] = api.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/auth/login");
    expect(JSON.parse(String(init.body))).toEqual({ email: "ada@acme.example", password: "Correct-horse-1!" });
    const session = useSessionStore.getState();
    expect(session.user).toMatchObject({ name: "Ada Obi", portal: "hr_ld_admin" });
    expect(session.organisation.name).toBe("Acme Logistics");
    expect(screen.queryByText(/Password123!/)).toBeNull();
  });

  it("shows the backend's message and stays on the page when sign-in fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: { message: "Invalid email or password" } }, { status: 401 })));
    await signIn("ada@acme.example", "wrong");
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Invalid email or password"));
    expect(push).not.toHaveBeenCalled();
    expect(useSessionStore.getState().liveUser).toBeNull();
  });
});
