import { cookies } from "next/headers";

import { bcmsApiConfig, isSameOrigin } from "@/lib/bcms-api";

/** Removes the session cookie. The backend has no sign-out endpoint yet, so its token lives until it expires. */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: { code: "FORBIDDEN", message: "Not allowed." } }, { status: 403 });
  const store = await cookies();
  store.delete(bcmsApiConfig().sessionCookie);
  return new Response(null, { status: 204 });
}
