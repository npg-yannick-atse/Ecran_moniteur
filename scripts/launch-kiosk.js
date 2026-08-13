/**
 * Lance le navigateur en plein écran sur le dashboard — process PM2 dédié.
 *
 * Pourquoi ce script existe : une page web ne peut pas se mettre en plein écran
 * toute seule (les navigateurs exigent un geste utilisateur). Le seul levier est
 * la LIGNE DE COMMANDE du navigateur. Ce script l'exploite pour que
 * `pm2 start ecosystem.config.js` démarre à la fois le serveur et l'affichage.
 *
 * ⚠️ Ne fonctionne que si l'écran est branché sur CETTE machine, et si PM2
 * tourne dans une session Windows ouverte. En service Windows (session 0), les
 * processus graphiques ne s'affichent sur aucun bureau.
 *
 * Réglages par variables d'environnement (cf. ecosystem.config.js) :
 *   KIOSK_URL     URL complète — prioritaire sur tout le reste
 *   KIOSK_LIGNE   code ligne (ex. L019SHP) → http://HOST:PORT/lignes/<code>
 *   KIOSK_HOST    défaut localhost
 *   KIOSK_BROWSER chemin explicite vers chrome.exe / msedge.exe
 *   KIOSK_MODE    "kiosk" (défaut) ou "fullscreen" — fullscreen laisse Échap
 */

const { spawn } = require("child_process")
const fs = require("fs")

const PORT = process.env.PORT || 8082
const HOST = process.env.KIOSK_HOST || "localhost"

// Schéma : https dès qu'un port TLS est utilisé. Attention, avec le certificat
// wildcard *.npgandour.com il FAUT viser un nom d'hôte (ecran.npgandour.com) ;
// une IP ou "localhost" déclencherait une erreur de certificat.
const SCHEME = process.env.KIOSK_SCHEME || (PORT === "8082" ? "http" : "https")
const base = `${SCHEME}://${HOST}${PORT === "443" || PORT === "80" ? "" : `:${PORT}`}`

const url =
  process.env.KIOSK_URL ||
  (process.env.KIOSK_LIGNE ? `${base}/lignes/${process.env.KIOSK_LIGNE}` : `${base}/`)

// Chrome d'abord, Edge en repli — Edge est présent sur tout Windows 10/11.
const CANDIDATS = [
  process.env.KIOSK_BROWSER,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean)

const navigateur = CANDIDATS.find((p) => {
  try {
    return fs.existsSync(p)
  } catch {
    return false
  }
})

if (!navigateur) {
  console.error(
    "[kiosque] Aucun navigateur trouvé. Renseigner KIOSK_BROWSER avec le " +
      "chemin complet vers chrome.exe ou msedge.exe."
  )
  process.exit(1)
}

// --kiosk : plein écran verrouillé (Échap ne sort pas).
// --start-fullscreen : plein écran mais Échap/F11 fonctionnent.
const modeFlag =
  process.env.KIOSK_MODE === "fullscreen" ? "--start-fullscreen" : "--kiosk"

const args = [
  modeFlag,
  "--noerrdialogs",
  "--disable-infobars",
  "--disable-session-crashed-bubble", // pas de "Chrome s'est mal fermé" après coupure
  "--disable-features=TranslateUI",
  url,
]

console.log(`[kiosque] ${navigateur}`)
console.log(`[kiosque] ${modeFlag} → ${url}`)

const enfant = spawn(navigateur, args, { stdio: "inherit" })

// On garde le process Node vivant tant que le navigateur tourne : PM2 surveille
// CE process. Quand le navigateur est fermé, on sort avec son code et PM2
// (autorestart) le relance — un écran d'atelier fermé par erreur revient seul.
enfant.on("exit", (code) => {
  console.log(`[kiosque] navigateur fermé (code ${code}) — PM2 va relancer`)
  process.exit(code === null ? 1 : code)
})

// Arrêt propre sur `pm2 stop` / `pm2 restart` : on ferme aussi le navigateur.
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    enfant.kill()
    process.exit(0)
  })
}
