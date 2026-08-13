import { prisma } from "../lib/prisma"

async function main() {
  const cols: any[] = await prisma.$queryRaw`
    SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'of_has_demand'
    ORDER BY ORDINAL_POSITION
  `
  console.log("=== Colonnes of_has_demand ===")
  for (const c of cols) console.log(" ", c.COLUMN_NAME, c.DATA_TYPE)

  const sample: any[] = await prisma.$queryRaw`
    SELECT TOP 3 * FROM of_has_demand ORDER BY createdAt DESC
  `
  console.log("\n=== Échantillons (top 3 recent) ===")
  console.log(sample)

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
