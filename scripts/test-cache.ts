/**
 * Test de comportement du cache + single-flight.
 * Usage : npx tsx scripts/test-cache.ts
 */
import { listLignes } from "../lib/dashboard-service"
import { prisma } from "../lib/prisma"

let dbHits = 0
const origRaw = (prisma as any).$queryRaw.bind(prisma)
;(prisma as any).$queryRaw = (...args: any[]) => {
  dbHits++
  return origRaw(...args)
}
const origFindMany = prisma.process.findMany.bind(prisma.process)
prisma.process.findMany = ((...args: any[]) => {
  dbHits++
  return origFindMany(...(args as [any]))
}) as any

async function main() {
  console.log("=== Test 1: 50 appels concurrents (attendu: ~2 hits DB = single-flight) ===")
  dbHits = 0
  const t0 = Date.now()
  const results = await Promise.all(
    Array.from({ length: 50 }, () => listLignes())
  )
  console.log(
    `50 appels en ${Date.now() - t0}ms, ${dbHits} requêtes DB, ` +
      `toutes identiques: ${results.every((r) => r === results[0])}`
  )

  console.log("\n=== Test 2: 5 appels 500ms plus tard (attendu: 0 hit, cache chaud) ===")
  await new Promise((r) => setTimeout(r, 500))
  dbHits = 0
  await Promise.all(Array.from({ length: 5 }, () => listLignes()))
  console.log(`5 appels, ${dbHits} requêtes DB`)

  console.log("\n=== Test 3: attendre 3.5s (> TTL 3s) + 1 appel (attendu: ~2 hits) ===")
  await new Promise((r) => setTimeout(r, 3500))
  dbHits = 0
  await listLignes()
  console.log(`1 appel après TTL, ${dbHits} requêtes DB`)

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
