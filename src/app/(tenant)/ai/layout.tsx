import type { ReactNode } from "react";

import { AiClientProvider } from "@/features/ai";

/** AI screens share one AI client (live via the /api/ai BFF, or the isolated dev mock) and the verified identity. */
export default function AiLayout({ children }: { children: ReactNode }) {
  return <AiClientProvider>{children}</AiClientProvider>;
}
