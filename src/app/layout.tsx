import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { AppProviders } from "@/components/providers/app-providers";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "BICMAS | BCMS",
    template: "%s | BICMAS",
  },
  description:
    "Business Capability Management System — organisational capability, skills, and growth.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full`} suppressHydrationWarning>
      <body
        className="min-h-full flex flex-col font-sans text-navy antialiased"
        suppressHydrationWarning
      >
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
