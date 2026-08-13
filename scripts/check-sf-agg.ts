import { prisma } from "../lib/prisma"

async function main() {
  const r: any[] = await prisma.$queryRaw`
    SELECT [of], type_article, qte_of, qte_remplir,
           total_qte_remplissage, total_qte_polypackage, total_qte_livraison,
           pct_remplissage, pct_polypackage, pct_livraison,
           nb_fiches_cheminement,
           status_designation, statusUtilisateur_designation
    FROM v_statistique_production_of
    WHERE [of] = '000001128613'
  `
  console.log("Agrégats vue pour SF 1128613 :")
  console.log(r[0])
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
