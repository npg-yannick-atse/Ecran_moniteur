import { getDashboard } from "../lib/dashboard-service"
import { prisma } from "../lib/prisma"

async function main() {
  const r = await getDashboard("L060POM")
  const of = r?.ofs.find((o) => o.of === "000001128612")
  if (!of) {
    console.log("PF 000001128612 introuvable sur L060POM")
    return
  }
  console.log("PF", of.of, ":", of.qteRempli, "/", of.quantite)
  console.log("SF", of.sf.of, ":")
  console.log("  quantite:", of.sf.quantite)
  console.log("  qteFabriquee:", of.sf.qteFabriquee)
  console.log("  pourcentage:", of.sf.pourcentage + "%")
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
