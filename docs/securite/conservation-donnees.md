# Conservation, export et suppression des données

## Durées de conservation

| Données | Durée | Mécanisme |
| --- | --- | --- |
| Relevés PDF, opérations, budget, objectifs, bilans mensuels | Tant que le compte existe | Suppression unitaire possible à tout moment |
| Conversations avec le coach IA | 1 mois, 3 mois, 1 an (défaut) ou 2 ans, au choix | Purge quotidienne (`run_maintenance`) |
| Journal technique (`app_logs`) | 90 jours | Purge quotidienne |
| Notifications lues | 180 jours | Purge quotidienne |
| Consommation IA agrégée | 400 jours | Purge quotidienne |
| Limites anti-abus | 2 jours | Purge quotidienne |
| Journal d'audit | Durée du compte ; anonymisé à la suppression (`on delete set null`) | — |
| Factures | 10 ans, chez Stripe (obligation comptable) | — |
| Compte inactif | 3 ans sans connexion → email d'avertissement → suppression 30 jours plus tard | Maintenance quotidienne |
| Sauvegardes chiffrées | 30 jours glissants (à appliquer sur le stockage des sauvegardes) | Procédure manuelle |

La maintenance tourne chaque nuit à 03:00 UTC (pg_cron → Edge Function `maintenance`). Elle
remet aussi en échec les imports bloqués depuis plus de 15 minutes et crée les rappels mensuels.

## Export (droit d'accès et à la portabilité)

« Profil et paramètres → Export des données » télécharge un fichier JSON contenant profil,
situation, budget, relevés analysés, opérations, règles, objectifs, contributions, suivi des
recommandations, bilans mensuels, conversations, comptes identifiés, abonnement, factures,
notifications et accès accordés à l'assistance. Les PDF d'origine se téléchargent un par un
depuis « Mes relevés ». Chaque export est inscrit dans le journal de sécurité.

## Suppression (droit à l'effacement)

« Profil et paramètres → Suppression du compte », confirmation « SUPPRIMER ». L'Edge Function
`delete-account` :

1. supprime tous les fichiers du dossier de l'utilisateur dans le stockage ;
2. supprime le compte d'authentification, ce qui efface en cascade toutes les tables liées ;
3. enregistre l'événement `account.deleted` (sans donnée personnelle).

Un abonnement Stripe en cours doit être résilié par l'utilisateur avant la suppression ; à défaut,
l'équipe le résilie depuis le tableau de bord Stripe à réception de l'événement.

Les demandes reçues par le formulaire de contact (sujet « Mes données personnelles ») sont
traitées sous un mois.
