"use client"

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { ArrowRight, Loader2 } from "lucide-react"
import { api } from "@/lib/api"
import { Header } from "@/components/header"
import type { ProcessListItem } from "@/lib/types"

type SectionCard = {
  nom: string
  code: string
  nbLignes: number
  nbOf: number
  nbOfEnCours: number
  nbOfEnRetard: number
}

export default function HomePage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["lignes"],
    queryFn: ({ signal }) => api.lignes(signal),
    refetchInterval: 30_000,
  })

  const sections = useMemo<SectionCard[]>(() => {
    if (!data) return []
    const map = new Map<string, SectionCard>()
    for (const l of data.lignes as ProcessListItem[]) {
      const key = l.section.nom || "Autres"
      const s = map.get(key) ?? {
        nom: key,
        code: l.section.code,
        nbLignes: 0,
        nbOf: 0,
        nbOfEnCours: 0,
        nbOfEnRetard: 0,
      }
      s.nbLignes += 1
      s.nbOf += l.nbOf
      s.nbOfEnCours += l.nbOfEnCours
      s.nbOfEnRetard += l.nbOfEnRetard
      map.set(key, s)
    }
    return Array.from(map.values()).sort((a, b) =>
      a.nom.localeCompare(b.nom, "fr")
    )
  }, [data])

  return (
    <div className="min-h-screen">
      <Header
        title="ECRAN DE SUIVI PRODUCTION"
        subtitle="Sélectionnez une section"
      />

      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-10 text-center">
          <h2 className="text-2xl font-bold text-slate-800">
            Sections de Production
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Choisissez une section pour voir ses lignes
          </p>
        </div>

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

        {data && (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {sections.map((s) => (
              <Link
                key={s.nom}
                href={`/sections/${encodeURIComponent(s.nom)}`}
                className="group block overflow-hidden rounded-2xl border-2 border-transparent bg-white shadow-sm transition-all hover:-translate-y-1 hover:border-wms hover:shadow-xl"
              >
                <div
                  className="relative px-5 py-5"
                  style={{
                    background: "linear-gradient(135deg, #004f5e, #006d82)",
                  }}
                >
                  <div className="absolute right-4 top-4 rounded-full border border-white/30 bg-white/20 px-3 py-1 text-[11px] font-semibold text-white">
                    {s.nbLignes} ligne{s.nbLignes > 1 ? "s" : ""}
                  </div>
                  <h3 className="text-xl font-bold uppercase text-white">
                    {s.nom}
                  </h3>
                </div>
                <div className="px-5 py-4">
                  <div className="grid grid-cols-3 gap-4">
                    <Stat value={s.nbOf} label="OF Total" />
                    <Stat
                      value={s.nbOfEnCours}
                      label="En Cours"
                      tone={s.nbOfEnCours > 2 ? "warning" : "default"}
                    />
                    <Stat
                      value={s.nbOfEnRetard}
                      label="En Retard"
                      tone={s.nbOfEnRetard > 0 ? "danger" : "default"}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-end bg-wms-bg px-5 py-3">
                  <span className="mr-2 text-xs font-semibold text-wms-dark">
                    Voir les lignes
                  </span>
                  <ArrowRight className="h-4 w-4 text-wms transition-transform group-hover:translate-x-1.5" />
                </div>
              </Link>
            ))}
          </div>
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
