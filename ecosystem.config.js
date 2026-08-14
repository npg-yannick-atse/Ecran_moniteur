/**
 * Configuration PM2 — Ecran de Suivi Production
 *
 * Démarrage :
 *   npm run build
 *   pm2 start ecosystem.config.js
 *
 * L'app écoute sur 0.0.0.0:8082 → accessible depuis n'importe quelle IP de la
 * machine (ex: http://10.10.2.xx:8082), pas seulement localhost.
 *
 * exec_mode = fork (1 seule instance) et NON cluster : le cache in-memory de
 * `lib/dashboard-service.ts` (TTL 3s + single-flight) est par process. En mode
 * cluster, chaque worker aurait son propre cache → N fois plus de requêtes SQL.
 */

const HOST = process.env.HOST || "0.0.0.0"
const PORT = process.env.PORT || 8082
// Port TLS. Égal à PORT par défaut : le serveur sert HTTPS et redirige le HTTP
// en clair sur ce même port. Mettre 443 pour des URLs sans numéro de port.
const HTTPS_PORT = process.env.HTTPS_PORT || PORT
// Nom d'hôte couvert par le certificat. Sert de cible aux redirections quand
// un écran arrive encore par l'IP du serveur (voir server.js).
const PUBLIC_HOST = process.env.PUBLIC_HOST || "gmon.npgandour.com"

module.exports = {
  apps: [
    {
      name: "ecran-moniteur",
      cwd: __dirname,
      // server.js (et non `next start`) : Next ne sait pas faire de TLS.
      // Il sert en HTTPS si les certificats sont présents, en HTTP sinon.
      script: "server.js",
      interpreter: "node",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        HOST,
        PORT, // HTTP : redirige vers HTTPS quand TLS est actif
        HTTPS_PORT,
        SSL_DIR: "npgandour.com",
        PUBLIC_HOST,
        // Derrière l'openresty de prod, c'est le proxy qui termine le TLS :
        // l'app doit rester en HTTP simple, sinon le proxy reçoit une
        // redirection 301 au lieu de la page. Mettre TLS=on (ou supprimer
        // cette ligne) uniquement si l'app est exposée en direct.
        TLS: process.env.TLS || "off",
      },
      time: true,
      out_file: "logs/out.log",
      error_file: "logs/error.log",
      merge_logs: true,
    },

  ],
}
