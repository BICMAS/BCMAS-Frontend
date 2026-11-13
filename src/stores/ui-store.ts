import { create } from "zustand";

type UiState = {
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  setMobileNavOpen: (open: boolean) => void;
};

/**
 * Shared client UI chrome state (sidebar / mobile drawer).
 * Feature data should live in server fetchers / React Query later — not here.
 */
export const useUiStore = create<UiState>((set) => ({
  sidebarCollapsed: false,
  mobileNavOpen: false,
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setMobileNavOpen: (open) => set({ mobileNavOpen: open }),
}));
