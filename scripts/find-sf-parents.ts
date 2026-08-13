import { prisma } from "../lib/prisma"

async function main() {
  // OF 1128613 est ZHAL (semi-fini). On cherche les PF ZFER
  // qui pointent vers lui (of_secondary = '000001128613')
  const parents: any[] = await prisma.$queryRaw`
    SELECT [of], code_article, designation_article, process,
           quantite, qte_remplir, type_article,
           id_status_production, id_statusUtilisateur_FK
    FROM [Of]
    WHERE of_secondary = '000001128613'
  `
  console.log("=== PF parents (of_secondary = 000001128613) ===")
  console.log(parents)

  // Et les infos du SF lui-même
  const sf: any[] = await prisma.$queryRaw`
    SELECT [of], code_article, designation_article, type_article,
           quantite, qte_remplir, process
    FROM [Of]
    WHERE [of] = '000001128613'
  `
  console.log("\n=== SF 1128613 lui-même ===")
  console.log(sf[0])

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
