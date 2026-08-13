"use client"

/**
 * Changement du statut utilisateur d'un OF.
 *
 * L'app ne rejoue AUCUNE règle métier : la matrice de transitions et la
 * synchronisation SAP sont appliquées par service-of, qui refuse avec un
 * message explicite. On affiche ce message tel quel — un refus n'est pas une
 * erreur technique mais une information utile à l'opérateur.
 */

import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, Check, Loader2, X } from "lucide-react"
import { api } from "@/lib/api"
import { cn, contrastText, formatOf } from "@/lib/utils"
import type { OfRow, StatusUtilisateurOption } from "@/lib/types"

interface Props {
  of: OfRow
  /** Poste technique de la ligne — exigé par l'API pour passer en OF Débuté */
  posteTechnique: string | null
  onClose: () => void
}

export function StatusChangeModal({ of, posteTechnique, onClose }: Props) {
  const queryClient = useQueryClient()
  const [choisi, setChoisi] = useState<StatusUtilisateurOption | null>(null)
  const [commentaire, setCommentaire] = useState("")
  const [refus, setRefus] = useState<string | null>(null)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["statuts-utilisateur"],
    queryFn: ({ signal }) => api.statutsUtilisateur(signal),
    staleTime: 5 * 60_000, // la liste ne bouge quasiment jamais
    retry: false,
  })

  const mutation = useMutation({
    mutationFn: () => {
      if (!choisi) throw new Error("Aucun statut sélectionné")
      return api.changerStatutUtilisateur(of.of, {
        userStatusId: choisi.id,
        commentaire: commentaire.trim() || undefined,
        fillProcessCode: choisi.requiertProcessCode
          ? (posteTechnique ?? undefined)
          : undefined,
      })
    },
    onSuccess: (res) => {
      if (!res.ok) {
        setRefus(res.message ?? "Changement refusé par service-of")
        return
      }
      // Le statut vient de changer côté WMS : on force le rafraîchissement du
      // dashboard plutôt que d'attendre le prochain poll (jusqu'à 10 s).
      queryClient.invalidateQueries({ queryKey: ["dashboard"] })
      onClose()
    },
    onError: (e) => setRefus((e as Error).message),
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = ""
    }
  }, [onClose])

  const statuts = data?.statuts ?? []
  const manqueProcessCode = choisi?.requiertProcessCode && !posteTechnique

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[85vh] w-[min(95vw,560px)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 bg-wms-bg px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-wms-dark">
              Changer le statut — OF {formatOf(of.of)}
            </h2>
            <p className="mt-0.5 text-xs text-slate-600">
              Statut actuel :{" "}
              <b style={{ color: of.statusUtilisateur.color }}>
                {of.statusUtilisateur.label}
              </b>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-white hover:text-slate-900"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-auto px-6 py-5">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-wms" />
              <span className="ml-3 text-sm text-slate-500">
                Chargement des statuts…
              </span>
            </div>
          )}

          {isError && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
              <p className="font-semibold">Statuts indisponibles</p>
              <p className="mt-1">{(error as Error).message}</p>
            </div>
          )}

          {statuts.length > 0 && (
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Nouveau statut
              </label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {statuts.map((s) => {
                  const actif = choisi?.id === s.id
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setChoisi(s)
                        setRefus(null)
                      }}
                      className={cn(
                        "rounded-lg border-2 px-3 py-2 text-left text-sm font-semibold transition-all",
                        actif
                          ? "shadow-md"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      )}
                      style={
                        actif
                          ? {
                              borderColor: s.color,
                              background: s.color,
                              color: contrastText(s.color),
                            }
                          : undefined
                      }
                    >
                      <span className="flex items-center gap-2">
                        {!actif && (
                          <span
                            className="h-3 w-3 shrink-0 rounded-full"
                            style={{ background: s.color }}
                          />
                        )}
                        {actif && <Check className="h-4 w-4 shrink-0" />}
                        {s.designation}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div>
            <label
              htmlFor="commentaire-statut"
              className="text-[11px] font-bold uppercase tracking-wide text-slate-500"
            >
              Commentaire
            </label>
            <textarea
              id="commentaire-statut"
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
              rows={3}
              placeholder="Motif du changement (facultatif)"
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-wms"
            />
          </div>

          {manqueProcessCode && (
            <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                « {choisi?.designation} » exige le poste technique de la ligne,
                qui n'est pas renseigné pour cette ligne. Le changement serait
                refusé.
              </span>
            </div>
          )}

          {refus && (
            <div className="flex gap-2 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{refus}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200"
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={!choisi || manqueProcessCode || mutation.isPending}
            onClick={() => {
              setRefus(null)
              mutation.mutate()
            }}
            className={cn(
              "flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-bold text-white transition-colors",
              !choisi || manqueProcessCode || mutation.isPending
                ? "cursor-not-allowed bg-slate-300"
                : "bg-wms hover:bg-wms-dark"
            )}
          >
            {mutation.isPending && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            Appliquer
          </button>
        </div>
      </div>
    </div>
  )
}
