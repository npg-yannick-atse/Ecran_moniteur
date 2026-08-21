import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Formate un numéro d'OF en retirant les zéros à gauche : "000001128764" → "1128764"
 */
export function formatOf(of: string | null | undefined): string {
  if (!of) return "—"
  return of.replace(/^0+/, "") || "0"
}

export function formatDateTimeFr(iso: string | null): string {
  if (!iso) return "--"
  const d = new Date(iso)
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/** Date seule, sans heure : "14/08". Pour les repères ordonnancés à la journée. */
export function formatDateFr(iso: string | null): string {
  if (!iso) return "--"
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
  })
}

export function formatDureeMinutes(min: number | null): string {
  if (min == null) return "--"
  if (min < 60) return `${Math.round(min)}min`
  const totalH = Math.floor(min / 60)
  const m = Math.round(min % 60)
  if (totalH < 24) {
    return m > 0 ? `${totalH}h ${m.toString().padStart(2, "0")}min` : `${totalH}h`
  }
  const j = Math.floor(totalH / 24)
  const h = totalH % 24
  const parts = [`${j}j`]
  if (h > 0) parts.push(`${h}h`)
  if (m > 0) parts.push(`${m.toString().padStart(2, "0")}min`)
  return parts.join(" ")
}

/**
 * Durée en heures + minutes uniquement, sans jamais basculer en jours.
 * 45 → "45min" · 195 → "3h 15min" · 4068 → "67h 48min"
 * (formatDureeMinutes bascule en "2j 19h 48min" au-delà de 24 h ; ici on garde
 * les heures pour comparer d'un coup d'œil des durées de statut.)
 */
export function formatHeuresMinutes(min: number | null): string {
  if (min == null) return "--"
  const total = Math.round(min)
  if (total < 60) return `${total}min`
  const h = Math.floor(total / 60)
  const m = total % 60
  return m > 0 ? `${h}h ${m.toString().padStart(2, "0")}min` : `${h}h`
}

// =============================================================================
// Contraste — les couleurs de statut viennent de la DB et vont du très sombre
// (#8C0E02) au très clair (#d9e838). Un texte blanc en dur devient illisible
// sur les claires. On choisit donc la couleur de texte d'après la luminance.
// =============================================================================

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

/** Luminance relative WCAG (0 = noir, 1 = blanc). */
export function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex)
  if (!rgb) return 0
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b)
}

/** Texte lisible SUR un aplat de cette couleur : ardoise foncée ou blanc. */
export function contrastText(hex: string): string {
  return relativeLuminance(hex) > 0.45 ? "#0f172a" : "#ffffff"
}

/**
 * Version assombrie d'une couleur, pour l'utiliser en TEXTE sur fond clair
 * (badges teintés). Les couleurs déjà sombres sont renvoyées telles quelles.
 */
export function darkenForText(hex: string): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  let { r, g, b } = rgb
  // Assombrit par paliers de 15 % jusqu'à passer sous le seuil de lisibilité.
  for (let i = 0; i < 12 && relativeLuminance(rgbToHex(r, g, b)) > 0.22; i++) {
    r = Math.round(r * 0.85)
    g = Math.round(g * 0.85)
    b = Math.round(b * 0.85)
  }
  return rgbToHex(r, g, b)
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`
}

/**
 * Un contrôle qualité est hors tolérance quand le poids mesuré à l'unité sort
 * des bornes du dosage (prod_order_state.contenance_min/max). Renvoie false
 * quand les bornes ou le poids manquent : on ne signale que ce qu'on sait.
 *
 * Les décimales SQL Server remontent en chaîne via `$queryRaw` — d'où le
 * Number() explicite, sans lequel la comparaison serait lexicographique.
 */
export function horsTolerance(
  poids: number | null,
  min: number | null,
  max: number | null
): boolean {
  const p = Number(poids)
  if (!Number.isFinite(p) || p <= 0) return false
  if (min != null && p < min) return true
  if (max != null && p > max) return true
  return false
}

export function formatNumber(n: number | null | undefined): string {
  if (n == null) return "--"
  return n.toLocaleString("fr-FR")
}
