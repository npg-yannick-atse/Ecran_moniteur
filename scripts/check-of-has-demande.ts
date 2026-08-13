import { prisma } from "../lib/prisma"

async function main() {
  const cols: any[] = await prisma.$queryRaw`
    SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'of_has_demande'
    ORDER BY ORDINAL_POSITION
  `
  console.log("=== Colonnes of_has_demande ===")
  for (const c of cols) console.log(" ", c.COLUMN_NAME, c.DATA_TYPE)

  const sample: any[] = await prisma.$queryRaw`
    SELECT TOP 3 * FROM of_has_demande
    WHERE last_demand_livraison IS NOT NULL
    ORDER BY createdAt DESC
  `
  console.log("\n=== Échantillons ===")
  console.log(sample)

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
