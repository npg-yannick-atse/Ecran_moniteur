import { prisma } from "../lib/prisma"

async function time(label: string, fn: () => Promise<any>) {
  const t0 = Date.now()
  const r = await fn()
  const ms = Date.now() - t0
  const count = Array.isArray(r) ? `${r.length} rows` : ""
  console.log(label.padEnd(50), `${ms}ms`, count)
}

async function main() {
  // warmup connection
  await prisma.$queryRaw`SELECT 1`

  await time("vue PF only L019SHP", () => prisma.$queryRaw`
    SELECT id_of, [of], qte_of, qte_remplir
    FROM v_statistique_production_of
    WHERE process_code='L019SHP' AND type_article='ZFER'
      AND (id_status_production=11 OR id_statusUtilisateur_FK=2)
  `)

  await time("vue self-join PF+SF L019SHP", () => prisma.$queryRaw`
    SELECT pf.id_of, pf.[of], sf.[of] AS sf_of
    FROM v_statistique_production_of pf
    LEFT JOIN v_statistique_production_of sf
      ON sf.[of] = pf.of_secondary AND sf.type_article='ZHAL'
    WHERE pf.process_code='L019SHP' AND pf.type_article='ZFER'
      AND (pf.id_status_production=11 OR pf.id_statusUtilisateur_FK=2)
  `)

  await time("v_historique_status_of (5 OFs)", () => prisma.$queryRaw`
    SELECT id_of, date_changement, id_status_FK
    FROM v_historique_status_of
    WHERE id_of IN (1, 2, 3, 4, 5)
  `)

  await time("listLignes count query", () => prisma.$queryRaw`
    SELECT process, COUNT(*) AS nb
    FROM [Of]
    WHERE type_article='ZFER'
      AND (id_status_production=11 OR id_statusUtilisateur_FK=2)
    GROUP BY process
  `)

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
