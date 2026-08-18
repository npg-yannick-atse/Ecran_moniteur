/**
 * Types partagés entre l'API v2 et le frontend.
 *
 * Voir la doc complète : `production-monitoringV3_v080426/api/routes/v2-dashboard.ts`
 * Mappings DB confirmés via `scripts/inspect-db.ts` (table status, statusUtilisateur, etc.)
 */

export type StatusLevel = "ok" | "info" | "warning" | "danger" | "neutral"

export interface LigneInfo {
  code: string // ex: "L019SHP"
  designation: string // ex: "LRC 2 SHAMP MANUELLE"
  section: { code: string; nom: string } // ex: { code: "SHP", nom: "Shampooing" }
  poste_technique: string | null
}

export interface KPIs {
  nbOfPF: number
  nbComposantsReceptionnes: number
  nbTotalComposants: number
  avancementGlobal: number // 0-100
  /** OFs démarrés par l'opérateur (OFDE = id_statusUtilisateur_FK = 2) */
  nbOfDebute: number
  /** OFs en consommation active (id_status_production = 11) */
  nbOfEnConso: number
  /** OFs ayant une demande de composant (dateDemandeComposant renseignée) */
  nbOfDemande: number
  /** OFs sans aucun event OFDE = production jamais démarrée */
  nbOfNonDebute: number
  /**
   * Temps de production restant sur la ligne, en minutes — TOUS les OF, qu'ils
   * soient démarrés ou non. Par OF : pièces restantes ÷ cadence (pcs/min).
   * Répond à « il reste combien d'heures à produire ».
   */
  dureeProductionResteMinutes: number
  /** Part du total portée par les OF déjà démarrés (reste à finir) */
  dureeProductionResteEnCoursMinutes: number
  /** Part du total portée par les OF pas encore démarrés (file d'attente) */
  dureeProductionResteALancerMinutes: number
  /** Breakdown par status production affiché en haut */
  statusCounts: { label: string; count: number; color: string }[]
}

export interface StatusBadge {
  label: string
  level: StatusLevel
  color: string // hex couleur custom (ex venant de la table statusUtilisateur)
}

export interface SfInfo {
  of: string | null
  quantite: number | null
  qteFabriquee: number // qte_remplir du SF
  pourcentage: number // 0-100
  statusProd: StatusBadge
  statusLog: StatusBadge
  statusUtil: StatusBadge
  estimation: string | null // ISO datetime
  dureeReelleMinutes: number | null
  dateDemandeComposant: string | null // ISO — 1er event id_status_FK=2 sur le SF (repère amont)
  dateDebutProduction: string | null // ISO — 1er event OFDE sur le SF = début réel de la fab
  /** ISO — dernière confirmation FINALE (prod_operation_confirmation.is_final) = fin réelle du SF */
  dateFinProduction: string | null
  dateTelechargement: string | null // ISO — Of.createdAt du SF (arrivée WMS)
  dateDemandeLivraison: string | null // ISO — of_has_demand.last_date_demand_livraison du SF
  dateSystemeDemande: string | null // ISO — of_has_demand.last_date_system_demande du SF
}

export type TimelineRail = "SF" | "Remplissage" | "Fardelage" | "Livraison"

export interface TimelineEvent {
  date: string // ISO datetime
  type: "logistique" | "utilisateur" | "production"
  category: "PF" | "SF" // distingue les events de l'OF principal vs son semi-fini
  rail: TimelineRail // Y-axis : sur quel rail l'event est dessiné
  code: string // identifiant court ex "valide", "debute", "remplissage"
  label: string // texte affiché ex "OF Validé"
  color: string // hex
  qte?: number | null // quantité en PIÈCES (pour remplissage/fardelage/livraison)
  qteCarton?: number | null // quantité convertie en CARTONS (CRN) ; null si article au poids
  palette?: number | null // indice de la palette (sheet_index) — remplissage/fardelage/livraison
}

/**
 * Période de statut utilisateur PF (non dédupliquée) — pour rendu en bande
 * colorée au-dessus des rails, façon timeline du monitoring. Chaque période
 * = [start, end] où end = début de la période suivante (ou null si en cours).
 */
export interface StatusPeriod {
  code: string // "util-2" etc.
  designation: string // "OF Débuté" etc.
  color: string // hex
  start: string // ISO
  end: string | null // ISO ; null = statut courant (jusqu'à maintenant)
  durationMin: number // durée en minutes (jusqu'à now si en cours)
  consoSegment: number | null // énergie consommée pendant CE statut = delta index compteur ; null si pas de relevé sur la fenêtre
  createdBy: string | null // auteur du changement de statut
  commentaire: string | null // motif saisi à la bascule, souvent vide
}

