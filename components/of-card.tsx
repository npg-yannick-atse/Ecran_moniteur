import { memo, useState } from "react"
import {
  cn,
  darkenForText,
  formatDateFr,
  formatDateTimeFr,
  formatDureeMinutes,
  formatNumber,
  formatOf,
  relativeLuminance,
} from "@/lib/utils"
import type { OfRow } from "@/lib/types"
import { StatusPill } from "./status-pill"
import { Timeline } from "./timeline"
import { ComposantsModal } from "./composants-modal"
import { SfModal } from "./sf-modal"
import { StatusHistoryModal } from "./status-history-modal"
import {
  AlertTriangle,
  Beaker,
  Boxes,
  CalendarClock,
  CircleCheck,
  Clock,
  Droplets,
  Gauge,
  Info as InfoIcon,
  MoreVertical,
  Package as PackageIcon,
  Truck,
} from "lucide-react"
import { TIMELINE_LEGEND_ITEMS, LegendChip } from "./timeline-legend"

interface Props {
  of: OfRow
}

/**
 * Gabarit commun des badges de l'entête (composants, effectif, cadence,
 * dosage, énergie) — une seule source pour la taille, sinon ils dérivent.
 */
const BADGE_BASE =
  "inline-flex select-none items-center gap-1 rounded-full border px-3 py-1 text-sm font-bold tabular-nums"

