/**
 * Client API typé.
 *
 * Les routes /api/v2/* sont servies par Next.js lui-même (Route Handlers
 * dans app/api/v2/), donc des URLs relatives suffisent. Le frontend et l'API
 * tournent sur le même origin (port 8082) — aucun CORS, aucune env var.
 */

import type {
  DashboardResponse,
  OfComposantsResponse,
  ProcessListResponse,
} from "./types"

async function fetchJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, {
    signal,
    headers: { Accept: "application/json" },
    cache: "no-store",
  })
  if (!res.ok) {
    throw new Error(`API ${path} → ${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  /** Liste des lignes de production (sélection + KPIs résumés) */
  lignes: (signal?: AbortSignal) =>
    fetchJson<ProcessListResponse>("/api/v2/lignes", signal),

  /** Dashboard complet d'une ligne */
  dashboard: (code: string, signal?: AbortSignal) =>
    fetchJson<DashboardResponse>(
      `/api/v2/lignes/${encodeURIComponent(code)}/dashboard`,
      signal
    ),

  /** Liste détaillée des composants d'un OF (PF + SF associé) */
  composants: (of: string, signal?: AbortSignal) =>
    fetchJson<OfComposantsResponse>(
      `/api/v2/of/${encodeURIComponent(of)}/composants`,
      signal
    ),
}
