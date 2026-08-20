"use client"

import { Fragment } from "react"
import { cn, darkenForText, formatHeuresMinutes } from "@/lib/utils"
import type { KPIs } from "@/lib/types"

export type KpiFilter = "all" | "retard" | null

interface Props {
  kpis: KPIs
  activeFilter: KpiFilter
  onFilterChange: (filter: KpiFilter) => void
}

type KpiFormat = "int" | "qte" | "pct"

interface KpiItem {
  key: keyof KPIs
  label: string
  color: string
  format: KpiFormat
  filter: KpiFilter // quel filtre activer quand on clique
  /** Si défini, affiche `valeur / total` (ratio visuel). */
  totalKey?: keyof KPIs
  /** Affiche une barre verticale AVANT ce KPI (séparation visuelle). */
  separatorBefore?: boolean
}

// Aucun KPI global affiché : la barre ne montre plus que le breakdown par
// statut utilisateur (cf. plus bas). Le compteur "OF sur la ligne" a été
// retiré à la demande — remettre l'entrée ici pour le réafficher :
//   { key: "nbOfPF", label: "OF sur la ligne", color: "#008ea9", format: "int", filter: null }
const ITEMS: KpiItem[] = []

/**
 * Tuile de la barre du haut — même gabarit pour toutes.
 * `count` pour un compteur, `value` pour une valeur déjà formatée (durée…).
 */
function Tile({
  count,
  value,
  label,
  color,
  title,
}: {
  count?: number
  value?: string
  label: string
  color: string
  title?: string
}) {
  const display = value ?? String(count ?? 0)
  // Le liseré garde la couleur brute du statut ; le chiffre l'assombrit, sinon
  // les statuts clairs (ex. "Manque de composant" #d9e838) sont illisibles sur
  // le fond slate-100.
  const textColor = darkenForText(color)
  // Une tuile à 0 reste affichée mais s'efface visuellement : l'information
  // « aucun OF dans ce statut » doit être lisible sans capter l'attention.
  const vide = (count ?? 0) === 0 && !value
  return (
    <div
      className={cn(
        "flex min-w-[9rem] flex-1 items-center gap-3 rounded-lg px-4 py-2",
        vide ? "bg-slate-50 opacity-60" : "bg-slate-100"
      )}
      title={title}
    >
      <div className="h-10 w-1 rounded-sm" style={{ background: color }} />
      <div className="text-left">
        <div
          className={cn(
            "font-bold tabular-nums",
            display.length > 7 ? "text-lg" : "text-2xl"
          )}
          style={{ color: textColor }}
        >
          {display}
        </div>
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-900">
          {label}
        </div>
      </div>
    </div>
  )
}

const qteFmt = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 })

function formatKpi(value: number, format: KpiFormat): string {
  switch (format) {
    case "pct":
      return `${Math.round(value)}%`
    case "qte":
      return qteFmt.format(Math.round(value))
    case "int":
    default:
      return String(value)
  }
}

function formatKpiWithTotal(
  value: number,
  total: number,
  format: KpiFormat
): { main: string; sub: string } {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return {
    main: `${formatKpi(value, format)} / ${formatKpi(total, format)}`,
    sub: `${pct}%`,
  }
}

export function KpiBar({ kpis, activeFilter, onFilterChange }: Props) {
  // flex-wrap : le référentiel complet fait une quinzaine de tuiles, elles ne
  // tiennent plus sur une seule ligne comme avant.
  return (
    <div className="flex flex-wrap gap-3 border-b border-slate-200 bg-white px-6 py-4">
      {ITEMS.map((item) => {
        const value = kpis[item.key] as number
        const total = item.totalKey ? (kpis[item.totalKey] as number) : null
        const isNbOfPF = item.key === "nbOfPF"
        const displayMain =
          !isNbOfPF && total != null
            ? formatKpiWithTotal(value, total, item.format).main
            : formatKpi(value, item.format)
        const displaySub =
          total != null ? formatKpiWithTotal(value, total, item.format).sub : null
        const isClickable = item.filter !== null
        const isActive = isClickable && activeFilter === item.filter

        return (
          <Fragment key={item.key}>
            {item.separatorBefore && (
              <div className="mx-1 h-10 w-px self-center bg-slate-300" />
            )}
          <button
            type="button"
            disabled={!isClickable}
            onClick={() => {
              if (!isClickable) return
              // Toggle : recliquer sur le filtre actif le désactive
              onFilterChange(isActive ? "all" : item.filter)
            }}
            className={cn(
              "flex flex-1 items-center gap-3 rounded-lg px-4 py-2 transition-all",
              isClickable ? "cursor-pointer" : "cursor-default",
              isActive
                ? "ring-2 shadow-md"
                : isClickable
                  ? "bg-slate-100 hover:bg-slate-200"
                  : "bg-slate-100"
            )}
            style={
              isActive
                ? ({
                    background: `${item.color}12`,
                    "--tw-ring-color": item.color,
                  } as React.CSSProperties)
                : undefined
            }
          >
            <div
              className={cn(
                "h-10 w-1 rounded-sm transition-all",
                isActive ? "w-1.5" : ""
              )}
              style={{ background: item.color }}
            />
            <div className="text-left">
              <div
                className={cn(
                  "font-bold tabular-nums",
                  displayMain.length > 12 ? "text-lg" : "text-2xl"
                )}
                style={{ color: item.color }}
              >
                {isNbOfPF ? kpis.nbOfPF : displayMain}
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-slate-500">
                {item.label}
                {displaySub && (
                  <span
                    className="text-[9px] font-bold normal-case tracking-normal"
                    style={{ color: item.color }}
                  >
                    ({displaySub})
                  </span>
                )}
              </div>
            </div>
          </button>
          </Fragment>
        )
      })}
      {/* Breakdown dynamique par statut utilisateur */}
      {kpis.statusCounts.map((sc) => (
        <Tile
          key={sc.label}
          count={sc.count}
          label={sc.label}
          color={sc.color}
        />
      ))}
      {/* Compteurs transverses (pas des statuts utilisateur) */}
      {/* Tuiles « OF demandés » et « OF non débutés » retirées à la demande.
          Les compteurs restent calculés côté API. */}
      <Tile
        value={formatHeuresMinutes(kpis.dureeProductionResteMinutes)}
        label="Prod. restante"
        color="#7c3aed"
        title={
          `Temps de production restant sur la ligne, tous OF confondus : ` +
          `${formatHeuresMinutes(kpis.dureeProductionResteEnCoursMinutes)} sur les OF démarrés ` +
          `+ ${formatHeuresMinutes(kpis.dureeProductionResteALancerMinutes)} sur les OF à lancer. ` +
          `Calcul : pièces restantes ÷ cadence théorique. Hors changements de format, pauses et pannes.`
        }
      />
    </div>
  )
}
