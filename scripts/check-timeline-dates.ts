import { getDashboard } from "../lib/dashboard-service"
import { prisma } from "../lib/prisma"

async function main() {
  const r = await getDashboard("L060POM")
  const of = r?.ofs.find((o) => o.of === "000001127547")
  if (!of) {
    console.log("OF 1127547 introuvable")
    return
  }
  console.log("Dates de la timeline pour PF 1127547 :")
  console.log("  demande PF :", of.dateDemandeComposant)
  console.log("  début ordo PF :", of.dateDebutOrdo)
  console.log("  fin ordo PF :", of.estimationProd)
  console.log("  demande SF :", of.sf.dateDemandeComposant)
  console.log("  fin ordo SF :", of.sf.estimation)
  console.log("  SF pct :", of.sf.pourcentage + "%")
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
