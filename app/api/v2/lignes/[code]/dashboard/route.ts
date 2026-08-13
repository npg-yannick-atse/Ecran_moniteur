import { NextResponse } from "next/server"
import { getDashboard } from "@/lib/dashboard-service"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(
  _req: Request,
  { params }: { params: { code: string } }
) {
  try {
    const data = await getDashboard(params.code)
    if (!data) {
      return NextResponse.json({ error: "Ligne non trouvée" }, { status: 404 })
    }
    return NextResponse.json(data)
  } catch (err) {
    console.error(`[GET /api/v2/lignes/${params.code}/dashboard]`, err)
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 })
  }
}
