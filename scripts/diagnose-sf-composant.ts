import { prisma } from "../lib/prisma"

async function main() {
  const r: any[] = await prisma.$queryRaw`
    SELECT TOP 10
      pf.[of]             AS pf_of,
      pf.qte_remplir      AS pf_rempli,
      pf.quantite         AS pf_qte,
      sf.[of]             AS sf_of,
      sf.qte_remplir      AS sf_rempli,
      sf.quantite         AS sf_qte,
      oi.id_status_FK     AS oi_status_sf,
      s_oi.designation    AS oi_status_label,
      sf.id_status_FK     AS sf_self_status,
      s_sf.designation    AS sf_self_label
    FROM [Of] pf
    LEFT JOIN [Of] sf
      ON sf.[of] = pf.of_secondary AND sf.type_article='ZHAL'
    LEFT JOIN [of_item] oi
      ON oi.id_of_FK = pf.id_of AND oi.type_article='ZHAL'
    LEFT JOIN [status] s_oi ON s_oi.id_status = oi.id_status_FK
    LEFT JOIN [status] s_sf ON s_sf.id_status = sf.id_status_FK
    WHERE pf.type_article='ZFER'
      AND sf.qte_remplir > 0
      AND pf.id_statusUtilisateur_FK = 2
    ORDER BY pf.updatedAt DESC
  `
  console.log("PF avec SF fabriqué (qte_remplir > 0) :")
  for (const x of r) {
    console.log(
      ` PF ${x.pf_of} (rempli ${x.pf_rempli}/${x.pf_qte}) — SF ${x.sf_of} fab ${x.sf_rempli}/${x.sf_qte}`
    )
    console.log(
      `   of_item.id_status_FK du SF côté PF = ${x.oi_status_sf} → "${x.oi_status_label}"`
    )
    console.log(
      `   Of(SF).id_status_FK (statut propre au SF) = ${x.sf_self_status} → "${x.sf_self_label}"`
    )
    console.log("")
  }
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
