"use client"

/**
 * Timeline interactive d'un OF — style "monitoring" (Recharts).
 *
 * Trois rails sur l'axe Y : SF, Remplissage, Polypackage (empilés du haut vers
 * le bas). Axe X temporel avec zoom et sélecteur de plage de dates. Chaque
 * event de `of.events` est un point scatter coloré + icône Unicode. Les dates
 * spéciales (Téléchargement, Demande Composant, Date Système, Estimation,
 * Now) sont des ReferenceLine verticales.
 */

import { useEffect, useMemo, useState } from "react"
import {
  CartesianGrid,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  XAxis,
  YAxis,
} from "recharts"
import { format } from "date-fns"
import { fr } from "date-fns/locale"
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
import { cn } from "@/lib/utils"
import type { OfRow, TimelineEvent } from "@/lib/types"
import { getEventIcon } from "@/lib/event-icon"

// Rails empilés de bas en haut avec un écart constant de 1.
// Le flux production va de bas (livraison = dernière étape) vers le haut
// (SF = source amont). Les bandes transverses (qualité, intervention) sont
// intercalées au-dessus du flux.
const RAIL_Y: Record<TimelineEvent["rail"], number> = {
  SF: 7,
  Remplissage: 4,
  Fardelage: 3,
  Livraison: 2,
}
const STATUS_BAND_Y = 1
const QUALITY_Y = 5
const INTERVENTION_Y = 6
const Y_MAX = 7.5

interface Props {
  of: OfRow
}

