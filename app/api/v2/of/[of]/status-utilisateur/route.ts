import { NextResponse } from "next/server"
import {
  ServiceOfNonConfigure,
  changeStatusUtilisateur,
} from "@/lib/service-of"

export const dynamic = "force-dynamic"
export const revalidate = 0

/**
 * PUT /api/v2/of/:of/status-utilisateur
 *
 * Relaie vers service-of. On ne rejoue AUCUNE règle métier ici : la matrice de
 * transitions et l'appel SAP sont du ressort de service-of, qui refuse en
 * 400/409 avec un message clair. On se contente de valider la forme du corps et
 * de faire remonter le code HTTP et le message tels quels, pour que l'opérateur
 * voie la vraie raison du refus.
 */
export async function PUT(
  req: Request,
  { params }: { params: { of: string } }
) {
  let entree: Record<string, unknown>
  try {
    entree = await req.json()
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 })
  }

  const userStatusId = Number(entree.userStatusId ?? entree.user_status_id)
  if (!Number.isFinite(userStatusId)) {
    return NextResponse.json(
      { error: "userStatusId manquant ou non numérique" },
      { status: 400 }
    )
  }

  // OF Débuté (2) : sans le poste technique, service-of refuserait de toute
  // façon — autant le dire tout de suite plutôt que de faire l'aller-retour.
  const fillProcessCode =
    (entree.fillProcessCode as string | undefined) ??
    (entree.fill_process_code as string | undefined)
  if (userStatusId === 2 && !fillProcessCode) {
    return NextResponse.json(
      { error: "fillProcessCode requis pour passer un OF en Débuté" },
      { status: 400 }
    )
  }

  const userIdParDefaut = process.env.SERVICE_OF_USER_ID
  const corps: Record<string, unknown> = {
    userStatusId,
    ...(entree.commentaire ? { commentaire: entree.commentaire } : {}),
    ...(fillProcessCode ? { fillProcessCode } : {}),
  }
  // Traçabilité : user_id explicite, sinon celui du .env, sinon un nom libre.
  const userId = entree.userId ?? entree.user_id ?? userIdParDefaut
  if (userId != null && userId !== "") corps.user_id = Number(userId)
  if (entree.createdBy) corps.created_by = entree.createdBy

  try {
    const amont = await changeStatusUtilisateur(params.of, corps)
    const ok = amont.status >= 200 && amont.status < 300
    return NextResponse.json(
      { ok, message: amont.message, data: amont.body },
      { status: amont.status }
    )
  } catch (err) {
    if (err instanceof ServiceOfNonConfigure) {
      return NextResponse.json(
        { ok: false, message: err.message },
        { status: 503 }
      )
    }
    console.error(`[PUT /api/v2/of/${params.of}/status-utilisateur]`, err)
    const timeout = err instanceof Error && err.name === "AbortError"
    return NextResponse.json(
      {
        ok: false,
        message: timeout
          ? "service-of n'a pas répondu dans le délai imparti"
          : "service-of injoignable",
      },
      { status: 502 }
    )
  }
}
