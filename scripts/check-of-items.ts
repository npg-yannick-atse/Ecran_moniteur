import { prisma } from "../lib/prisma"

async function main() {
  const ofNum = "000001127547"

  const idOf: any[] = await prisma.$queryRaw`
    SELECT id_of FROM [Of] WHERE [of] = ${ofNum}
  `
  if (!idOf[0]) {
    console.log("OF introuvable")
    return
  }

  // Toutes les colonnes de of_item pour voir ce qui indique "réceptionné"
  const cols: any[] = await prisma.$queryRaw`
    SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'of_item' ORDER BY ORDINAL_POSITION
  `
  console.log("=== Colonnes of_item ===")
  for (const c of cols) console.log(" ", c.COLUMN_NAME, c.DATA_TYPE)

  // Les items de l'OF
  const items: any[] = await prisma.$queryRaw`
    SELECT * FROM [of_item] WHERE id_of_FK = ${idOf[0].id_of}
  `
  console.log(`\n=== ${items.length} items de l'OF ${ofNum} ===`)
  for (const it of items) console.log(it)

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
