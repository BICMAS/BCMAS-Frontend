import type { MockUser } from "@/types/user";

/**
 * The signed-in person as the BCMS backend describes them, in the shape the app's screens use.
 * Safe for the browser: it never holds the access token.
 */
export type SessionUser = MockUser & {
  organisationName: string;
};
