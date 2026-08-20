"use client"

import { useEffect, useState } from "react"
import { Factory } from "lucide-react"
import Link from "next/link"
import { FullscreenButton } from "./fullscreen-button"
import { cn } from "@/lib/utils"

interface HeaderProps {
  title: string
  subtitle?: string
  backHref?: string
  rightSlot?: React.ReactNode
  /** Ligne en panne ou à l'arrêt : tout l'entête passe en rouge. */
  alerte?: boolean
}

export function Header({
  title,
  subtitle,
  backHref,
  rightSlot,
  alerte,
}: HeaderProps) {
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <header
      className={cn(
        "flex items-center justify-between border-b-[3px] px-6 py-3 text-white shadow-md",
        alerte ? "animate-blink border-rose-900" : "border-wms"
      )}
      style={{
        // Rouge sur toute la barre : un bandeau d'alerte séparé se perdait
        // dans la page, l'entête est ce que l'on voit de loin en atelier.
        background: alerte
          ? "linear-gradient(135deg, #7f1d1d, #b91c1c)"
          : "linear-gradient(135deg, #004f5e, #006d82)",
      }}
    >
      <div className="flex items-center gap-3">
        {backHref && (
          <Link
            href={backHref}
            className="rounded-lg border border-white/25 bg-white/10 px-4 py-2 text-xs font-semibold transition-colors hover:bg-white/20"
          >
            ← Retour
          </Link>
        )}
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-wms text-sm font-bold">
          <Factory className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold uppercase leading-tight">{title}</h1>
          {subtitle && (
            <p className="font-mono text-sm text-wms-lighter">{subtitle}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-5">
        {rightSlot}
        <FullscreenButton />
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 animate-live-pulse rounded-full bg-emerald-400" />
        </div>
        <div className="text-right">
          <div className="text-[10px] text-wms-lighter">
            {now?.toLocaleDateString("fr-FR", {
              weekday: "long",
              day: "2-digit",
              month: "long",
            }) ?? ""}
          </div>
          <div className="text-base font-bold tabular-nums">
            {now?.toLocaleTimeString("fr-FR", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            }) ?? "--:--:--"}
          </div>
        </div>
      </div>
    </header>
  )
}
