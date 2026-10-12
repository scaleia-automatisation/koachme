# Registre des activités de traitement (RGPD, article 30)

> Pré-rempli à partir du fonctionnement réel de l'application. À compléter (identité du
> responsable, contact DPO) et à valider par le responsable de traitement avant l'ouverture.

**Responsable du traitement** : [raison sociale, adresse, SIREN — à compléter]
**Contact données personnelles / DPO** : [adresse — à compléter]
**Personnes concernées** : utilisateurs du service (particuliers majeurs résidant en France / UE),
visiteurs écrivant via le formulaire de contact, membres de l'équipe.

| # | Traitement | Finalité | Base légale | Données | Durée de conservation | Destinataires |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Gestion des comptes | Création, authentification, sécurité du compte | Contrat | Email, mot de passe (haché par Supabase), prénom facultatif, facteur TOTP, version des CGU acceptée | Durée du compte ; suppression après 3 ans d'inactivité (+30 j de prévenance) | Supabase (hébergement) |
| 2 | Bilan budgétaire | Calcul du budget, diagnostic, recommandations, objectifs, suivi mensuel | Contrat | Revenus, charges, situation (épargne, dettes, foyer), objectifs, bilans mensuels | Durée du compte | Supabase |
| 3 | Analyse des relevés | Extraction et classement des opérations bancaires | Contrat | Relevés PDF, opérations (date, libellé, montant), 4 derniers chiffres du compte | Durée du compte ; suppression unitaire possible | Supabase ; OpenAI (texte masqué : identité, IBAN, cartes, coordonnées) |
| 4 | Lecture OCR d'un relevé scanné | Lecture d'un document sans texte | **Consentement** (pour chaque document) | Image du relevé (non masquée) | Fichier : durée du compte ; OpenAI : pas d'entraînement, conservation limitée par le contrat API | OpenAI |
| 5 | Coach IA | Réponses personnalisées sur le budget | Contrat | Questions, réponses, chiffres agrégés du bilan (pas les relevés) | 1 mois à 2 ans au choix (défaut 1 an) | Supabase ; OpenAI |
| 6 | Abonnement et facturation | Souscription, paiement, factures, rappels de renouvellement | Contrat ; obligation légale (comptabilité) | Identifiant client Stripe, statut, montants, liens de factures, preuve de la demande d'accès immédiat | Durée du compte (application) ; 10 ans pour les pièces comptables (Stripe) | Stripe |
| 7 | Emails transactionnels | Confirmation, sécurité, paiement, rappels | Contrat ; rappel mensuel selon le choix de l'utilisateur | Email, prénom, type d'événement | Journaux d'envoi du prestataire | Resend |
| 8 | Assistance | Réponse aux demandes | Intérêt légitime | Nom, email, sujet, message, note interne | 3 ans après l'envoi | Équipe (rôle assistance) |
| 9 | Accès d'assistance | Diagnostic d'un problème signalé | **Consentement** révocable | Métadonnées techniques des imports, compteurs | Durée de l'accès (≤ 7 jours) ; trace dans le journal d'audit | Équipe (rôle assistance) |
| 10 | Sécurité et journaux | Prévention des abus, traçabilité, diagnostic | Intérêt légitime | Journal d'audit (actions sensibles), journal technique (sans donnée bancaire), compteurs anti-abus | Audit : durée du compte (auteur anonymisé ensuite) ; technique : 90 jours | Équipe |
| 11 | Sauvegardes | Continuité de service | Intérêt légitime | Copie chiffrée (AES-256-GCM) des données et fichiers | 30 jours glissants | Stockage de l'entreprise |

**Transferts hors UE** : OpenAI, Resend (États-Unis), Stripe (UE et États-Unis) — clauses
contractuelles types et, le cas échéant, cadre UE–États-Unis (Data Privacy Framework). Base de
données et fichiers : Supabase, Francfort (UE).

**Mesures de sécurité** : voir [sécurité](../securite/securite.md) — RLS par utilisateur,
stockage privé, liens de téléchargement de 60 s, masquage avant IA, double authentification,
chiffrement en transit et au repos, sauvegardes chiffrées testées, journal d'audit, CSP stricte.

**Droits des personnes** : export JSON et suppression du compte en libre-service ; retrait de
l'accès d'assistance ; choix de la durée de conservation du coach ; demandes par email traitées
sous un mois ([guide d'administration](../guide-administration.md)).

**Décisions automatisées** : aucune décision produisant des effets juridiques ou significatifs ;
le diagnostic est informatif.
