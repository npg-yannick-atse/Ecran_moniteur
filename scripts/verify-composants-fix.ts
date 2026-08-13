import { getDashboard } from "../lib/dashboard-service"
import { prisma } from "../lib/prisma"

async function main() {
  const r = await getDashboard("L060POM")
  const of = r?.ofs.find((o) => o.of === "000001127547")
  if (!of) {
    console.log("OF 1127547 introuvable sur L060POM")
    return
  }
  console.log(
    `OF ${of.of} : ${of.nbComposantsReceptionnes} / ${of.nbTotalComposants} composants réceptionnés`
  )
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
