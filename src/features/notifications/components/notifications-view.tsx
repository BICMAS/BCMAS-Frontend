"use client";

import Link from "next/link";
import {
  ClipboardCheckIcon,
  FileCheckIcon,
  GraduationCapIcon,
  LayersIcon,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { useNotificationsStore } from "@/features/notifications/store";
import type { AppNotification } from "@/features/notifications/types";
import { cn } from "@/lib/utils";

const iconMap = {
  assessment: ClipboardCheckIcon,
  evidence: FileCheckIcon,
  learning: GraduationCapIcon,
  system: LayersIcon,
} as const;

const toneBar: Record<AppNotification["tone"], string> = {
  success: "bg-green-lime",
  info: "bg-blue-500",
  neutral: "bg-slate-300",
};

const toneWell: Record<AppNotification["tone"], string> = {
  success: "border-green-100 bg-green-50 text-green-deep",
  info: "border-blue-100 bg-blue-50 text-blue-600",
  neutral: "bg-slate-50 text-slate-400",
};

function NotificationCard({ item }: { item: AppNotification }) {
  const markRead = useNotificationsStore((s) => s.markRead);
  const dismiss = useNotificationsStore((s) => s.dismiss);
  const Icon = iconMap[item.icon];

  return (
    <div
      className={cn(
        "group relative flex items-start gap-6 p-6 transition-all hover:bg-slate-50/50",
        item.section === "earlier" && "opacity-70",
      )}
    >
      {!item.read ? (
        <div
          className={cn(
            "absolute top-0 bottom-0 left-0 w-1",
            toneBar[item.tone],
          )}
        />
      ) : null}
      <div
        className={cn(
          "flex size-12 shrink-0 items-center justify-center rounded-xl border",
          toneWell[item.tone],
        )}
      >
        <Icon className="size-5" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-start justify-between gap-3">
          <h4 className="text-base font-bold text-navy">{item.title}</h4>
          <span className="shrink-0 text-[10px] font-bold text-slate-400 uppercase">
            {item.relativeTime}
          </span>
        </div>
        <p className="mb-4 text-sm leading-relaxed text-slate-500">
          {item.body}
        </p>
        <div className="flex flex-wrap gap-3">
          {item.primaryAction ? (
            <Link
              href={item.primaryAction.href}
              className={cn(buttonVariants({ size: "sm" }), "shadow-md")}
              onClick={() => markRead(item.id)}
            >
              {item.primaryAction.label}
            </Link>
          ) : null}
          {item.secondaryActionLabel ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                dismiss(item.id);
                toast.message("Notification dismissed");
              }}
            >
              {item.secondaryActionLabel}
            </Button>
          ) : null}
          {!item.read && !item.secondaryActionLabel ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                markRead(item.id);
                toast.success("Marked as read");
              }}
            >
              Mark read
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function NotificationsView() {
  const items = useNotificationsStore((s) => s.items);
  const markAllRead = useNotificationsStore((s) => s.markAllRead);
  const unread = items.filter((i) => !i.read).length;
  const newer = items.filter((i) => i.section === "new");
  const earlier = items.filter((i) => i.section === "earlier");

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        title="Notifications"
        description="Stay across assessments, evidence, learning, and organisation updates."
        actions={
          <Button
            type="button"
            variant="secondary"
            disabled={unread === 0}
            onClick={() => {
              markAllRead();
              toast.success("All notifications marked as read");
            }}
          >
            Mark all read
          </Button>
        }
      />

      {items.length === 0 ? (
        <div className="rounded-2xl border border-border-slate bg-white p-10 text-center text-sm text-slate-500">
          You are all caught up. No notifications.
        </div>
      ) : (
        <>
          {newer.length > 0 ? (
            <section className="space-y-4">
              <h3 className="ml-1 text-xs font-bold tracking-wider text-navy uppercase">
                New Notifications
              </h3>
              <div className="divide-y divide-border-slate overflow-hidden rounded-2xl border border-border-slate bg-white shadow-sm">
                {newer.map((item) => (
                  <NotificationCard key={item.id} item={item} />
                ))}
              </div>
            </section>
          ) : null}

          {earlier.length > 0 ? (
            <section className="space-y-4 pt-2">
              <h3 className="ml-1 text-xs font-bold tracking-wider text-navy uppercase opacity-50">
                Earlier Notifications
              </h3>
              <div className="divide-y divide-border-slate overflow-hidden rounded-2xl border border-border-slate bg-white shadow-sm">
                {earlier.map((item) => (
                  <NotificationCard key={item.id} item={item} />
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
