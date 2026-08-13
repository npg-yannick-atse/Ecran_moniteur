"use client"

import { useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { Loader2, X } from "lucide-react"
import { api } from "@/lib/api"
import { formatDateTimeFr, formatOf } from "@/lib/utils"
import type { OfRow, SfInfo } from "@/lib/types"
import { StatusPill } from "./status-pill"
import { ComposantsSection } from "./composants-modal"

interface Props {
  of: OfRow
  onClose: () => void
}

export function SfModal({ of, onClose }: Props) {
  const sf: SfInfo = of.sf

  // Composants du SF : on interroge l'API avec le code du PF — le service
  // résout le SF via of_secondary et renvoie les deux listes (PF + SF) ; on
  // filtre côté UI pour ne garder que ceux tagués "SF".
  const { data: composantsData, isLoading: composantsLoading } = useQuery({
    queryKey: ["composants", of.of],
    queryFn: ({ signal }) => api.composants(of.of, signal),
    refetchInterval: 15_000,
    enabled: !!sf.of,
  })
  const sfItems =
    composantsData?.composants.filter((c) => c.source === "SF") ?? []

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

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[90vh] w-[min(95vw,1280px)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-wms-bg px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-wms-dark">
              Semi-fini — {formatOf(sf.of)}
            </h2>
            <p className="mt-0.5 text-xs text-slate-600">
              Lié au PF{" "}
              <b className="font-mono text-wms-light">OF {formatOf(of.of)}</b>
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

        {/* Body */}
        <div className="flex-1 space-y-5 overflow-auto px-6 py-5">
          {/* Statuts */}
          <section>
            <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Statuts
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={sf.statusUtil} />
              <StatusPill status={sf.statusProd} prefix="Prod" />
              <StatusPill status={sf.statusLog} prefix="Log" />
            </div>
          </section>

          {/* Grille infos — conservée uniquement Date Demande Composant */}
          <section className="grid grid-cols-1 gap-3">
            <Info
              label="Date Demande Composant"
              value={formatDateTimeFr(sf.dateDemandeComposant)}
            />
          </section>

          {/* Composants du SF */}
          <section>
            <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Composants du semi-fini
            </h3>
            {composantsLoading && !composantsData ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-wms" />
                <span className="ml-3 text-xs text-slate-500">Chargement…</span>
              </div>
            ) : (
              <ComposantsSection
                items={sfItems}
                emptyText={
                  sf.of
                    ? "Aucun composant sur le SF"
                    : "Aucun SF associé à ce PF"
                }
              />
            )}
          </section>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 bg-slate-50 px-6 py-3 text-right text-[11px] text-slate-500">
          Échap pour fermer
        </div>
      </div>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-slate-800">{value}</div>
    </div>
  )
}
