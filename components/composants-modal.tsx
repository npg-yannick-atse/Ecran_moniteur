"use client"

import { useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { Loader2, X, CheckCircle2, Circle } from "lucide-react"
import { api } from "@/lib/api"
import { cn, formatNumber } from "@/lib/utils"
import type { OfComposant, StatusBadge } from "@/lib/types"
import { StatusPill } from "./status-pill"

interface Props {
  ofCode: string
  /** Statut logistique de l'OF — déplacé ici depuis l'entête : il porte sur la
   *  réception des composants, c'est donc sa place naturelle. */
  statusLogistique?: StatusBadge
  onClose: () => void
}

export function ComposantsModal({ ofCode, statusLogistique, onClose }: Props) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["composants", ofCode],
    queryFn: ({ signal }) => api.composants(ofCode, signal),
    refetchInterval: 15_000,
  })

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

  const pfItems = data?.composants.filter((c) => c.source === "PF") ?? []
  const nbPfRecep = pfItems.filter((c) => c.receptionne).length

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[85vh] w-[min(95vw,1280px)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-wms-bg px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-wms-dark">
              Composants PF — OF {ofCode}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {statusLogistique?.label && (
                <StatusPill status={statusLogistique} prefix="Log" />
              )}
              {data && (
                <span className="text-sm text-slate-600">
                  {nbPfRecep} / {pfItems.length} réceptionnés
                </span>
              )}
            </div>
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
        <div className="flex-1 overflow-auto px-6 py-5">
          {isLoading && (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-wms" />
              <span className="ml-3 text-slate-600">Chargement…</span>
            </div>
          )}

          {isError && (
            <div className="rounded-lg border border-rose-300 bg-rose-50 p-4 text-rose-700">
              <p className="font-semibold">Erreur</p>
              <p className="mt-1 text-sm">{(error as Error).message}</p>
            </div>
          )}

          {data && (
            <ComposantsSection
              items={pfItems}
              emptyText="Aucun composant sur le PF"
            />
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 bg-slate-50 px-6 py-3 text-right text-[11px] text-slate-500">
          Échap pour fermer
        </div>
      </div>
    </div>
  )
}

export function ComposantsSection({
  items,
  emptyText,
}: {
  items: OfComposant[]
  emptyText?: string
}) {
  return (
    <section>
      {items.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 py-4 text-center text-xs text-slate-400">
          {emptyText ?? "—"}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[1150px] text-left text-xs">
            <thead className="bg-slate-100 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
              <tr>
                <th className="w-10 px-3 py-2">
                  <span className="sr-only">Réception</span>
                </th>
                <th className="px-3 py-2">Article</th>
                <th className="px-3 py-2">Désignation</th>
                <th className="px-3 py-2 text-right">Qté requise</th>
                <th className="px-3 py-2 text-right">Reçue</th>
                <th
                  className="px-3 py-2 text-right"
                  title="Pas encore arrivé sur la ligne (requise − réceptionnée)"
                >
                  Reste magasin
                </th>
                <th
                  className="px-3 py-2 text-right"
                  title="Pas encore servi par le magasin (requise − préparée)"
                >
                  En attente magasin
                </th>
                <th
                  className="px-3 py-2 text-right"
                  title="Reste en zone tampon (of_item.qte_restant_zone)"
                >
                  Reste zone tampon
                </th>
                <th
                  className="px-3 py-2 text-right"
                  title="Servi par le magasin mais pas encore entré en zone tampon (préparée − réceptionnée)"
                >
                  En attente zone
                </th>
                <th className="px-3 py-2 text-right">Reste conditionnement</th>
                <th className="px-3 py-2">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((c, i) => (
                <tr
                  key={`${c.codeArticle}-${c.batch ?? ""}-${i}`}
                  className={cn(
                    "transition-colors hover:bg-slate-50",
                    c.isBC
                      ? "bg-orange-50/60"
                      : c.receptionne
                        ? "bg-emerald-50/30"
                        : ""
                  )}
                >
                  <td className="px-3 py-2">
                    {c.receptionne ? (
                      <CheckCircle2
                        className="h-4 w-4 text-emerald-500"
                        aria-label="Réceptionné"
                      />
                    ) : (
                      <Circle
                        className="h-4 w-4 text-slate-300"
                        aria-label="Non réceptionné"
                      />
                    )}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 font-mono font-semibold",
                      c.isBC ? "text-orange-700" : "text-slate-800"
                    )}
                  >
                    {c.isBC && (
                      <span className="mr-1.5 inline-block rounded bg-orange-500 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                        BC
                      </span>
                    )}
                    {c.codeArticle}
                  </td>
                  <td className="px-3 py-2 text-slate-700">{c.designation}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-800">
                    {formatNumber(c.qteRequise ?? c.quantite)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                    {c.qteReceptionnee != null
                      ? formatNumber(c.qteReceptionnee)
                      : "—"}
                  </td>
                  <ResteCell value={c.resteMagasin} emplacement={c.magasin} />
                  <ResteCell value={c.enAttenteMagasin} />
                  <ResteCell
                    value={c.resteZoneTampon}
                    emplacement={c.zoneTampon}
                  />
                  <ResteCell value={c.enAttenteZone} />
                  <ResteCell value={c.resteConditionnement} />
                  <td className="px-3 py-2">
                    {c.status.label ? (
                      <span
                        className="inline-block rounded px-2 py-0.5 text-[10px] font-semibold text-white"
                        style={{ backgroundColor: c.status.color }}
                      >
                        {c.status.label}
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

/**
 * Cellule "Reste …" : la valeur en gras ambre quand il reste du stock à cet
 * endroit, grisée quand c'est à 0 (rien à aller chercher). Le code
 * d'emplacement (magasin / zone tampon) est affiché en dessous quand il existe.
 */
function ResteCell({
  value,
  emplacement,
}: {
  value: number | null
  emplacement?: string | null
}) {
  const empty = value == null || value <= 0
  return (
    <td className="px-3 py-2 text-right">
      <div
        className={cn(
          "tabular-nums",
          empty ? "text-slate-400" : "font-semibold text-amber-700"
        )}
      >
        {value != null ? formatNumber(value) : "—"}
      </div>
      {emplacement && (
        <div className="mt-0.5 text-[9px] font-medium uppercase tracking-wide text-slate-400">
          {emplacement}
        </div>
      )}
    </td>
  )
}
