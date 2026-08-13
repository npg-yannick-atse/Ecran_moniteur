import { getDashboard } from "../lib/dashboard-service"
import { prisma } from "../lib/prisma"

async function main() {
  const r = await getDashboard("L060POM")
  const of = r?.ofs.find((o) => o.of === "000001127547")
  if (!of) {
    console.log("OF introuvable")
    return
  }
  console.log("=== OF 1127547 (PF) ===")
  console.log("  demande composant (À préparer)   :", of.dateDemandeComposant)
  console.log("  début production (OFDE) — ancre  :", of.dateDebutProduction)
  console.log("  début ordonnancement (SAP)       :", of.dateDebutOrdo)
  console.log("  fin ordonnancement (SAP)         :", of.estimationProd)
  console.log("")
  console.log("=== SF ===")
  console.log("  demande composant SF             :", of.sf.dateDemandeComposant)
  console.log("  début production SF (OFDE SF)    :", of.sf.dateDebutProduction)
  console.log("  fin ordonnancement SF            :", of.sf.estimation)
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
