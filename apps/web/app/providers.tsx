"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState, type PropsWithChildren } from "react";

import { isApiError } from "@/lib/api-client";

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          if (isApiError(error) && error.status >= 400 && error.status < 500) return false;
          return failureCount < 2;
        },
      },
    },
  });
}

export function Providers({ children }: PropsWithChildren) {
  const [queryClient] = useState(createQueryClient);
  return <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}><QueryClientProvider client={queryClient}>{children}</QueryClientProvider></ThemeProvider>;
}
