/**
 * Client de l'API service-of (changement de statut utilisateur d'un OF).
 *
 * Appelé UNIQUEMENT côté serveur, depuis les Route Handlers. Deux raisons de
 * ne pas laisser le navigateur appeler service-of directement :
 *   - l'app est servie en HTTPS ; un appel vers un service-of en http serait
 *     bloqué comme contenu mixte ;
 *   - il faudrait du CORS côté service-of.
 * Le navigateur parle donc à /api/v2/* (même origine) qui relaie.
 *
 * Configuration — .env :
 *   SERVICE_OF_BASE_URL   racine API de service-of (ex. http://10.10.10.x:8082/api)
 *   SERVICE_OF_USER_ID    user_id par défaut pour la traçabilité (facultatif)
 *   SERVICE_OF_TIMEOUT_MS délai max d'un appel (défaut 15000)
 */

const TIMEOUT_MS = Number(process.env.SERVICE_OF_TIMEOUT_MS || 15_000)

export class ServiceOfNonConfigure extends Error {
  constructor() {
    super(
      "SERVICE_OF_BASE_URL n'est pas défini : l'API de changement de statut " +
        "n'est pas encore raccordée. Renseigner la variable dans .env puis " +
        "redémarrer (pm2 restart ecran-moniteur)."
    )
    this.name = "ServiceOfNonConfigure"
  }
}

function baseUrl(): string {
  const url = process.env.SERVICE_OF_BASE_URL?.trim()
  if (!url) throw new ServiceOfNonConfigure()
  return url.replace(/\/+$/, "") // pas de slash final, on concatène derrière
}

export function serviceOfConfigure(): boolean {
  return !!process.env.SERVICE_OF_BASE_URL?.trim()
}

/** Résultat d'un appel relayé : on conserve le code HTTP amont tel quel. */
export interface ReponseAmont {
  status: number
  body: unknown
  /** Message métier extrait du corps quand il y en a un */
  message?: string
}

async function appeler(
  chemin: string,
  init: RequestInit
): Promise<ReponseAmont> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${baseUrl()}${chemin}`, {
      ...init,
      signal: ctrl.signal,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    })
    // service-of peut répondre en texte brut sur certaines erreurs.
    const brut = await res.text()
    let body: unknown = brut
    try {
      body = brut ? JSON.parse(brut) : null
    } catch {
      /* on garde le texte */
    }
    const message =
      body && typeof body === "object" && "message" in body
        ? String((body as { message: unknown }).message)
        : typeof body === "string" && body
          ? body
          : undefined
    return { status: res.status, body, message }
  } finally {
    clearTimeout(timer)
  }
}

/** GET {BASE}/v1-compat/statusUtilisateur — liste des statuts utilisateur. */
export function listStatusUtilisateur(): Promise<ReponseAmont> {
  return appeler("/v1-compat/statusUtilisateur", { method: "GET" })
}

/**
 * PUT {BASE}/v1-compat/of/statusUtilisateur/by-order/{orderNumber}
 *
 * `orderNumber` est le numéro d'OF SANS ses zéros de tête : la doc donne
 * .../by-order/1136984 alors qu'en base l'OF est stocké "000001136984".
 */
export function changeStatusUtilisateur(
  ofCode: string,
  corps: Record<string, unknown>
): Promise<ReponseAmont> {
  const orderNumber = ofCode.replace(/^0+/, "") || ofCode
  return appeler(
    `/v1-compat/of/statusUtilisateur/by-order/${encodeURIComponent(orderNumber)}`,
    { method: "PUT", body: JSON.stringify(corps) }
  )
}
