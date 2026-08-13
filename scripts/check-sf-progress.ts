import { prisma } from "../lib/prisma"

async function main() {
  const pfOf = "000001128613"

  const pf: any[] = await prisma.$queryRaw`
    SELECT [of], of_secondary, process, code_article,
           quantite, qte_remplir, type_article
    FROM [Of] WHERE [of] = ${pfOf}
  `
  console.log("=== PF ===")
  console.log(pf[0])

  const sfRef = pf[0]?.of_secondary
  if (!sfRef) {
    console.log("Pas de SF (of_secondary vide)")
    return
  }

  const sf: any[] = await prisma.$queryRaw`
    SELECT [of], type_article, quantite, qte_remplir,
           qte_polypacker, qte_livrer, qte_livrer_semi
    FROM [Of] WHERE [of] = ${sfRef}
  `
  console.log(`\n=== SF (${sfRef}) ===`)
  console.log(sf[0])

  const q = sf[0]?.quantite ?? 0
  const r = sf[0]?.qte_remplir ?? 0
  const pct = q > 0 ? Math.round((r / q) * 100) : 0
  console.log(
    `\nCalcul barre SF : qte_remplir (${r}) / quantite (${q}) = ${pct}%`
  )

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
