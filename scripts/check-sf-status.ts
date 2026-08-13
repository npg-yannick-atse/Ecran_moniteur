import { prisma } from "../lib/prisma"
import { getDashboard } from "../lib/dashboard-service"

async function main() {
  // Prendre 1 PF actif avec un SF associé
  const sample: any[] = await prisma.$queryRaw`
    SELECT TOP 1 pf.[of] AS pf_of, pf.of_secondary, pf.process
    FROM [Of] pf
    WHERE pf.type_article='ZFER'
      AND pf.of_secondary IS NOT NULL
      AND (pf.id_status_production=11 OR pf.id_statusUtilisateur_FK=2)
  `
  if (!sample[0]) {
    console.log("Pas de PF avec SF trouvé")
    return
  }
  const { pf_of: pfOf, of_secondary: sfOf, process } = sample[0]
  console.log(`PF: ${pfOf}  |  SF: ${sfOf}  |  Ligne: ${process}\n`)

  // Source DB brute
  const dbRaw: any[] = await prisma.$queryRaw`
    SELECT
      o.[of],
      o.id_status_FK,
      s.designation AS log_label,
      s.color       AS log_color,
      o.id_status_production,
      sp.designation AS prod_label,
      sp.color       AS prod_color,
      o.id_statusUtilisateur_FK,
      su.designation AS util_label,
      su.color       AS util_color
    FROM [Of] o
    LEFT JOIN [status] s ON s.id_status = o.id_status_FK
    LEFT JOIN [status] sp ON sp.id_status = o.id_status_production
    LEFT JOIN [statusUtilisateur] su ON su.id_statusUtilisateur = o.id_statusUtilisateur_FK
    WHERE o.[of] = ${sfOf} AND o.type_article='ZHAL'
  `
  console.log("=== Valeurs DB brutes (SF) ===")
  console.log(dbRaw[0])

  // Via l'app
  const r = await getDashboard(process)
  const of = r?.ofs.find((o) => o.of === pfOf)
  console.log("\n=== Via getDashboard() (app) ===")
  console.log({
    of: of?.sf.of,
    statusLog: of?.sf.statusLog,
    statusProd: of?.sf.statusProd,
    statusUtil: of?.sf.statusUtil,
  })

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
