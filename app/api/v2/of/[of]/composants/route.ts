import { NextResponse } from "next/server"
import { getOfComposants } from "@/lib/dashboard-service"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(
  _req: Request,
  { params }: { params: { of: string } }
) {
  try {
    const data = await getOfComposants(params.of)
    if (!data) {
      return NextResponse.json({ error: "OF non trouvé" }, { status: 404 })
    }
    return NextResponse.json(data)
  } catch (err) {
    console.error(`[GET /api/v2/of/${params.of}/composants]`, err)
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 })
  }
}
