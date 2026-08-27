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
  // Une tuile à 0 reste affichée mais s'efface visuellement.
  //
  // L'estompage porte sur le CHIFFRE et le liseré, jamais sur le libellé :
  // une opacité posée sur toute la tuile délavait aussi le nom du statut, qui
  // devenait illisible alors que c'est justement ce qu'on cherche à lire.
  const vide = (count ?? 0) === 0 && !value
  return (
    <div
      className={cn(
        // La tuile épouse son contenu, entre un plancher et un plafond :
        //   - pas de flex-1, sinon 4 tuiles prennent un quart d'écran chacune ;
        //   - pas de largeur fixe non plus, sinon "Attente LABO" occupe autant
        //     que "Pause production Non Planifiée" et la barre déborde sur une
        //     deuxième ligne à moitié vide.
        // Le plafond force les libellés longs à passer sur deux lignes plutôt
        // qu'à étirer la tuile.
        "flex min-w-[7.5rem] max-w-[11rem] shrink-0 items-center gap-2.5 rounded-lg px-3 py-2",
        vide ? "bg-slate-50" : "bg-slate-100"
      )}
      title={title}
    >
      <div
        className={cn("h-10 w-1 shrink-0 rounded-sm", vide && "opacity-40")}
        style={{ background: color }}
      />
      <div className="min-w-0 text-left">
        <div
          className={cn(
            "font-bold tabular-nums",
            display.length > 7 ? "text-lg" : "text-2xl"
          )}
          style={{ color: vide ? "#94a3b8" : textColor }}
        >
          {display}
        </div>
        <div className="text-xs font-bold uppercase leading-tight tracking-tight text-slate-900">
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

/**
 * Statuts remontés sur la seconde ligne, aux côtés des indicateurs de charge.
 * Ce sont les états d'attente : ce qui est prêt à partir, ou volontairement
 * suspendu. Ils sont retirés de la première ligne pour ne pas figurer 2 fois.
 */
const STATUTS_LIGNE_2 = ["OF Validé", "Pause production Planifiée"]

export function KpiBar({ kpis, activeFilter, onFilterChange }: Props) {
  const parStatut = new Map(kpis.statusCounts.map((s) => [s.label, s]))
  const statutsLigne1 = kpis.statusCounts.filter(
    (s) => !STATUTS_LIGNE_2.includes(s.label)
  )
  // flex-wrap : le référentiel complet fait une quinzaine de tuiles, elles ne
  // tiennent plus sur une seule ligne comme avant.
  return (
    <div className="border-b border-slate-200 bg-white px-6 py-4">
    <div className="flex flex-wrap gap-3">
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
      {/* Ligne 1 : les statuts de production proprement dits */}
      {statutsLigne1.map((sc) => (
        <Tile
          key={sc.label}
          count={sc.count}
          label={sc.label}
          color={sc.color}
        />
      ))}
    </div>

    {/* Ligne 2 : ce qui est en attente de départ, et la charge restante. */}
    <div className="mt-3 flex flex-wrap justify-center gap-3 border-t border-slate-200 pt-3">
      {STATUTS_LIGNE_2.map((label) => {
        const sc = parStatut.get(label)
        if (!sc) return null
        // "OF Validé" porte deux chiffres dans une seule tuile : les OF dont
        // les composants sont demandés, sur le total des validés. Les afficher
        // dans deux tuiles séparées comptait les mêmes OF deux fois — un OF ne
        // quitte pas le statut "OF Validé" quand la demande de composants part.
        if (label === "OF Validé") {
          return (
            <Tile
              key={label}
              value={`${kpis.nbOfValideDemande} / ${sc.count}`}
              label="OF Validé (dont demandés)"
              color={sc.color}
              title={`${sc.count} OF au statut "OF Validé", dont ${kpis.nbOfValideDemande} ont déjà leurs composants demandés — c'est la file d'attente réellement prête à partir. Les ${sc.count - kpis.nbOfValideDemande} autres attendent encore leur demande de composants.`}
            />
          )
        }
        return (
          <Tile
            key={label}
            count={sc.count}
            label={sc.label}
            color={sc.color}
          />
        )
      })}
      <Tile
        value={formatHeuresMinutes(kpis.dureeProductionResteMinutes)}
        label="Charge planifiée"
        color="#7c3aed"
        title={
          `Temps de production restant sur la ligne, tous OF confondus : ` +
          `${formatHeuresMinutes(kpis.dureeProductionResteEnCoursMinutes)} sur les OF démarrés ` +
          `+ ${formatHeuresMinutes(kpis.dureeProductionResteALancerMinutes)} sur les OF à lancer. ` +
          `Calcul : pièces restantes ÷ cadence théorique. Hors changements de format, pauses et pannes.`
        }
      />
    </div>
    </div>
  )
}
