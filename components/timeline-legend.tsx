/**
 * Légende statique des icônes du timeline.
 * Affichée en bandeau horizontal (sous la KPI bar) et dans la popover
 * "3 points" de chaque OfCard — liste unique partagée.
 */

import type { ReactNode } from "react"
import {
  Check,
  CircleCheck,
  Droplets,
  Flag,
  FlaskConical,
  Lock,
  Package,
  PackageCheck,
  Truck,
} from "lucide-react"

export interface LegendItemDef {
  label: string
  bg: string
  icon: ReactNode
  group: "production" | "reception" | "qualite" | "statut" | "marqueur"
}

const ICO = (C: React.ComponentType<{ className?: string }>) => (
  <C className="h-3.5 w-3.5 text-white" />
)

export const TIMELINE_LEGEND_ITEMS: LegendItemDef[] = [
  // Production
  { label: "Remplissage", bg: "#FF9800", icon: ICO(Droplets), group: "production" },
  { label: "Fardelage", bg: "#33a8bf", icon: ICO(Package), group: "production" },
  { label: "Livraison", bg: "#4CAF50", icon: ICO(Truck), group: "production" },
  { label: "Confirmation SF", bg: "#1d4ed8", icon: ICO(Check), group: "production" },
  { label: "Confirmation SF finale", bg: "#1d4ed8", icon: ICO(Flag), group: "production" },
  // Réception
  { label: "Réceptionnés", bg: "#4CAF50", icon: ICO(PackageCheck), group: "reception" },
  { label: "Réception Partielle", bg: "#f59e0b", icon: ICO(PackageCheck), group: "reception" },
  // Qualité
  { label: "Contrôle Qualité", bg: "#8B5CF6", icon: ICO(FlaskConical), group: "qualite" },
  // Statut PF (icônes dans la bande)
  { label: "OF Validé", bg: "#22c55e", icon: "✓", group: "statut" },
  { label: "OF Débuté", bg: "#2196F3", icon: "▶", group: "statut" },
  { label: "Pause production", bg: "#FFC107", icon: "⏸", group: "statut" },
  { label: "Changement prod.", bg: "#FF5722", icon: "↻", group: "statut" },
  { label: "Attente LABO", bg: "#9333ea", icon: "⏳", group: "statut" },
  { label: "Panne", bg: "#EF4444", icon: "⚠", group: "statut" },
  { label: "Clôturé", bg: "#10b981", icon: ICO(Lock), group: "statut" },
  // Marqueurs
  { label: "Téléchargement PF / SF", bg: "#0ea5e9", icon: "⬇", group: "marqueur" },
  { label: "Bon Complémentaire (BC)", bg: "#ea580c", icon: "BC", group: "marqueur" },
  { label: "Demande Composant", bg: "#d97706", icon: "📦", group: "marqueur" },
  { label: "Date Système", bg: "#9333ea", icon: "📅", group: "marqueur" },
  { label: "Demande intervention (arrêt)", bg: "#dc2626", icon: "⚠", group: "marqueur" },
  { label: "Avis clôturé", bg: "#16a34a", icon: ICO(CircleCheck), group: "marqueur" },
]

export function TimelineLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-slate-200 bg-white px-6 py-2">
      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
        Légende :
      </span>
      {TIMELINE_LEGEND_ITEMS.map((it) => (
        <LegendChip key={it.label} item={it} />
      ))}
    </div>
  )
}

export function LegendChip({ item }: { item: LegendItemDef }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold leading-none text-white shadow-sm"
        style={{ background: item.bg }}
      >
        {item.icon}
      </span>
      <span className="text-[10px] text-slate-700">{item.label}</span>
    </div>
  )
}
