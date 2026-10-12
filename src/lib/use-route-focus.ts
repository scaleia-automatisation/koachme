import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

// Dernière page affichée, partagée par toutes les mises en page (public,
// connexion, espace, administration) : un changement de mise en page est
// aussi un changement de page.
let lastPath: string | null = null

/**
 * Après un changement de page, place le focus sur le contenu principal
 * (#contenu) : les lecteurs d'écran annoncent la nouvelle page et la
 * navigation au clavier reprend depuis le haut du contenu, au lieu de rester
 * sur un élément qui n'existe plus. Le premier affichage n'est pas modifié.
 */
export function useRouteFocus() {
  const { pathname } = useLocation()
  useEffect(() => {
    if (lastPath !== null && lastPath !== pathname) document.getElementById('contenu')?.focus({ preventScroll: true })
    lastPath = pathname
  }, [pathname])
}