export const OfCard = memo(function OfCard({ of }: Props) {
  const [showComposants, setShowComposants] = useState(false)
  const [showSf, setShowSf] = useState(false)
  const [showLegend, setShowLegend] = useState(false)
  const [showHistorique, setShowHistorique] = useState(false)
  const rempliPct =
    of.quantite > 0 ? Math.round((of.qteRempli / of.quantite) * 100) : 0
  // Ratios bruts (peuvent dépasser 100% — feedback user : afficher la vraie valeur)
  const polypackSurRempliPct =
    of.qteRempli > 0
      ? Math.round((of.qtePolypackee / of.qteRempli) * 100)
      : 0
  const livreSurPolypackPct =
    of.qtePolypackee > 0
      ? Math.round((of.qteLivree / of.qtePolypackee) * 100)
      : 0
  const sfPct = of.sf.pourcentage

  // ---- Alerte SF ---------------------------------------------------------
  // Le SF doit être terminé AVANT que le PF ne démarre le remplissage.
  //
  // Tant que le PF n'a PAS démarré, on ne peut rien reprocher au SF : il a
  // encore le temps d'être fini. Aucune alerte dans ce cas, quel que soit
  // l'état du SF. C'est le démarrage du PF qui rend le retard constatable.
  //
  // Une fois le PF démarré, le SF est "en retard" (orange) si :
  //   1. il n'est toujours pas débuté, OU
  //   2. il n'est toujours pas terminé, OU
  //   3. il s'est terminé APRÈS le démarrage du PF.
  const pfDebutTs = of.dateDebutProduction
    ? new Date(of.dateDebutProduction).getTime()
    : null
  const sfDebutTs = of.sf.dateDebutProduction
    ? new Date(of.sf.dateDebutProduction).getTime()
    : null
  const sfFinTs = of.sf.dateFinProduction
    ? new Date(of.sf.dateFinProduction).getTime()
    : null
  const sfAlerte =
    !!of.sf.of &&
    pfDebutTs != null &&
    (sfDebutTs == null
      ? true
      : sfFinTs != null
        ? sfFinTs > pfDebutTs
        : sfPct < 100)
  const sfAlerteRaison =
    sfDebutTs == null
      ? "PF démarré alors que le SF n'est pas débuté"
      : sfFinTs != null
        ? "SF terminé après le démarrage du PF"
        : "PF démarré alors que le SF n'est pas terminé"

  // ---- Étape « finale » --------------------------------------------------
  // Une étape est finie quand TOUTES les palettes de l'OF y sont passées, et
  // non quand la quantité théorique est atteinte. Vérifié sur les données :
  //   OF 1136104 : 667/670 CRN mais 17/17 palettes → fini (dernière incomplète)
  //   OF 1134921 : 581/500 CRN mais  8/10 palettes → 2 palettes restent !
  // Le critère quantité se trompe dans les deux sens ; les palettes sont
  // l'unité de travail réelle. Repli sur la quantité quand le nombre de
  // palettes n'est qu'estimé (fiches pas encore créées).
  const etapeFinale = (palettesEtape: number, karEtape: number): boolean => {
    if (of.quantitePalettes > 0 && !of.quantitePalettesEstimee) {
      return palettesEtape >= of.quantitePalettes
    }
    return of.quantite > 0 && karEtape >= of.quantite
  }

  // Dernière période de statut = statut courant de l'OF. Sa durée court
  // jusqu'à maintenant (calculée côté API, rafraîchie à chaque poll).
  // NB : statusHistoryPF exclut "OF Validé", donc ce statut peut différer de
  // la pill statusUtilisateur — d'où sa désignation rappelée dans le tooltip.
  const dernierStatut = of.statusHistoryPF.at(-1) ?? null

  // Le fond du header reprend la couleur du statut utilisateur, teinté pour
  // garder le texte lisible. Le bord bas garde la même couleur en plus soutenu
  // (~50%) pour délimiter header ↔ body.
  // Les couleurs claires de la DB (ex. "Manque de composant" #d9e838) donnent
  // une teinte quasi blanche à 13% : on monte l'opacité pour qu'elles restent
  // identifiables d'un coup d'œil depuis l'atelier.
  const statusColor = of.statusUtilisateur.color || "#94a3b8"
  const statusIsLight = relativeLuminance(statusColor) > 0.45
  const headerBg = `${statusColor}${statusIsLight ? "40" : "22"}`

  return (
    <div className="mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      {/* HEADER */}
      <div
        className="border-b px-5 py-2.5"
        style={{
          backgroundColor: headerBg,
          borderBottomColor: `${statusColor}80`,
        }}
      >
        {/* Ligne 1 : identité de l'OF à gauche, statuts à droite */}
        <div className="flex items-center justify-between">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="font-mono text-xl font-bold leading-tight text-wms">
            OF {formatOf(of.of)}
          </span>
          <span className="text-base font-semibold leading-tight text-slate-700">
            <span className="font-mono">{of.codeArticle}</span>
            <span className="mx-1 text-slate-400">—</span>
            {of.designationArticle}
          </span>
          {/* Effectif masqué tant que l'OF n'a pas démarré : personne n'y est
              encore affecté, le chiffre ne voudrait rien dire. */}
          {of.dateDebutProduction != null && (
            <span
              className={cn(
                BADGE_BASE,
                of.nbEffectifOF != null &&
                  of.nbEffectifLigne != null &&
                  of.nbEffectifOF < of.nbEffectifLigne
                  ? "border-amber-300 bg-amber-50 text-amber-700"
                  : "border-slate-300 bg-slate-50 text-slate-700"
              )}
              title="Effectif prévu sur la ligne / effectif affecté à l'OF (opération 0010)"
            >
              <span className="opacity-70">Effectif</span>{" "}
              {of.nbEffectifLigne != null ? of.nbEffectifLigne : "—"}
              <span className="mx-1 opacity-40">/</span>
              {of.nbEffectifOF != null ? Math.round(of.nbEffectifOF) : "—"}
            </span>
          )}
          {of.consommationEnergie != null && (
            <span
              className={cn(
                BADGE_BASE,
                "border-emerald-300 bg-emerald-50 text-emerald-700"
              )}
              title="Consommation énergie cumulée PF + SF (somme des deltas d'index de chaque compteur)"
            >
              ⚡
              {of.consommationEnergie.toLocaleString("fr-FR", {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              })}{" "}
              <span className="opacity-70">kWh</span>
            </span>
          )}
          {of.dateFinOrdo && (
            <span
              className={cn(
                BADGE_BASE,
                "border-amber-300 bg-amber-50 text-amber-700"
              )}
              title={
                of.dateFinOrdoAvecHeure
                  ? "Date de fin d'ordonnancement SAP"
                  : "Date de fin d'ordonnancement SAP — ordonnancé à la journée, aucune heure fournie"
              }
            >
              <CalendarClock className="h-3.5 w-3.5" />
              <span className="opacity-70">Fin ordo</span>
              {of.dateFinOrdoAvecHeure
                ? formatDateTimeFr(of.dateFinOrdo)
                : formatDateFr(of.dateFinOrdo)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {/* La durée est DANS la pastille : c'est la durée de CE statut, la
              séparer en deux badges laissait croire à deux informations
              indépendantes. Clic → historique complet. */}
          <button
            type="button"
            onClick={() => setShowHistorique(true)}
            title="Voir l'historique des statuts de l'OF"
            className="rounded-full transition-transform hover:scale-105"
          >
            <StatusPill
              status={of.statusUtilisateur}
              duree={
                dernierStatut
                  ? formatDureeMinutes(dernierStatut.durationMin)
                  : undefined
              }
            />
          </button>
          <StatusPill status={of.statusProduction} prefix="Prod" />
          {/* Statut logistique retiré d'ici : il porte sur la réception des
              composants, il est donc à sa place dans le modal composants. */}
          {of.retard && (
            <span className="flex animate-blink items-center gap-1 rounded bg-rose-500 px-3 py-1 text-[10px] font-bold text-white">
              <AlertTriangle className="h-3 w-3" />
              RETARD +{formatDureeMinutes(of.retardMinutes)}
            </span>
          )}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowLegend((s) => !s)}
              className="flex h-7 w-7 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-800"
              title="Légende du timeline"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            {showLegend && (
              <TimelineLegendPopover onClose={() => setShowLegend(false)} />
            )}
          </div>
        </div>
        </div>

        {/* Ligne 2 : caractéristiques de l'OF. Sur une ligne à part pour ne pas
            disputer la largeur aux pastilles de statut de la ligne 1. */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {of.dosage != null && (
            <span
              className={cn(
                BADGE_BASE,
                "border-violet-300 bg-violet-50 text-violet-700"
              )}
              title="Dosage cible par unité (contenance)"
            >
              <Beaker className="h-3.5 w-3.5" />
              <span className="opacity-70">Dosage</span>
              {formatNumber(of.dosage)}
            </span>
          )}
          {of.cadencePiecesParMinute != null && (
            <span
              className={cn(BADGE_BASE, "border-sky-300 bg-sky-50 text-sky-700")}
              title={
                of.cadenceLibelle
                  ? `Cadence théorique — ${of.cadenceLibelle}`
                  : "Cadence théorique"
              }
            >
              <Gauge className="h-3.5 w-3.5" />
              {formatNumber(of.cadencePiecesParMinute)}
              <span className="opacity-70">pcs/min</span>
            </span>
          )}
          {of.nbTotalComposants > 0 && (
            <button
              type="button"
              onClick={() => setShowComposants(true)}
              className={cn(
                BADGE_BASE,
                "cursor-pointer transition-transform hover:scale-105",
                of.nbComposantsReceptionnes >= of.nbTotalComposants
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                  : of.nbComposantsReceptionnes === 0
                    ? "border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100"
                    : "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
              )}
              title="Voir les composants PF"
            >
              {of.nbComposantsReceptionnes} / {of.nbTotalComposants} composants
            </button>
          )}
        </div>
      </div>

      {/* BODY */}
      <div className="grid grid-cols-[35%_65%] gap-0">
        {/* LEFT */}
        <div className="flex flex-col gap-3 border-r-2 border-wms-bg p-5">
          {/* SF indicator */}
          <div
            className={cn(
              "flex items-center gap-3 rounded-lg border px-3 py-2",
              sfAlerte
                ? "border-orange-400 bg-orange-50"
                // Ton gris par défaut : le SF est une information de contexte,
                // le bleu wms le mettait au même niveau que les données PF.
                : "border-slate-300 bg-slate-100"
            )}
            title={sfAlerte ? sfAlerteRaison : undefined}
          >
            <span
              className={cn(
                "rounded px-2 py-0.5 text-[9px] font-bold text-white",
                sfAlerte ? "bg-orange-500" : "bg-slate-500"
              )}
            >
              SF
            </span>
            <span
              className={cn(
                "font-mono text-xs font-semibold",
                sfAlerte ? "text-orange-700" : "text-slate-600"
              )}
            >
              {formatOf(of.sf.of)}
            </span>
            <div className="flex flex-1 items-center gap-2">
              <div
                className={cn(
                  "h-2.5 flex-1 overflow-hidden rounded-full",
                  sfAlerte ? "bg-orange-200" : "bg-slate-300"
                )}
              >
                <div
                  className={cn(
                    "h-full rounded-full",
                    sfAlerte
                      ? "bg-orange-500"
                      : sfPct >= 100
                        ? "bg-emerald-500"
                        : sfPct >= 50
                          ? "bg-wms"
                          : "bg-amber-500"
                  )}
                  // Un SF à 0 % en alerte doit rester visible : filet mini.
                  style={{ width: `${sfAlerte ? Math.max(sfPct, 4) : sfPct}%` }}
                />
              </div>
              <span
                className={cn(
                  "min-w-[40px] text-right text-xs font-bold",
                  sfAlerte ? "text-orange-700" : "text-slate-600"
                )}
              >
                {sfPct}%
              </span>
            </div>
            {sfAlerte && (
              <span
                className="flex items-center gap-1 rounded bg-orange-500 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white"
                title={sfAlerteRaison}
              >
                <AlertTriangle className="h-2.5 w-2.5" />
                {sfDebutTs == null ? "Non débuté" : "En retard"}
              </span>
            )}
            {/* Quantité SF agrandie : c'est le chiffre que l'on cherche de
                loin sur la ligne, il était en 10px. */}
            <span className="whitespace-nowrap text-2xl font-extrabold leading-none tabular-nums text-slate-800">
              {formatNumber(of.sf.qteFabriquee)}
              <span className="mx-1 text-lg font-normal text-slate-400">/</span>
              {formatNumber(of.sf.quantite)}
            </span>
            <button
              type="button"
              onClick={() => setShowSf(true)}
              disabled={!of.sf.of}
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm font-bold tabular-nums transition-colors",
                !of.sf.of
                  ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                  : of.sf.nbTotalComposants === 0
                    ? "border-slate-300 bg-white text-slate-500 hover:bg-slate-50"
                    : of.sf.nbComposantsReceptionnes >= of.sf.nbTotalComposants
                      ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                      : of.sf.nbComposantsReceptionnes === 0
                        ? "border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100"
                        : "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
              )}
              title={
                of.sf.of
                  ? "Composants du SF réceptionnés — cliquer pour le détail"
                  : "Aucun SF associé"
              }
            >
              <InfoIcon className="h-3.5 w-3.5" />
              {of.sf.nbComposantsReceptionnes} / {of.sf.nbTotalComposants}
              <span className="font-semibold opacity-70">composants</span>
            </button>
          </div>

          <div className="grid grid-cols-4 gap-3">
            <TotalBox
              label="Total Palette"
              palettes={of.quantitePalettes}
              estimee={of.quantitePalettesEstimee}
              totalPieces={of.quantiteTotalPieces}
              kar={of.quantite}
              unit={of.unite === "KAR" ? "CRN" : of.unite}
            />
            <QteBox
              label="Qté Remplie"
              icon={Droplets}
              tone="rempli"
              kar={of.qteRempli}
              pieces={of.qteRempliPieces}
              totalPieces={of.qteRempliTotalPieces}
              palettes={of.qteRempliPalettes}
              finale={etapeFinale(of.qteRempliPalettes, of.qteRempli)}
            />
            <QteBox
              label="Qté Fardelée"
              badge={of.dernierPostePolypack}
              icon={PackageIcon}
              tone="fardele"
              kar={of.qtePolypackee}
              pieces={of.qtePolypackeePieces}
              totalPieces={of.qtePolypackeeTotalPieces}
              palettes={of.qtePolypackeePalettes}
              finale={etapeFinale(of.qtePolypackeePalettes, of.qtePolypackee)}
            />
            <QteBox
              label="Qté Livrée"
              icon={Truck}
              tone="livre"
              kar={of.qteLivree}
              pieces={of.qteLivreePieces}
              totalPieces={of.qteLivreeTotalPieces}
              palettes={of.qteLivreePalettes}
              finale={etapeFinale(of.qteLivreePalettes, of.qteLivree)}
            />
          </div>

          {/* Bloc bas (cards durée/dates + barres) : occupe l'espace restant
              (flex-1) et tout le groupe est poussé en BAS (justify-end), l'espace
              libre se plaçant au-dessus des cards. */}
          <div className="flex flex-1 flex-col justify-end gap-3">
          {/* "Durée Reste Production" (of.dureeResteProductionMinutes) est
              volontairement masquée — l'extrapolation n'était pas sur la même
              base que le cumul affiché. Le champ reste dispo côté API. */}
          <div className="grid grid-cols-2 gap-3">
            <MetricBox
              label="Durée Production (cumul)"
              // Cumul du seul statut "OF Débuté" : c'est le temps de production
              // effectif, hors pauses, pannes et attentes.
              value={formatDureeMinutes(of.dureeProductionEcouleeMinutes)}
              tone="cumul"
              title="Σ des durées passées en statut « OF Débuté » — temps de production effectif, hors pauses, pannes et attentes"
            />
            {/* Contrôles rapportés au temps de production : « 3 contrôles »
                seul ne dit rien, 3 contrôles en 2 h ou en 3 jours n'ont pas le
                même sens. Le dénominateur est le cumul en statut Débuté. */}
            <MetricBox
              label="Contrôles Qualité / Durée Prod"
              value={`${of.qualityEvents.length} / ${formatDureeMinutes(of.dureeProductionEcouleeMinutes)}`}
              tone="qualite"
              title={`${of.qualityEvents.length} contrôle(s) qualité pour ${formatDureeMinutes(of.dureeProductionEcouleeMinutes)} de production effective (statut OF Débuté)`}
            />
            <MetricBox
              label="Date Demande Composant"
              value={formatDateTimeFr(of.dateDemandeComposant)}
              tone="demande"
            />
          </div>

          {/* Barres de progression en cascade : TH → Rempli → Polypack → Livré */}
          <div className="space-y-2">
            <ProgressBar
              label="Qté Remplie / Quantité TH"
              numerator={of.qteRempli}
              denominator={of.quantite}
              pct={rempliPct}
            />
            <ProgressBar
              label="Qté Fardelée / Qté Remplie"
              numerator={of.qtePolypackee}
              denominator={of.qteRempli}
              pct={polypackSurRempliPct}
            />
            <ProgressBar
              label="Qté Livrée / Qté Fardelée"
              numerator={of.qteLivree}
              denominator={of.qtePolypackee}
              pct={livreSurPolypackPct}
            />
          </div>
          </div>
        </div>

        {/* RIGHT — Timeline visuelle Gantt + axe + dots */}
        <div className="bg-slate-50 p-5">
          <Timeline of={of} />
        </div>
      </div>

      {showComposants && (
        <ComposantsModal
          ofCode={of.of}
          statusLogistique={of.statusLogistique}
          onClose={() => setShowComposants(false)}
        />
      )}

      {showHistorique && (
        <StatusHistoryModal of={of} onClose={() => setShowHistorique(false)} />
      )}

      {showSf && <SfModal of={of} onClose={() => setShowSf(false)} />}
    </div>
  )
})

/** Palette des cartes quantité — une teinte par étape du flux. */
const QTE_TONES = {
  rempli: {
    card: "border-wms-light bg-wms-bg text-wms-dark",
    accent: "text-wms-dark",
  },
  fardele: {
    card: "border-indigo-200 bg-indigo-50 text-indigo-800",
    accent: "text-indigo-800",
  },
  livre: {
    card: "border-emerald-200 bg-emerald-50 text-emerald-800",
    accent: "text-emerald-800",
  },
} as const

/**
 * Carte "Quantité TH" — même gabarit et même ordre de lecture que les cartes
 * QTE (palettes → pièces → cartons) pour permettre la comparaison directe
 * ligne à ligne avec Remplie / Fardelée / Livrée. Ton neutre.
 */
function TotalBox({
  label,
  palettes,
  estimee,
  totalPieces,
  kar,
  unit,
}: {
  label: string
  palettes: number
  estimee: boolean
  totalPieces: number | null
  kar: number
  unit: string
}) {
  return (
    <div
      className="flex flex-col rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-slate-700"
      title={
        estimee
          ? `${label} — ${formatNumber(palettes)} palettes prévues (calculé : quantité ÷ gerbage ; les fiches palette ne sont pas encore créées) · ${totalPieces != null ? `${formatNumber(totalPieces)} pcs · ` : ""}${formatNumber(kar)} ${unit}`
          : `${label} — ${formatNumber(palettes)} palette(s) · ${totalPieces != null ? `${formatNumber(totalPieces)} pcs · ` : ""}${formatNumber(kar)} ${unit}`
      }
    >
      <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide opacity-80">
        <Boxes className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{label}</span>
      </div>

      {/* Chiffre phare : nb total de palettes de l'OF. Le "≈" signale que les
          fiches palette n'existent pas encore et que c'est le prévu calculé. */}
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-3xl font-extrabold leading-none tabular-nums">
          {estimee && <span className="opacity-50">≈</span>}
          {formatNumber(palettes)}
        </span>
        <span className="text-xs font-semibold uppercase opacity-70">
          palette{palettes > 1 ? "s" : ""}
        </span>
      </div>

      <div className="my-1.5 h-px bg-current opacity-20" />

      <div className="space-y-1">
        <div className="text-base font-bold leading-none tabular-nums">
          {totalPieces != null ? formatNumber(totalPieces) : "—"}
          <span className="ml-0.5 text-[11px] font-semibold opacity-70">
            pcs
          </span>
        </div>
        <div className="text-sm font-bold leading-none tabular-nums">
          {formatNumber(kar)}
          <span className="ml-0.5 text-[11px] font-semibold opacity-70">
            {unit}
          </span>
        </div>
      </div>
    </div>
  )
}

/**
 * Carte QTE avec 3 niveaux de lecture, du plus parlant en atelier au plus
 * précis :
 *   1. Palettes (nb fiches) — chiffre principal
 *   2. Total pièces (Σ fiche.qte_*)
 *   3. Cartons entiers + pièces restantes (XXXX CRN + Y pcs)
 * À 0, la carte passe en gris pour ne pas capter l'œil.
 */
function QteBox({
  label,
  badge,
  icon: Icon,
  tone,
  kar,
  pieces,
  totalPieces,
  palettes,
  finale,
}: {
  label: string
  badge?: string | null
  icon: React.ComponentType<{ className?: string }>
  tone: keyof typeof QTE_TONES
  kar: number
  pieces: number
  totalPieces: number
  palettes: number
  /** Toutes les palettes de l'OF sont passées par cette étape */
  finale?: boolean
}) {
  const empty = palettes === 0 && totalPieces === 0 && kar === 0
  const t = QTE_TONES[tone]
  return (
    <div
      className={cn(
        "flex flex-col rounded-lg border px-3 py-2",
        empty ? "border-slate-200 bg-slate-50 text-slate-400" : t.card
      )}
      title={`${label} — ${formatNumber(palettes)} palette(s) · ${formatNumber(totalPieces)} pcs · ${formatNumber(Math.round(kar))} CRN + ${formatNumber(pieces)} pcs`}
    >
      <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide opacity-80">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{label}</span>
        {badge && (
          <span className="ml-auto shrink-0 rounded bg-white/70 px-1 text-[10px] font-bold tabular-nums">
            {badge}
          </span>
        )}
        {/* Étape terminée : rond vert coché, aligné à droite de l'entête. */}
        {finale && (
          <CircleCheck
            className={cn("h-5 w-5 shrink-0 text-emerald-600", !badge && "ml-auto")}
            aria-label="Étape terminée"
          />
        )}
      </div>

      {/* Chiffre phare : palettes */}
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-3xl font-extrabold leading-none tabular-nums">
          {formatNumber(palettes)}
        </span>
        <span className="text-xs font-semibold uppercase opacity-70">
          palette{palettes > 1 ? "s" : ""}
        </span>
      </div>

      <div className="my-1.5 h-px bg-current opacity-20" />

      {/* Total pièces, puis cartons entiers + reliquat */}
      <div className="space-y-1">
        <div className="text-base font-bold leading-none tabular-nums">
          {formatNumber(totalPieces)}
          <span className="ml-0.5 text-[11px] font-semibold opacity-70">
            pcs
          </span>
        </div>
        <div className="text-sm font-bold leading-none tabular-nums">
          {formatNumber(Math.round(kar))}
          <span className="ml-0.5 text-[11px] font-semibold opacity-70">
            CRN
          </span>
          <span className="mx-1 opacity-50">+</span>
          {formatNumber(pieces)}
          <span className="ml-0.5 text-[11px] font-semibold opacity-70">
            pcs
          </span>
        </div>
      </div>
    </div>
  )
}

/**
 * Popover affichant la légende des icônes du timeline.
 * Utilise la même liste partagée que le bandeau légende en haut de page.
 */
function TimelineLegendPopover({ onClose }: { onClose: () => void }) {
  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="absolute right-0 top-full z-50 mt-1 max-h-[80vh] w-[34rem] overflow-auto rounded-xl border-2 border-slate-300 bg-white p-5 shadow-2xl">
        <div className="mb-4 border-b-2 border-slate-200 pb-3 text-lg font-bold uppercase tracking-wide text-slate-800">
          Légende timeline
        </div>
        <ul className="space-y-3">
          {TIMELINE_LEGEND_ITEMS.map((it) => (
            <li key={it.label}>
              <LegendChip item={it} />
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}

function MetricBox({
  label,
  value,
  tone,
  title,
}: {
  label: string
  value: string
  tone: "ordo" | "demande" | "cumul" | "qualite"
  title?: string
}) {
  const cls =
    tone === "ordo"
      ? "border-wms-light bg-wms-bg text-wms"
      : tone === "cumul"
        ? "border-slate-300 bg-slate-100 text-slate-700"
        : tone === "qualite"
          ? "border-violet-200 bg-violet-50 text-violet-700"
          : "border-amber-200 bg-amber-50 text-amber-700"
  return (
    <div className={cn("rounded-lg border px-3 py-2", cls)} title={title}>
      <div className="text-[11px] font-semibold uppercase tracking-wide opacity-80">
        {label}
      </div>
      <div className="mt-1 text-base font-bold">{value}</div>
    </div>
  )
}

function ProgressBar({
  label,
  numerator,
  denominator,
  pct,
}: {
  label: string
  numerator: number
  denominator: number
  pct: number
}) {
  // On plafonne visuellement la barre à 100% mais on affiche le ratio réel.
  const barWidth = Math.min(100, Math.max(pct, numerator > 0 ? 2 : 0))
  const over = pct > 100
  const tooltip = `${label} : ${formatNumber(numerator)} / ${formatNumber(denominator)} (${pct}%)`
  return (
    <div title={tooltip} className="cursor-help">
      <div className="mb-1 flex justify-between text-xs font-semibold uppercase text-slate-500">
        <span>{label}</span>
        <span
          className={cn(
            pct === 0
              ? "text-rose-500"
              : over
                ? "text-indigo-600"
                : "text-emerald-600"
          )}
        >
          {formatNumber(numerator)} / {formatNumber(denominator)} ({pct}%)
        </span>
      </div>
      <div className="h-3.5 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-700",
            pct === 0
              ? "bg-rose-300"
              : over
                ? "bg-indigo-500"
                : pct >= 100
                  ? "bg-emerald-500"
                  : pct >= 50
                    ? "bg-wms"
                    : "bg-amber-500"
          )}
          style={{ width: `${barWidth}%` }}
        />
      </div>
    </div>
  )
}