export function Timeline({ of }: Props) {
  const [containerWidth, setContainerWidth] = useState(100)
  // Mode "Shift" = fenêtre resserrée sur le cluster d'events récents.
  // Actif PAR DÉFAUT : c'est la vue utile en salle (ce qui vient de se passer).
  // Le bouton bascule vers la vue complète (toute la vie de l'OF).
  const [shiftMode, setShiftMode] = useState(true)

  const { defaultStart, defaultEnd, lastOperationTs } = useMemo(() => {
    const eventTs = of.events.map((e) => new Date(e.date).getTime())
    const statusEnds = of.statusHistoryPF
      .map((p) => (p.end ? new Date(p.end).getTime() : null))
      .filter((x): x is number => x != null)
    const anchors = [
      of.dateDebutOrdo,
      of.dateDebutProduction,
      of.dateTelechargement,
      of.sf.dateTelechargement,
      of.dateDemandeLivraison,
      of.dateSystemeDemande,
    ]
      .filter(Boolean)
      .map((d) => new Date(d!).getTime())
    const mins = [...eventTs, ...anchors]
    const maxs = [...eventTs, ...statusEnds, ...anchors]
    const s = mins.length ? Math.min(...mins) : Date.now() - 86_400_000
    const e = maxs.length ? Math.max(...maxs) : Date.now()
    const pad = Math.max((e - s) * 0.03, 10 * 60_000)
    // Dernière opération réelle = dernier event OU dernière fin de statut
    // (pas les anchors qui sont des dates de référence, pas des opérations)
    const opsOnly = [...eventTs, ...statusEnds]
    const lastOp = opsOnly.length > 0 ? Math.max(...opsOnly) : e
    return { defaultStart: s - pad, defaultEnd: e + pad, lastOperationTs: lastOp }
  }, [of])

  // Fenêtre "Shift" : les 10 derniers events de TOUTES les sources (events,
  // qualité, interventions, téléchargements, fins de bandes statut), avec un
  // padding généreux pour que les icônes (r=12px) ne débordent pas des bords.
  // Recalculée à chaque refresh des données → la vue suit la production.
  const { shiftStart, shiftEnd } = useMemo(() => {
    const allTs: number[] = [
      ...of.events.map((e) => new Date(e.date).getTime()),
      ...of.qualityEvents.map((q) => new Date(q.date).getTime()),
      ...of.interventions.map((i) => new Date(i.date).getTime()),
      ...(of.dateTelechargement
        ? [new Date(of.dateTelechargement).getTime()]
        : []),
      ...(of.sf.dateTelechargement
        ? [new Date(of.sf.dateTelechargement).getTime()]
        : []),
      ...of.statusHistoryPF
        .map((p) => (p.end ? new Date(p.end).getTime() : 0))
        .filter((t) => t > 0),
    ].sort((a, b) => a - b)
    const recent = allTs.slice(-10)
    if (recent.length >= 2) {
      const span = recent[recent.length - 1] - recent[0]
      const pad = Math.max(span * 0.35, 60 * 60 * 1000)
      return {
        shiftStart: recent[0] - pad,
        shiftEnd: recent[recent.length - 1] + pad,
      }
    }
    return {
      shiftStart: lastOperationTs - 8 * 60 * 60 * 1000,
      shiftEnd: lastOperationTs,
    }
  }, [of, lastOperationTs])

  const rangeStart = shiftMode ? shiftStart : defaultStart
  const rangeEnd = shiftMode ? shiftEnd : defaultEnd

  const scatterData = useMemo(
    () =>
      of.events
        .map((e) => ({
          date: new Date(e.date).getTime(),
          y: RAIL_Y[e.rail],
          rail: e.rail,
          label: e.label,
          color: e.color,
          code: e.code,
          type: e.type,
          category: e.category,
          qte: e.qte,
          qteCarton: e.qteCarton,
          palette: e.palette,
        }))
        .filter((d) => d.date >= rangeStart && d.date <= rangeEnd),
    [of.events, rangeStart, rangeEnd]
  )

  // Demandes d'intervention (avis) — Scatter dédié, Y=5.
  // Chaque avis génère 1 dot à sa création + (s'il est clôturé) 1 dot à la date
  // de clôture, avec une icône distincte (avis résolu).
  const interventionData = useMemo(() => {
    return of.interventions
      .flatMap((i) => {
        const dots = [
          {
            date: new Date(i.date).getTime(),
            y: INTERVENTION_Y,
            rail: "DI PF" as const,
            label: `Avis ${i.avisNumber ?? i.id}`,
            color: i.arret ? "#dc2626" : (i.color ?? "#f97316"),
            code: `avis-${i.id}`,
            type: "logistique" as const,
            category: "PF" as const,
            qte: null,
            interventionInfo: i,
          },
        ]
        if (i.clotureDate) {
          dots.push({
            date: new Date(i.clotureDate).getTime(),
            y: INTERVENTION_Y,
            rail: "DI PF" as const,
            label: `Avis ${i.avisNumber ?? i.id} — Clôturé`,
            color: "#16a34a",
            code: `aviscloture-${i.id}`,
            type: "logistique" as const,
            category: "PF" as const,
            qte: null,
            interventionInfo: i,
          })
        }
        return dots
      })
      .filter((d) => d.date >= rangeStart && d.date <= rangeEnd)
  }, [of.interventions, rangeStart, rangeEnd])

  // Contrôles qualité — Scatter dédié
  const qualityData = useMemo(() => {
    return of.qualityEvents
      .map((q) => ({
        date: new Date(q.date).getTime(),
        y: QUALITY_Y,
        rail: "Contrôle Qualité PF" as const,
        label: `Contrôle qualité #${q.echantillon ?? q.id}`,
        color: "#8B5CF6",
        code: `quality-${q.id}`,
        type: "logistique" as const,
        category: "PF" as const,
        qte: null,
        qualityInfo: q,
      }))
      .filter((d) => d.date >= rangeStart && d.date <= rangeEnd)
  }, [of.qualityEvents, rangeStart, rangeEnd])

  // Téléchargements PF/SF — Scatter séparé. Recharts track leurs hovers
  // indépendamment, ce qui évite les confusions PF↔SF.
  const downloadData = useMemo(() => {
    const out: Array<{
      date: number
      y: number
      rail: TimelineEvent["rail"]
      label: string
      color: string
      code: string
      type: TimelineEvent["type"]
      category: "PF" | "SF"
      qte: null
    }> = []
    // Décalage vertical léger (+0.25) : download flotte juste au-dessus du
    // rail pour ne pas overlapper avec les dots du rail quand ils sont au
    // même X (ex: status Initialisé qui se déclenche 1-2s après createdAt).
    if (of.dateTelechargement) {
      out.push({
        date: new Date(of.dateTelechargement).getTime(),
        y: RAIL_Y.Remplissage + 0.25,
        rail: "Remplissage",
        label: "Téléchargement PF",
        color: "#0ea5e9",
        code: "dl-pf",
        type: "logistique",
        category: "PF",
        qte: null,
      })
    }
    if (of.sf.dateTelechargement) {
      out.push({
        date: new Date(of.sf.dateTelechargement).getTime(),
        y: RAIL_Y.SF + 0.25,
        rail: "SF",
        label: "Téléchargement SF",
        color: "#0284c7",
        code: "dl-sf",
        type: "logistique",
        category: "SF",
        qte: null,
      })
    }
    // Marqueurs dates (📦 Demande Composant + 📅 Date Système) — placés
    // au-dessus des downloads sur leurs rails respectifs (PF → Remplissage,
    // SF → SF), même comportement que les téléchargements.
    if (of.dateDemandeLivraison) {
      out.push({
        date: new Date(of.dateDemandeLivraison).getTime(),
        y: RAIL_Y.Remplissage,
        rail: "Remplissage",
        label: "Demande Composant PF",
        color: "#d97706",
        code: "demande-pf",
        type: "logistique",
        category: "PF",
        qte: null,
      })
    }
    if (of.dateSystemeDemande) {
      out.push({
        date: new Date(of.dateSystemeDemande).getTime(),
        y: RAIL_Y.Remplissage,
        rail: "Remplissage",
        label: "Date Système PF",
        color: "#9333ea",
        code: "systeme-pf",
        type: "logistique",
        category: "PF",
        qte: null,
      })
    }
    if (of.sf.dateDemandeLivraison) {
      out.push({
        date: new Date(of.sf.dateDemandeLivraison).getTime(),
        y: RAIL_Y.SF,
        rail: "SF",
        label: "Demande Composant SF",
        color: "#b45309",
        code: "demande-sf",
        type: "logistique",
        category: "SF",
        qte: null,
      })
    }
    if (of.sf.dateSystemeDemande) {
      out.push({
        date: new Date(of.sf.dateSystemeDemande).getTime(),
        y: RAIL_Y.SF,
        rail: "SF",
        label: "Date Système SF",
        color: "#7e22ce",
        code: "systeme-sf",
        type: "logistique",
        category: "SF",
        qte: null,
      })
    }
    // Icônes BC (Bon Complémentaire) — une par date distincte de livraison
    // sur les items type_poste='Z'. PF sur Remplissage, SF sur SF.
    for (const d of of.bcDatesPF) {
      out.push({
        date: new Date(d).getTime(),
        y: RAIL_Y.Remplissage,
        rail: "Remplissage",
        label: "Bon Complémentaire PF",
        color: "#ea580c",
        code: "bc-pf",
        type: "logistique",
        category: "PF",
        qte: null,
      })
    }
    for (const d of of.bcDatesSF) {
      out.push({
        date: new Date(d).getTime(),
        y: RAIL_Y.SF,
        rail: "SF",
        label: "Bon Complémentaire SF",
        color: "#c2410c",
        code: "bc-sf",
        type: "logistique",
        category: "SF",
        qte: null,
      })
    }
    return out.filter((d) => d.date >= rangeStart && d.date <= rangeEnd)
  }, [
    of.dateTelechargement,
    of.sf.dateTelechargement,
    of.bcDatesPF,
    of.bcDatesSF,
    rangeStart,
    rangeEnd,
  ])

  // Périodes de statut user PF (bande sous les rails, y=1). Rendu via
  // <ReferenceArea> purement visuel — ne capte pas les events tooltip
  // partagés Recharts, donc n'interfère pas avec le hover des icônes.
  // Le hover est géré séparément via onMouseEnter/Leave + tooltip HTML.
  const statusBands = useMemo(() => {
    return of.statusHistoryPF
      .map((p, idx) => {
        const start = new Date(p.start).getTime()
        const end = p.end ? new Date(p.end).getTime() : Date.now()
        if (end < rangeStart || start > rangeEnd) return null
        return {
          key: `${p.code}-${idx}-${p.start}`,
          code: p.code, // util-X (pour icône)
          designation: p.designation,
          color: p.color,
          start,
          end,
          clampedStart: Math.max(start, rangeStart),
          clampedEnd: Math.min(end, rangeEnd),
          durationMin: p.durationMin,
          consoSegment: p.consoSegment,
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
  }, [of.statusHistoryPF, rangeStart, rangeEnd])

  // Icônes de début de chaque période de statut PF (positionnées au start
  // de chaque band, sur la même Y que la band).
  const statusIconsData = useMemo(() => {
    return statusBands.map((b) => ({
      date: b.clampedStart,
      y: STATUS_BAND_Y,
      rail: "Statut PF" as const,
      label: b.designation,
      color: b.color,
      code: b.code,
      type: "utilisateur" as const,
      category: "PF" as const,
      qte: null,
      // Pour le tooltip : on injecte les infos d'origine
      statusInfo: {
        start: b.start,
        end: b.end,
        durationMin: b.durationMin,
      },
    }))
  }, [statusBands])

  const [hoveredBand, setHoveredBand] = useState<
    (typeof statusBands)[number] | null
  >(null)
  const [bandTipPos, setBandTipPos] = useState<{
    x: number
    y: number
  } | null>(null)

  // Tooltip custom pour les dots (remplace Recharts Tooltip qui ne gère
  // pas fiablement le hover quand des dots sont proches en X).
  const [hoveredDot, setHoveredDot] = useState<any>(null)
  const [dotTipPos, setDotTipPos] = useState<{
    x: number
    y: number
  } | null>(null)

  const handleDotEnter = (data: any, _idx: number, e: any) => {
    setHoveredDot(data)
    setDotTipPos({ x: e?.clientX ?? 0, y: e?.clientY ?? 0 })
  }
  const handleDotLeave = () => setHoveredDot(null)

  // Masque les tooltips au scroll (sinon le tooltip fixed suit l'écran)
  useEffect(() => {
    const hide = () => {
      setHoveredDot(null)
      setHoveredBand(null)
    }
    window.addEventListener("scroll", hide, true)
    return () => window.removeEventListener("scroll", hide, true)
  }, [])

  if (of.events.length < 2 && statusBands.length === 0) {
    return (
      <div className="py-8 text-center text-xs text-slate-400">
        Pas de données temporelles
      </div>
    )
  }

  const markers: {
    date: number
    color: string
    label: string
  }[] = []
  const nowTs = Date.now()
  if (nowTs >= rangeStart && nowTs <= rangeEnd)
    markers.push({
      date: nowTs,
      color: "#16a34a",
      label: "Maintenant",
    })

  // Ticks = dates réelles des events/marqueurs affichés dans le timeline.
  // On dédoublonne les dates trop proches (min = durée totale / 20).
  const adaptiveTicks = (() => {
    const all: number[] = [
      ...scatterData.map((d) => d.date),
      ...downloadData.map((d) => d.date),
      ...interventionData.map((d) => d.date),
      ...qualityData.map((d) => d.date),
      ...statusBands.map((b) => b.start),
      ...markers.map((m) => m.date),
    ]
      .filter((t) => t >= rangeStart && t <= rangeEnd)
      .sort((a, b) => a - b)
    if (all.length === 0) return [rangeStart, rangeEnd]
    // Dédup : tick >= tick_précédent + minGap
    const minGap = Math.max((rangeEnd - rangeStart) / 20, 60_000)
    const out: number[] = [all[0]]
    for (let i = 1; i < all.length; i++) {
      if (all[i] - out[out.length - 1] >= minGap) out.push(all[i])
    }
    return out
  })()

  const zoomHint = zoomIntervalLabel(containerWidth)

  return (
    <div className="flex flex-col">
      {/* ===== CONTROLS ===== */}
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px]">
        <button
          type="button"
          onClick={() => {
            setShiftMode((s) => !s)
            setContainerWidth(100)
          }}
          title={
            shiftMode
              ? "Vue resserrée sur les derniers events — cliquer pour voir tout l'OF"
              : "Vue complète de l'OF — cliquer pour resserrer sur les derniers events"
          }
          className={cn(
            "rounded px-3 py-1 font-semibold shadow-sm",
            shiftMode
              ? "bg-sky-600 text-white ring-2 ring-sky-300"
              : "bg-slate-200 text-slate-700 hover:bg-slate-300"
          )}
        >
          Shift
        </button>
        {/* Zoom + Reset masqués en mode Shift (timeline figé) */}
        {!shiftMode && (
          <>
            <div className="flex items-center gap-1.5">
              <label className="font-semibold text-slate-600" htmlFor="timeline-zoom">
                Zoom:
              </label>
              <input
                id="timeline-zoom"
                type="range"
                min={100}
                max={1000}
                step={50}
                value={containerWidth}
                onChange={(e) => setContainerWidth(Number(e.target.value))}
                className="w-28 cursor-pointer"
                aria-label="Zoom du timeline"
                title="Zoom"
              />
              <span className="tabular-nums text-slate-700">
                {containerWidth}%
              </span>
              <span className="text-[10px] text-sky-600">{zoomHint}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setContainerWidth(100)
              }}
              className="ml-auto rounded bg-slate-200 px-2 py-0.5 font-semibold text-slate-700 hover:bg-slate-300"
            >
          Reset
            </button>
          </>
        )}
      </div>

      {/* ===== CHART ===== */}
      <div
        className={cn(
          "relative select-none overflow-y-hidden [&_*]:outline-none [&_*]:focus:outline-none",
          shiftMode ? "overflow-x-hidden" : "overflow-x-auto"
        )}
        onMouseLeave={() => {
          setHoveredDot(null)
          setHoveredBand(null)
        }}
      >
        {hoveredBand && bandTipPos && (
          <div
            className="pointer-events-none fixed z-[100] max-w-sm rounded-lg border-2 border-slate-300 bg-white p-3 text-sm shadow-2xl"
            style={{
              left:
                typeof window !== "undefined" &&
                bandTipPos.x + 14 + 380 > window.innerWidth
                  ? bandTipPos.x - 14 - 380
                  : bandTipPos.x + 14,
              top: bandTipPos.y + 14,
            }}
          >
            <div className="flex items-center gap-1.5 text-base font-bold text-slate-800">
              <span
                className="h-2.5 w-2.5 rounded"
                style={{ background: hoveredBand.color }}
              />
              <span>{hoveredBand.designation}</span>
            </div>
            <div className="mt-1.5 space-y-1 text-sm text-slate-600">
              <div>
                <span className="font-semibold text-slate-500">Début :</span>{" "}
                {format(new Date(hoveredBand.start), "dd/MM/yyyy HH:mm:ss", {
                  locale: fr,
                })}
              </div>
              <div>
                <span className="font-semibold text-slate-500">Durée :</span>{" "}
                {formatDurationMin(hoveredBand.durationMin)}
              </div>
              {hoveredBand.consoSegment != null && (
                <div className="text-xs font-semibold text-emerald-700">
                  <span className="font-semibold text-slate-500">
                    ⚡ Conso sur ce statut :
                  </span>{" "}
                  {hoveredBand.consoSegment >= 0 ? "+" : ""}
                  {hoveredBand.consoSegment.toLocaleString("fr-FR", {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  })}{" "}
                  kWh
                </div>
              )}
            </div>
          </div>
        )}
        {hoveredDot && dotTipPos && (
          <DotTooltip data={hoveredDot} pos={dotTipPos} />
        )}
        <ResponsiveContainer width={`${containerWidth}%`} height={560}>
          <LineChart margin={{ top: 40, right: 20, left: 0, bottom: 50 }}>
            <CartesianGrid
              horizontal={true}
              vertical={false}
              stroke="#e5e7eb"
            />
            <XAxis
              dataKey="date"
              type="number"
              domain={[rangeStart, rangeEnd]}
              ticks={adaptiveTicks}
              scale="time"
              tickFormatter={(t) => formatTick(new Date(t), containerWidth)}
              tick={{
                fontSize: 9,
                fontWeight: 600,
                angle: -45,
                textAnchor: "end",
              }}
              height={50}
              stroke="#64748b"
            />
            <YAxis
              type="number"
              domain={[0, Y_MAX]}
              ticks={[1, 2, 3, 4, 5, 6, 7]}
              tickFormatter={(v) =>
                v === 7
                  ? "SF"
                  : v === 6
                    ? "DI PF"
                    : v === 5
                      ? "Contrôle Qualité PF"
                      : v === 4
                        ? "Remplissage"
                        : v === 3
                          ? "Fardelage"
                          : v === 2
                            ? "Livraison"
                            : v === 1
                              ? "Statut PF"
                              : ""
              }
              tick={{ fontSize: 10, fontWeight: 700, fill: "#334155" }}
              width={100}
              stroke="#94a3b8"
            />

            {markers.map((m, i) => (
              <ReferenceLine
                key={i}
                x={m.date}
                stroke={m.color}
                strokeWidth={2.5}
                label={{
                  value: `${m.label} — ${format(new Date(m.date), "dd/MM HH:mm", { locale: fr })}`,
                  position: "top",
                  angle: -90,
                  offset: -25,
                  dx: 14,
                  fontSize: 10,
                  fill: m.color,
                  fontWeight: 600,
                  fontFamily:
                    "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
                }}
              />
            ))}

            {/* Bandes de statut user PF (sous les rails, y=1) — ReferenceArea
                purement visuel + handlers natifs onMouseEnter/Leave pour
                déclencher un tooltip HTML séparé (pas Recharts → pas de
                conflit avec les icônes). */}
            {statusBands.map((b) => (
              <ReferenceArea
                key={b.key}
                x1={b.clampedStart}
                x2={b.clampedEnd}
                y1={STATUS_BAND_Y - 0.15}
                y2={STATUS_BAND_Y + 0.15}
                fill={b.color}
                fillOpacity={0.85}
                stroke="none"
                ifOverflow="hidden"
                onMouseEnter={((e: any) => {
                  setHoveredBand(b)
                  setBandTipPos({ x: e?.clientX ?? 0, y: e?.clientY ?? 0 })
                }) as any}
                onMouseMove={((e: any) => {
                  setBandTipPos({ x: e?.clientX ?? 0, y: e?.clientY ?? 0 })
                }) as any}
                onMouseLeave={(() => setHoveredBand(null)) as any}
              />
            ))}

            <Scatter
              data={scatterData}
              dataKey="y"
              shape={EventDot}
              onMouseEnter={handleDotEnter as any}
              onMouseLeave={handleDotLeave as any}
            />
            <Scatter
              data={downloadData}
              dataKey="y"
              shape={EventDot}
              onMouseEnter={handleDotEnter as any}
              onMouseLeave={handleDotLeave as any}
            />
            <Scatter
              data={interventionData}
              dataKey="y"
              shape={EventDot}
              onMouseEnter={handleDotEnter as any}
              onMouseLeave={handleDotLeave as any}
            />
            <Scatter
              data={qualityData}
              dataKey="y"
              shape={EventDot}
              onMouseEnter={handleDotEnter as any}
              onMouseLeave={handleDotLeave as any}
            />
            {/* Icônes au début de chaque période de statut PF (dans la bande) */}
            <Scatter
              data={statusIconsData}
              dataKey="y"
              shape={StatusBandDot}
              onMouseEnter={handleDotEnter as any}
              onMouseLeave={handleDotLeave as any}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ============================================================================
// Custom renderers
// ============================================================================

function getLucideIcon(
  code: string
): React.ComponentType<{ className?: string }> | null {
  if (code.startsWith("remp-") || code === "remplissage") return Droplets
  if (code.startsWith("poly-") || code === "polypackage") return Package
  if (code.startsWith("livr-") || code === "livraison") return Truck
  if (code.startsWith("sflivr-")) return Truck // livraison du vrac SF vers la ligne
  if (code === "log-7" || code === "log-8") return PackageCheck // Réception Partielle + Receptionnés
  if (code === "util-6") return Lock // Cloturé
  if (code.startsWith("quality-")) return FlaskConical // Contrôle qualité
  if (code.startsWith("aviscloture-")) return CircleCheck // Avis clôturé (résolu)
  if (code.startsWith("sfconf-final-")) return Flag // Confirmation FINALE du SF
  if (code.startsWith("sfconf-")) return Check // Confirmation partielle
  return null
}

function EventDot(props: any) {
  const { cx, cy, payload } = props
  if (cx == null || cy == null) return null
  const LucideIcon = getLucideIcon(payload.code)
  return (
    <g>
      <circle
        cx={cx}
        cy={cy}
        r={12}
        fill={payload.color}
        stroke="#0f172a"
        strokeWidth={0.75}
        opacity={0.95}
      />
      {LucideIcon ? (
        <foreignObject
          x={cx - 8}
          y={cy - 8}
          width={16}
          height={16}
          style={{ pointerEvents: "none" }}
        >
          <LucideIcon className="h-4 w-4 text-white" />
        </foreignObject>
      ) : (
        <text
          x={cx}
          y={cy + 4}
          textAnchor="middle"
          fontSize={12}
          fontWeight={700}
          fill="#ffffff"
          style={{ pointerEvents: "none" }}
        >
          {getEventIcon(payload.code)}
        </text>
      )}
    </g>
  )
}

/**
 * Variante compacte d'EventDot — utilisée pour les icônes de début de
 * période de statut placées DANS la bande Statut PF (Y=1) qui est étroite.
 * Cercle plus petit (r=8) avec icône réduite.
 */
function StatusBandDot(props: any) {
  const { cx, cy, payload } = props
  if (cx == null || cy == null) return null
  const LucideIcon = getLucideIcon(payload.code)
  return (
    <g>
      <circle
        cx={cx}
        cy={cy}
        r={8}
        fill={payload.color}
        stroke="#0f172a"
        strokeWidth={0.5}
      />
      {LucideIcon ? (
        <foreignObject
          x={cx - 6}
          y={cy - 6}
          width={12}
          height={12}
          style={{ pointerEvents: "none" }}
        >
          <LucideIcon className="h-3 w-3 text-white" />
        </foreignObject>
      ) : (
        <text
          x={cx}
          y={cy + 3}
          textAnchor="middle"
          fontSize={9}
          fontWeight={700}
          fill="#ffffff"
          style={{ pointerEvents: "none" }}
        >
          {getEventIcon(payload.code)}
        </text>
      )}
    </g>
  )
}

/**
 * Tooltip HTML custom pour les dots. Reçoit directement les données de
 * l'item survolé (via Scatter onMouseEnter) et la position souris. Pas
 * de dépendance au Tooltip Recharts (qui ne gérait pas bien les dots
 * proches en X).
 */
function DotTooltip({ data: d, pos }: { data: any; pos: { x: number; y: number } }) {
  const avis = d.interventionInfo
  const quality = d.qualityInfo
  const status = d.statusInfo
  // Flip à gauche si le tooltip dépasse le bord droit de la fenêtre.
  const TOOLTIP_WIDTH = 380 // élargi : les tooltips sont lus de loin en atelier
  const flipLeft =
    typeof window !== "undefined" &&
    pos.x + 14 + TOOLTIP_WIDTH > window.innerWidth
  return (
    <div
      className="pointer-events-none fixed z-[100] max-w-sm rounded-lg border-2 border-slate-300 bg-white p-3 text-sm shadow-2xl"
      style={{
        left: flipLeft ? pos.x - 14 - TOOLTIP_WIDTH : pos.x + 14,
        top: pos.y + 14,
      }}
    >
      <div className="flex items-center gap-1.5 text-base font-bold text-slate-800">
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ background: d.color }}
        />
        <span>{d.label}</span>
      </div>
      <div className="mt-1.5 space-y-1 text-sm text-slate-600">
        <div>
          <span className="font-semibold text-slate-500">Rail :</span> {d.rail}
        </div>
        <div>
          <span className="font-semibold text-slate-500">Date :</span>{" "}
          {format(new Date(d.date), "dd/MM/yyyy HH:mm:ss", { locale: fr })}
        </div>
        {status ? (
          <>
            <div>
              <span className="font-semibold text-slate-500">Début :</span>{" "}
              {format(new Date(status.start), "dd/MM/yyyy HH:mm:ss", { locale: fr })}
            </div>
            <div>
              <span className="font-semibold text-slate-500">Durée :</span>{" "}
              {formatDurationMin(status.durationMin)}
            </div>
          </>
        ) : quality ? (
          <>
            {quality.echantillon != null && (
              <div>
                <span className="font-semibold text-slate-500">Taille échantillon :</span>{" "}
                {quality.echantillon}
              </div>
            )}
            {quality.poids != null && (
              <div>
                <span className="font-semibold text-slate-500">Poids :</span>{" "}
                {quality.poids}
              </div>
            )}
            {quality.quantiteValide != null && (
              <div>
                <span className="font-semibold text-slate-500">Qté validée :</span>{" "}
                {quality.quantiteValide}
              </div>
            )}
            {quality.nombreEchantillon != null && (
              <div>
                <span className="font-semibold text-slate-500">N° contrôle :</span>{" "}
                {quality.nombreEchantillon}
              </div>
            )}
            {quality.createdBy && (
              <div>
                <span className="font-semibold text-slate-500">Par :</span>{" "}
                {quality.createdBy}
              </div>
            )}
          </>
        ) : avis ? (
          <>
            {avis.statut && (
              <div>
                <span className="font-semibold text-slate-500">Statut :</span>{" "}
                {avis.statut}
              </div>
            )}
            {avis.priorite && (
              <div>
                <span className="font-semibold text-slate-500">Priorité :</span>{" "}
                {avis.priorite}
              </div>
            )}
            {avis.posteTechnique && (
              <div>
                <span className="font-semibold text-slate-500">Poste :</span>{" "}
                {avis.posteTechnique}
              </div>
            )}
            {avis.codeEquipement && (
              <div>
                <span className="font-semibold text-slate-500">
                  Équipement :
                </span>{" "}
                {avis.codeEquipement}
              </div>
            )}
            {avis.arret && (
              <div className="font-bold text-rose-600">Arrêt de prod</div>
            )}
            {avis.createdBy && (
              <div>
                <span className="font-semibold text-slate-500">Par :</span>{" "}
                {avis.createdBy}
              </div>
            )}
            {avis.commentaire && (
              <div className="mt-1 italic text-slate-500">
                {avis.commentaire}
              </div>
            )}
          </>
        ) : (
          <>
            {d.qte != null && (
              <div>
                <span className="font-semibold text-slate-500">Qté pièce :</span>{" "}
                {d.qte}
                {d.qteCarton != null && (
                  <>
                    {" / "}
                    <span className="font-semibold text-slate-500">
                      Qté carton :
                    </span>{" "}
                    {d.qteCarton}
                  </>
                )}
              </div>
            )}
            <div>
              <span className="font-semibold text-slate-500">Catégorie :</span>{" "}
              {d.category}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Helpers
// ============================================================================

function formatDurationMin(min: number): string {
  if (min < 1) return "< 1 min"
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h < 24) return m > 0 ? `${h} h ${m} min` : `${h} h`
  const d = Math.floor(h / 24)
  const rh = h % 24
  return rh > 0 ? `${d} j ${rh} h` : `${d} j`
}

function formatTick(d: Date, zoom: number): string {
  if (zoom >= 700) return format(d, "HH:mm:ss")
  if (zoom >= 400) return format(d, "HH:mm")
  if (zoom >= 200) return format(d, "dd/MM HH:mm")
  return format(d, "dd/MM HH'h'")
}

function zoomIntervalLabel(zoom: number): string {
  if (zoom >= 1000) return "~5 s"
  if (zoom >= 900) return "~10 s"
  if (zoom >= 800) return "~15 s"
  if (zoom >= 700) return "~30 s"
  if (zoom >= 600) return "~1 min"
  if (zoom >= 500) return "~3 min"
  if (zoom >= 400) return "~6 min"
  if (zoom >= 300) return "~15 min"
  if (zoom >= 200) return "~30 min"
  return "~1 h"
}

