"use client"

import { useEffect, useState } from "react"
import { Factory } from "lucide-react"
import Link from "next/link"
import { FullscreenButton } from "./fullscreen-button"

interface HeaderProps {
  title: string
  subtitle?: string
  backHref?: string
  rightSlot?: React.ReactNode
}

export function Header({ title, subtitle, backHref, rightSlot }: HeaderProps) {
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <header
      className="sticky top-0 z-50 flex items-center justify-between border-b-[3px] border-wms px-6 py-3 text-white shadow-md"
      style={{
        background: "linear-gradient(135deg, #004f5e, #006d82)",
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
