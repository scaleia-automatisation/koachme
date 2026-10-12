# Gestion des incidents de sécurité

## Détection

- Espace d'administration : « Erreurs et imports » (journal technique), « Sécurité » (journal
  d'audit), vue d'ensemble (erreurs sur 24 h, impayés).
- Supabase : journaux d'authentification, de l'API et des Edge Functions ; conseiller de sécurité.
- Stripe : événements de webhook en échec, litiges.
- Signalements des utilisateurs (formulaire de contact).

## Procédure

1. **Qualifier** (dans l'heure) : nature, données concernées, nombre de comptes, l'incident
   est-il en cours ? Ouvrir une fiche d'incident (date, constat, actions, décisions).
2. **Contenir** :
   - clé exposée : la révoquer et la régénérer immédiatement (Supabase, OpenAI, Stripe, Resend,
     `MAINTENANCE_SECRET`, `BACKUP_ENCRYPTION_KEY`), puis mettre à jour les secrets des Edge
     Functions et `.env.local` ;
   - compte compromis : déconnecter toutes ses sessions, réinitialiser le mot de passe, retirer
     ses rôles d'équipe (`npm run admin:grant -- email role --revoke`) ;
   - faille applicative : désactiver la fonctionnalité (Edge Function, politique RLS) le temps du
     correctif.
3. **Évaluer le risque pour les personnes** : relevés bancaires et données financières sont des
   données sensibles pour les utilisateurs.
4. **Notifier** :
   - **CNIL sous 72 heures** après la prise de connaissance si la violation présente un risque
     pour les droits et libertés (téléservice de notification sur cnil.fr) ;
   - **les utilisateurs concernés sans délai** si le risque est élevé : nature de l'incident,
     conséquences probables, mesures prises, conseils (changer de mot de passe, vigilance face à
     l'hameçonnage) ;
   - prestataires concernés (Supabase, Stripe, OpenAI).
5. **Corriger et vérifier** : correctif, tests de non-régression (`npm run check`), conseiller de
   sécurité Supabase, restauration si nécessaire ([procédure](sauvegarde-restauration.md)).
6. **Retour d'expérience** sous 15 jours : cause, chronologie, mesures durables. Conserver la
   fiche dans le registre des violations (obligatoire, même sans notification).

## Contacts à tenir à jour

| Rôle | Contact |
| --- | --- |
| Responsable des incidents | *à compléter* |
| Délégué à la protection des données | *à compléter* |
| Hébergeur (Supabase) | support via le tableau de bord |
| Paiement (Stripe) | support via le tableau de bord |