/**
 * Demande d'intervention (table [dbo].[avis]) liée à la ligne d'un OF
 * et tombant dans sa fenêtre temporelle.
 */
export interface InterventionEvent {
  id: number
  avisNumber: string | null
  date: string // ISO — avis.createdAt
  posteTechnique: string | null
  codeEquipement: string | null
  priorite: string | null // "urgent", etc.
  statut: string | null // ex: "Lancement Avis"
  color: string | null
  commentaire: string | null
  createdBy: string | null
  arret: boolean // 1 = arrêt de prod
  clotureDate: string | null // ISO — date de clôture de l'avis (statut Clôture), si clôturé
}

export interface OfRow {
  // identifiants
  of: string
  ofSF: string | null
  typeArticle: string // "ZFER"
  codeArticle: string
  designationArticle: string

  // quantités
  quantite: number // Quantité théorique (qte_of — SAP), en CRN pour les articles KAR
  /**
   * Nb total de palettes de l'OF : compte réel des fiche_cheminement non
   * annulées ; à défaut (fiches pas encore créées) le prévu CEIL(qte_of/gerbage).
   */
  quantitePalettes: number
  /** true quand la valeur ci-dessus est le prévu calculé, pas le compte réel */
  quantitePalettesEstimee: boolean
  /** Quantité théorique convertie en pièces ; null si article au poids (pas de ratio) */
  quantiteTotalPieces: number | null
  qteRempli: number // en KAR (Of.qte_remplir)
  qtePolypackee: number // en KAR
  qteLivree: number // en KAR
  unite: string

  // Décomposition Carton entier + Pièces restantes + Total pièces + nb Palettes
  //   - Pieces = unités restantes (ex: 1039.069 CRN × 72 → 5 pcs restantes)
  //   - TotalPieces = Σ fiche.qte_* (total unités individuelles)
  //   - Palettes = nb fiches avec la date correspondante
  qteRempliPieces: number
  qteRempliTotalPieces: number
  qteRempliPalettes: number
  qtePolypackeePieces: number
  qtePolypackeeTotalPieces: number
  qtePolypackeePalettes: number
  qteLivreePieces: number
  qteLivreeTotalPieces: number
  qteLivreePalettes: number

  // contexte
  section: string // section_nom
  ligne: string // process code

  // composants (nomenclature) sur cet OF
  nbComposantsReceptionnes: number // of_item.batch IS NOT NULL count
  nbTotalComposants: number // total of_item count

  // statuts (texte prêt à afficher + couleur)
  statusUtilisateur: StatusBadge
  statusProduction: StatusBadge
  statusLogistique: StatusBadge

  // dates / ordonnancement
  dateDebutOrdo: string | null // ISO — date planifiée SAP
  dateFinOrdo: string | null // ISO
  /**
   * false quand SAP n'a pas fourni d'heure de fin (colonne
   * heure_fin_ordonnancement NULL) : l'ISO est alors calé à minuit et
   * l'afficher avec une heure ferait croire à une précision inexistante.
   * Vérifié en base : NULL sur 1 356 OF PF sur 1 356.
   */
  dateFinOrdoAvecHeure: boolean
  dureeOrdoMinutes: number | null
  dateDemandeComposant: string | null // ISO — 1er event "À préparer" créé par un utilisateur (pas SAP/null)
  dateDebutProduction: string | null // ISO — 1er event OFDE (OF Débuté) = début réel de la prod
  estimationProd: string | null // ISO

  // production restante (calculée depuis Of_has_statusUtilisateurs.duree_production)
  dureeProductionEcouleeMinutes: number | null // Σ duree_production côté OHSU
  dureeResteProductionMinutes: number | null // extrapolation basée sur la cadence réelle
  dateFinProduction: string | null // ISO — now + dureeResteProductionMinutes

  // 3 dates spéciales affichées comme marqueurs verticaux sur la timeline
  dateTelechargement: string | null // ISO — Of.createdAt (arrivée de l'OF dans le WMS)
  dateDemandeLivraison: string | null // ISO — of_has_demand.last_date_demand_livraison (dernière révision)
  dateSystemeDemande: string | null // ISO — of_has_demand.last_date_system_demande (dernière révision)

  // Dernier poste sur lequel un polypackage a été effectué (fiche_cheminement.polypack_on)
  dernierPostePolypack: string | null

  // Nombre effectif : opérateurs affectés à l'OF (opération 0010) vs prévu ligne
  nbEffectifOF: number | null // operations.nb_effectif pour operation_code='0010'
  nbEffectifLigne: number | null // process.nombre_effectif

  // Cadence théorique (vue v_statistique_production_of) :
  //   base_temps = nb de pièces, cadence = nb de minutes → pcs/min = base_temps / cadence
  cadencePiecesParMinute: number | null
  cadenceLibelle: string | null // ex: "48 PCE / 1 MIN (48 PCE/MIN)"

