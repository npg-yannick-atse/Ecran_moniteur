/**
 * Service métier pour les dashboards (frontend WMS).
 *
 * Mappings et logique dérivés de l'inspection réelle de la BDD WMS_MP via
 * `scripts/inspect-db.ts`. Toute la logique est ici, les Route Handlers Next.js
 * (`app/api/v2/...`) ne font qu'appeler ces fonctions.
 *
 * Goals:
 * 1. Renvoyer des objets PRÊTS À AFFICHER (zéro calcul côté client)
 * 2. Requêtes parallèles + groupées (pas de N+1)
 * 3. Lecture seule
 */

import { Prisma } from "@prisma/client"
import { prisma } from "./prisma"
import type {
  DashboardResponse,
  OfComposantsResponse,
  OfRow,
  ProcessListResponse,
  StatusBadge,
  StatusLevel,
  TimelineEvent,
} from "./types"

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Filtre des OFs "en production active" utilisé partout :
 *   - id_status_production = 1 (En consommation — le système confirme la prod) [V2]
 *   - OU id_statusUtilisateur_FK = 2 (OF Débuté — l'opérateur l'a démarré)
 *
 * Ce filtre est injecté directement dans les requêtes SQL raw (WHERE).
 */

// =============================================================================
// LOGS TIMING — pour voir en console quelle query prend du temps.
//   - Activés uniquement hors prod OU si DASHBOARD_DEBUG=1
//   - Préfixe [dashboard] + [miss|query] pour repérer dans les logs Next.js
// =============================================================================

const LOGS_ENABLED =
  process.env.NODE_ENV !== "production" || process.env.DASHBOARD_DEBUG === "1"

async function logQuery<T>(label: string, fn: () => Promise<T>): Promise<T> {
  if (!LOGS_ENABLED) return fn()
  const t0 = Date.now()
  try {
    const r = await fn()
    const count = Array.isArray(r) ? (r as unknown[]).length : undefined
    const tag = count != null ? `${count} rows` : "ok"
    console.log(`[dashboard][query] ${label.padEnd(32)} ${Date.now() - t0}ms  ${tag}`)
    return r
  } catch (e) {
    console.log(`[dashboard][query] ${label.padEnd(32)} ${Date.now() - t0}ms  ERROR`)
    throw e
  }
}

function logImpl(label: string) {
  if (!LOGS_ENABLED) return () => {}
  const t0 = Date.now()
  console.log(`[dashboard][miss] ${label} — fetching from DB`)
  return () => {
    console.log(
      `[dashboard][miss] ${label} — done in ${Date.now() - t0}ms\n`
    )
  }
}

// =============================================================================
// CACHE IN-MEMORY (TTL court + single-flight dedup)
// =============================================================================
// Objectif : supporter 50+ utilisateurs concurrents sans saturer SQL Server.
// Avec un TTL de 3s, 50 users regardant 10 lignes → ~3 req DB/s au lieu de ~35.
// Le "single-flight" garantit qu'un burst d'utilisateurs sur une clé froide ne
// déclenche qu'UNE seule requête DB (les autres attendent la même Promise).
//
// Persisté sur globalThis pour survivre au hot-reload Next.js en dev (sinon
// chaque sauvegarde d'un fichier vide le cache — le Prisma singleton fait pareil).

const CACHE_TTL_MS = 3000

type CacheEntry<T> = { expiresAt: number; value: T }
type CacheStore = {
  data: Map<string, CacheEntry<unknown>>
  inflight: Map<string, Promise<unknown>>
}
const globalForCache = globalThis as unknown as { dashboardCache?: CacheStore }
const store: CacheStore =
  globalForCache.dashboardCache ?? {
    data: new Map(),
    inflight: new Map(),
  }
if (process.env.NODE_ENV !== "production") globalForCache.dashboardCache = store

async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const now = Date.now()
  const hit = store.data.get(key) as CacheEntry<T> | undefined
  if (hit && hit.expiresAt > now) {
    if (LOGS_ENABLED) {
      const remainingMs = hit.expiresAt - now
      console.log(
        `[dashboard][cache-hit]  ${key} (frais pendant encore ${remainingMs}ms)`
      )
    }
    return hit.value
  }

  const pending = store.inflight.get(key) as Promise<T> | undefined
  if (pending) {
    if (LOGS_ENABLED) {
      console.log(`[dashboard][single-flight] ${key} (attend query en cours)`)
    }
    return pending
  }

  const p = fn()
    .then((value) => {
      store.data.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value })
      return value
    })
    .finally(() => {
      store.inflight.delete(key)
    })
  store.inflight.set(key, p)
  return p
}

// =============================================================================
// MAPPINGS (id_status / id_statusUtilisateur → label + level + color)
// =============================================================================

/**
 * Dérive le `level` (ok/info/warning/danger) à partir du libellé d'un statut.
 * On lit le libellé + la couleur depuis la DB (via les vues), on calcule juste
 * le niveau pour l'UI — simple heuristique de mots-clés.
 */
function deriveLevel(designation: string | null | undefined): StatusLevel {
  if (!designation) return "neutral"
  const d = designation.toLowerCase()
  if (
    d.includes("clotur") ||
    d.includes("livré") ||
    d.includes("consomm") ||
    d.includes("transféré") ||
    d.includes("validé")
  )
    return "ok"
  if (
    d.includes("panne") ||
    d.includes("interromp") ||
    d.includes("annul") ||
    d.includes("manque") ||
    d.includes("problème") ||
    d.includes("refus")
  )
    return "danger"
  if (
    d.includes("pause") ||
    d.includes("changement") ||
    d.includes("attente") ||
    d.includes("partiel") ||
    d.includes("préparer") ||
    d.includes("transit")
  )
    return "warning"
  if (d.includes("débuté") || d.includes("préparé") || d.includes("initialis"))
    return "info"
  return "info"
}

/** Construit un StatusBadge à partir des données brutes de la vue. */
function badgeFromView(
  designation: string | null | undefined,
  color: string | null | undefined
): StatusBadge {
  if (!designation) return { label: "—", level: "neutral", color: "#9E9E9E" }
  return {
    label: designation,
    level: deriveLevel(designation),
    color: color ?? "#9E9E9E",
  }
}

function mapProdStatus(id: number | null | undefined): StatusBadge {
  // id NULL = pas de statut prod côté système → on laisse la pill vide,
  // StatusPill détecte le label vide et ne rend rien.
  // ids V2 (ref_production_status) : 1=En consommation, 2=Consommer,
  // 3=En Livraison, 4=Livrer, 5=Cloture. (Anciens ids WMS_MP : 11/12/13/14/18.)
  if (id == null) return { label: "", level: "neutral", color: "#9E9E9E" }
  if (id === 1) return { label: "En cours", level: "warning", color: "#FF9800" }
  if (id === 2) return { label: "Consommé", level: "ok", color: "#4CAF50" }
  if (id === 3) return { label: "En livraison", level: "info", color: "#33a8bf" }
  if (id === 4) return { label: "Livré", level: "ok", color: "#4CAF50" }
  if (id === 5) return { label: "Cloturé", level: "ok", color: "#4CAF50" }
  return { label: `Status ${id}`, level: "neutral", color: "#9E9E9E" }
}

// =============================================================================
// HELPERS
// =============================================================================

function combineDateTime(
  date: Date | null | undefined,
  time: Date | null | undefined
): Date | null {
  if (!date) return null
  if (!time) return date
  const d = new Date(date)
  d.setUTCHours(time.getUTCHours(), time.getUTCMinutes(), time.getUTCSeconds(), 0)
  return d
}

function diffMinutes(
  a: Date | null | undefined,
  b: Date | null | undefined
): number | null {
  if (!a || !b) return null
  return Math.round((b.getTime() - a.getTime()) / 60_000)
}

function safePct(
  num: number | null | undefined,
  denom: number | null | undefined
): number {
  if (!num || !denom || denom === 0) return 0
  return Math.min(100, Math.max(0, Math.round((num / denom) * 100)))
}

function buildLigneInfo(
  p: {
    code: string | null
    designation: string | null
    ligne: string | null
    poste_technique: string | null
  },
  section: { code: string; nom: string } | null
) {
  return {
    code: p.code ?? "",
    designation: p.designation ?? "",
    section: section ?? { code: "", nom: "" },
    poste_technique: p.poste_technique,
  }
}

// =============================================================================
// listLignes()
// =============================================================================

async function listLignesImpl(): Promise<ProcessListResponse> {
  const done = logImpl("listLignes()")
  // Jointure process → zones pour récupérer le vrai nom de section (zone_name).
  // L'ancien mapping par slice(-3) du code était une devinette ; ici c'est la source SAP.
  const processes = await logQuery("process + zones", () =>
    prisma.$queryRaw<
      {
        code: string
        designation: string | null
        ligne: string | null
        poste_technique: string | null
        id_zone_FK: number | null
        zone_name: string | null
      }[]
    >`
      SELECT
        p.code,
        p.designation,
        p.ligne,
        p.poste_technique,
        p.id_zone_FK,
        z.zone_name
      FROM [process] p
      LEFT JOIN [zones] z ON z.id_zone = p.id_zone_FK
      WHERE p.type = 'PF'
      ORDER BY p.code ASC
    `
  )

  /**
   * 1 seule requête SQL groupée — même filtre que le monitoring.
   *
   * Calcule par ligne :
   *  - nb_of       : nombre total d'OFs en production active
   *  - nb_en_cours : ceux au statut utilisateur OFDE (id_statusUtilisateur_FK = 2)
   *  - nb_en_retard: ceux dont date+heure de fin ordonnancement est dépassée
   */
  // Filtre de comptage aligné sur le filtre de la page ligne : on affiche
  // tous les OFs sauf Annulés (id_status_FK=9) et Cloturés (id_status_production=5 en V2).
  const counts = await logQuery("counts par process [Of]", () =>
    prisma.$queryRaw<
      {
        process: string
        nb_of: number
        nb_en_cours: number
        nb_en_retard: number
      }[]
    >`
      SELECT
        process,
        COUNT(*) AS nb_of,
        SUM(CASE WHEN id_statusUtilisateur_FK = 2 THEN 1 ELSE 0 END) AS nb_en_cours,
        SUM(CASE
          WHEN ISNULL(id_status_production, 0) <> 5
            AND date_fin_ordonnancement IS NOT NULL
            AND DATEADD(
                  SECOND,
                  DATEDIFF(SECOND, '00:00:00', ISNULL(heure_fin_ordonnancement, '00:00:00')),
                  CAST(date_fin_ordonnancement AS DATETIME)
                ) < GETDATE()
          THEN 1 ELSE 0
        END) AS nb_en_retard
      FROM [Of]
      WHERE type_article = 'ZFER'
        AND ISNULL(id_status_FK, 0) <> 9              -- exclut Annulés
        AND ISNULL(id_status_production, 0) <> 5      -- exclut Cloturés (id 5 en V2)
      GROUP BY process
    `
  )
  const countByProcess = new Map(
    counts.map((r) => [
      r.process,
      {
        nbOf: Number(r.nb_of),
        nbOfEnCours: Number(r.nb_en_cours),
        nbOfEnRetard: Number(r.nb_en_retard),
      },
    ])
  )

  const lignes = processes
    .filter((p) => p.code)
    .map((p) => {
      const c =
        countByProcess.get(p.code ?? "") ?? {
          nbOf: 0,
          nbOfEnCours: 0,
          nbOfEnRetard: 0,
        }
      return {
        code: p.code ?? "",
        designation: p.designation ?? "",
        ligne: p.ligne,
        poste_technique: p.poste_technique,
        section: {
          code: (p.code ?? "").slice(-3),
          nom: p.zone_name ?? "",
        },
        nbOf: c.nbOf,
        nbOfEnCours: c.nbOfEnCours,
        nbOfEnRetard: c.nbOfEnRetard,
      }
    })

  done()
  return { lignes, generatedAt: new Date().toISOString() }
}

