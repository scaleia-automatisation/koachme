# Tests automatisés et résultats

Dernière exécution complète : **12 octobre 2026**, projet Supabase de développement, Google Chrome installé sur le poste
(Windows 11).

| Suite | Commande | Résultat |
| --- | --- | --- |
| Typage, lint, build | `npm run check` | ✓ sans erreur |
| Unitaires et intégration (17 fichiers) | `npm test` | ✓ **213 / 213** |
| Bout en bout (Playwright) | `npm run e2e` | ✓ **30 / 30** (voir note) |
| Performances et CSP sur le build | `npm run e2e:perf` | ✓ **9 / 9** |
| Sauvegarde + restauration | `npm run backup && npm run restore:test` | ✓ 29 tables, 413 lignes, 2 fichiers |
| Règles RLS | `npm run docs:rls` | ✓ RLS active sur les 29 tables, 52 politiques |

Note : lors de la passe complète, le scénario A a dépassé le délai sur le tout premier chargement
de page (poste mis en veille pendant l'exécution) ; relancé seul, il passe en 16 s. Les 29 autres
tests sont passés dans la même exécution.

## Tests unitaires et d'intégration (`src/**/*.test.ts`, `tests/`)

| Fichier | Tests | Contenu |
| --- | --- | --- |
| `src/domain/financial-datasets.test.ts` | 26 | **Jeux de données contrôlés (§7.2)** : foyer sur 4 comptes et 3 mois — salaire et charges fixes, revenus complémentaires irréguliers, virements internes appariés, remboursement, récurrences, doublons d'un relevé qui en recoupe un autre, opération incertaine et en attente, périodes différentes selon les comptes, prime et achat exceptionnels, relevé aux soldes incohérents, revenus déclarés hors relevés ; saisie manuelle à fréquences variées ; contrôle des soldes ; arrondis sans dérive. Tous les résultats sont calculés à la main. |
| `src/domain/statements.test.ts` | — | Règles financières obligatoires, catégorisation, doublons, récurrences, exceptionnels, périodes |
| `src/domain/diagnosis.test.ts`, `domain.test.ts`, `suivi.test.ts` | — | Diagnostic, budget, objectifs, historique, recommandations |
| `tests/db/rls.test.ts` | — | Isolation des données, stockage, contact |
| `tests/db/statement-import.test.ts` | — | Import réel (extraction IA), OCR avec accord, suppression du compte |
| `tests/db/coach.test.ts` | 7 | Coach : réponses fondées sur les données, quotas, offre gratuite, isolation |
| `tests/db/billing.test.ts` | 12 | Webhook signé, consentement d'exécution immédiate, droits, impayés, remboursement, changement de formule, rappel annuel, résiliation, relance en cas d'erreur |
| `tests/db/admin.test.ts` | 9 | Rôles, assistance consentie, offres, FAQ, indicateurs |
| `tests/db/operations.test.ts` | 12 | Limites d'offre, export PDF, maintenance, anti-abus, erreurs du navigateur, surveillance |
| `tests/db/consistency.test.ts` | 5 | **Cohérence base ↔ API ↔ code** : tables, colonnes, fonctions SQL et Edge Functions utilisées existent ; migrations appliquées et non modifiées |
| `tests/db/categories.test.ts`, `tests/functions/*` | — | Référentiels, masquage avant IA, synchronisation du moteur serveur |

Aucun calcul financier central ne dépend d'une vérification visuelle ni d'une réponse d'IA :
l'IA ne fait que proposer une catégorie, les montants viennent du moteur déterministe testé.

## Bout en bout (`e2e/`, vrai navigateur, vrai projet Supabase)

| Scénario | Étapes vérifiées |
| --- | --- |
| **A** — sans relevé | Inscription (erreurs de formulaire, CGU, prénom), choix du parcours, revenus, charges (dont une annuelle), dépenses, bilan avec calculs vérifiés (2 250 € / 1 595 € / 655 €), recommandations, objectif et limite de l'offre gratuite, coach verrouillé puis réponse réelle citant le reste mensuel |
| **B** — avec relevé | Import d'un PDF, extraction réelle (26 opérations, soldes vérifiés), refus du doublon, classement des opérations incertaines, validation, revenus absents ajoutés, bilan (2 730 € / 1 225,80 €), page Dépenses |
| **C** — suivi mensuel | Nouvelle période qui recoupe la précédente (4 doublons détectés), comparaison février → mars (courses 153,40 € → 222,50 €), récurrences, bilan mis à jour, virement d'épargne associé à un objectif |
| **D** — paiement | Souscription (case de consentement obligatoire ; sans clé Stripe : message clair), retour de paiement simulé sans effet, confirmation par webhook signé, droits Premium, factures, changement de formule, échec de paiement (droits conservés), régularisation, bouton de résiliation, résiliation programmée, fin d'abonnement et retour à l'offre gratuite — droits vérifiés après chaque événement |
| **E** — sécurité | Lecture, modification, suppression des données d'autrui refusées ; téléchargement d'un relevé d'autrui refusé ; administration refusée (interface et base) ; fichiers invalides (type, vide, trop gros, faux PDF, dépôt dans le dossier d'autrui) ; limites d'usage (contact, quota d'import, session obligatoire) ; export limité à ses données et suppression complète du compte |
| **Qualité** | Aucun lien interne cassé (public et espace), page introuvable, messages d'erreur des formulaires, accès selon les rôles (visiteur, utilisateur, administrateur), écrans sans données, chargement lent, erreur réseau et « Réessayer », **accessibilité WCAG 2.1 AA (axe-core) sans défaut grave sur 32 pages**, navigation au clavier (lien d'évitement, focus après navigation, menus), affichage sans débordement sur ordinateur, tablette et mobile |

