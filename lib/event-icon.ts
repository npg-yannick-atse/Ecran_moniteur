/**
 * Mapping code d'event timeline → glyphe Unicode affiché dans le dot.
 * Partagé entre Timeline (dots) et TimelineLegend (légende dynamique).
 */
export function getEventIcon(code: string): string {
  if (code === "dl-pf" || code === "dl-sf") return "\u2B07" // ⬇
  if (code === "bc-pf" || code === "bc-sf") return "BC" // texte
  if (code === "demande-pf" || code === "demande-sf") return "\u{1F4E6}" // 📦
  if (code === "systeme-pf" || code === "systeme-sf") return "\u{1F4C5}" // 📅
  if (code.startsWith("sfconf-final-")) return "\u2713\u2713"
  if (code.startsWith("sfconf-")) return "\u2713"
  if (code.startsWith("aviscloture-")) return "\u2705"
  if (code.startsWith("avis-")) return "\u26A0" // ⚠ demande d'intervention
  if (code.startsWith("remp-") || code === "remplissage") return "\u2699"
  if (code.startsWith("poly-") || code === "polypackage") return "\u25A6"
  if (code.startsWith("livr-") || code === "livraison") return "\u2709"

  if (code.startsWith("log-")) {
    const n = Number(code.slice(4))
    if (n === 1) return "\u2B07"
    if (n === 2) return "\u25B6"
    if (n === 3) return "\u25D0"
    if (n === 4) return "\u2713"
    if (n === 5) return "\u21CC"
    if (n === 6) return "\u21D2"
    if (n === 7) return "\u25D1"
    if (n === 8) return "\u2709"
    if (n === 9) return "\u2717"
    if (n === 11) return "\u2699"
    if (n === 12) return "\u2297"
    if (n === 13) return "\u27A1"
    if (n === 14) return "\u2709"
    if (n === 18) return "\u2605"
    return "\u25A0"
  }

  if (code.startsWith("util-")) {
    const n = Number(code.slice(5))
    if (n === 1) return "\u2713"
    if (n === 2) return "\u25B6"
    if (n === 3) return "\u25A0"
    if (n === 6) return "\u2605"
    if (n === 7 || n === 8) return "\u23F3"
    if (n === 9) return "\u23F8"
    if (n === 10) return "\u26A0"
    if (n === 11) return "\u21BB"
    if (n >= 13 && n <= 15) return "\u26A0"
    return "\u25CF"
  }

  return "\u25CF"
}
