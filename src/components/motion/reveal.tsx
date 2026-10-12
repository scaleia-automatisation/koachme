import { motion, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'

/**
 * Apparition légère au défilement (désactivée si l'utilisateur réduit les animations).
 * `as="li"` pour un élément de liste : la structure <ul>/<ol> reste valide.
 */
export function Reveal({ children, delay = 0, className, as = 'div' }: { children: ReactNode; delay?: number; className?: string; as?: 'div' | 'li' }) {
  const reduce = useReducedMotion()
  if (reduce) return as === 'li' ? <li className={className}>{children}</li> : <div className={className}>{children}</div>
  const Tag = as === 'li' ? motion.li : motion.div
  return (
    <Tag
      className={className}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay }}
    >
      {children}
    </Tag>
  )
}
