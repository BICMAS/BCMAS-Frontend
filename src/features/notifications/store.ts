"use client";

import { create } from "zustand";

import { mockNotifications } from "@/features/notifications/data/mock-notifications";
import type { AppNotification } from "@/features/notifications/types";

type NotificationsState = {
  items: AppNotification[];
  markRead: (id: string) => void;
  markAllRead: () => void;
  dismiss: (id: string) => void;
  unreadCount: () => number;
};

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  items: mockNotifications,
  markRead: (id) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id ? { ...item, read: true } : item,
      ),
    })),
  markAllRead: () =>
    set((state) => ({
      items: state.items.map((item) => ({ ...item, read: true })),
    })),
  dismiss: (id) =>
    set((state) => ({
      items: state.items.filter((item) => item.id !== id),
    })),
  unreadCount: () => get().items.filter((item) => !item.read).length,
}));
