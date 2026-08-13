import { prisma } from "../lib/prisma"

async function main() {
  const sfNum = "000001123717"

  // 1. Le SF lui-même (depuis [Of])
  const sf: any[] = await prisma.$queryRaw`
    SELECT [of], type_article, code_article, designation_article,
           process, quantite, qte_remplir, qte_polypacker, qte_livrer,
           id_status_FK, id_status_production, id_statusUtilisateur_FK,
           updatedAt
    FROM [Of] WHERE [of] = ${sfNum}
  `
  console.log(`=== SF ${sfNum} (table [Of]) ===`)
  console.log(sf[0])

  // 2. Agrégats fiche_cheminement (depuis la vue)
  const agg: any[] = await prisma.$queryRaw`
    SELECT [of], type_article, qte_of, qte_remplir,
           total_qte_remplissage, total_qte_polypackage, total_qte_livraison,
           pct_remplissage, pct_polypackage, pct_livraison,
           nb_fiches_cheminement, total_qte_receptionne,
           status_designation, statusUtilisateur_designation
    FROM v_statistique_production_of
    WHERE [of] = ${sfNum}
  `
  console.log(`\n=== Agrégats vue v_statistique_production_of ===`)
  console.log(agg[0])

  // 3. PF parents qui pointent vers ce SF
  const parents: any[] = await prisma.$queryRaw`
    SELECT [of], code_article, designation_article, process,
           type_article, quantite, qte_remplir,
           id_status_production, id_statusUtilisateur_FK
    FROM [Of]
    WHERE of_secondary = ${sfNum}
  `
  console.log(`\n=== PF parent(s) qui pointent vers ce SF ===`)
  console.log(parents.length === 0 ? "(aucun)" : parents)

  // 4. Lignes fiche_cheminement individuelles pour ce SF
  if (sf[0]) {
    const fc: any[] = await prisma.$queryRaw`
      SELECT TOP 5 id_fiche, qte_remplissage, remplissage_date,
             qte_polypackage, polypackage_date,
             qte_livraison, livraison_date, qte_receptionne
      FROM [fiche_cheminement]
      WHERE id_of_FK = ${sf[0].of ? null : null}
    `
    // Use id_of from sf result
    const idOf: any[] = await prisma.$queryRaw`
      SELECT id_of FROM [Of] WHERE [of] = ${sfNum}
    `
    if (idOf[0]) {
      const fcReal: any[] = await prisma.$queryRaw`
        SELECT TOP 10 id_fiche, qte_remplissage, remplissage_date,
               qte_polypackage, polypackage_date,
               qte_livraison, livraison_date
        FROM [fiche_cheminement]
        WHERE id_of_FK = ${idOf[0].id_of}
        ORDER BY id_fiche
      `
      console.log(`\n=== fiche_cheminement (10 premières) ===`)
      console.log(`Total fiches: ${fcReal.length}`)
      for (const f of fcReal) console.log("  ", f)
    }
  }

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
