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

// Ligne affichée par le kiosque local (voir l'app "ecran-kiosque" plus bas).
// Vide → page d'accueil (choix de la section).
const KIOSK_LIGNE = process.env.KIOSK_LIGNE || ""

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
      },
      time: true,
      out_file: "logs/out.log",
      error_file: "logs/error.log",
      merge_logs: true,
    },

    /**
     * Affichage plein écran sur CETTE machine.
     *
     * Une page web ne peut pas se mettre en plein écran seule (geste utilisateur
     * obligatoire côté navigateur). On passe donc par la ligne de commande du
     * navigateur, pilotée par PM2 : `pm2 start ecosystem.config.js` démarre le
     * serveur ET l'écran.
     *
     * Prérequis :
     *   - l'écran est branché sur cette machine (sinon, inutile : ce process ne
     *     peut pas ouvrir de fenêtre à distance) ;
     *   - PM2 tourne dans une session Windows OUVERTE. En service Windows
     *     (session 0), aucune fenêtre ne s'affiche.
     *
     * Démarrer le serveur seul (salle technique, pas d'écran) :
     *   pm2 start ecosystem.config.js --only ecran-moniteur
     *
     * Choisir la ligne affichée :
     *   KIOSK_LIGNE=L019SHP pm2 start ecosystem.config.js
     */
    {
      name: "ecran-kiosque",
      cwd: __dirname,
      script: "scripts/launch-kiosk.js",
      interpreter: "node",
      exec_mode: "fork",
      instances: 1,
      // Relance si quelqu'un ferme la fenêtre par erreur, avec un délai pour
      // éviter la boucle rapide quand aucun navigateur n'est installé.
      autorestart: true,
      restart_delay: 5000,
      watch: false,
      env: {
        // Le kiosque attaque le serveur en HTTPS : sur une URL en https, un
        // certificat wildcard exige un NOM D'HÔTE, pas localhost ni une IP.
        KIOSK_URL: process.env.KIOSK_URL || "",
        PORT: HTTPS_PORT,
        // Nom d'hôte, pas localhost ni une IP : le certificat wildcard
        // *.npgandour.com n'est valable que pour un nom de ce domaine.
        KIOSK_HOST: process.env.KIOSK_HOST || "gmon.npgandour.com",
        KIOSK_LIGNE,
        // "kiosk" = verrouillé · "fullscreen" = Échap et F11 fonctionnent
        KIOSK_MODE: process.env.KIOSK_MODE || "kiosk",
      },
      time: true,
      out_file: "logs/kiosque-out.log",
      error_file: "logs/kiosque-error.log",
      merge_logs: true,
    },
  ],
}
