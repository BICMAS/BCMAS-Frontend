import { proxyToAi } from "@/lib/ai-bff";

/**
 * Same-origin proxy to the AI service (see src/lib/ai-bff). It reads the request (cookies,
 * headers, body), so it is always dynamic and never cached; SSE responses stream through.
 */
type Context = { params: Promise<{ path: string[] }> };

async function handle(request: Request, context: Context): Promise<Response> {
  const { path } = await context.params;
  return proxyToAi(request, path);
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
