"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import { useState, type ReactNode } from "react";
import { MutationFeedbackBanner } from "@/components/shell/mutation-feedback-banner";

export interface AppProvidersProps {
  children: ReactNode;
  className?: string;
}

export function AppProviders({ children }: AppProvidersProps) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 10_000, retry: 1 },
        },
      }),
  );

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <SessionProvider>
        <QueryClientProvider client={client}>
          {children}
          {/* Save results show here, inline on the screen. There are no toasts. */}
          <div className="pointer-events-none fixed inset-x-0 top-0 z-50 mx-auto max-w-md px-5 pt-3">
            <MutationFeedbackBanner className="pointer-events-auto bg-[var(--orbit-paper)] py-2" />
          </div>
        </QueryClientProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}
