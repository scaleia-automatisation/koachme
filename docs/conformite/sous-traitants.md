# Prestataires et sous-traitants (RGPD, article 28)

> Vérifier et archiver chaque contrat avant l'ouverture. Les liens indiquent où trouver les
> documents ; leur contenu exact relève du contrat accepté par l'entreprise.

| Prestataire | Rôle | Données | Localisation | Contrat à signer / vérifier | Points d'attention |
| --- | --- | --- | --- | --- | --- |
| **Supabase** | Base de données, authentification, stockage, fonctions | Toutes les données de l'application | Francfort (UE) — projet en `eu-central-1` | DPA Supabase (tableau de bord → Organisation → Legal), liste de ses sous-traitants | Offre Pro pour la production (sauvegardes, support) ; vérifier que les sauvegardes restent dans l'UE |
| **OpenAI** | Lecture des relevés, OCR, coach | Texte masqué des relevés ; image des scans (avec accord) ; questions et chiffres agrégés | États-Unis | DPA OpenAI (platform.openai.com → paramètres de l'organisation), clauses contractuelles types | Données API non utilisées pour l'entraînement ; demander la non-conservation (« zero data retention ») si possible ; alternative UE envisageable (Azure OpenAI en région UE) |
| **Stripe** | Paiement, abonnements, factures | Email, identifiant client, moyen de paiement (chez Stripe uniquement), montants | Irlande (UE) / États-Unis | Contrat de services Stripe incluant le DPA | Economiz ne voit jamais le numéro de carte ; Stripe est aussi responsable de traitement pour ses obligations propres (lutte anti-fraude, LCB-FT) |
| **Resend** | Emails transactionnels | Email, prénom, contenu des emails (aucune donnée bancaire) | États-Unis | DPA Resend | Domaine d'envoi vérifié (SPF, DKIM, DMARC) |
| **Hébergeur du site** (Vercel ou autre) | Diffusion du site statique | Adresses IP et journaux d'accès | Réseau mondial | DPA de l'hébergeur | Aucune donnée applicative ne transite par l'hébergeur du site (appels directs à Supabase) |

## Engagements de l'entreprise envers ses prestataires

- Tenir à jour cette liste et celle affichée dans la politique de confidentialité
  (`src/config/legal.ts` → `PROCESSORS`).
- Informer les utilisateurs avant tout nouveau sous-traitant traitant des données financières.
- Réexaminer les garanties de transfert (clauses contractuelles types, Data Privacy Framework)
  en cas d'évolution juridique.
