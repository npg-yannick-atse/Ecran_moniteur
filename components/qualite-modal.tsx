"use client"

/**
 * Liste des contrôles qualité d'un OF — les entêtes de résultat d'inspection
 * (table entete_resultat_inspect), ouverte au clic sur la carte
 * « Contrôles Qualité / Durée Prod ».
 *
 * Aucune requête : tout vient de `of.qualityEvents`, déjà dans la réponse du
 * dashboard. Le champ quantite_valide n'est pas repris, il vaut 5 sur toutes
 * les lignes de la table.
 */

import { useEffect } from "react"
import { AlertTriangle, FlaskConical, X } from "lucide-react"
import { cn, formatDureeMinutes, formatOf, horsTolerance } from "@/lib/utils"
import type { OfRow } from "@/lib/types"

interface Props {
  of: OfRow
  onClose: () => void
}

const dateComplete = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })

export function QualiteModal({ of, onClose }: Props) {
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

  // Du plus récent au plus ancien : c'est le dernier contrôle qu'on vient voir.
  const controles = [...of.qualityEvents].sort(
    (a, b) => +new Date(b.date) - +new Date(a.date)
  )
  const hors = (c: { poids: number | null }) =>
    horsTolerance(c.poids, of.dosageMin, of.dosageMax)
  const nbHors = controles.filter(hors).length

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[85vh] w-[min(95vw,880px)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 bg-violet-50 px-6 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-violet-900">
              <FlaskConical className="h-5 w-5" />
              Contrôles qualité — OF {formatOf(of.of)}
            </h2>
            <p className="mt-0.5 text-sm text-slate-600">
              {controles.length} contrôle{controles.length > 1 ? "s" : ""} pour{" "}
              {formatDureeMinutes(of.dureeProductionEcouleeMinutes)} de
              production effective
              {of.dosageMin != null && of.dosageMax != null && (
                <>
                  {" · tolérance "}
                  <b className="tabular-nums">
                    {of.dosageMin} – {of.dosageMax}
                  </b>
                </>
              )}
              {nbHors > 0 && (
                <b className="ml-2 rounded bg-rose-100 px-2 py-0.5 text-rose-700">
                  {nbHors} hors tolérance
                </b>
              )}
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
          {controles.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 py-8 text-center text-sm text-slate-400">
              Aucun contrôle qualité enregistré sur cet OF
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[880px] text-left text-sm">
                <thead className="bg-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-700">
                  <tr>
                    <th className="px-3 py-2">Lot contrôle</th>
                    <th className="px-3 py-2 text-right">N° Échantillon</th>
                    <th className="px-3 py-2 text-right">Nombre d'échantillon</th>
                    <th className="px-3 py-2 text-right">Poids</th>
                    <th className="px-3 py-2">Effectué Par</th>
                    <th className="px-3 py-2">Modifié Par</th>
                    <th className="px-3 py-2">Effectué Le</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {controles.map((c) => (
                    <tr
                      key={c.id}
                      className={cn(
                        hors(c) ? "bg-rose-50 hover:bg-rose-100" : "hover:bg-slate-50"
                      )}
                    >
                      <td className="px-3 py-2 font-mono tabular-nums text-slate-700">
                        {c.lotControle || "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                        {c.echantillon ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-bold tabular-nums text-violet-700">
                        {c.nombreEchantillon ?? "—"}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2 text-right font-bold tabular-nums",
                          hors(c) ? "text-rose-700" : "text-slate-800"
                        )}
                        title={
                          hors(c)
                            ? `Hors tolérance : attendu entre ${of.dosageMin} et ${of.dosageMax}`
                            : undefined
                        }
                      >
                        {hors(c) && (
                          <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
                        )}
                        {c.poids ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {c.createdBy || "—"}
                      </td>
                      <td
                        className="px-3 py-2 text-slate-600"
                        title={
                          c.modifiePar
                            ? `Modifié le ${dateComplete(c.modifieLe ?? c.date)}`
                            : undefined
                        }
                      >
                        {c.modifiePar || "—"}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-slate-700">
                        {dateComplete(c.date)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 bg-slate-50 px-6 py-3 text-right text-xs text-slate-500">
          Échap pour fermer
        </div>
      </div>
    </div>
  )
}
