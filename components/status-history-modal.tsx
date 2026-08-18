"use client"

/**
 * Historique des statuts utilisateur d'un OF, ouvert au clic sur la pastille
 * de statut de l'entête.
 *
 * Aucune requête : tout vient de `of.statusHistoryPF`, déjà présent dans la
 * réponse du dashboard. Chaque période porte sa durée, son auteur et son
 * commentaire — le même jeu de données que les bandes colorées du timeline,
 * présenté ici en liste chronologique.
 */

import { useEffect } from "react"
import { X } from "lucide-react"
import { cn, contrastText, formatDureeMinutes, formatOf } from "@/lib/utils"
import type { OfRow } from "@/lib/types"

interface Props {
  of: OfRow
  onClose: () => void
}

/** "13/08/2026 10:17:32" — seconde incluse, deux bascules peuvent se suivre. */
function dateComplete(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

export function StatusHistoryModal({ of, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = ""
    }
  }, [onClose])

  const periodes = of.statusHistoryPF
  const total = periodes.reduce((s, p) => s + p.durationMin, 0)

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[85vh] w-[min(95vw,720px)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 bg-wms-bg px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-wms-dark">
              Historique des statuts — OF {formatOf(of.of)}
            </h2>
            <p className="mt-0.5 text-sm text-slate-600">
              {periodes.length} changement{periodes.length > 1 ? "s" : ""} ·{" "}
              {formatDureeMinutes(total)} au total
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-white hover:text-slate-900"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto px-6 py-5">
          {periodes.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 py-6 text-center text-sm text-slate-400">
              Aucun changement de statut enregistré
            </div>
          ) : (
            <ol className="space-y-2">
              {periodes.map((p, i) => {
                const enCours = p.end == null
                return (
                  <li
                    key={`${p.code}-${p.start}-${i}`}
                    className={cn(
                      "rounded-lg border px-4 py-3",
                      enCours
                        ? "border-slate-300 bg-slate-50 ring-2 ring-wms-lighter"
                        : "border-slate-200"
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span
                        className="rounded-full px-3 py-1 text-sm font-bold uppercase tracking-wide"
                        style={{
                          background: p.color,
                          color: contrastText(p.color),
                        }}
                      >
                        {p.designation}
                      </span>
                      <span className="text-base font-bold tabular-nums text-slate-700">
                        {formatDureeMinutes(p.durationMin)}
                        {enCours && (
                          <span className="ml-2 text-xs font-semibold uppercase text-wms">
                            en cours
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
                      <span>{dateComplete(p.start)}</span>
                      <span className="font-semibold text-slate-700">
                        {p.createdBy || "—"}
                      </span>
                      <span className="italic text-slate-500">
                        {p.commentaire || "—"}
                      </span>
                      {p.consoSegment != null && (
                        <span className="font-semibold text-emerald-700">
                          ⚡ {p.consoSegment >= 0 ? "+" : ""}
                          {p.consoSegment.toLocaleString("fr-FR", {
                            minimumFractionDigits: 1,
                            maximumFractionDigits: 1,
                          })}{" "}
                          kWh
                        </span>
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </div>

        <div className="border-t border-slate-200 bg-slate-50 px-6 py-3 text-right text-xs text-slate-500">
          Échap pour fermer
        </div>
      </div>
    </div>
  )
}
