/**
 * Configuration PM2 — affichage plein écran SUR LA MACHINE QUI PORTE L'ÉCRAN.
 *
 * Fichier séparé volontairement : dans le déploiement courant, le serveur est
 * central et les écrans sont des postes distincts qui ouvrent simplement une
 * URL. Ce process n'a donc rien à faire sur le serveur — il y lancerait un
 * Chrome invisible que PM2 relancerait en boucle. `pm2 start
 * ecosystem.config.js` ne démarre que le serveur ; ce fichier ne sert que si
 * l'écran est branché sur la machine où tourne PM2.
 *
 * Utilisation, sur le poste d'affichage :
 *   set KIOSK_LIGNE=L019SHP
 *   pm2 start ecosystem.kiosk.config.js
 *
 * Prérequis : PM2 doit tourner dans une session Windows OUVERTE. En service
 * Windows (session 0), aucune fenêtre ne s'affiche sur le bureau.
 *
 * Alternative sans PM2 sur le poste : un raccourci Chrome --kiosk dans
 * shell:startup, ou une politique kiosque poussée par le MDM.
 */

// Serveur visé. Nom d'hôte obligatoire, pas une IP : le certificat wildcard
// *.npgandour.com ne couvre pas les adresses IP.
const KIOSK_HOST = process.env.KIOSK_HOST || "gmon.npgandour.com"
const KIOSK_PORT = process.env.KIOSK_PORT || 8082
// Ligne affichée. Vide → page d'accueil (choix de la section).
const KIOSK_LIGNE = process.env.KIOSK_LIGNE || ""

module.exports = {
  apps: [
    {
      name: "ecran-kiosque",
      cwd: __dirname,
      script: "scripts/launch-kiosk.js",
      interpreter: "node",
      exec_mode: "fork",
      instances: 1,
      // Relance si quelqu'un ferme la fenêtre par erreur. Le délai évite la
      // boucle rapide quand aucun navigateur n'est installé sur le poste.
      autorestart: true,
      restart_delay: 5000,
      watch: false,
      env: {
        KIOSK_URL: process.env.KIOSK_URL || "",
        KIOSK_HOST,
        PORT: KIOSK_PORT,
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
