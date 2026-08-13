"use client"

/**
 * Bouton plein écran, actif par défaut.
 *
 * Les navigateurs REFUSENT `requestFullscreen()` hors d'un geste utilisateur :
 * impossible de passer en plein écran au chargement, contrairement au bouton
 * Shift du timeline qui n'était qu'un état React. Le compromis retenu :
 *
 *   - la préférence est ON par défaut (persistée dans localStorage) ;
 *   - tant qu'elle est ON et qu'on n'est pas en plein écran, le PREMIER clic
 *     ou appui touche n'importe où sur la page y bascule — le geste existe,
 *     le navigateur accepte ;
 *   - sortir du plein écran (bouton ou Échap) éteint la préférence, sinon on
 *     y serait ramené au clic suivant, ce qui serait insupportable.
 *
 * Pour un écran d'atelier qui doit démarrer seul sans personne devant, la
 * seule solution sans geste reste le mode kiosque — celui du navigateur
 * (chrome.exe --kiosk <url>) ou celui poussé par le MDM (Hexnode…).
 * Dans ce cas le bouton ne sert plus à rien : il se masque tout seul, détecté
 * via la media query `display-mode`.
 */

import { useCallback, useEffect, useState } from "react"
import { Maximize, Minimize } from "lucide-react"
import { cn } from "@/lib/utils"

const PREF_KEY = "ecran-moniteur:fullscreen"

export function FullscreenButton() {
  const [isFullscreen, setIsFullscreen] = useState(false)
  // null = préférence pas encore lue (évite un flash au montage côté client)
  const [wantFullscreen, setWantFullscreen] = useState<boolean | null>(null)
  // Kiosque MDM (Hexnode…) ou PWA installée : la fenêtre n'a déjà plus de
  // chrome navigateur, le bouton n'a plus d'objet → on ne le rend pas du tout.
  const [enModeKiosque, setEnModeKiosque] = useState(false)

  useEffect(() => {
    setWantFullscreen(window.localStorage.getItem(PREF_KEY) !== "off")
    const mq = window.matchMedia(
      "(display-mode: fullscreen), (display-mode: standalone)"
    )
    const sync = () => setEnModeKiosque(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [])

  // Suit l'état réel : Échap et F11 changent le plein écran sans passer par nous.
  useEffect(() => {
    const sync = () => {
      const on = document.fullscreenElement != null
      setIsFullscreen(on)
      if (!on) {
        // Sortie manuelle → on cesse de vouloir y retourner.
        setWantFullscreen(false)
        window.localStorage.setItem(PREF_KEY, "off")
      }
    }
    document.addEventListener("fullscreenchange", sync)
    return () => document.removeEventListener("fullscreenchange", sync)
  }, [])

  const enter = useCallback(() => {
    document.documentElement.requestFullscreen?.().catch(() => {
      // Refus du navigateur (geste non reconnu, iframe sans allowfullscreen…) :
      // on n'insiste pas, le bouton reste disponible.
    })
  }, [])

  // Bascule au premier geste, tant que la préférence est active.
  useEffect(() => {
    if (wantFullscreen !== true || isFullscreen) return
    const onGesture = () => enter()
    // `once` : un seul déclenchement, pas de listener qui traîne.
    document.addEventListener("pointerdown", onGesture, { once: true })
    document.addEventListener("keydown", onGesture, { once: true })
    return () => {
      document.removeEventListener("pointerdown", onGesture)
      document.removeEventListener("keydown", onGesture)
    }
  }, [wantFullscreen, isFullscreen, enter])

  const toggle = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.()
      return
    }
    window.localStorage.setItem(PREF_KEY, "on")
    setWantFullscreen(true)
    enter()
  }

  if (enModeKiosque) return null

  return (
    <button
      type="button"
      onClick={toggle}
      title={
        isFullscreen
          ? "Quitter le plein écran (Échap)"
          : "Passer en plein écran — s'active aussi au premier clic sur la page"
      }
      aria-label={isFullscreen ? "Quitter le plein écran" : "Plein écran"}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-lg border transition-colors",
        isFullscreen
          ? "border-white/25 bg-white/10 text-white hover:bg-white/20"
          : "border-emerald-300/60 bg-emerald-400/20 text-white hover:bg-emerald-400/30"
      )}
    >
      {isFullscreen ? (
        <Minimize className="h-4 w-4" />
      ) : (
        <Maximize className="h-4 w-4" />
      )}
    </button>
  )
}
