import { useEffect } from 'react'

const SUFFIX = 'Economiz'

/** Titre d'onglet propre à chaque page. */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} — ${SUFFIX}` : `${SUFFIX} — Votre argent, en clair.`
  }, [title])
}
