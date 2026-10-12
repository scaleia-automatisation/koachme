# Emails transactionnels

Tous les emails sont en français, avec la même mise en page sobre (logo, titre, message, bouton
d'action) et la mention « Economiz ne vous demandera jamais vos identifiants bancaires ».
Ils ne contiennent aucun montant de relevé ni aucune opération bancaire.

**État** : les modèles sont prêts et branchés, mais **aucun email ne part tant que Resend n'est pas
configuré** (`RESEND_API_KEY`, `RESEND_FROM_EMAIL`, domaine vérifié) — voir
[déploiement](deploiement.md#6-emails-resend). Sans clé, l'envoi est ignoré sans bloquer
l'action (les notifications dans l'application restent créées), et les emails d'authentification
partent depuis le service par défaut de Supabase (en anglais, 2 par heure, réservé aux tests).

## Compte (Supabase Auth, modèles dans `scripts/auth-config.mjs`)

| Email | Déclencheur |
| --- | --- |
| Confirmez votre adresse email | Inscription |
| Réinitialisation de votre mot de passe | « Mot de passe oublié » |
| Confirmez votre nouvelle adresse email | Changement d'adresse |
| Votre code de confirmation | Réauthentification avant une opération sensible |

Les liens pointent vers `/auth/confirmation` et sont valables 1 heure.

## Abonnement (Edge Function `stripe-webhook`)

| Email | Déclencheur (événement Stripe vérifié) |
| --- | --- |
| Votre abonnement Premium est actif | Abonnement activé (après paiement) |
| Formule modifiée | Passage mensuel ↔ annuel |
| Résiliation enregistrée | Résiliation programmée en fin de période |
| Résiliation annulée | L'utilisateur revient sur sa résiliation |
| Votre abonnement est résilié | Fin effective de l'abonnement |
| Échec du paiement de votre abonnement | Prélèvement refusé (avec lien vers « Mon abonnement ») |
| Renouvellement de votre abonnement annuel | `invoice.upcoming` pour un abonnement annuel (rappel loi Chatel) |

Les factures et reçus de paiement sont envoyés par Stripe (à activer dans Paramètres → Emails
clients), avec les mentions légales de l'entreprise.

## Suivi et cycle de vie (Edge Function `maintenance`)

| Email | Déclencheur |
| --- | --- |
| Votre bilan du mois vous attend | Rappel mensuel, si l'utilisateur l'a accepté (Paramètres → Notifications) |
| Votre compte Economiz va être supprimé | Compte inactif depuis 3 ans (suppression 30 jours après) |

## Équipe

| Email | Déclencheur |
| --- | --- |
| Alerte Economiz : erreurs en hausse | Surveillance (toutes les 15 min) : seuil d'erreurs dépassé, erreur du webhook de paiement ou imports en échec ; au plus une alerte par heure, vers `ALERT_EMAIL` |
