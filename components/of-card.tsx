import { memo, useState } from "react"
import {
  cn,
  darkenForText,
  formatDateFr,
  formatDateTimeFr,
  formatDureeMinutes,
  formatNumber,
  formatOf,
  horsTolerance,
  relativeLuminance,
} from "@/lib/utils"
import type { OfRow } from "@/lib/types"
import { StatusPill } from "./status-pill"
import { Timeline } from "./timeline"
import { ComposantsModal } from "./composants-modal"
import { StatusHistoryModal } from "./status-history-modal"
import { QualiteModal } from "./qualite-modal"
import {
  AlertTriangle,
  Beaker,
  Boxes,
  CalendarClock,
  CircleCheck,
  Droplets,
  Gauge,
  Info as InfoIcon,
  MoreVertical,
  Package as PackageIcon,
  Truck,
  TrendingUp,
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
  const [showLegend, setShowLegend] = useState(false)
  const [showHistorique, setShowHistorique] = useState(false)
  const [showQualite, setShowQualite] = useState(false)
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

  // ---- Cadence réellement tenue ------------------------------------------
  // pièces effectivement remplies ÷ temps effectivement produit (statut OF
  // Débuté). À comparer à la cadence théorique de la gamme : le rapport des
  // deux est le rendement de la ligne sur cet OF.
  const cadenceReelle =
    of.dureeProductionEcouleeMinutes != null &&
    of.dureeProductionEcouleeMinutes > 0 &&
    of.qteRempliTotalPieces > 0
      ? of.qteRempliTotalPieces / of.dureeProductionEcouleeMinutes
      : null
  const rendementPct =
    cadenceReelle != null && of.cadencePiecesParMinute
      ? Math.round((cadenceReelle / of.cadencePiecesParMinute) * 100)
      : null
  // Durée de production que représente TOUT l'OF au rythme constaté, et ce
  // qu'il en reste. Null pour les articles au poids (pas de quantité en pièces).
  const dureeTotaleCadenceReelle =
    cadenceReelle != null && of.quantiteTotalPieces != null
      ? Math.round(of.quantiteTotalPieces / cadenceReelle)
      : null
  const resteCadenceReelle =
    cadenceReelle != null && of.quantiteTotalPieces != null
      ? Math.round(
          Math.max(0, of.quantiteTotalPieces - of.qteRempliTotalPieces) /
            cadenceReelle
        )
      : null

  // ---- Dates de fin projetées --------------------------------------------
  // Deux projections de la date à laquelle l'OF sera terminé : l'une au rythme
  // de la gamme, l'autre au rythme réellement tenu. L'écart entre les deux dit
  // le retard qui se creuse.
  //
  // Ce sont des minutes de PRODUCTION ajoutées à maintenant : la projection
  // suppose une production continue, sans pause ni arrêt. La date réelle sera
  // donc plus tardive — ces valeurs bornent l'optimisme, elles ne le prédisent
  // pas.
  const restePieces =
    of.quantiteTotalPieces != null
      ? Math.max(0, of.quantiteTotalPieces - of.qteRempliTotalPieces)
      : null
  const projeter = (minutes: number | null): string | null =>
    minutes == null || restePieces === 0
      ? null
      : new Date(Date.now() + minutes * 60_000).toISOString()
  const dateFinTheorique = projeter(
    restePieces != null && of.cadencePiecesParMinute
      ? restePieces / of.cadencePiecesParMinute
      : null
  )

  const dateFinReelle = projeter(
    restePieces != null && cadenceReelle ? restePieces / cadenceReelle : null
  )

  // Temps écoulé depuis le démarrage RÉEL de la production (1er event OFDE),
  // pauses et arrêts compris. À comparer à "Durée Production (cumul)" qui, lui,
  // ne compte que le temps effectivement produit : l'écart entre les deux est
  // le temps perdu.
  const ecouleDepuisDebutMinutes = of.dateDebutProduction
    ? Math.max(
        0,
        Math.round(
          (Date.now() - new Date(of.dateDebutProduction).getTime()) / 60_000
        )
      )
    : null

  // Contrôles qualité dont le poids sort des bornes de dosage. Signalés par
  // une alerte sur la tuile : un dosage hors tolérance est un rebut potentiel,
  // ça ne doit pas attendre l'ouverture du détail.
  const controlesHorsTolerance = of.qualityEvents.filter((c) =>
    horsTolerance(c.poids, of.dosageMin, of.dosageMax)
  ).length

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
          {/* Durées de production, réelle et théorique, côte à côte. Le budget
              théorique porte sur l'OF ENTIER : le comparer au réel n'a de sens
              qu'en fin d'OF. L'infobulle donne la comparaison à périmètre égal,
              sur les pièces déjà produites. */}
          {/* Statut logistique retiré d'ici : il porte sur la réception des
              composants, il est donc à sa place dans le modal composants. */}
          {/* Badge RETARD retiré de l'entête : les trois dates de fin
              (ordo, théorique, réelle) disent déjà où en est l'OF. */}
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
              {/* Chiffres bruts, sans séparateur de milliers : formatNumber
                  insère un espace insécable étroit (U+202F) qui, sur deux
                  nombres séparés par un slash, brouille la lecture. */}
              {Math.round(of.sf.qteFabriquee)}
              <span className="mx-1.5 text-lg font-normal text-slate-400">/</span>
              {of.sf.quantite != null ? Math.round(of.sf.quantite) : "--"}
            </span>
            {/* Information seule, non cliquable : le détail des composants du
                SF n'est pas consultable depuis ici. */}
            <span
              className="flex select-none items-center gap-1.5 rounded-md border border-slate-300 bg-slate-100 px-2.5 py-1.5 text-sm font-bold tabular-nums text-slate-500"
              title={
                of.sf.of
                  ? "Composants du SF réceptionnés sur le total"
                  : "Aucun SF associé"
              }
            >
              <InfoIcon className="h-3.5 w-3.5" />
              {of.sf.nbComposantsReceptionnes} / {of.sf.nbTotalComposants}
              <span className="font-semibold opacity-70">composants</span>
            </span>
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

          {/* Barres de progression en cascade : TH → Rempli → Polypack → Livré.
              Placées juste sous les cartes quantité qu'elles résument, plutôt
              qu'en bas de colonne : elles se lisent avec elles, et l'espace
              vide qui traînait au milieu disparaît. */}
          <div className="mt-2 space-y-2.5">
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
          {/* Cadence en vis-à-vis de la date de fin qu'elle produit : chaque
              ligne se lit « à ce rythme, l'OF finit à cette heure ». L'écart
              entre les deux lignes est directement l'écart au plan. */}
          {(cadenceReelle != null || of.cadencePiecesParMinute != null) && (
            <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
              <CadenceFinLigne
                icone={TrendingUp}
                libelle="Réelle"
                cadence={
                  cadenceReelle != null
                    ? cadenceReelle.toLocaleString("fr-FR", {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 1,
                      })
                    : null
                }
                date={dateFinReelle}
                ton={
                  rendementPct == null
                    ? "neutre"
                    : rendementPct >= 100
                      ? "ok"
                      : "alerte"
                }
                title={`Cadence réellement tenue : ${of.qteRempliTotalPieces.toLocaleString("fr-FR")} pièces en ${formatDureeMinutes(of.dureeProductionEcouleeMinutes)} de production effective${of.cadencePiecesParMinute ? ` — soit ${rendementPct}% de la cadence de la gamme` : ""}. Fin projetée à ce rythme, production continue supposée.`}
              />
              <CadenceFinLigne
                icone={Gauge}
                libelle="Théorique"
                cadence={
                  of.cadencePiecesParMinute != null
                    ? formatNumber(of.cadencePiecesParMinute)
                    : null
                }
                date={dateFinTheorique}
                ton="theo"
                title={`Cadence de la gamme${of.cadenceLibelle ? ` — ${of.cadenceLibelle}` : ""}. Fin projetée à ce rythme, production continue supposée.`}
              />
            </div>
          )}


          {/* Cards durées/dates : poussées en bas de colonne (flex-1 +
              justify-end), l'espace libre restant se plaçant au-dessus. */}
          <div className="flex flex-1 flex-col justify-end gap-3">
          {/* "Durée Reste Production" (of.dureeResteProductionMinutes) est
              volontairement masquée — l'extrapolation n'était pas sur la même
              base que le cumul affiché. Le champ reste dispo côté API. */}
          <div className="grid grid-cols-2 gap-3">
            <MetricBox
              label="Écoulé depuis Date Début"
              value={formatDureeMinutes(ecouleDepuisDebutMinutes)}
              tone="ordo"
              title={
                of.dateDebutProduction
                  ? `Production démarrée le ${formatDateTimeFr(of.dateDebutProduction)} — temps écoulé depuis, pauses et arrêts compris`
                  : "L'OF n'a pas encore démarré"
              }
            />
            {/* Contrôles rapportés au temps de production : « 3 contrôles »
                seul ne dit rien, 3 contrôles en 2 h ou en 3 jours n'ont pas le
                même sens. Le dénominateur est le cumul en statut Débuté. */}
            <MetricBox
              label="Contrôles Qualité / Durée Prod"
              value={`${of.qualityEvents.length} / ${formatDureeMinutes(of.dureeProductionEcouleeMinutes)}`}
              tone="qualite"
              alerte={controlesHorsTolerance > 0}
              title={
                controlesHorsTolerance > 0
                  ? `${controlesHorsTolerance} contrôle(s) hors tolérance : poids en dehors de [${of.dosageMin} – ${of.dosageMax}]. Cliquer pour le détail.`
                  : `${of.qualityEvents.length} contrôle(s) qualité pour ${formatDureeMinutes(of.dureeProductionEcouleeMinutes)} de production effective — cliquer pour le détail`
              }
              onClick={() => setShowQualite(true)}
            />
            {/* Ce que l'OF entier coûtera en temps machine au rythme constaté,
                à opposer à la cadence théorique de la gamme. */}
            <MetricBox
              label="Durée Prod. à cadence réelle"
              value={formatDureeMinutes(dureeTotaleCadenceReelle)}
              tone="cadence"
              title={
                dureeTotaleCadenceReelle != null
                  ? `Durée de production de tout l'OF au rythme constaté (${cadenceReelle!.toFixed(1)} pcs/min) — il en reste ${formatDureeMinutes(resteCadenceReelle)}`
                  : "Cadence réelle non calculable : production pas encore démarrée, ou article au poids"
              }
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

      {showQualite && (
        <QualiteModal of={of} onClose={() => setShowQualite(false)} />
      )}

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
        {/* Étape terminée : rond coché, aligné à droite de l'entête.
            Vert pur (#16a34a) et non emerald, qui tire vers le turquoise et se
            confondait avec le bleu-vert de la carte Qté Remplie. */}
        {finale && (
          <CircleCheck
            className={cn("h-5 w-5 shrink-0", !badge && "ml-auto")}
            style={{ color: "#16a34a" }}
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

/**
 * Une ligne du bloc « cadence ↔ date de fin » : la cadence à gauche, la date
 * de fin qu'elle implique à droite. Les mettre en vis-à-vis évite d'avoir à
 * relier mentalement deux badges éloignés dans l'entête.
 */
function CadenceFinLigne({
  icone: Icone,
  libelle,
  cadence,
  date,
  ton,
  title,
}: {
  icone: React.ComponentType<{ className?: string }>
  libelle: string
  cadence: string | null
  date: string | null
  ton: "ok" | "alerte" | "theo" | "neutre"
  title?: string
}) {
  const cls =
    ton === "ok"
      ? "bg-emerald-50 text-emerald-800"
      : ton === "alerte"
        ? "bg-amber-50 text-amber-800"
        : ton === "theo"
          ? "bg-sky-50 text-sky-800"
          : "bg-slate-50 text-slate-700"
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 border-b border-white/60 px-3 py-2 text-sm last:border-b-0",
        cls
      )}
      title={title}
    >
      <span className="flex min-w-0 items-center gap-1.5 font-bold tabular-nums">
        <Icone className="h-4 w-4 shrink-0" />
        <span className="text-[10px] font-semibold uppercase opacity-70">
          {libelle}
        </span>
        {cadence ?? "--"}
        <span className="text-[10px] font-semibold opacity-70">pcs/min</span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5 font-bold tabular-nums">
        <span className="text-[10px] font-semibold uppercase opacity-70">
          Fin
        </span>
        {date ? formatDateTimeFr(date) : "--"}
      </span>
    </div>
  )
}

