"use client";

import * as React from "react";
import { ThemeProvider } from "next-themes";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

type AppProvidersProps = {
  children: React.ReactNode;
};

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <TooltipProvider delay={200}>
        {children}
        <Toaster richColors closeButton position="top-right" />
      </TooltipProvider>
    </ThemeProvider>
  );
}