// =============================================================================
// getDashboard()
// =============================================================================

async function getDashboardImpl(
  code: string
): Promise<DashboardResponse | null> {
  const done = logImpl(`getDashboard(${code})`)
  /**
   * 100% via les vues SQL :
   *  - v_statistique_production_of : 1 seule requête self-join PF + SF
   *  - v_historique_status_of      : 1 seule requête pour la timeline (PF + SF)
   * + fallback process+zones si aucun OF actif sur la ligne (la vue ne retourne
   *   que des lignes qui ont au moins un OF, donc pas l'info "ligne vide").
   */
  type PfSfRow = {
    // PF
    id_of: number
    of: string
    of_secondary: string | null
    code_article: string | null
    designation_article: string | null
    type_article: string | null
    qte_of: number | null
    qte_remplir: number | null
    qte_polypacker: number | null
    qte_livrer: number | null
    qte_piece_globale: number | null
    colisage: number | null // pièces par carton (= prod_order.packing_qty)
    unite: string | null
    // Cadence théorique : base_temps pièces pour `cadence` minutes.
    // Les decimal SQL Server remontent en string via $queryRaw → Number() au mapping.
    cadence: unknown
    base_temps: unknown
    cadence_libelle: string | null
    contenance: unknown // dosage cible par unité
    gerbage: number | null // nb de cartons (CRN) par palette
    debut_ordonnancement: Date | null
    date_debut_ordonnancement: Date | null
    heure_debut_ordonnancement: Date | null
    date_fin_ordonnancement: Date | null
    heure_fin_ordonnancement: Date | null
    id_status_FK: number | null
    status_designation: string | null
    status_color: string | null
    id_status_production: number | null
    statusProduction_designation: string | null
    statusProduction_color: string | null
    id_statusUtilisateur_FK: number | null
    statusUtilisateur_designation: string | null
    statusUtilisateur_color: string | null
    process_code: string | null
    process_designation: string | null
    process_ligne: string | null
    process_poste_technique: string | null
    zone_name: string | null
    of_updatedAt: Date
    nb_of_items: number | null
    nb_of_items_avec_batch: number | null
    // SF (via of_secondary self-join)
    sf_id_of: number | null
    sf_of: string | null
    sf_qte_of: number | null
    sf_qte_remplir: number | null
    sf_status_designation: string | null
    sf_status_color: string | null
    sf_id_status_production: number | null
    sf_statusProduction_designation: string | null
    sf_statusProduction_color: string | null
    sf_statusUtil_designation: string | null
    sf_statusUtil_color: string | null
    sf_date_fin_ordonnancement: Date | null
    sf_heure_fin_ordonnancement: Date | null
    // Pour les ZHAL, qte_remplir n'est pas maintenu sur [Of] → on lit les
    // vraies quantités fabriquées depuis l'agrégat fiche_cheminement.
    sf_total_qte_remplissage: number | null
    sf_pct_remplissage: number | null
  }

  const rows = await logQuery(
    "PF+SF self-join (vue)",
    () => prisma.$queryRaw<PfSfRow[]>`
    SELECT
      pf.id_of, pf.[of], pf.of_secondary,
      pf.code_article, pf.designation_article, pf.type_article,
      pf.qte_of, pf.qte_remplir, pf.qte_polypacker, pf.qte_livrer, pf.qte_piece_globale, pf.colisage, pf.unite,
      pf.cadence, pf.base_temps, pf.cadence_libelle, pf.contenance, pf.gerbage,
      pf.debut_ordonnancement, pf.date_debut_ordonnancement, pf.heure_debut_ordonnancement,
      pf.date_fin_ordonnancement, pf.heure_fin_ordonnancement,
      pf.id_status_FK, pf.status_designation, pf.status_color,
      pf.id_status_production,
      sp.designation       AS statusProduction_designation,
      sp.color             AS statusProduction_color,
      pf.id_statusUtilisateur_FK, pf.statusUtilisateur_designation, pf.statusUtilisateur_color,
      pf.process_code, pf.process_designation, pf.process_ligne, pf.process_poste_technique,
      pf.zone_name,
      pf.of_updatedAt,
      pf.nb_of_items,
      pf.nb_of_items_avec_batch,
      sf.id_of              AS sf_id_of,
      sf.[of]               AS sf_of,
      sf.qte_of             AS sf_qte_of,
      sf.qte_remplir        AS sf_qte_remplir,
      sf.status_designation AS sf_status_designation,
      sf.status_color       AS sf_status_color,
      sf.id_status_production AS sf_id_status_production,
      sp_sf.designation                AS sf_statusProduction_designation,
      sp_sf.color                      AS sf_statusProduction_color,
      sf.statusUtilisateur_designation AS sf_statusUtil_designation,
      sf.statusUtilisateur_color       AS sf_statusUtil_color,
      sf.date_fin_ordonnancement       AS sf_date_fin_ordonnancement,
      sf.heure_fin_ordonnancement      AS sf_heure_fin_ordonnancement,
      sf.total_qte_remplissage         AS sf_total_qte_remplissage,
      sf.pct_remplissage               AS sf_pct_remplissage
    FROM [dbo].[v_statistique_production_of] pf
    -- Jointure SF : si plusieurs SF portent le même code (ex: OF retéléchargé
    -- plusieurs fois en DB), on garde uniquement celui avec l'id_of le plus
    -- élevé (= le plus récent).
    LEFT JOIN [dbo].[v_statistique_production_of] sf
      ON sf.id_of = (
        SELECT TOP 1 sf2.id_of
        FROM [dbo].[v_statistique_production_of] sf2
        WHERE sf2.[of] = pf.of_secondary AND sf2.type_article = 'ZHAL'
        ORDER BY sf2.id_of DESC
      )
    LEFT JOIN [dbo].[status] sp
      ON sp.id_status = pf.id_status_production
    LEFT JOIN [dbo].[status] sp_sf
      ON sp_sf.id_status = sf.id_status_production
    WHERE pf.process_code = ${code}
      AND pf.type_article = 'ZFER'
      AND ISNULL(pf.id_status_FK, 0) <> 9            -- exclut OFs Annulés
      AND ISNULL(pf.id_status_production, 0) <> 5    -- exclut OFs Cloturés (id 5 en V2)
    ORDER BY pf.of_updatedAt DESC
  `
  )

  // Cas ligne vide : la vue n'expose pas les process sans OF. Fallback direct.
  if (rows.length === 0) {
    const procFallback = await logQuery("fallback process+zones", () =>
      prisma.$queryRaw<
        {
          code: string
          designation: string | null
          ligne: string | null
          poste_technique: string | null
          zone_name: string | null
        }[]
    >`
      SELECT TOP 1
        p.code, p.designation, p.ligne, p.poste_technique, z.zone_name
      FROM [process] p
      LEFT JOIN [zones] z ON z.id_zone = p.id_zone_FK
      WHERE p.code = ${code} AND p.type = 'PF'
    `
    )
    const p = procFallback[0]
    if (!p) {
      done()
      return null
    }
    done()
    return {
      ligne: buildLigneInfo(p, {
        code: p.code.slice(-3),
        nom: p.zone_name ?? "",
      }),
      kpis: {
        nbOfPF: 0,
        nbComposantsReceptionnes: 0,
        nbTotalComposants: 0,
        avancementGlobal: 0,
        nbOfDebute: 0,
        nbOfEnConso: 0,
        nbOfDemande: 0,
        nbOfNonDebute: 0,
        dureeProductionResteMinutes: 0,
        dureeProductionResteEnCoursMinutes: 0,
        dureeProductionResteALancerMinutes: 0,
        statusCounts: [],
      },
      ofs: [],
      ligneEnArret: false,
      arretActif: null,
      generatedAt: new Date().toISOString(),
    }
  }

  // Ligne info à partir de la première row (tous les rows partagent le même process)
  const first = rows[0]
  const sectionInfo = {
    code: (first.process_code ?? "").slice(-3),
    nom: first.zone_name ?? "",
  }
  const processInfo = {
    code: first.process_code ?? "",
    designation: first.process_designation ?? "",
    ligne: first.process_ligne,
    poste_technique: first.process_poste_technique,
  }

  // Fetch tous les events (PF + SF) en 1 seule query
  type EventRow = {
    id_of: number
    date_changement: Date
    id_status_FK: number | null
    id_statusUtilisateur_FK: number | null
    status_designation: string | null
    status_color: string | null
    type_status: string
    created_by: string | null
    commentaire: string | null
  }
  const pfIds = rows.map((r) => r.id_of)
  const sfIds = rows
    .map((r) => r.sf_id_of)
    .filter((x): x is number => x != null)
  const allIds = Array.from(new Set([...pfIds, ...sfIds]))

  // Ratio pièces/carton (CRN) PAR ARTICLE — calculé depuis les OF qui ont
  // qte_piece_globale renseigné. Sert de REPLI quand l'OF courant ne l'a pas
  // (≈82% des OF KAR ont qte_piece_globale NULL). Le ratio est une propriété de
  // l'article (ex. 0CABCDEF0150NOR = 64320/670 = 96 pcs/carton). On prend la
  // valeur de l'OF le plus récent de cet article.
  const articleRatios = await logQuery(
    "ratios pcs/carton par article",
    () => prisma.$queryRaw<{ code_article: string; ratio: number }[]>`
      SELECT code_article, ratio FROM (
        SELECT code_article,
               CAST(qte_piece_globale AS FLOAT) / qte_of AS ratio,
               ROW_NUMBER() OVER (PARTITION BY code_article ORDER BY id_of DESC) AS rn
        FROM [dbo].[v_statistique_production_of]
        WHERE qte_piece_globale > 0 AND qte_of > 0
      ) t WHERE rn = 1
    `
  )
  const ratioByArticle = new Map(
    articleRatios.map((a) => [a.code_article, a.ratio])
  )

  const events =
    allIds.length > 0
      ? await logQuery(
          `timeline events (${allIds.length} OFs)`,
          () => prisma.$queryRaw<EventRow[]>`
            SELECT
              id_of,
              date_changement,
              id_status_FK,
              id_statusUtilisateur_FK,
              status_designation,
              status_color,
              type_status,
              created_by,
              commentaire
            FROM [dbo].[v_historique_status_of]
            WHERE id_of IN (${Prisma.join(allIds)})
            ORDER BY date_changement ASC
          `
        )
      : []

  // v_historique_status_of.created_by stocke un ID utilisateur ("24"), pas un
  // nom. On le résout via auth_user pour afficher "adolphe.adomon" dans
  // l'historique des statuts. Table courte (quelques dizaines de lignes),
  // chargée d'un coup plutôt que jointe sur la vue d'historique.
  const utilisateurs = await logQuery("auth_user", () =>
    prisma.$queryRaw<{ id: number; username: string | null }[]>`
      SELECT id, username FROM [dbo].[auth_user]
    `
  )
  const nomParUserId = new Map(
    utilisateurs.map((u) => [String(u.id), u.username ?? String(u.id)])
  )
  /** Nom d'utilisateur si created_by est un ID connu, valeur brute sinon. */
  const resoudreAuteur = (v: string | null): string | null =>
    v == null ? null : (nomParUserId.get(v.trim()) ?? v)

  const eventsByOfId = new Map<number, EventRow[]>()
  for (const e of events) {
    const arr = eventsByOfId.get(e.id_of) ?? []
    arr.push(e)
    eventsByOfId.set(e.id_of, arr)
  }

  // ===== Énergie (WMS_MP_V2 : wf_order_event) =====
  // Relevés du compteur (current_energy_tag = index cumulé) captés sur les
  // events USER_STATUS_CHANGE, reliés à l'OF via id_order_fk = id_of.
  // On garde (ts, index) triés pour dériver : conso totale OF (delta) et
  // conso par segment de statut. energy_tag_id NULL sur ~99% des events → seuls
  // les OF sur machines instrumentées ont des relevés.
  //
  // PF *et* SF (allIds) : la conso affichée est le CUMUL des deux. Attention,
  // on ne fusionne surtout pas les deux séries de relevés — les compteurs sont
  // distincts, leurs index absolus n'ont rien à voir et un "dernier − premier"
  // sur le mélange serait faux (voire négatif). On calcule un delta par OF,
  // puis on additionne les deux deltas (cf. plus bas).
  type EnergyRow = {
    id_order_fk: number
    created_at: Date
    current_energy_tag: unknown // decimal → coercé via Number()
  }
  const energyRows =
    allIds.length > 0
      ? await logQuery(
          `relevés énergie (${allIds.length} OFs)`,
          () => prisma.$queryRaw<EnergyRow[]>`
            SELECT id_order_fk, created_at, current_energy_tag
            FROM [dbo].[wf_order_event]
            WHERE current_energy_tag IS NOT NULL
              AND id_order_fk IN (${Prisma.join(allIds)})
            ORDER BY created_at ASC
          `
        )
      : []
  const energyByOfId = new Map<number, { ts: number; index: number }[]>()
  for (const e of energyRows) {
    const idx = Number(e.current_energy_tag)
    if (!Number.isFinite(idx)) continue
    const arr = energyByOfId.get(e.id_order_fk) ?? []
    arr.push({ ts: e.created_at.getTime(), index: idx })
    energyByOfId.set(e.id_order_fk, arr)
  }

  // Composants "vraiment réceptionnés" = of_item.id_status_FK = 8.
  // Le nb_of_items_avec_batch de la vue compte les items avec un batch assigné
  // (SAP) mais pas forcément reçus — inexact pour notre besoin métier.
  type ComposantsRow = {
    id_of_FK: number
    nb_items: number
    nb_receptionnes: number
  }
  const composants =
    pfIds.length > 0
      ? await logQuery(
          `composants of_item (${pfIds.length} OFs)`,
          // Le SF (of_item.type_article='ZHAL') est EXCLU du total composant :
          // il est déjà représenté par sa propre card SF et sa barre dédiée,
          // donc pas besoin de le compter 2 fois.
          () => prisma.$queryRaw<ComposantsRow[]>`
            SELECT
              oi.id_of_FK,
              COUNT(*) AS nb_items,
              SUM(CASE WHEN oi.id_status_FK = 8 THEN 1 ELSE 0 END) AS nb_receptionnes
            FROM [dbo].[of_item] oi
            WHERE oi.id_of_FK IN (${Prisma.join(pfIds)})
              AND ISNULL(oi.annuler, 0) = 0
              AND oi.type_article <> 'ZHAL'
              AND oi.code_article NOT IN ('5PDCEAU', '5PDCBRONIDOX', 'SPDCBRONIDOX')
            GROUP BY oi.id_of_FK
          `
        )
      : []
  // Dates BC (Bon Complémentaire) = of_item.date_Livraison quand type_poste='Z'
  // Une entrée par date distincte par OF (PF ou SF).
  const bcDates =
    allIds.length > 0
      ? await logQuery(
          `BC dates of_item (${allIds.length} OFs)`,
          () => prisma.$queryRaw<{ id_of_FK: number; date_Livraison: Date }[]>`
            SELECT DISTINCT id_of_FK, date_Livraison
            FROM [dbo].[of_item]
            WHERE id_of_FK IN (${Prisma.join(allIds)})
              AND type_poste = 'Z'
              AND date_Livraison IS NOT NULL
              AND ISNULL(annuler, 0) = 0
            ORDER BY id_of_FK, date_Livraison
          `
        )
      : []
  const bcDatesByOfId = new Map<number, Date[]>()
  for (const r of bcDates) {
    const arr = bcDatesByOfId.get(r.id_of_FK) ?? []
    arr.push(r.date_Livraison)
    bcDatesByOfId.set(r.id_of_FK, arr)
  }

  const composantsByOfId = new Map(
    composants.map((c) => [
      c.id_of_FK,
      {
        nb_items: Number(c.nb_items),
        nb_receptionnes: Number(c.nb_receptionnes),
      },
    ])
  )

  // Durée RÉELLE de production = Σ duree_production des events OHSU où le
  // statut utilisateur est OFDE ("OF Débuté/En cours", id=2). Les autres
  // statuts (OFVA validation, PPR pause, CHG changement, PTE panne…) stockent
  // aussi une durée mais ne comptent pas comme du temps de production effectif.
  type DureeRow = { id_of_FK: number; duree_ofde: number | null }
  const dureesProd =
    pfIds.length > 0
      ? await logQuery(
          `OFDE duree_production (${pfIds.length} OFs)`,
          () => prisma.$queryRaw<DureeRow[]>`
            SELECT
              id_of_FK,
              SUM(ISNULL(duree_production, 0)) AS duree_ofde
            FROM [dbo].[Of_has_statusUtilisateurs]
            WHERE id_of_FK IN (${Prisma.join(pfIds)})
              AND id_statusUtilisateur_FK = 2
            GROUP BY id_of_FK
          `
        )
      : []
  const dureeOfdeByOfId = new Map(
    dureesProd.map((d) => [d.id_of_FK, Number(d.duree_ofde ?? 0)])
  )

  // Dernière entrée of_has_demand par OF (dates demande livraison / système)
  type DemandRow = {
    id_of_FK: number
    last_date_demand_livraison: Date | null
    last_date_system_demande: Date | null
    of_createdAt: Date | null
  }
  const demands =
    pfIds.length > 0
      ? await logQuery(
          `of_has_demand (${pfIds.length} OFs)`,
          () => prisma.$queryRaw<DemandRow[]>`
            SELECT
              t.id_of_FK,
              t.last_date_demand_livraison,
              t.last_date_system_demande,
              o.createdAt AS of_createdAt
            FROM (
              SELECT
                id_of_FK,
                last_date_demand_livraison,
                last_date_system_demande,
                ROW_NUMBER() OVER (PARTITION BY id_of_FK ORDER BY createdAt DESC) AS rn
              FROM [dbo].[of_has_demand]
              WHERE id_of_FK IN (${Prisma.join(allIds)})
                AND ISNULL(annuler, 0) = 0
            ) t
            LEFT JOIN [dbo].[Of] o ON o.id_of = t.id_of_FK
            WHERE t.rn = 1
          `
        )
      : []
  const demandByOfId = new Map(demands.map((d) => [d.id_of_FK, d]))

  // Date de téléchargement = Of.createdAt — source directe pour PF ET SF
  // (of_has_demand est parfois absent pour certains OFs, ne peut pas servir
  // de source fiable).
  const createdAtRows =
    allIds.length > 0
      ? await logQuery(
          `Of.createdAt (${allIds.length} OFs)`,
          () => prisma.$queryRaw<{ id_of: number; createdAt: Date }[]>`
            SELECT id_of, createdAt
            FROM [dbo].[Of]
            WHERE id_of IN (${Prisma.join(allIds)})
          `
        )
      : []
  const createdAtByOfId = new Map(
    createdAtRows.map((r) => [r.id_of, r.createdAt])
  )
  // Alias pour rétro-compat interne (code plus bas utilise sfCreatedAtByOfId)
  const sfCreatedAtByOfId = createdAtByOfId

  // Events fiche_cheminement (remplissage/polypackage/livraison) par OF
  // On récupère TOUTES les fiches (y compris annulées) avec le flag `annuler`.
  // - Le ratio pcs/CRN est calculé sur toutes les fiches (car SAP les compte)
  // - Le display (palettes, pcs, CRN converti) ne compte que les non-annulées
  type FicheRow = {
    id_of_FK: number
    id_fiche: number
    indice: number | null
    annuler: number | null
    remplissage_date: Date | null
    qte_remplissage: number | null
    polypackage_date: Date | null
    qte_polypackage: number | null
    livraison_date: Date | null
    qte_livraison: number | null
  }
  const fichesAll =
    pfIds.length > 0
      ? await logQuery(
          `fiche_cheminement events (${pfIds.length} OFs)`,
          () => prisma.$queryRaw<FicheRow[]>`
            SELECT
              id_of_FK, id_fiche, indice, annuler,
              remplissage_date, qte_remplissage,
              polypackage_date, qte_polypackage,
              livraison_date, qte_livraison
            FROM [dbo].[fiche_cheminement]
            -- allIds et non pfIds : les fiches du SF servent à tracer ses
            -- livraisons sur le rail SF du timeline. Les compteurs PF lisent
            -- la map par id_of du PF, ces lignes en plus ne les touchent pas.
            WHERE id_of_FK IN (${Prisma.join(allIds)})
              AND (remplissage_date IS NOT NULL
                OR polypackage_date IS NOT NULL
                OR livraison_date IS NOT NULL)
            ORDER BY id_of_FK, id_fiche
          `
        )
      : []
  // Map de TOUTES les fiches (pour calcul de ratio cohérent avec SAP)
  const fichesAllByOfId = new Map<number, FicheRow[]>()
  for (const f of fichesAll) {
    const arr = fichesAllByOfId.get(f.id_of_FK) ?? []
    arr.push(f)
    fichesAllByOfId.set(f.id_of_FK, arr)
  }
  // Map des fiches NON-ANNULÉES uniquement (pour les compteurs affichés)
  const fichesByOfId = new Map<number, FicheRow[]>()
  for (const f of fichesAll) {
    if ((f.annuler ?? 0) === 1) continue
    const arr = fichesByOfId.get(f.id_of_FK) ?? []
    arr.push(f)
    fichesByOfId.set(f.id_of_FK, arr)
  }

  // Nb TOTAL de palettes prévues sur l'OF.
  // Requête dédiée et non `fichesByOfId.size` : la requête ci-dessus ne ramène
  // que les fiches ayant DÉJÀ une opération (remplissage/polypack/livraison).
  // Les palettes créées mais pas encore touchées en sont absentes — les compter
  // depuis cette map donnait "palettes démarrées", pas "palettes prévues".
  const palettesTotalByOfId = new Map<number, number>()
  if (pfIds.length > 0) {
    const palRows = await logQuery(
      `nb palettes total (${pfIds.length} OFs)`,
      () => prisma.$queryRaw<{ id_of_FK: number; nb: number }[]>`
        SELECT id_of_FK, COUNT(*) AS nb
        FROM [dbo].[fiche_cheminement]
        WHERE id_of_FK IN (${Prisma.join(pfIds)})
          AND ISNULL(annuler, 0) = 0
        GROUP BY id_of_FK
      `
    )
    for (const p of palRows) {
      palettesTotalByOfId.set(p.id_of_FK, Number(p.nb))
    }
  }

  // Dernier poste de polypackage par OF (poste sur lequel a été effectué
  // le polypackage de la dernière fiche en date — pour affichage UI).
  const dernierPolypackPoste =
    pfIds.length > 0
      ? await logQuery(
          `dernier polypack_on (${pfIds.length} OFs)`,
          () => prisma.$queryRaw<{ id_of_FK: number; polypack_on: string | null }[]>`
            SELECT id_of_FK, polypack_on
            FROM (
              SELECT
                id_of_FK,
                polypack_on,
                ROW_NUMBER() OVER (
                  PARTITION BY id_of_FK
                  ORDER BY polypackage_date DESC
                ) AS rn
              FROM [dbo].[fiche_cheminement]
              WHERE id_of_FK IN (${Prisma.join(pfIds)})
                AND ISNULL(annuler, 0) = 0
                AND polypackage_date IS NOT NULL
                AND polypack_on IS NOT NULL
            ) t
            WHERE t.rn = 1
          `
        )
      : []
  const lastPolypackPosteByOfId = new Map(
    dernierPolypackPoste.map((r) => [r.id_of_FK, r.polypack_on])
  )

  // Confirmations d'opérations du SF (prod_operation_confirmation) — style SAP
  // CONF : chaque ligne = une opération (ex. "FAIRE DU MELANGE") confirmée sur
  // une fiche du SF, avec sa quantité et son horodatage. Affichées sur le rail
  // SF de la timeline. Lien vers l'OF via routing_sheet -> prod_order.
  type SfConfRow = {
    id: number
    id_of_FK: number
    operation_code: string | null // vrai n° d'étape de la gamme (ex. 0010)
    operation_name: string | null
    work_center_name: string | null
    quantity: number | null
    is_final: boolean | null // confirmation finale SAP (vs partielle)
    created_at: Date
  }
  const sfConfirms =
    sfIds.length > 0
      ? await logQuery(
          `SF operation confirmations (${sfIds.length} OFs)`,
          // On expose l'OPÉRATION réelle (op.operation_code / name / poste de
          // charge via id_operation_fk), pas c.operation_code qui est un code
          // SAP de confirmation (0090/0092/0094) sans sens métier pour l'UI.
          () => prisma.$queryRaw<SfConfRow[]>`
            SELECT
              c.id,
              po.id                      AS id_of_FK,
              op.operation_code,
              op.operation_name,
              op.work_center_name,
              CAST(c.quantity AS FLOAT)  AS quantity,
              c.is_final_confirmation    AS is_final,
              c.created_at
            FROM [dbo].[prod_operation_confirmation] c
            JOIN [dbo].[prod_routing_sheet] rs ON rs.id = c.id_routing_sheet_fk
            JOIN [dbo].[prod_order] po          ON po.id = rs.id_order_fk
            LEFT JOIN [dbo].[prod_operation] op ON op.id = c.id_operation_fk
            WHERE po.id IN (${Prisma.join(sfIds)})
              AND ISNULL(c.is_cancelled, 0) = 0
            ORDER BY c.created_at
          `
        )
      : []
  const sfConfirmsByOfId = new Map<number, SfConfRow[]>()
  for (const c of sfConfirms) {
    const arr = sfConfirmsByOfId.get(c.id_of_FK) ?? []
    arr.push(c)
    sfConfirmsByOfId.set(c.id_of_FK, arr)
  }

  // Demandes d'intervention (avis) sur la ligne (process=code).
  // On charge tout l'historique de la ligne ; chaque OF ne gardera que les
  // avis tombant dans sa fenêtre temporelle côté mapping.
  type AvisRow = {
    id_avis: number
    avis_number: string | null
    code_equipement: string | null
    poste_technique: string | null
    arret: number | null
    designation_priorite: string | null
    commentaire: string | null
    created_by: string | null
    createdAt: Date
    status_designation: string | null
    cloture_date: Date | null
  }
  const avisList = await logQuery(
    `avis (line=${code})`,
    () => prisma.$queryRaw<AvisRow[]>`
      SELECT a.id_avis, a.avis_number, a.code_equipement, a.poste_technique,
             a.arret, a.designation_priorite, a.commentaire, a.created_by,
             a.createdAt,
             s.designation AS status_designation,
             -- Date de clôture = createdAt du passage au statut Clôture Avis (id 3)
             (SELECT MAX(h.createdAt)
                FROM [dbo].[avis_has_statusAvis] h
               WHERE h.id_avis_FK = a.id_avis
                 AND h.id_statusAvis_FK = 3) AS cloture_date
      FROM [dbo].[avis] a
      LEFT JOIN [dbo].[statusAvis] s ON s.id_statusAvis = a.id_statusAvis_FK
      WHERE a.process = ${code}
        AND a.arret = 1
      ORDER BY a.createdAt ASC
    `
  )

  // Contrôles qualité par OF (entete_resultat_inspect)
  type QualityRow = {
    id_enteteResultatInspect: number
    id_of_FK: number
    echantillon: number | null
    poids: number | null
    quantite_valide: number | null
    nombre_echantillon: number | null
    created_by: string | null
    createdAt: Date
  }
  const qualityRows =
    pfIds.length > 0
      ? await logQuery(
          `quality inspections (${pfIds.length} OFs)`,
          () => prisma.$queryRaw<QualityRow[]>`
            SELECT id_enteteResultatInspect, id_of_FK, echantillon, poids,
                   quantite_valide, nombre_echantillon, created_by, createdAt
            FROM [dbo].[entete_resultat_inspect]
            WHERE id_of_FK IN (${Prisma.join(pfIds)})
            ORDER BY createdAt ASC
          `
        )
      : []
  const qualityByOfId = new Map<number, QualityRow[]>()
  for (const q of qualityRows) {
    const arr = qualityByOfId.get(q.id_of_FK) ?? []
    arr.push(q)
    qualityByOfId.set(q.id_of_FK, arr)
  }

  // Nombre effectif par OF (opération 0010)
  const effectifByOfId = new Map<number, number>()
  if (pfIds.length > 0) {
    const effRows = await logQuery(
      `nb_effectif opération 0010 (${pfIds.length} OFs)`,
      () => prisma.$queryRaw<{ id_of_FK: number; nb_effectif: string | null }[]>`
        SELECT id_of_FK, nb_effectif
        FROM [dbo].[operations]
        WHERE id_of_FK IN (${Prisma.join(pfIds)})
          AND operation_code = '0010'
      `
    )
    for (const r of effRows) {
      if (r.nb_effectif != null) {
        effectifByOfId.set(r.id_of_FK, parseFloat(r.nb_effectif))
      }
    }
  }

  // Nombre effectif configuré sur la ligne (process.nombre_effectif)
  const processEffectifRow = await logQuery(
    `process nombre_effectif (${code})`,
    () => prisma.$queryRaw<{ nombre_effectif: number | null }[]>`
      SELECT nombre_effectif FROM [dbo].[process] WHERE code = ${code}
    `
  )
  const processEffectif = processEffectifRow[0]?.nombre_effectif ?? null

  const now = new Date()

  const ofRows = rows.map((r) => {
    const pfEvents = eventsByOfId.get(r.id_of) ?? []
    const sfEvents =
      r.sf_id_of != null ? (eventsByOfId.get(r.sf_id_of) ?? []) : []

    // Dates ordonnancement
    const debutOrdo =
      combineDateTime(
        r.date_debut_ordonnancement,
        r.heure_debut_ordonnancement
      ) ?? r.debut_ordonnancement
    const finOrdo = combineDateTime(
      r.date_fin_ordonnancement,
      r.heure_fin_ordonnancement
    )
    const dureeOrdoMin = diffMinutes(debutOrdo, finOrdo)

    // Demande composant = 1er event "A préparer" (id_status_FK = 2) CRÉÉ PAR UN
    // UTILISATEUR (created_by non null). Les events à created_by NULL proviennent
    // de triggers système SAP/interne et ne correspondent pas à la vraie demande.
    const isRealDemande = (e: EventRow) =>
      e.type_status === "STATUS_SYSTEME" &&
      e.id_status_FK === 2 &&
      e.created_by != null &&
      e.created_by.trim() !== ""
    const demandeEvt = pfEvents.find(isRealDemande)
    const dateDemandeComposant = demandeEvt?.date_changement ?? null
    const demandeEvtSF = sfEvents.find(isRealDemande)
    const dateDemandeComposantSF = demandeEvtSF?.date_changement ?? null

    // Début production = 1er event utilisateur OFDE (id_statusUtilisateur_FK = 2,
    // "OF Débuté"). C'est le VRAI top départ de la fabrication (l'opérateur a
    // cliqué "Démarrer") — différent de la demande composant qui elle est un
    // évènement logistique amont.
    const ofdeEvt = pfEvents.find(
      (e) =>
        e.type_status === "STATUS_UTILISATEUR" &&
        e.id_statusUtilisateur_FK === 2
    )
    const dateDebutProduction = ofdeEvt?.date_changement ?? null
    const ofdeEvtSF = sfEvents.find(
      (e) =>
        e.type_status === "STATUS_UTILISATEUR" &&
        e.id_statusUtilisateur_FK === 2
    )
    const dateDebutProductionSF = ofdeEvtSF?.date_changement ?? null

    // Estimation + retard
    const estimationProd = finOrdo
    const retard =
      !!estimationProd &&
      now > estimationProd &&
      r.id_status_production !== 5
    const retardMinutes =
      retard && estimationProd ? (diffMinutes(estimationProd, now) ?? 0) : 0

    // SF quantités / pourcentage — on privilégie sf_qte_remplir (SAP) car
    // total_qte_remplissage de la vue inclut les fiches annulées, ce qui
    // produit des pourcentages > 100% (ex: OF 1108895 → 266%, 1113691 → 200%).
    // Fallback sur total_qte_remplissage uniquement si qte_remplir = 0.
    const sfQteFabriquee =
      r.sf_qte_remplir && r.sf_qte_remplir > 0
        ? r.sf_qte_remplir
        : (r.sf_total_qte_remplissage ?? 0)
    const sfPct = safePct(sfQteFabriquee, r.sf_qte_of)

    // ===== Timeline : dedup par statut (1ère occurrence) =====
    // Whitelist des statuts système affichés :
    //   7 = "Réception Partielle"
    //   8 = "Receptionnés"
    // Tous les autres (Initialisés, À préparer, Préparés, Transférés, etc.)
    // sont volontairement masqués pour garder la timeline lisible.
    const ALLOWED_LOG_STATUS_IDS = new Set<number>([7, 8])
    const timelineEvents: TimelineEvent[] = []

    function pushDeduped(evts: EventRow[], category: "PF" | "SF") {
      const seenSys = new Set<number>()
      const seenUser = new Set<number>()
      for (const e of evts) {
        if (e.type_status === "STATUS_SYSTEME" && e.id_status_FK != null) {
          if (!ALLOWED_LOG_STATUS_IDS.has(e.id_status_FK)) continue
          if (seenSys.has(e.id_status_FK)) continue
          seenSys.add(e.id_status_FK)
          // Rail : SF → rail SF ; PF (log, ex: Réceptionnés) → rail Remplissage
          // (événement de préparation côté PF, avant la phase polypack).
          const rail = category === "SF" ? "SF" : "Remplissage"
          // Réception Partielle (id=7) → forcé en orange pour la distinguer
          // visuellement de Receptionnés (id=8) qui reste en vert.
          const forcedColor =
            e.id_status_FK === 7
              ? "#f59e0b"
              : (e.status_color ?? "#9E9E9E")
          timelineEvents.push({
            date: e.date_changement.toISOString(),
            type: "logistique",
            category,
            rail,
            code: `log-${e.id_status_FK}`,
            label: e.status_designation ?? `Status ${e.id_status_FK}`,
            color: forcedColor,
          })
        } else if (
          e.type_status === "STATUS_UTILISATEUR" &&
          e.id_statusUtilisateur_FK != null
        ) {
          // Les events user PF sont rendus sous forme de BANDE colorée au
          // dessus des rails (via statusHistoryPF) — on ne les dessine plus
          // comme dots ici pour éviter la redondance visuelle. Côté SF on
          // garde les dots (pas de bande dédiée au SF pour l'instant).
          if (category === "PF") continue
          // Le statut "Initialisé" (id=1) se déclenche au moment de la
          // création de l'OF, exactement au même instant que Of.createdAt
          // (= date de téléchargement). On le masque côté dots pour laisser
          // l'icône ⬇ le remplacer sémantiquement et éviter la collision.
          if (e.id_statusUtilisateur_FK === 1) continue
          if (seenUser.has(e.id_statusUtilisateur_FK)) continue
          seenUser.add(e.id_statusUtilisateur_FK)
          timelineEvents.push({
            date: e.date_changement.toISOString(),
            type: "utilisateur",
            category,
            rail: "SF",
            code: `util-${e.id_statusUtilisateur_FK}`,
            label: e.status_designation ?? "Statut utilisateur",
            color: e.status_color ?? "#9E9E9E",
          })
        }
      }
    }

    pushDeduped(pfEvents, "PF")
    pushDeduped(sfEvents, "SF")

    // Events fiche_cheminement (remplissage, fardelage, livraison)
    const fiches = fichesByOfId.get(r.id_of) ?? []
    // Ratio pièces → cartons (CRN). Source V2 primaire : `colisage`
    // (= prod_order.packing_qty = pièces par carton, renseigné sur ~100% des OF
    // KAR). Replis : qte_piece_globale/qte_of, puis ratio de l'article. null
    // pour les articles au poids (KG, colisage NULL) → pas de conversion carton.
    const artRatio = ratioByArticle.get(r.code_article ?? "") ?? null
    const pcsParCarton =
      (r.colisage ?? 0) > 0
        ? (r.colisage as number)
        : (r.qte_piece_globale ?? 0) > 0 && (r.qte_of ?? 0) > 0
          ? (r.qte_piece_globale as number) / (r.qte_of as number)
          : artRatio && artRatio > 0
            ? artRatio
            : null
    const toCarton = (pcs: number | null): number | null =>
      pcs != null && pcsParCarton
        ? Math.round((pcs / pcsParCarton) * 100) / 100
        : null
    for (const f of fiches) {
      if (f.remplissage_date) {
        timelineEvents.push({
          date: f.remplissage_date.toISOString(),
          type: "production",
          category: "PF",
          rail: "Remplissage",
          code: `remp-${f.id_fiche}`,
          label: `Remplissage — Palette N°${f.indice ?? "?"}`,
          color: "#FF9800",
          qte: f.qte_remplissage ?? null,
          qteCarton: toCarton(f.qte_remplissage ?? null),
          palette: f.indice ?? null,
        })
      }
      if (f.polypackage_date) {
        timelineEvents.push({
          date: f.polypackage_date.toISOString(),
          type: "production",
          category: "PF",
          rail: "Fardelage",
          code: `poly-${f.id_fiche}`,
          label: `Fardelage — Palette N°${f.indice ?? "?"}`,
          color: "#33a8bf",
          qte: f.qte_polypackage ?? null,
          qteCarton: toCarton(f.qte_polypackage ?? null),
          palette: f.indice ?? null,
        })
      }
      if (f.livraison_date) {
        timelineEvents.push({
          date: f.livraison_date.toISOString(),
          type: "production",
          category: "PF",
          rail: "Livraison",
          code: `livr-${f.id_fiche}`,
          label: `Livraison — Palette N°${f.indice ?? "?"}`,
          color: "#4CAF50",
          qte: f.qte_livraison ?? null,
          qteCarton: toCarton(f.qte_livraison ?? null),
          palette: f.indice ?? null,
        })
      }
    }

    // Confirmations d'opérations du SF (prod_operation_confirmation) sur le rail
    // SF : chaque point = une opération confirmée (ex. "FAIRE DU MELANGE") avec
    // sa quantité. Couleur SF dédiée + badge "SF" (cf. EventDot).
    const sfConfs =
      r.sf_id_of != null ? (sfConfirmsByOfId.get(r.sf_id_of) ?? []) : []
    for (const c of sfConfs) {
      timelineEvents.push({
        date: c.created_at.toISOString(),
        type: "production",
        category: "SF",
        rail: "SF",
        // double-coche réservée à la confirmation finale ; simple coche sinon
        code: c.is_final ? `sfconf-final-${c.id}` : `sfconf-${c.id}`,
        label: `${c.operation_name ?? "Confirmation"}${c.work_center_name ? ` — ${c.work_center_name}` : ""}${c.is_final ? " (finale)" : ""}`,
        color: "#1d4ed8", // bleu foncé, dédié au SF
        qte: c.quantity ?? null,
        qteCarton: null,
        palette: null,
      })
    }
    // Livraisons du SF — le semi-fini a ses propres fiches de cheminement.
    // Chaque livraison = un lot de vrac descendu vers la ligne de conditionnement,
    // donc le maillon qui manquait entre la fabrication du SF et le remplissage.
    for (const f of r.sf_id_of != null
      ? (fichesByOfId.get(r.sf_id_of) ?? [])
      : []) {
      if (!f.livraison_date) continue
      timelineEvents.push({
        date: f.livraison_date.toISOString(),
        type: "production",
        category: "SF",
        rail: "SF",
        code: `sflivr-${f.id_fiche}`,
        label: `Livraison SF — Palette N°${f.indice ?? "?"}`,
        color: "#0891b2", // cyan foncé : famille SF, distinct du bleu des confirmations
        qte: f.qte_livraison ?? null,
        qteCarton: null,
        palette: f.indice ?? null,
      })
    }

    // Fin réelle du SF = dernière confirmation marquée finale. Sert de repère
    // pour savoir si le SF était prêt avant que le PF ne démarre (cf. of-card).
    const dateFinProductionSF =
      sfConfs
        .filter((c) => c.is_final)
        .reduce<Date | null>(
          (acc, c) =>
            acc == null || c.created_at > acc ? c.created_at : acc,
          null
        ) ?? null
    timelineEvents.sort((a, b) => a.date.localeCompare(b.date))

    // ===== statusHistoryPF : périodes brutes (non dédupliquées) =====
    // Pour rendu "bande colorée avec durée" au-dessus des rails.
    // On prend TOUS les events utilisateur PF triés chrono et on crée des
    // intervalles [start, end] où end = date du statut suivant (ou null si
    // c'est le dernier = statut courant, durée calculée jusqu'à now).
    const pfUserEvts = pfEvents
      .filter(
        (e) =>
          e.type_status === "STATUS_UTILISATEUR" &&
          e.id_statusUtilisateur_FK != null &&
          e.id_statusUtilisateur_FK !== 1 // exclut "OF Validé" des bandes
      )
      .sort(
        (a, b) =>
          a.date_changement.getTime() - b.date_changement.getTime()
      )
    // Relevés énergie du PF SEUL — c'est cette série qui alimente la conso par
    // segment de statut (statusHistoryPF ne contient que des statuts PF, y
    // injecter le compteur du SF n'aurait pas de sens).
    const energyReadings = [...(energyByOfId.get(r.id_of) ?? [])].sort(
      (a, b) => a.ts - b.ts
    )
    // Index compteur au temps t = dernier relevé <= t (null si aucun avant t).
    const energyIndexAt = (t: number): number | null => {
      let val: number | null = null
      for (const rd of energyReadings) {
        if (rd.ts <= t) val = rd.index
        else break
      }
      return val
    }
    const round2 = (n: number) => Math.round(n * 100) / 100
    // Conso d'un OF = dernier relevé − premier relevé de SA série (delta d'index
    // compteur). Il faut au moins 2 relevés pour faire une différence.
    const deltaConso = (
      readings: { ts: number; index: number }[]
    ): number | null =>
      readings.length >= 2
        ? readings[readings.length - 1].index - readings[0].index
        : null
    // Conso affichée = CUMUL PF + SF. On somme les deux deltas, chacun calculé
    // sur son propre compteur — surtout pas un delta sur les séries fusionnées.
    const consoPF = deltaConso(energyReadings)
    const consoSF =
      r.sf_id_of != null
        ? deltaConso(
            [...(energyByOfId.get(r.sf_id_of) ?? [])].sort((a, b) => a.ts - b.ts)
          )
        : null
    const consommationEnergie =
      consoPF == null && consoSF == null
        ? null
        : round2((consoPF ?? 0) + (consoSF ?? 0))

    const statusHistoryPF = pfUserEvts.map((e, i) => {
      const start = e.date_changement
      const end =
        i < pfUserEvts.length - 1 ? pfUserEvts[i + 1].date_changement : null
      const endTs = end ?? now
      const durationMin = Math.max(
        0,
        Math.round((endTs.getTime() - start.getTime()) / 60_000)
      )
      // Conso du segment = index(fin du statut) − index(début du statut).
      const idxStart = energyIndexAt(start.getTime())
      const idxEnd = energyIndexAt(endTs.getTime())
      const consoSegment =
        idxStart != null && idxEnd != null ? round2(idxEnd - idxStart) : null
      return {
        code: `util-${e.id_statusUtilisateur_FK}`,
        designation: e.status_designation ?? `Statut ${e.id_statusUtilisateur_FK}`,
        color: e.status_color ?? "#9E9E9E",
        start: start.toISOString(),
        end: end?.toISOString() ?? null,
        durationMin,
        consoSegment,
        createdBy: resoudreAuteur(e.created_by),
        commentaire: e.commentaire?.trim() || null,
      }
    })

    // Quantités canoniques affichées en KARTONS (KAR) :
    //   - Of.qte_remplir / qte_polypacker / qte_livrer sont maintenus par SAP en KAR
    //   - fiche_cheminement.qte_* est en UNITÉS individuelles (1 KAR = N unités, N varie par article)
    //
    // Stratégie : prendre Of.qte_* quand > 0 (source de vérité SAP en KAR), sinon
    // convertir Σ fiches (unités) → KAR via le ratio détecté depuis un autre champ
    // où les 2 sources sont renseignées. Cas typique : Of.qte_livrer=0 mais fiches
    // livrées (ex: 1123676).
    // Fiches non-annulées (display)
    const ofFiches = fichesByOfId.get(r.id_of) ?? []
    const sumRemp = ofFiches.reduce((s, f) => s + (f.qte_remplissage ?? 0), 0)
    const sumPoly = ofFiches.reduce((s, f) => s + (f.qte_polypackage ?? 0), 0)
    const sumLivr = ofFiches.reduce((s, f) => s + (f.qte_livraison ?? 0), 0)
    // Toutes fiches (y compris annulées) — pour calcul du ratio pcs/CRN
    // car SAP comptabilise tout, annulées comprises.
    const ofFichesAll = fichesAllByOfId.get(r.id_of) ?? []
    const sumRempAll = ofFichesAll.reduce((s, f) => s + (f.qte_remplissage ?? 0), 0)
    const sumPolyAll = ofFichesAll.reduce((s, f) => s + (f.qte_polypackage ?? 0), 0)
    const sumLivrAll = ofFichesAll.reduce((s, f) => s + (f.qte_livraison ?? 0), 0)
    const sapRemp = r.qte_remplir ?? 0
    const sapPoly = r.qte_polypacker ?? 0
    const sapLivr = r.qte_livrer ?? 0
    // Ratio pcs/CRN = pièces par carton de l'article.
    // Source V2 : qte_piece_globale (= prod_order_state.global_piece_qty, total
    // en pièces) ÷ qte_of (total en CRN). Ex: OF KAR 411 CRN ↔ 26958 pcs → 65.6.
    // En V2 les qte_remplir/polypacker/livrer (ancien SAP) sont NULL ; on garde
    // l'ancienne logique en repli si jamais elles redeviennent renseignées.
    // Pour les articles au poids (KG), qte_piece_globale est NULL → pas de
    // conversion (ratio null) : la quantité reste exprimée telle quelle.
    const pieceGlobale = r.qte_piece_globale ?? 0
    const qteOfCrn = r.qte_of ?? 0
    const ratioUPerKar =
      (r.colisage ?? 0) > 0
        ? (r.colisage as number) // source primaire : colisage (pcs/carton)
        : pieceGlobale > 0 && qteOfCrn > 0
          ? pieceGlobale / qteOfCrn
          : artRatio && artRatio > 0
            ? artRatio // repli : ratio pcs/carton de l'article (autres OF)
            : sapRemp > 0 && sumRempAll > 0
              ? sumRempAll / sapRemp
              : sapPoly > 0 && sumPolyAll > 0
                ? sumPolyAll / sapPoly
                : sapLivr > 0 && sumLivrAll > 0
                  ? sumLivrAll / sapLivr
                  : null
    // Conversion : pcs (non-annulées) → CRN via le ratio fiable
    const convertToKar = (sumU: number) =>
      ratioUPerKar && ratioUPerKar > 0 ? sumU / ratioUPerKar : sumU
    // On utilise TOUJOURS Σ fiches non-annulées converties en CRN (option B :
    // les annulations WMS font baisser le compteur affiché, même si SAP a
    // gardé l'ancienne valeur).
    const qteRempliRaw = convertToKar(sumRemp)
    const qtePolypackeeRaw = convertToKar(sumPoly)
    const qteLivreeRaw = convertToKar(sumLivr)
    // Décomposition Carton entier + Pièces restantes (ne formant pas un CRN
    // complet). Ex: 1039.069 CRN × ratio 72 → 1039 CRN + 5 pcs restantes.
    const decompose = (qteKarFloat: number) => {
      const crn = Math.floor(qteKarFloat)
      if (!ratioUPerKar || ratioUPerKar <= 0) return { crn, pieces: 0 }
      const pieces = Math.round((qteKarFloat - crn) * ratioUPerKar)
      return { crn, pieces }
    }
    const remp = decompose(qteRempliRaw)
    const poly = decompose(qtePolypackeeRaw)
    const livr = decompose(qteLivreeRaw)
    const qteRempli = remp.crn
    const qtePolypackee = poly.crn
    const qteLivree = livr.crn
    // Nombre de palettes = nb de fiches ayant la date correspondante
    const qteRempliPalettes = ofFiches.filter((f) => f.remplissage_date).length
    const qtePolypackeePalettes = ofFiches.filter((f) => f.polypackage_date).length
    const qteLivreePalettes = ofFiches.filter((f) => f.livraison_date).length
    // Palettes TOTALES de l'OF, avec deux sources par ordre de fiabilité :
    //
    //   1. Le compte RÉEL des fiches non annulées (palettesTotalByOfId). Le WMS
    //      les crée toutes d'un coup (indices 1..N). Attention : surtout PAS
    //      ofFiches, qui ne contient que les palettes déjà opérées.
    //   2. Si l'OF n'a pas encore ses fiches (statut Validé / Initialisés),
    //      le PRÉVU : CEILING(qte_of / gerbage), gerbage = nb de CRN par palette.
    //
    // Vérifié en base : la formule retombe sur le compte réel sur 1223/1294 OF.
    // Les 71 écarts ont TOUS plus de fiches que prévu (palettes ajoutées en
    // cours de prod) — d'où la priorité au réel dès qu'il existe.
    const palettesReelles = palettesTotalByOfId.get(r.id_of) ?? 0
    const gerbage = Number(r.gerbage)
    const palettesPrevues =
      Number.isFinite(gerbage) && gerbage > 0 && qteOfCrn > 0
        ? Math.ceil(qteOfCrn / gerbage)
        : 0
    const quantitePalettes =
      palettesReelles > 0 ? palettesReelles : palettesPrevues
    const quantitePalettesEstimee = palettesReelles === 0 && palettesPrevues > 0
    // Quantité théorique en pièces : qte_piece_globale si renseigné, sinon
    // qte_of (CRN) × ratio pcs/carton. null pour les articles au poids.
    const quantiteTotalPieces =
      pieceGlobale > 0
        ? Math.round(pieceGlobale)
        : ratioUPerKar && ratioUPerKar > 0 && qteOfCrn > 0
          ? Math.round(qteOfCrn * ratioUPerKar)
          : null

    // Durée reste production : extrapolation linéaire.
    //   rate = dureeEcoulee (min) / qteRempli → minutes par unité produite
    //   reste = qteTH - qteRempli
    //   dureeReste = rate × reste
    // dureeEcoulee = Σ duree_production OHSU filtré sur OFDE uniquement
    // (les autres statuts = validation, pause, panne… ne sont pas du temps prod).
    const dureeEcoulee = dureeOfdeByOfId.get(r.id_of) ?? 0
    const qteTheorique = r.qte_of ?? 0
    const resteQte = Math.max(0, qteTheorique - qteRempli)
    const dureeResteMinutes =
      dureeEcoulee > 0 && qteRempli > 0 && resteQte > 0
        ? Math.round((dureeEcoulee * resteQte) / qteRempli)
        : null
    const dateFinProduction =
      dureeResteMinutes != null
        ? new Date(now.getTime() + dureeResteMinutes * 60_000)
        : null

    return {
      of: r.of,
      ofSF: r.of_secondary,
      typeArticle: r.type_article ?? "ZFER",
      codeArticle: r.code_article ?? "",
      designationArticle: r.designation_article ?? "",

      quantite: qteTheorique,
      quantitePalettes,
      quantitePalettesEstimee,
      quantiteTotalPieces,
      qteRempli,
      qtePolypackee,
      qteLivree,
      qteRempliPieces: remp.pieces,
      qteRempliTotalPieces: sumRemp,
      qteRempliPalettes,
      qtePolypackeePieces: poly.pieces,
      qtePolypackeeTotalPieces: sumPoly,
      qtePolypackeePalettes,
      qteLivreePieces: livr.pieces,
      qteLivreeTotalPieces: sumLivr,
      qteLivreePalettes,
      unite: r.unite ?? "",

      section: sectionInfo.nom,
      ligne: r.process_code ?? "",

      nbComposantsReceptionnes:
        composantsByOfId.get(r.id_of)?.nb_receptionnes ?? 0,
      nbTotalComposants: composantsByOfId.get(r.id_of)?.nb_items ?? 0,

      statusUtilisateur: badgeFromView(
        r.statusUtilisateur_designation,
        r.statusUtilisateur_color
      ),
      // Si la jointure status fournit une designation, on la prend ; sinon
      // fallback sur le mapping hardcodé (au cas où id_status_production ne
      // mappe pas toujours à une ligne de la table status).
      statusProduction: r.statusProduction_designation
        ? badgeFromView(
            r.statusProduction_designation,
            r.statusProduction_color
          )
        : mapProdStatus(r.id_status_production),
      statusLogistique: badgeFromView(r.status_designation, r.status_color),

      dateDebutOrdo: debutOrdo?.toISOString() ?? null,
      dateFinOrdo: finOrdo?.toISOString() ?? null,
      dateFinOrdoAvecHeure: r.heure_fin_ordonnancement != null,
      dureeOrdoMinutes: dureeOrdoMin,
      dateDemandeComposant: dateDemandeComposant?.toISOString() ?? null,
      dateDebutProduction: dateDebutProduction?.toISOString() ?? null,
      estimationProd: estimationProd?.toISOString() ?? null,

      dureeProductionEcouleeMinutes: dureeEcoulee > 0 ? dureeEcoulee : null,
      dureeResteProductionMinutes: dureeResteMinutes,
      dateFinProduction: dateFinProduction?.toISOString() ?? null,

      dateTelechargement:
        createdAtByOfId.get(r.id_of)?.toISOString() ?? null,
      dateDemandeLivraison:
        demandByOfId.get(r.id_of)?.last_date_demand_livraison?.toISOString() ??
        null,
      dateSystemeDemande:
        demandByOfId.get(r.id_of)?.last_date_system_demande?.toISOString() ??
        null,

      retard,
      retardMinutes,

      sf: {
        of: r.sf_of,
        quantite: r.sf_qte_of,
        qteFabriquee: sfQteFabriquee,
        pourcentage: sfPct,
        statusProd: r.sf_statusProduction_designation
          ? badgeFromView(
              r.sf_statusProduction_designation,
              r.sf_statusProduction_color
            )
          : mapProdStatus(r.sf_id_status_production),
        statusLog: badgeFromView(r.sf_status_designation, r.sf_status_color),
        statusUtil: badgeFromView(
          r.sf_statusUtil_designation,
          r.sf_statusUtil_color
        ),
        estimation:
          combineDateTime(
            r.sf_date_fin_ordonnancement,
            r.sf_heure_fin_ordonnancement
          )?.toISOString() ?? null,
        dureeReelleMinutes: null,
        dateDemandeComposant: dateDemandeComposantSF?.toISOString() ?? null,
        dateDebutProduction: dateDebutProductionSF?.toISOString() ?? null,
        dateFinProduction: dateFinProductionSF?.toISOString() ?? null,
        dateTelechargement:
          r.sf_id_of != null
            ? (sfCreatedAtByOfId.get(r.sf_id_of)?.toISOString() ?? null)
            : null,
        dateDemandeLivraison:
          r.sf_id_of != null
            ? (demandByOfId.get(r.sf_id_of)?.last_date_demand_livraison?.toISOString() ?? null)
            : null,
        dateSystemeDemande:
          r.sf_id_of != null
            ? (demandByOfId.get(r.sf_id_of)?.last_date_system_demande?.toISOString() ?? null)
            : null,
      },

      dernierPostePolypack: lastPolypackPosteByOfId.get(r.id_of) ?? null,
      nbEffectifOF: effectifByOfId.get(r.id_of) ?? null,
      nbEffectifLigne: processEffectif,

      cadencePiecesParMinute: (() => {
        // cadence_libelle = "48 PCE / 1 MIN" → base_temps=48 pièces, cadence=1 min
        const pieces = Number(r.base_temps)
        const minutes = Number(r.cadence)
        if (!Number.isFinite(pieces) || !Number.isFinite(minutes)) return null
        if (minutes <= 0 || pieces <= 0) return null
        return Math.round((pieces / minutes) * 100) / 100
      })(),
      cadenceLibelle: r.cadence_libelle,
      dosage: (() => {
        const d = Number(r.contenance)
        return Number.isFinite(d) && d > 0 ? d : null
      })(),

      consommationEnergie,

      qualityEvents: (qualityByOfId.get(r.id_of) ?? []).map((q) => ({
        id: q.id_enteteResultatInspect,
        date: q.createdAt.toISOString(),
        echantillon: q.echantillon,
        poids: q.poids,
        quantiteValide: q.quantite_valide,
        nombreEchantillon: q.nombre_echantillon,
        createdBy: q.created_by,
      })),

      bcDatesPF: (bcDatesByOfId.get(r.id_of) ?? []).map((d) => d.toISOString()),
      bcDatesSF:
        r.sf_id_of != null
          ? (bcDatesByOfId.get(r.sf_id_of) ?? []).map((d) => d.toISOString())
          : [],

      events: timelineEvents,
      statusHistoryPF,
      // Fenêtre OF : [dateTelechargement (ou debutProduction si absent) ; now]
      interventions: (() => {
        const ofStart =
          demandByOfId.get(r.id_of)?.of_createdAt ??
          dateDebutProduction ??
          debutOrdo
        if (!ofStart) return []
        const startMs = ofStart.getTime()
        const endMs = now.getTime()
        return avisList
          .filter((a) => {
            const t = a.createdAt.getTime()
            return t >= startMs && t <= endMs
          })
          .map((a) => ({
            id: a.id_avis,
            avisNumber: a.avis_number,
            date: a.createdAt.toISOString(),
            posteTechnique: a.poste_technique,
            codeEquipement: a.code_equipement,
            priorite: a.designation_priorite,
            statut: a.status_designation,
            color: null,
            commentaire: a.commentaire,
            createdBy: a.created_by,
            arret: a.arret === 1,
            clotureDate: a.cloture_date?.toISOString() ?? null,
          }))
      })(),
      updatedAt: r.of_updatedAt.toISOString(),
    }
  })

  // Tri des OFs :
  //   1. Panne technique
  //   2. OF Débuté (OFDE)
  //   3. En attente de livraison (statusProduction En Livraison / Livrer)
  //   4. Non débutés (OF Validé / Initialisé) — triés par dateDemandeComposant
  //   5. Tous les autres statuts
  const sortPriority = (r: (typeof ofRows)[number]): number => {
    const u = (r.statusUtilisateur.label ?? "").toLowerCase()
    const p = (r.statusProduction.label ?? "").toLowerCase()
    if (u.includes("panne")) return 0
    if (u.includes("débuté") || u.includes("debute") || u === "of débuté") return 1
    if (
      p.includes("livraison") ||
      p.includes("livrer") ||
      u.includes("attente") && u.includes("livr")
    )
      return 2
    if (
      u.includes("validé") ||
      u.includes("initialisé") ||
      u.includes("non débuté")
    )
      return 3
    return 4
  }
  ofRows.sort((a, b) => {
    const pa = sortPriority(a)
    const pb = sortPriority(b)
    if (pa !== pb) return pa - pb
    // Priorité 3 (Non débutés) : tri par dateDemandeComposant ASC
    if (pa === 3) {
      const aDate = a.dateDemandeComposant
        ? new Date(a.dateDemandeComposant).getTime()
        : Infinity
      const bDate = b.dateDemandeComposant
        ? new Date(b.dateDemandeComposant).getTime()
        : Infinity
      return aDate - bDate
    }
    // Autres groupes : tri secondaire par updatedAt DESC
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })

  const qteCommandee = ofRows.reduce((s, r) => s + r.quantite, 0)
  const qteRemplie = ofRows.reduce((s, r) => s + r.qteRempli, 0)
  const nbComposantsReceptionnes = rows.reduce(
    (s, r) => s + (r.nb_of_items_avec_batch ?? 0),
    0
  )
  const nbTotalComposants = rows.reduce(
    (s, r) => s + (r.nb_of_items ?? 0),
    0
  )
  const nbOfDebute = rows.filter(
    (r) => r.id_statusUtilisateur_FK === 2
  ).length
  const nbOfEnConso = rows.filter(
    (r) => r.id_status_production === 1
  ).length
  // Demandé = une demande composant a été émise sur l'OF (1er event "À préparer").
  // Non débuté = aucun event OFDE → la production n'a jamais commencé.
  const nbOfDemande = ofRows.filter(
    (r) => r.dateDemandeComposant != null
  ).length
  const ofsNonDebutes = ofRows.filter((r) => r.dateDebutProduction == null)
  const nbOfNonDebute = ofsNonDebutes.length

  // Charge de production restante sur la ligne, en minutes de temps machine.
  // Compte TOUS les OF, pas seulement ceux à lancer : un OF démarré à 50 % a
  // encore la moitié de sa production devant lui. Pour un OF non démarré,
  // qteRempliTotalPieces vaut 0 → la formule retombe sur la quantité totale.
  const minutesResteProduction = (r: OfRow): number => {
    // 1. Cadence théorique appliquée aux pièces qui restent à produire.
    if (r.quantiteTotalPieces != null && r.cadencePiecesParMinute) {
      const restePieces = Math.max(
        0,
        r.quantiteTotalPieces - r.qteRempliTotalPieces
      )
      return restePieces / r.cadencePiecesParMinute
    }
    // 2. Repli : extrapolation sur la cadence réellement observée (OF démarrés
    //    uniquement, null sinon) — utile pour les articles au poids.
    if (r.dureeResteProductionMinutes != null) {
      return r.dureeResteProductionMinutes
    }
    // 3. Dernier repli : durée d'ordonnancement SAP.
    return r.dureeOrdoMinutes ?? 0
  }
  const sommeReste = (rows: OfRow[]) =>
    Math.round(rows.reduce((t, r) => t + minutesResteProduction(r), 0))

  const dureeProductionResteALancerMinutes = sommeReste(ofsNonDebutes)
  const dureeProductionResteEnCoursMinutes = sommeReste(
    ofRows.filter((r) => r.dateDebutProduction != null)
  )
  const dureeProductionResteMinutes =
    dureeProductionResteEnCoursMinutes + dureeProductionResteALancerMinutes

  // Breakdown par statut utilisateur. On part du RÉFÉRENTIEL complet
  // (ref_user_status) et pas seulement des statuts présents sur la ligne :
  // une tuile à 0 est une information — « aucun OF en panne » se lit d'un coup
  // d'œil, alors qu'une tuile absente oblige à se demander si le statut existe.
  const statusRef = await logQuery("ref_user_status", () =>
    prisma.$queryRaw<
      { designation: string; color: string | null }[]
    >`
      SELECT designation, color
      FROM [dbo].[ref_user_status]
      WHERE ISNULL(is_active, 0) = 1 AND ISNULL(vue_web, 0) = 1
      ORDER BY designation
    `
  )
  const statusMap = new Map<string, { count: number; color: string }>()
  for (const s of statusRef) {
    statusMap.set(s.designation, { count: 0, color: s.color || "#9E9E9E" })
  }
  for (const r of rows) {
    const label = r.statusUtilisateur_designation ?? "Inconnu"
    const entry = statusMap.get(label)
    if (entry) entry.count++
    // Statut porté par un OF mais absent du référentiel (désactivé depuis) :
    // on l'ajoute quand même, sinon des OF disparaîtraient du décompte.
    else
      statusMap.set(label, {
        count: 1,
        color: r.statusUtilisateur_color ?? "#9E9E9E",
      })
  }
  const statusCounts = Array.from(statusMap, ([label, { count, color }]) => ({
    label,
    count,
    color,
  })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "fr"))

  const kpis = {
    nbOfPF: ofRows.length,
    nbComposantsReceptionnes,
    nbTotalComposants,
    avancementGlobal:
      qteCommandee > 0 ? Math.round((qteRemplie / qteCommandee) * 100) : 0,
    nbOfDebute,
    nbOfEnConso,
    nbOfDemande,
    nbOfNonDebute,
    dureeProductionResteMinutes,
    dureeProductionResteEnCoursMinutes,
    dureeProductionResteALancerMinutes,
    statusCounts,
  }

  // Détection arrêt ligne : avis actif (status 1 ou 2) avec arret=1
  const avisArret = avisList.find(
    (a) => a.arret === 1
  )
  // Vérifier si l'avis d'arrêt est encore actif (son dernier statut n'est pas clôturé/supprimé)
  // On utilise le id_statusAvis_FK de la table avis (pas avis_has_statusAvis)
  // pour simplifier — status 1 (Création) ou 2 (Lancement) = actif.
  // Note: la requête avisList ne contient que les avis du process/ligne.
  // On cherche le DERNIER avis actif avec arret.
  const lastActiveArret = [...avisList]
    .reverse()
    .find((a) => a.arret === 1)
  // Vérifier via avis_has_statusAvis si cet avis est encore actif
  let ligneEnArret = false
  let arretActif: {
    avisNumber: string | null
    priorite: string | null
    commentaire: string | null
    createdBy: string | null
    date: string
  } | null = null
  if (lastActiveArret) {
    const latestStatus = await prisma.$queryRaw<
      { id_statusAvis_FK: number }[]
    >`
      SELECT TOP 1 id_statusAvis_FK
      FROM [dbo].[avis_has_statusAvis]
      WHERE id_avis_FK = ${lastActiveArret.id_avis}
      ORDER BY createdAt DESC
    `
    const currentStatus = latestStatus[0]?.id_statusAvis_FK
    // Actif = status 1 (Création) ou 2 (Lancement)
    if (currentStatus === 1 || currentStatus === 2) {
      ligneEnArret = true
      arretActif = {
        avisNumber: lastActiveArret.avis_number,
        priorite: lastActiveArret.designation_priorite,
        commentaire: lastActiveArret.commentaire,
        createdBy: lastActiveArret.created_by,
        date: lastActiveArret.createdAt.toISOString(),
      }
    }
  }

  done()
  return {
    ligne: buildLigneInfo(processInfo, sectionInfo),
    kpis,
    ofs: ofRows,
    ligneEnArret,
    arretActif,
    generatedAt: new Date().toISOString(),
  }
}

