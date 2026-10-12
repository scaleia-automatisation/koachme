# Guide d'administration

L'espace d'administration est accessible à l'adresse `/admin` aux seuls comptes disposant d'un
rôle d'équipe. Le lien « Administration » (bouclier) apparaît alors dans l'en-tête de l'espace.

## Rôles

| Rôle | Accès |
| --- | --- |
| **Assistance** (`support`) | Vue d'ensemble, demandes d'assistance, erreurs et imports en échec, usage de l'IA, consultation de l'état technique d'un compte **avec l'accord de son titulaire** |
| **Administrateur** (`admin`) | Tout ce qui précède, plus : offres et limites, FAQ, journal de sécurité, gestion de l'équipe |

Aucun rôle ne donne accès au contenu des relevés, aux opérations, aux montants ni aux conversations
avec le coach. Les droits sont vérifiés par la base de données à chaque requête : masquer ou
afficher un bouton dans le navigateur ne donne aucun droit.

**Double authentification obligatoire** pour tout compte d'équipe (Profil et paramètres →
Sécurité). L'espace d'administration affiche une alerte tant qu'elle n'est pas activée.

### Attribuer ou retirer un rôle

- Premier administrateur : `npm run admin:grant -- email@domaine.fr admin` (clé serveur).
- Ensuite : Administration → Équipe → « Ajouter un membre » (le compte doit exister). Retrait
  par le bouton « Retirer ». Un administrateur ne peut pas retirer son propre rôle.
- Chaque attribution et chaque retrait sont inscrits dans le journal de sécurité.

## Vue d'ensemble

Comptes et comptes actifs, inscriptions (7 et 30 jours, graphique), abonnements actifs et impayés,
revenu mensuel récurrent (abonnements annuels ramenés au mois), relevés analysés et en échec,
questions au coach et jetons consommés, demandes d'assistance ouvertes, erreurs sur 24 heures.
Uniquement des chiffres agrégés.

## Assistance

**Demandes** : messages du formulaire de contact. Filtrer (à traiter, nouvelles, en cours,
résolues), ouvrir une demande, se l'attribuer, changer son statut, ajouter une note interne
(jamais visible par l'utilisateur), répondre par email. Les messages sont supprimés 3 ans après
leur envoi.

**Retrouver un compte** : recherche par email exact (journalisée). Pour consulter l'état technique
d'un compte (statut des imports, erreurs, périodes, nombre d'opérations, contrôle des soldes),
**l'utilisateur doit d'abord accorder un accès** depuis Profil et paramètres → Accès de
l'assistance (24 heures à 7 jours, révocable). Sans accord en cours, la consultation est refusée par
la base. Chaque consultation apparaît dans l'activité de sécurité de l'utilisateur.

Procédure type : demander à l'utilisateur d'accorder l'accès en indiquant l'objet de sa demande,
consulter, répondre, puis lui rappeler qu'il peut retirer l'accès.

## Erreurs et imports

- **Imports en échec** (100 derniers) : date, code d'erreur, méthode (texte / OCR), tentatives,
  taille. Codes fréquents : `not_statement` (document non bancaire), `needs_ocr` (scan en attente
  de l'accord de l'utilisateur), `no_operations`, `processing_error` (incident temporaire : relance
  possible par l'utilisateur), `not_pdf`.
- **Journal technique** (90 jours) : erreurs des fonctions serveur et du navigateur (source
  `frontend`), avec un contexte minimal sans donnée bancaire.
- **Alertes** : la surveillance (toutes les 15 minutes) envoie un email à `ALERT_EMAIL` si les
  erreurs dépassent le seuil, si le webhook de paiement échoue ou si les imports échouent en série.

## Usage de l'IA

Questions posées au coach par jour, jetons consommés, réponses de repli (offre gratuite, quota
atteint, service indisponible), nombre d'utilisateurs. Le plafond global quotidien
(`COACH_GLOBAL_DAILY_TOKENS`) protège des dépenses imprévues ; les quotas par offre se règlent dans
« Offres et limites ».

## Offres et limites (administrateur)

Pour chaque offre : nom, accroche, prix TTC mensuel et annuel, identifiants de prix Stripe, limites
(relevés par mois, questions au coach par mois, objectifs, exports PDF par mois ; vide = sans
limite, 0 = non inclus), fonctionnalités incluses (historique, comparaisons, recommandations
avancées), arguments affichés, mise en avant, disponibilité à la souscription.

- Les **limites** s'appliquent immédiatement à tous les comptes de l'offre (contrôle côté serveur).
- Un **changement de prix** n'affecte pas les abonnements en cours : créer d'abord le nouveau prix
  dans Stripe (ou relancer `npm run stripe:setup`), puis renseigner son identifiant ici. Les pages
  Tarifs et CGV affichent automatiquement les nouveaux montants.
- L'offre gratuite « Découverte » est attribuée à tout compte sans abonnement actif.

## FAQ (administrateur)

Ajouter, modifier, ordonner (champ « Ordre »), publier ou passer en brouillon, supprimer. Les
modifications sont visibles immédiatement sur la page publique `/faq`.

## Sécurité (administrateur)

Journal d'audit filtrable : authentification (mot de passe, double authentification, sessions),
accès de l'assistance, administration (rôles, recherches), paiements, exports de données,
suppressions de compte. Les métadonnées ne contiennent aucune donnée bancaire.

En cas d'événement suspect : [procédure de gestion des incidents](securite/incidents.md).

## Tâches courantes hors interface

| Tâche | Commande / lieu |
| --- | --- |
| Sauvegarde chiffrée | `npm run backup` (quotidienne recommandée) |
| Test de restauration | `npm run restore:test` (mensuel) |
| État des secrets | `npm run secrets:sync -- --check` |
| Remboursement, litige, facture | Tableau de bord Stripe (le webhook met à jour l'application) |
| Désactivation d'un compte abusif | Supabase → Authentication → Users → Ban user |
| Demande RGPD reçue par email | Accès / portabilité : l'utilisateur exporte depuis ses paramètres ; effacement : suppression depuis ses paramètres, ou par l'équipe avec `npm run user:delete -- email --confirm` (jamais depuis le tableau de bord Supabase, qui laisserait les fichiers des relevés) |
