/**
 * READ-ONLY DB inspection script.
 * Used to understand the WMS_MP schema for the new dashboard app.
 *
 * Usage:
 *   npx tsx scripts/inspect-db.ts <section>
 *
 * Sections (run individually to keep output small):
 *   ping        - simple connectivity test
 *   status      - status table contents (id -> designation mapping)
 *   statusUtil  - statusUtilisateur table contents
 *   types       - distinct type_article values in Of
 *   processes   - distinct process codes + designations + types
 *   sample-of   - 1 sample OF with all related rows (the heavy join)
 *   columns     - list columns of a given table (pass table name as 2nd arg)
 *   tables      - list all tables in WMS_MP
 */

// Prisma loads .env automatically when the client is constructed.
import { prisma } from "../lib/prisma"

const section = process.argv[2] || "ping"
const arg = process.argv[3]

async function ping() {
  const r = await prisma.$queryRaw`SELECT 1 AS ok, DB_NAME() AS db, @@VERSION AS version`
  console.log(JSON.stringify(r, null, 2))
}

async function tables() {
  const r = await prisma.$queryRaw`
    SELECT TABLE_SCHEMA, TABLE_NAME
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_TYPE = 'BASE TABLE'
    ORDER BY TABLE_NAME
  `
  console.log(JSON.stringify(r, null, 2))
}

async function columns(table: string) {
  if (!table) {
    console.error("Usage: npx tsx scripts/inspect-db.ts columns <tableName>")
    return
  }
  const r = await prisma.$queryRaw`
    SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = ${table}
    ORDER BY ORDINAL_POSITION
  `
  console.log(JSON.stringify(r, null, 2))
}

async function status() {
  const r = await prisma.status.findMany({ orderBy: { id_status: "asc" } })
  console.log(JSON.stringify(r, null, 2))
}

async function statusUtil() {
  const r = await prisma.statusUtilisateur.findMany({
    orderBy: { id_statusUtilisateur: "asc" },
  })
  console.log(JSON.stringify(r, null, 2))
}

async function types() {
  const r = await prisma.$queryRaw`
    SELECT TOP 50 type_article, COUNT(*) AS n
    FROM [Of]
    GROUP BY type_article
    ORDER BY n DESC
  `
  console.log(JSON.stringify(r, null, 2))
}

async function processes() {
  // Distinct types
  const byType = await prisma.$queryRaw`
    SELECT type, COUNT(*) AS n FROM process GROUP BY type ORDER BY n DESC
  `
  console.log("=== process types ===")
  console.log(JSON.stringify(byType, null, 2))

  // PF processes only (the ones the dashboard cares about)
  const r = await prisma.process.findMany({
    select: {
      id_process: true,
      code: true,
      designation: true,
      ligne: true,
      type: true,
      poste_technique: true,
    },
    where: { type: "PF" },
    orderBy: { code: "asc" },
  })
  console.log(`\n=== PF processes (${r.length}) ===`)
  console.log(JSON.stringify(r, null, 2))
}

async function validate() {
  // 1. Confirm SF link: of_secondary should match a ZHAL OF
  console.log("=== validate of_secondary -> ZHAL OF ===")
  const pf = await prisma.of.findFirst({
    where: { type_article: "ZFER", of_secondary: { not: null } },
    select: { of: true, of_secondary: true, code_article: true },
  })
  console.log("PF:", pf)
  if (pf?.of_secondary) {
    const sf = await prisma.of.findFirst({
      where: { of: pf.of_secondary },
      select: { of: true, type_article: true, code_article: true, quantite: true, qte_remplir: true, qte_livrer: true },
    })
    console.log("SF (via of_secondary):", sf)
  }

  // 2. Check id_status_production distinct values
  console.log("\n=== id_status_production distinct values ===")
  const stProd = await prisma.$queryRaw`
    SELECT id_status_production, COUNT(*) AS n
    FROM [Of]
    WHERE type_article = 'ZFER'
    GROUP BY id_status_production
    ORDER BY n DESC
  `
  console.log(stProd)

  // 3. Count active OFs per line (extended filter)
  console.log("\n=== active OFs per line (top 10) ===")
  const perLine = await prisma.$queryRaw`
    SELECT TOP 10 process, COUNT(*) AS n
    FROM [Of]
    WHERE type_article = 'ZFER'
      AND id_statusUtilisateur_FK IN (1, 2, 7, 8, 9, 10, 11, 13, 14, 15)
    GROUP BY process
    ORDER BY n DESC
  `
  console.log(perLine)

  // 4. Pick one line with multiple OFs and list them
  console.log("\n=== sample line with multiple OFs ===")
  const sampleLine = await prisma.$queryRaw<{ process: string }[]>`
    SELECT TOP 1 process FROM [Of]
    WHERE type_article = 'ZFER'
      AND id_statusUtilisateur_FK IN (1, 2, 7, 8, 9, 10, 11, 13, 14, 15)
    GROUP BY process
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
  `
  if (sampleLine.length > 0) {
    const lineCode = sampleLine[0].process
    console.log(`line=${lineCode}`)
    const ofs = await prisma.of.findMany({
      where: {
        process: lineCode,
        type_article: "ZFER",
        id_statusUtilisateur_FK: { in: [1, 2, 7, 8, 9, 10, 11, 13, 14, 15] },
      },
      select: {
        of: true,
        of_secondary: true,
        designation_article: true,
        quantite: true,
        qte_remplir: true,
        id_status_FK: true,
        id_statusUtilisateur_FK: true,
        id_status_production: true,
        section_nom: true,
      },
      orderBy: { updatedAt: "desc" },
    })
    console.log(JSON.stringify(ofs, null, 2))
  }
}

async function sampleOf() {
  // Get 1 active OF with type ZFER
  const of = await prisma.of.findFirst({
    where: { type_article: "ZFER" },
    orderBy: { updatedAt: "desc" },
  })
  if (!of) {
    console.log("no ZFER OF found")
    return
  }
  console.log("=== OF ===")
  console.log(JSON.stringify(of, null, 2))

  console.log("\n=== of_has_status (chronological) ===")
  const ohs = await prisma.of_has_status.findMany({
    where: { id_of_FK: of.id_of },
    orderBy: { createdAt: "asc" },
  })
  console.log(JSON.stringify(ohs, null, 2))

  console.log("\n=== of_has_statusUtilisateur (chronological) ===")
  const ohsu = await prisma.of_has_statusUtilisateurs.findMany({
    where: { id_of_FK: of.id_of },
    orderBy: { createdAt: "asc" },
  })
  console.log(JSON.stringify(ohsu, null, 2))

  console.log("\n=== fiche_cheminement ===")
  const fc = await prisma.fiche_cheminement.findMany({
    where: { id_of_FK: of.id_of },
    orderBy: { createdAt: "asc" },
  })
  console.log(JSON.stringify(fc, null, 2))

  console.log("\n=== warehouse_preparation ===")
  const wp = await prisma.warehouse_preparation.findMany({
    where: { of: of.of },
  })
  console.log(JSON.stringify(wp, null, 2))
}

async function main() {
  try {
    switch (section) {
      case "ping": await ping(); break
      case "tables": await tables(); break
      case "columns": await columns(arg!); break
      case "status": await status(); break
      case "statusUtil": await statusUtil(); break
      case "types": await types(); break
      case "processes": await processes(); break
      case "sample-of": await sampleOf(); break
      case "validate": await validate(); break
      default:
        console.error(`Unknown section: ${section}`)
        process.exit(1)
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
