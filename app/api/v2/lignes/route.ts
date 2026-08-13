import { NextResponse } from "next/server"
import { listLignes } from "@/lib/dashboard-service"

// Force dynamic — pas de cache statique, on veut du temps réel
export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET() {
  try {
    const data = await listLignes()
    return NextResponse.json(data)
  } catch (err) {
    console.error("[GET /api/v2/lignes]", err)
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    )
  }
}
