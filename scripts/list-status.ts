import { prisma } from "../lib/prisma"

async function main() {
  const r: any[] = await prisma.$queryRaw`
    SELECT id_status, designation, color FROM [status] ORDER BY id_status
  `
  console.log("=== Statuts logistiques (table status) ===")
  for (const s of r)
    console.log(`  ${s.id_status} → ${s.designation} | ${s.color ?? "(null)"}`)

  const u: any[] = await prisma.$queryRaw`
    SELECT id_statusUtilisateur, designation, color FROM [statusUtilisateur] ORDER BY id_statusUtilisateur
  `
  console.log("\n=== Statuts utilisateurs (table statusUtilisateur) ===")
  for (const s of u)
    console.log(
      `  ${s.id_statusUtilisateur} → ${s.designation} | ${s.color ?? "(null)"}`
    )

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
