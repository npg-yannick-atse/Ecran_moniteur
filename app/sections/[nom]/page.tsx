"use client"

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { useParams } from "next/navigation"
import { ArrowRight, Loader2 } from "lucide-react"
import { api } from "@/lib/api"
import { Header } from "@/components/header"
import type { ProcessListItem } from "@/lib/types"

export default function SectionPage() {
  const params = useParams<{ nom: string }>()
  const sectionNom = decodeURIComponent(params.nom ?? "")

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["lignes"],
    queryFn: ({ signal }) => api.lignes(signal),
    refetchInterval: 30_000,
  })

  const lignes = useMemo<ProcessListItem[]>(() => {
    if (!data) return []
    return data.lignes.filter(
      (l) => (l.section.nom || "Autres") === sectionNom
    )
  }, [data, sectionNom])

  const totals = useMemo(() => {
    return lignes.reduce(
      (acc, l) => ({
        nbOf: acc.nbOf + l.nbOf,
        nbOfEnCours: acc.nbOfEnCours + l.nbOfEnCours,
        nbOfEnRetard: acc.nbOfEnRetard + l.nbOfEnRetard,
      }),
      { nbOf: 0, nbOfEnCours: 0, nbOfEnRetard: 0 }
    )
  }, [lignes])

  return (
    <div className="min-h-screen">
      <Header
        title={sectionNom}
        subtitle={`${lignes.length} ligne${lignes.length > 1 ? "s" : ""}`}
        backHref="/"
      />

      <main className="mx-auto max-w-7xl px-6 py-10">
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-wms" />
            <span className="ml-3 text-slate-600">Chargement…</span>
          </div>
        )}

        {isError && (
          <div className="rounded-lg border border-rose-300 bg-rose-50 p-6 text-rose-700">
            <p className="font-semibold">Erreur lors du chargement</p>
            <p className="mt-1 text-sm">{(error as Error).message}</p>
          </div>
        )}

        {data && lignes.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-slate-400">
            Aucune ligne dans cette section
          </div>
        )}

        {data && lignes.length > 0 && (
          <>
            <div className="mb-8 grid grid-cols-3 gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <Summary label="OF Total" value={totals.nbOf} />
              <Summary
                label="En Cours"
                value={totals.nbOfEnCours}
                tone={totals.nbOfEnCours > 0 ? "warning" : "default"}
              />
              <Summary
                label="En Retard"
                value={totals.nbOfEnRetard}
                tone={totals.nbOfEnRetard > 0 ? "danger" : "default"}
              />
            </div>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {lignes.map((ligne) => (
                <Link
                  key={ligne.code}
                  href={`/lignes/${ligne.code}`}
                  className="group block overflow-hidden rounded-2xl border-2 border-transparent bg-white shadow-sm transition-all hover:-translate-y-1 hover:border-wms hover:shadow-xl"
                >
                  <div
                    className="relative px-5 py-5"
                    style={{
                      background: "linear-gradient(135deg, #008ea9, #33a8bf)",
                    }}
                  >
                    <div className="absolute right-4 top-4 rounded-full border border-white/30 bg-white/20 px-3 py-1 text-[11px] font-semibold text-white">
                      {ligne.nbOf} OF
                    </div>
                    {/* Nom en haut, code en dessous — même hiérarchie que
                        l entête du dashboard de ligne. */}
                    <h3 className="text-base font-bold uppercase text-white">
                      {ligne.designation}
                    </h3>
                    <p className="mt-1 font-mono text-xs tracking-wider text-wms-lighter">
                      {ligne.code}
                    </p>
                  </div>
                  <div className="px-5 py-4">
                    <div className="grid grid-cols-3 gap-4">
                      <Stat value={ligne.nbOf} label="OF Total" />
                      <Stat
                        value={ligne.nbOfEnCours}
                        label="En Cours"
                        tone={ligne.nbOfEnCours > 2 ? "warning" : "default"}
                      />
                      <Stat
                        value={ligne.nbOfEnRetard}
                        label="En Retard"
                        tone={ligne.nbOfEnRetard > 0 ? "danger" : "default"}
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-end bg-wms-bg px-5 py-3">
                    <ArrowRight className="h-4 w-4 text-wms transition-transform group-hover:translate-x-1.5" />
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  )
}

function Stat({
  value,
  label,
  tone = "default",
}: {
  value: number
  label: string
  tone?: "default" | "warning" | "danger"
}) {
  const cls =
    tone === "danger"
      ? "text-rose-500"
      : tone === "warning"
        ? "text-amber-500"
        : "text-wms"
  return (
    <div className="text-center">
      <div className={`text-2xl font-bold tabular-nums ${cls}`}>{value}</div>
      <div className="mt-0.5 text-[9px] uppercase tracking-wide text-slate-500">
        {label}
      </div>
    </div>
  )
}

function Summary({
  value,
  label,
  tone = "default",
}: {
  value: number
  label: string
  tone?: "default" | "warning" | "danger"
}) {
  const cls =
    tone === "danger"
      ? "text-rose-500"
      : tone === "warning"
        ? "text-amber-500"
        : "text-wms"
  return (
    <div className="text-center">
      <div className={`text-4xl font-bold tabular-nums ${cls}`}>{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wide text-slate-500">
        {label}
      </div>
    </div>
  )
}
