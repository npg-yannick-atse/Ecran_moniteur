"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { AlertTriangle, Loader2 } from "lucide-react"
import { useParams } from "next/navigation"
import { api } from "@/lib/api"
import { Header } from "@/components/header"
import { KpiBar, type KpiFilter } from "@/components/kpi-bar"
import { OfCard } from "@/components/of-card"

export default function DashboardLignePage() {
  const params = useParams<{ code: string }>()
  const code = params.code

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["dashboard", code],
    queryFn: ({ signal }) => api.dashboard(code, signal),
    refetchInterval: 10_000,
    enabled: !!code,
  })

  const [kpiFilter, setKpiFilter] = useState<KpiFilter>("all")

  // Pas de tri frontend — l'ordre est défini côté backend
  // (Panne → OFDE → En attente livraison → Non débutés → Autres).
  const filteredOfs = useMemo(() => {
    if (!data) return []
    return kpiFilter === "retard"
      ? data.ofs.filter((of) => of.retard)
      : data.ofs
  }, [data, kpiFilter])

  return (
    <div className="min-h-screen">
      <Header
        title={
          data?.ligne
            ? data.ligne.section.nom
              ? `${data.ligne.code} - ${data.ligne.section.nom}`
              : data.ligne.code
            : code
        }
        subtitle={data?.ligne ? `${data.ligne.designation}` : "Chargement…"}
        backHref="/"
      />

      {isLoading && !data && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-wms" />
          <span className="ml-3 text-slate-600">Chargement du dashboard…</span>
        </div>
      )}

      {isError && (
        <div className="m-6 rounded-lg border border-rose-300 bg-rose-50 p-6 text-rose-700">
          <p className="font-semibold">Erreur</p>
          <p className="mt-1 text-sm">{(error as Error).message}</p>
        </div>
      )}

      {data && (
        <>
          {data.ligneEnArret && data.arretActif && (
            <div className="flex items-center gap-3 border-b border-rose-300 bg-rose-50 px-6 py-3">
              <AlertTriangle className="h-5 w-5 shrink-0 text-rose-600" />
              <div className="text-sm">
                <span className="font-bold text-rose-700">
                  LIGNE EN ARRÊT
                </span>
                <span className="ml-2 text-rose-600">
                  Avis {data.arretActif.avisNumber ?? "—"}
                  {data.arretActif.priorite && (
                    <span className="ml-1 rounded bg-rose-200 px-1.5 py-0.5 text-[10px] font-bold uppercase text-rose-800">
                      {data.arretActif.priorite}
                    </span>
                  )}
                  {data.arretActif.commentaire && (
                    <span className="ml-2 italic text-rose-500">
                      {data.arretActif.commentaire}
                    </span>
                  )}
                  {data.arretActif.createdBy && (
                    <span className="ml-2 text-rose-400">
                      par {data.arretActif.createdBy}
                    </span>
                  )}
                </span>
              </div>
            </div>
          )}
          <KpiBar
            kpis={data.kpis}
            activeFilter={kpiFilter}
            onFilterChange={setKpiFilter}
          />
          {/* Bandeau de légende masqué : il mangeait une bande de hauteur sur
              chaque écran d'atelier. La légende reste accessible par OF, via le
              bouton ⋮ de la carte. */}
          <main className="px-6 py-5">
            {/* Indicateur de filtre actif */}
            {kpiFilter !== "all" && (
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-wms/20 bg-wms-bg px-4 py-2 text-sm">
                <span className="text-slate-600">
                  Filtre actif :{" "}
                  <b className="text-wms-dark">En retard</b>
                </span>
                <span className="text-slate-400">
                  — {filteredOfs.length} / {data.ofs.length} OF
                </span>
                <button
                  type="button"
                  onClick={() => setKpiFilter("all")}
                  className="ml-auto rounded bg-wms px-2 py-0.5 text-xs font-semibold text-white hover:bg-wms-dark"
                >
                  Voir tous
                </button>
              </div>
            )}

            {filteredOfs.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-slate-400">
                {data.ofs.length === 0
                  ? "Aucun OF actif sur cette ligne"
                  : "Aucun OF ne correspond à ce filtre"}
              </div>
            ) : (
              filteredOfs.map((of) => <OfCard key={of.of} of={of} />)
            )}
          </main>
        </>
      )}
    </div>
  )
}