function MetricBox({
  label,
  value,
  tone,
  title,
  onClick,
  alerte,
}: {
  label: string
  value: string
  tone: "ordo" | "demande" | "cumul" | "qualite" | "cadence"
  title?: string
  /** Rend la carte cliquable — elle devient alors un vrai <button>. */
  onClick?: () => void
  /** Affiche un triangle rouge : une valeur demande une action. */
  alerte?: boolean
}) {
  const cls =
    tone === "ordo"
      ? "border-wms-light bg-wms-bg text-wms"
      : tone === "cumul"
        ? "border-slate-300 bg-slate-100 text-slate-700"
        : tone === "cadence"
        ? "border-sky-200 bg-sky-50 text-sky-700"
        : tone === "qualite"
          ? "border-violet-200 bg-violet-50 text-violet-700"
          : "border-amber-200 bg-amber-50 text-amber-700"
  const contenu = (
    <>
      <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide opacity-80">
        {alerte && (
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-600" />
        )}
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1 text-base font-bold">{value}</div>
    </>
  )
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={title}
        className={cn(
          "rounded-lg border px-3 py-2 text-left transition-transform hover:scale-[1.02] hover:shadow-md",
          cls,
          alerte && "border-rose-400 ring-2 ring-rose-200"
        )}
      >
        {contenu}
      </button>
    )
  }
  return (
    <div className={cn("rounded-lg border px-3 py-2", cls)} title={title}>
      {contenu}
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
