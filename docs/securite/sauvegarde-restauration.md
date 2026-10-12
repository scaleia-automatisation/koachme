# Sauvegarde et restauration

## Deux niveaux de sauvegarde

1. **Supabase** : sauvegardes quotidiennes automatiques de la base (7 jours sur l'offre Pro).
   La restauration à un instant précis (PITR) est une option payante à activer avant la mise en
   ligne.
2. **Sauvegarde applicative chiffrée** (`npm run backup`) : indépendante de Supabase, elle couvre
   aussi les fichiers des relevés, que les sauvegardes de base n'incluent pas.

## Sauvegarde applicative

```bash
npm run backup
```

- Exporte toutes les tables `public`, les comptes (identifiant, email, dates, métadonnées — jamais
  les mots de passe) et chaque fichier de relevé.
- Chiffre chaque élément en AES-256-GCM avec `BACKUP_ENCRYPTION_KEY` (64 caractères hexadécimaux
  dans `.env.local`). **Conservez cette clé séparément des sauvegardes** (gestionnaire de mots de
  passe de l'entreprise) : sans elle, aucune restauration n'est possible.
- Écrit `backups/<horodatage>/` : `manifest.json` (nombres de lignes et empreintes SHA-256),
  `data.json.enc`, `files/*.enc`. Le dossier `backups/` est exclu du dépôt.

Fréquence recommandée : quotidienne, copie vers un stockage externe chiffré (autre fournisseur),
rétention 30 jours.

## Test de restauration

```bash
npm run restore:test
```

1. Déchiffre la dernière sauvegarde (ou celle passée en argument) et vérifie l'empreinte de
   chaque table et de chaque fichier.
2. Restaure réellement les données dans un schéma temporaire `restore_test`, avec la même
   structure que la production.
3. Compare le nombre de lignes restaurées au manifeste.
4. Supprime le schéma temporaire.

Dernier test réussi : 12 octobre 2026 (29 tables, 413 lignes, 2 fichiers, 2 comptes).
À refaire **chaque mois** et après chaque migration importante ; consigner la date ici.

## Restauration réelle (incident)

1. Mettre le service en maintenance (désactiver les inscriptions dans Supabase Auth).
2. Si la base est endommagée : restaurer la sauvegarde Supabase la plus récente depuis le tableau
   de bord (ou un point PITR).
3. Si des données manquent après cette restauration : déchiffrer la sauvegarde applicative et
   réinsérer les lignes concernées (même méthode que `restore:test`, vers le schéma `public`, table
   par table, en commençant par les tables sans dépendance).
4. Fichiers des relevés : déchiffrer `files/*.enc` et les redéposer dans le bucket `statements`
   au chemin indiqué par `manifest.json`.
5. Rejouer les migrations (`npm run db:migrate`) puis les tests (`npm test`).
6. Les abonnements font foi chez Stripe : en cas de doute, renvoyer les événements depuis le
   tableau de bord Stripe (le webhook est idempotent).
