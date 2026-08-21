import { cn, contrastText } from "@/lib/utils"
import type { StatusBadge } from "@/lib/types"

/** Fallback couleur quand la DB ne renvoie rien. Mappé sur `level`. */
const LEVEL_FALLBACK_BG: Record<StatusBadge["level"], string> = {
  ok: "#10b981", // emerald-500
  info: "#008ea9", // wms
  warning: "#f59e0b", // amber-500
  danger: "#f43f5e", // rose-500
  neutral: "#94a3b8", // slate-400
}

interface Props {
  status: StatusBadge
  prefix?: string
  className?: string
  /** Durée passée dans CE statut, affichée dans la pastille (ex. "5h 24min"). */
  duree?: string
}

export function StatusPill({ status, prefix, className, duree }: Props) {
  // Pas de label utile (NULL côté DB) → on n'affiche rien plutôt que "—" / "En attente".
  if (!status.label || status.label === "—") return null

  // Couleur DB prioritaire ; fallback sur le niveau si couleur manquante.
  const bg =
    status.color && status.color.trim() !== ""
      ? status.color
      : LEVEL_FALLBACK_BG[status.level]

  // Texte blanc sur les couleurs sombres, ardoise sur les claires (ex.
  // "Manque de composant" #d9e838 : blanc dessus = ~1,4:1, illisible).
  const fg = contrastText(bg)

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-sm font-bold uppercase tracking-wide",
        className
      )}
      style={{ background: bg, color: fg }}
    >
      {prefix && <span className="mr-1 opacity-75">{prefix}:</span>}
      {status.label}
      {duree && (
        <>
          {/* Séparateur translucide : tient sur fond clair comme sur fond
              sombre, contrairement à une couleur fixe. */}
          <span className="mx-2 h-4 w-px bg-current opacity-30" />
          <span className="tabular-nums opacity-90">{duree}</span>
        </>
      )}
    </span>
  )
}
