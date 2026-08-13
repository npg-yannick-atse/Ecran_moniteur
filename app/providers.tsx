"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useState, type ReactNode } from "react"

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Stale-while-revalidate : pas de spinner sur les rafraîchissements
            staleTime: 5_000,
            refetchOnWindowFocus: true,
            refetchIntervalInBackground: false,
            retry: 2,
            retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 30_000),
          },
        },
      })
  )

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