// =============================================================================
// getOfComposants() — liste détaillée des composants d'un OF (PF + SF associé)
// =============================================================================

async function getOfComposantsImpl(
  ofCode: string
): Promise<OfComposantsResponse | null> {
  const done = logImpl(`getOfComposants(${ofCode})`)

  // 1) Résout l'id_of du PF + of_secondary (→ SF)
  const pfRows = await logQuery("of + of_secondary lookup", () =>
    prisma.$queryRaw<
      { id_of: number; of: string; of_secondary: string | null }[]
    >`
      SELECT TOP 1 id_of, [of], of_secondary
      FROM [Of]
      WHERE [of] = ${ofCode}
      ORDER BY updatedAt DESC
    `
  )
  const pf = pfRows[0]
  if (!pf) {
    done()
    return null
  }

  // 2) id_of du SF (si présent)
  let sfIdOf: number | null = null
  if (pf.of_secondary) {
    const sfRows = await logQuery("SF id_of lookup", () =>
      prisma.$queryRaw<{ id_of: number }[]>`
        SELECT TOP 1 id_of
        FROM [Of]
        WHERE [of] = ${pf.of_secondary} AND type_article = 'ZHAL'
        ORDER BY updatedAt DESC
      `
    )
    sfIdOf = sfRows[0]?.id_of ?? null
  }

  // 3) Tous les composants (PF + SF) en une requête, avec jointure status
  const ids = sfIdOf != null ? [pf.id_of, sfIdOf] : [pf.id_of]
  type ItemRow = {
    id_of_FK: number
    code_article: string
    designation_article: string | null
    quantite: number | null
    unite: string | null
    batch: string | null
    qte_requise: number | null
    qte_prepare: number | null
    qte_receptionne: number | null
    qte_consomme: number | null
    qte_restant_zone: number | null
    qte_restant_cnd: number | null
    magasin: string | null
    zone_tampon: string | null
    type_article: string | null
    id_status_FK: number | null
    status_designation: string | null
    status_color: string | null
    // Si l'item est un SF (ZHAL), on ramène aussi le statut propre de l'OF SF
    // (matché par code_article + numero_lo = batch) — permet de corriger le
    // bug WMS qui n'update pas oi.id_status_FK quand le SF est réceptionné.
    sf_self_id_status_FK: number | null
    sf_self_designation: string | null
    sf_self_color: string | null
    type_poste: string | null
    date_Livraison: Date | null
  }
  const items = await logQuery(
    `composants of_item (${ids.length} OFs)`,
    () => prisma.$queryRaw<ItemRow[]>`
      SELECT
        oi.id_of_FK,
        oi.code_article,
        oi.designation_article,
        oi.quantite,
        oi.unite,
        oi.batch,
        oi.qte_requise,
        oi.qte_prepare,
        oi.qte_receptionne,
        oi.qte_consomme,
        oi.qte_restant_zone,
        oi.qte_restant_cnd,
        oi.magasin,
        oi.zone_tampon,
        oi.type_article,
        oi.type_poste,
        oi.date_Livraison,
        oi.id_status_FK,
        s.designation AS status_designation,
        s.color       AS status_color,
        sf.id_status_FK AS sf_self_id_status_FK,
        s_sf.designation AS sf_self_designation,
        s_sf.color       AS sf_self_color
      FROM [dbo].[of_item] oi
      -- IMPORTANT : le statut composant (id_status_FK) référence ref_status
      -- (statuts de RÉCEPTION 1..8 : Initialisés…Receptionnés), PAS la vue
      -- compat [status] (= ref_production_status). Les ids se chevauchent, donc
      -- joindre [status] renverrait un libellé de PRODUCTION erroné (ex: id 8 →
      -- "Polypacker" au lieu de "Receptionnés"). On joint donc ref_status.
      LEFT JOIN [dbo].[ref_status] s ON s.id = oi.id_status_FK
      LEFT JOIN [dbo].[Of] sf
        ON oi.type_article = 'ZHAL'
        AND sf.code_article = oi.code_article
        AND sf.numero_lo = oi.batch
        AND sf.type_article = 'ZHAL'
      LEFT JOIN [dbo].[ref_status] s_sf ON s_sf.id = sf.id_status_FK
      WHERE oi.id_of_FK IN (${Prisma.join(ids)})
        AND ISNULL(oi.annuler, 0) = 0
        -- Exclut le SF (ZHAL) de la liste PF : il a sa propre card.
        AND NOT (oi.id_of_FK = ${pf.id_of} AND oi.type_article = 'ZHAL')
        -- Exclut quelques composants spécifiques qui n'appartiennent pas au PF
        -- (ils font partie du SF malgré leur présence dans la nomenclature PF).
        AND oi.code_article NOT IN ('5PDCEAU', '5PDCBRONIDOX', 'SPDCBRONIDOX')
        -- Composants "spéciaux" référencés dans ref_special_component : masqués
        -- de la liste du SF uniquement (ils restent visibles côté PF).
        -- is_deleted : la table contient des lignes soft-deleted, parfois en
        -- doublon sur le même article_code → on ne retient que les actives.
        AND NOT (
          oi.id_of_FK <> ${pf.id_of}
          AND EXISTS (
            SELECT 1
            FROM [dbo].[ref_special_component] rsc
            WHERE rsc.article_code = oi.code_article
              AND ISNULL(rsc.is_deleted, 0) = 0
          )
        )
      ORDER BY
        CASE WHEN oi.id_of_FK = ${pf.id_of} THEN 0 ELSE 1 END,
        oi.code_article ASC
    `
  )

  const composants = items.map((r) => {
    const isSF = r.type_article === "ZHAL"
    // Si le SF a son propre statut plus avancé que celui du of_item, on le
    // privilégie (correction du bug de propagation côté WMS).
    const effectiveStatusId =
      isSF &&
      r.sf_self_id_status_FK === 8 &&
      r.id_status_FK !== 8
        ? r.sf_self_id_status_FK
        : r.id_status_FK
    const effectiveDesignation =
      effectiveStatusId === r.sf_self_id_status_FK
        ? r.sf_self_designation
        : r.status_designation
    const effectiveColor =
      effectiveStatusId === r.sf_self_id_status_FK
        ? r.sf_self_color
        : r.status_color
    return {
      source: (r.id_of_FK === pf.id_of ? "PF" : "SF") as "PF" | "SF",
      codeArticle: r.code_article,
      designation: r.designation_article ?? "",
      quantite: r.quantite ?? 0,
      unite: r.unite ?? "",
      batch: r.batch,
      qteRequise: r.qte_requise,
      qteReceptionnee: r.qte_receptionne,
      qteConsommee: r.qte_consomme,
      // Ni "reste magasin" ni "en attente magasin" n'existent en base : les deux
      // se dérivent, avec un repère amont différent (réceptionnée vs préparée).
      // Planchées à 0 par sécurité même si aucune ligne négative n'existe.
      resteMagasin:
        r.qte_requise == null
          ? null
          : Math.max(0, r.qte_requise - (r.qte_receptionne ?? 0)),
      enAttenteMagasin:
        r.qte_requise == null
          ? null
          : Math.max(0, r.qte_requise - (r.qte_prepare ?? 0)),
      // Deux notions distinctes autour de la zone tampon :
      //   - resteZoneTampon : ce qui stationne DANS la zone (compteur WMS)
      //   - enAttenteZone   : ce qui a quitté le magasin mais n'y est pas
      //                       encore entré (transit) = préparée − réceptionnée
      resteZoneTampon: r.qte_restant_zone,
      enAttenteZone:
        r.qte_prepare == null
          ? null
          : Math.max(0, r.qte_prepare - (r.qte_receptionne ?? 0)),
      resteConditionnement: r.qte_restant_cnd,
      magasin: r.magasin,
      zoneTampon: r.zone_tampon,
      status: badgeFromView(effectiveDesignation, effectiveColor),
      receptionne: effectiveStatusId === 8,
      isBC: r.type_poste === "Z",
      dateLivraison: r.date_Livraison?.toISOString() ?? null,
    }
  })

  done()
  return {
    of: pf.of,
    sfOf: pf.of_secondary,
    composants,
    nbTotal: composants.length,
    nbReceptionnes: composants.filter((c) => c.receptionne).length,
    generatedAt: new Date().toISOString(),
  }
}

// =============================================================================
// PUBLIC API (wrappers cachés — point d'entrée des Route Handlers)
// =============================================================================

export function listLignes(): Promise<ProcessListResponse> {
  return cached("lignes", listLignesImpl)
}

export function getDashboard(code: string): Promise<DashboardResponse | null> {
  return cached(`dashboard:${code}`, () => getDashboardImpl(code))
}

export function getOfComposants(
  ofCode: string
): Promise<OfComposantsResponse | null> {
  return cached(`composants:${ofCode}`, () => getOfComposantsImpl(ofCode))
}
