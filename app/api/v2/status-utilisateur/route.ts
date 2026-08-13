import { NextResponse } from "next/server"
import {
  ServiceOfNonConfigure,
  listStatusUtilisateur,
} from "@/lib/service-of"
import type { StatusUtilisateurOption } from "@/lib/types"

export const dynamic = "force-dynamic"
export const revalidate = 0

/** id 2 = OFDE : l'API exige en plus fillProcessCode (ligne scannée). */
const AVEC_PROCESS_CODE = new Set([2])

/**
 * Normalise la réponse de service-of : la forme exacte des champs n'est pas
 * figée par la doc, on accepte donc les variantes usuelles (id/id_status…,
 * designation/libelle…) plutôt que de casser au premier écart.
 */
function normaliser(brut: unknown): StatusUtilisateurOption[] {
  const liste: unknown[] = Array.isArray(brut)
    ? brut
    : brut && typeof brut === "object" && Array.isArray((brut as any).data)
      ? (brut as any).data
      : []
  return liste
    .map((brutLigne: unknown) => {
      const r = brutLigne as Record<string, unknown>
      if (!r || typeof r !== "object") return null
      const id = Number(r?.id ?? r?.id_statusUtilisateur ?? r?.userStatusId)
      if (!Number.isFinite(id)) return null
      return {
        id,
        code: String(r?.code ?? ""),
        designation: String(
          r?.designation ?? r?.libelle ?? r?.label ?? `Statut ${id}`
        ),
        color: String(r?.color ?? r?.couleur ?? "#94a3b8"),
        requiertProcessCode: AVEC_PROCESS_CODE.has(id),
      } satisfies StatusUtilisateurOption
    })
    .filter((x): x is StatusUtilisateurOption => x !== null)
}

export async function GET() {
  try {
    const amont = await listStatusUtilisateur()
    if (amont.status < 200 || amont.status >= 300) {
      return NextResponse.json(
        { error: amont.message ?? "service-of a refusé la requête" },
        { status: amont.status }
      )
    }
    return NextResponse.json({ statuts: normaliser(amont.body) })
  } catch (err) {
    if (err instanceof ServiceOfNonConfigure) {
      return NextResponse.json({ error: err.message }, { status: 503 })
    }
    console.error("[GET /api/v2/status-utilisateur]", err)
    return NextResponse.json(
      { error: "service-of injoignable" },
      { status: 502 }
    )
  }
}