### Paiement Stripe

Sans clé Stripe, la page de paiement hébergée par Stripe n'est pas testée : le scénario D envoie
au webhook déployé les événements signés que Stripe enverrait. Dès que `STRIPE_SECRET_KEY` est
renseignée, le même scénario passe réellement par Stripe Checkout.

### Inscription

L'envoi de l'email de confirmation n'est pas testé (pas de SMTP configuré, et Supabase refuse les
adresses `example.com`) : la demande envoyée par le formulaire est rejouée côté serveur avec
exactement les mêmes données. À vérifier en recette avec une vraie adresse après configuration de
Resend.

## Performances (build de production, `npm run e2e:perf`)

| Page | Ordinateur | Mobile 4G simulée (CPU ×4) |
| --- | --- | --- |
| Accueil — LCP | 752 ms | 2 292 ms |
| Tarifs — LCP | 288 ms | 1 616 ms |
| Connexion — LCP | 196 ms | 1 428 ms |
| Bilan affiché (connecté) | 949 ms | 2 345 ms |
| Décalage de mise en page (CLS) | ≤ 0,014 | ≤ 0,013 |
| JavaScript initial (compressé) | 273 Ko | 273 Ko |

Seuils : LCP < 2,5 s (ordinateur) / 4 s (mobile 4G), CLS < 0,1. Aucune violation de la CSP de
production sur 11 pages parcourues.

## Défauts trouvés et corrigés pendant le bloc 7

- Page « Mon abonnement » qui plantait à l'activation d'un abonnement (format de date).
- Factures non rechargées à la confirmation du paiement.
- Formulaire du coach affiché un instant avant le chargement des droits.
- Écart d'un centime entre le total des dépenses et la somme exacte (arrondis par catégorie).
- Résiliation programmée et changement de formule sans notification ; pas d'email de
  confirmation de souscription ou de résiliation.
- Journal d'activité non rafraîchi après un export.
- Contrastes insuffisants (pastilles, textes secondaires), listes mal structurées, lien
  identifiable par sa seule couleur, tableaux défilants inaccessibles au clavier.
- Pas de lien d'évitement dans l'espace connecté ni l'administration ; focus perdu après chaque
  changement de page ; titres des pages introuvable et erreur non balisés.
- Haut de l'accueil masqué par une animation (affichage perçu retardé).
- Absence de case d'exécution immédiate (rétractation), de bouton de résiliation direct et de
  rappel avant renouvellement annuel.
