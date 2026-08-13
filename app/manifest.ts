import type { MetadataRoute } from "next"

/**
 * Manifeste PWA — permet d'installer le dashboard comme une application.
 *
 * `display: "fullscreen"` est la SEULE façon d'obtenir un plein écran sans
 * geste utilisateur : une fois installée, l'app s'ouvre dans sa propre fenêtre
 * sans barre d'adresse ni onglets. Le navigateur l'autorise parce que c'est
 * l'utilisateur qui a installé l'app, pas la page qui s'impose.
 *
 * Chrome retombe sur "standalone" puis "minimal-ui" si "fullscreen" n'est pas
 * disponible sur la plateforme — d'où la liste `display_override`.
 *
 * Installation : Chrome/Edge → menu ⋮ → "Installer Ecran de Suivi Production".
 * À faire une fois par poste ; l'icône reste ensuite dans le menu Démarrer et
 * peut être placée au démarrage de Windows (shell:startup).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ecran de Suivi Production",
    short_name: "Suivi Production",
    description: "Suivi temps réel des OF de production",
    start_url: "/",
    display: "fullscreen",
    display_override: ["fullscreen", "standalone", "minimal-ui"],
    orientation: "landscape",
    background_color: "#ffffff",
    theme_color: "#008ea9",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  }
}
