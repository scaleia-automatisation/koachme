# Documentation Economiz

## Livrables

| Livrable | Où |
| --- | --- |
| Application (pages publiques et privées, administration) | `src/` — routes dans `src/app/router.tsx` |
| Schéma de base de données documenté | [architecture/schema.md](architecture/schema.md) |
| Migrations SQL | `supabase/migrations/` (`npm run db:migrate`) |
| Règles RLS (générées depuis la base) | [architecture/rls.md](architecture/rls.md) (`npm run docs:rls`) |
| Fonctions serveur et secrets | `supabase/functions/`, [variables-environnement.md](variables-environnement.md) |
| Configuration Stripe en test | `npm run stripe:setup`, [deploiement.md §5](deploiement.md#5-stripe) |
| Emails transactionnels | [emails.md](emails.md) |
| Tests automatisés et résultats | [tests.md](tests.md) |
| Instructions de déploiement | [deploiement.md](deploiement.md) |
| Variables d'environnement | [variables-environnement.md](variables-environnement.md) |
| Guide d'administration | [guide-administration.md](guide-administration.md) |
| Éléments restant à configurer ou valider | [pre-lancement.md](pre-lancement.md) |

## Sécurité

- [Principes et contrôles](securite/securite.md)
- [Conservation, export et suppression](securite/conservation-donnees.md)
- [Sauvegarde et restauration](securite/sauvegarde-restauration.md)
- [Gestion des incidents et violations de données](securite/incidents.md)

## Conformité (pré-analyses à valider)

- [Registre des traitements](conformite/registre-traitements.md)
- [Analyse d'impact (AIPD)](conformite/aipd.md)
- [Sous-traitants](conformite/sous-traitants.md)
- [Facturation, TVA, rétractation, résiliation](conformite/facturation-tva.md)
- [Cadre réglementaire financier](conformite/reglementaire.md)