  // Dosage = contenance cible par unité (prod_order_state.contenance).
  // Ex: article "GDO. D.E.S 500ML" → 530. Pas d'unité stockée en base.
  dosage: number | null

  // Énergie (WMS_MP_V2 : wf_order_event.current_energy_tag = index compteur cumulé)
  // Conso cumulée PF + SF : somme des deltas d'index (dernier − premier relevé)
  // calculés SÉPARÉMENT sur chaque compteur. null si aucun des deux n'a ≥ 2
  // relevés ; si un seul en a, on ne compte que celui-là.
  consommationEnergie: number | null

  // Contrôles qualité (entete_resultat_inspect)
  qualityEvents: QualityEvent[]

  // Dates Bon Complémentaire (of_item.date_Livraison pour type_poste='Z')
  bcDatesPF: string[] // ISO
  bcDatesSF: string[] // ISO

  // retard
  retard: boolean
  retardMinutes: number

  // semi-fini lié
  sf: SfInfo

  // timeline
  events: TimelineEvent[]
  statusHistoryPF: StatusPeriod[] // périodes non dédupliquées des statuts user PF
  interventions: InterventionEvent[] // avis d'intervention sur la ligne pendant la vie de l'OF

  // métadonnées
  updatedAt: string // ISO
}

/**
 * Contrôle qualité (entete_resultat_inspect) lié à un OF.
 */
export interface QualityEvent {
  id: number
  date: string // ISO — createdAt
  echantillon: number | null
  poids: number | null
  quantiteValide: number | null
  nombreEchantillon: number | null
  createdBy: string | null
}

export interface ArretInfo {
  avisNumber: string | null
  priorite: string | null
  commentaire: string | null
  createdBy: string | null
  date: string // ISO
}

export interface DashboardResponse {
  ligne: LigneInfo
  kpis: KPIs
  ofs: OfRow[]
  /** La ligne est actuellement en arrêt (avis actif avec arret=1). */
  ligneEnArret: boolean
  /** Détails du dernier avis d'arrêt actif, si applicable. */
  arretActif: ArretInfo | null
  generatedAt: string // ISO datetime de génération de la réponse
}

export interface OfComposant {
  source: "PF" | "SF"
  codeArticle: string
  designation: string
  quantite: number
  unite: string
  batch: string | null
  qteRequise: number | null
  qteReceptionnee: number | null
  qteConsommee: number | null
  /** Reste à sortir du magasin = qte_requise − qte_receptionne (planché à 0) */
  resteMagasin: number | null
  /**
   * En attente au magasin = qte_requise − qte_prepare (planché à 0).
   * Ce que le magasin n'a pas encore servi. Diffère de `resteMagasin` sur ~3 %
   * des lignes seulement (qte_prepare = qte_receptionne sur 5 559/5 713).
   * `qte_prepare` est la seule colonne amont fiable : vérifié en base, elle est
   * ≤ qte_requise sur 100 % des lignes, alors que qte_transfere la dépasse
   * sur 11 % (double comptage WMS).
   */
  enAttenteMagasin: number | null
  /** of_item.qte_restant_zone — reste en zone tampon */
  resteZoneTampon: number | null
  /**
   * En attente d'entrer en zone = qte_prepare − qte_receptionne (planché à 0).
   * Servi par le magasin mais pas encore arrivé en zone tampon (en transit).
   * À ne pas confondre avec `resteZoneTampon`, qui est ce qui stationne DANS
   * la zone. Vaut 0 sur ~97 % des lignes (qte_prepare = qte_receptionne) :
   * c'est normal, le transit magasin → zone est court.
   */
  enAttenteZone: number | null
  /** of_item.qte_restant_cnd — reste au conditionnement */
  resteConditionnement: number | null
  magasin: string | null
  zoneTampon: string | null
  status: StatusBadge
  receptionne: boolean // id_status_FK = 8
  /** `type_poste = 'Z'` → Bon Complémentaire (BC) — affiché en couleur distincte */
  isBC: boolean
  /** `of_item.date_Livraison` — date du BC (ou date livraison normale) */
  dateLivraison: string | null
}

export interface OfComposantsResponse {
  of: string
  sfOf: string | null
  composants: OfComposant[]
  nbTotal: number
  nbReceptionnes: number
  generatedAt: string
}

export interface ProcessListItem {
  code: string
  designation: string
  ligne: string | null
  poste_technique: string | null
  section: { code: string; nom: string } // ex: { code: "SHP", nom: "Shampoing" }
  // KPIs résumés
  nbOf: number
  nbOfEnCours: number
  nbOfEnRetard: number
}

export interface ProcessListResponse {
  lignes: ProcessListItem[]
  generatedAt: string
}
