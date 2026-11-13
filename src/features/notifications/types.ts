export type NotificationTone = "success" | "info" | "neutral";

export type AppNotification = {
  id: string;
  title: string;
  body: string;
  relativeTime: string;
  tone: NotificationTone;
  read: boolean;
  section: "new" | "earlier";
  primaryAction?: { label: string; href: string };
  secondaryActionLabel?: string;
  icon: "assessment" | "evidence" | "learning" | "system";
};
