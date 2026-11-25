"use client";

import { useSyncExternalStore } from "react";

import { accountsRevision, subscribeAccounts } from "./services/accounts";

/** -1 on the server: accounts live in browser storage, so they are listed after hydration. */
export function useAccountsRevision() {
  return useSyncExternalStore(subscribeAccounts, accountsRevision, () => -1);
}
