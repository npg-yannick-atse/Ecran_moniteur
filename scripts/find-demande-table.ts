import { prisma } from "../lib/prisma"

async function main() {
  const r: any[] = await prisma.$queryRaw`
    SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_NAME LIKE '%demand%'
    ORDER BY TABLE_NAME
  `
  console.log("Tables avec 'demand' :", r)

  const c: any[] = await prisma.$queryRaw`
    SELECT DISTINCT TABLE_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE COLUMN_NAME LIKE 'last_demand%'
       OR COLUMN_NAME LIKE 'last_date_system%'
       OR COLUMN_NAME LIKE '%livraison%'
  `
  console.log("\nTables avec colonnes matching :", c)

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
