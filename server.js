/**
 * Serveur HTTPS — remplace `next start`.
 *
 * Next.js ne sait pas servir en TLS lui-même (`next start` n'a pas d'option
 * --cert/--key) : on enveloppe donc son gestionnaire de requêtes dans un
 * serveur Node https. Le rendu, le routage et les API restent gérés par Next,
 * ce fichier ne fait que la terminaison TLS.
 *
 * Certificats attendus dans `SSL_DIR` (défaut : ./npgandour.com) :
 *   private.key      clé privée
 *   certificate.crt  certificat du domaine
 *   ca_bundle.crt    chaîne intermédiaire (sinon "certificat non fiable" sur
 *                    certains clients, notamment Android et les vieux Windows)
 *
 * Si les fichiers sont absents, on démarre en HTTP simple plutôt que d'échouer :
 * un poste de dev ou un déploiement sans TLS reste fonctionnel.
 *
 * Par défaut HTTPS et HTTP partagent le MÊME port (8082) : le serveur renifle
 * le premier octet et aiguille vers TLS ou vers une redirection 301. Une seule
 * URL, une seule règle de pare-feu, et les écrans configurés en http://
 * continuent de fonctionner.
 *
 * Variables d'environnement :
 *   HOST         interface d'écoute (défaut 0.0.0.0)
 *   PORT         port d'écoute (défaut 8082)
 *   HTTPS_PORT   port TLS — défaut = PORT. Le fixer (443 p. ex.) sépare les deux
 *   SSL_DIR      dossier des certificats
 *   PUBLIC_HOST  nom d'hôte couvert par le certificat (ex. gmon.npgandour.com).
 *                Cible des redirections quand le client arrive par l'IP.
 *   HTTP_REDIRECT=off   supprime la redirection quand les ports sont distincts
 */

const fs = require("fs")
const net = require("net")
const path = require("path")
const http = require("http")
const https = require("https")
const { parse } = require("url")
const next = require("next")

const HOST = process.env.HOST || "0.0.0.0"
const HTTP_PORT = Number(process.env.PORT || 8082)
// Par défaut TLS sur le MÊME port : une seule URL, un seul pare-feu, et les
// adresses déjà configurées sur les écrans restent valables (cf. multiplexage
// plus bas). Mettre HTTPS_PORT=443 pour séparer les deux si besoin.
const HTTPS_PORT = Number(process.env.HTTPS_PORT || HTTP_PORT)
const SSL_DIR = path.resolve(__dirname, process.env.SSL_DIR || "npgandour.com")
// Nom d'hôte public, celui couvert par le certificat. Sert de cible aux
// redirections quand le client est arrivé par l'IP (cf. plus bas).
const PUBLIC_HOST = process.env.PUBLIC_HOST || ""

function lireCertificats() {
  const key = path.join(SSL_DIR, "private.key")
  const cert = path.join(SSL_DIR, "certificate.crt")
  const ca = path.join(SSL_DIR, "ca_bundle.crt")
  if (!fs.existsSync(key) || !fs.existsSync(cert)) return null
  return {
    key: fs.readFileSync(key),
    cert: fs.readFileSync(cert),
    // `ca` = intermédiaires. Sans eux la chaîne est incomplète : les
    // navigateurs récents la reconstruisent souvent, les autres non.
    ...(fs.existsSync(ca) ? { ca: fs.readFileSync(ca) } : {}),
  }
}

async function main() {
  const tls = lireCertificats()
  const app = next({ dev: false, hostname: HOST, port: tls ? HTTPS_PORT : HTTP_PORT })
  const handle = app.getRequestHandler()
  await app.prepare()

  const servirNext = (req, res) => handle(req, res, parse(req.url, true))

  if (!tls) {
    console.warn(
      `[server] Aucun certificat dans ${SSL_DIR} → démarrage en HTTP simple.`
    )
    http.createServer(servirNext).listen(HTTP_PORT, HOST, () => {
      console.log(`[server] HTTP  http://${HOST}:${HTTP_PORT}`)
    })
    return
  }

  const serveurHttps = https.createServer(tls, servirNext)

  // Redirection HTTP → HTTPS.
  //
  // Piège : les écrans déjà déployés pointent souvent sur l'IP du serveur
  // (http://10.10.10.200:8082/...). Rediriger tel quel les enverrait sur
  // https://10.10.10.200:8082 — refusé, le certificat ne couvre que
  // *.npgandour.com. On réécrit donc vers PUBLIC_HOST quand l'hôte demandé
  // est une IP ou localhost, pour que ces écrans continuent de fonctionner
  // sans avoir à retoucher leur URL un par un.
  const estSansNom = (h) =>
    !h || h === "localhost" || /^\d{1,3}(\.\d{1,3}){3}$/.test(h)
  const serveurRedirection = http.createServer((req, res) => {
    const demande = (req.headers.host || "").split(":")[0]
    const hote =
      PUBLIC_HOST && estSansNom(demande) ? PUBLIC_HOST : demande || PUBLIC_HOST
    const port = HTTPS_PORT === 443 ? "" : `:${HTTPS_PORT}`
    res.writeHead(301, { Location: `https://${hote}${port}${req.url}` })
    res.end()
  })

  if (HTTP_PORT !== HTTPS_PORT) {
    // Ports distincts : chacun son écouteur, cas classique.
    serveurHttps.listen(HTTPS_PORT, HOST, () =>
      console.log(`[server] HTTPS https://${HOST}:${HTTPS_PORT}`)
    )
    if (process.env.HTTP_REDIRECT !== "off") {
      serveurRedirection.listen(HTTP_PORT, HOST, () =>
        console.log(`[server] HTTP  http://${HOST}:${HTTP_PORT} → redirige`)
      )
    }
    return
  }

  // MÊME PORT pour les deux : on écoute en TCP brut et on aiguille selon le
  // premier octet reçu. Une poignée de main TLS commence toujours par 0x16
  // (ContentType = handshake) ; une requête HTTP en clair commence par une
  // lettre ASCII ("GET", "POST"…). Un écran resté sur http:// reçoit donc une
  // redirection au lieu d'une erreur illisible, sans second port à ouvrir.
  net
    .createServer((socket) => {
      socket.once("data", (chunk) => {
        // Le `once("data")` a mis le socket en mode flowing : sans pause() les
        // octets suivants seraient consommés dans le vide avant que le serveur
        // cible ne s'y abonne. On remet donc l'octet lu, on gèle le flux, on
        // passe la main, puis on relance au tick suivant — une fois la cible
        // branchée sur ses propres écouteurs.
        socket.pause()
        socket.unshift(chunk)
        const cible = chunk[0] === 0x16 ? serveurHttps : serveurRedirection
        cible.emit("connection", socket)
        process.nextTick(() => socket.resume())
      })
      socket.on("error", () => socket.destroy())
    })
    .listen(HTTPS_PORT, HOST, () =>
      console.log(
        `[server] HTTPS https://${HOST}:${HTTPS_PORT} (http sur le même port → redirigé)`
      )
    )
}

main().catch((err) => {
  console.error("[server] Démarrage impossible :", err)
  process.exit(1)
})
