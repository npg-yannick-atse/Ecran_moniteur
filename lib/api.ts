/**
 * Client API typé.
 *
 * Les routes /api/v2/* sont servies par Next.js lui-même (Route Handlers
 * dans app/api/v2/), donc des URLs relatives suffisent. Le frontend et l'API
 * tournent sur le même origin (port 8082) — aucun CORS, aucune env var.
 */

import type {
  ChangeStatusUtilisateurRequest,
  ChangeStatusUtilisateurResponse,
  DashboardResponse,
  OfComposantsResponse,
  ProcessListResponse,
  StatusUtilisateurOption,
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

  /** Statuts utilisateur proposables — relayé depuis service-of */
  statutsUtilisateur: (signal?: AbortSignal) =>
    fetchJson<{ statuts: StatusUtilisateurOption[] }>(
      "/api/v2/status-utilisateur",
      signal
    ),

  /**
   * Change le statut utilisateur d'un OF via service-of.
   * Ne lève pas sur un refus métier : le message de service-of est renvoyé
   * dans `message` avec `ok: false`, pour être affiché tel quel à l'opérateur.
   */
  changerStatutUtilisateur: async (
    of: string,
    corps: ChangeStatusUtilisateurRequest
  ): Promise<ChangeStatusUtilisateurResponse> => {
    const res = await fetch(
      `/api/v2/of/${encodeURIComponent(of)}/status-utilisateur`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(corps),
      }
    )
    const data = await res.json().catch(() => ({}))
    return {
      ok: res.ok && data.ok !== false,
      message: data.message ?? data.error,
      data: data.data,
    }
  },
}
