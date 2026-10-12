# Analyse d'impact relative à la protection des données (AIPD) — pré-analyse

> Document de travail. La décision finale et l'AIPD complète relèvent du responsable de
> traitement, idéalement avec un DPO ou un conseil spécialisé, **avant l'ouverture au public**.

## Une AIPD est-elle nécessaire ?

Les lignes directrices européennes (WP248) et la liste de la CNIL retiennent une AIPD dès que
**deux critères** sont réunis. Pour Economiz :

| Critère | Applicable ? | Justification |
| --- | --- | --- |
| Évaluation / notation de personnes | **Oui** | Statut de la situation financière (favorable / vigilance / prioritaire), diagnostic et recommandations personnalisées |
| Données sensibles ou à caractère hautement personnel | **Oui** | Données financières détaillées (relevés bancaires, revenus, dettes), considérées comme hautement personnelles |
| Usage innovant / nouvelles technologies | **Oui** | Lecture des relevés et coach par intelligence artificielle générative |
| Personnes vulnérables | Possible | Personnes en difficulté financière (statut « prioritaire ») |
| Traitement à grande échelle | À terme | Selon le nombre d'utilisateurs |
| Décision automatisée à effet juridique | Non | Diagnostic informatif uniquement |
| Croisement de données, surveillance systématique, transfert hors UE | Partiel | Transferts encadrés vers OpenAI (États-Unis) |

**Conclusion : au moins trois critères sont réunis — une AIPD doit être réalisée avant le
lancement.** L'outil PIA de la CNIL peut être utilisé.

## Éléments déjà disponibles pour l'AIPD

**Description** : [registre des traitements](registre-traitements.md), [schéma de
données](../architecture/schema.md), [règles d'accès](../architecture/rls.md).

**Nécessité et proportionnalité**
- Minimisation : aucun identifiant bancaire demandé ; seuls les 4 derniers chiffres du compte
  sont conservés ; texte des relevés masqué avant l'IA (identité, IBAN, cartes, coordonnées) ;
  le coach ne reçoit que des chiffres agrégés.
- Parcours sans relevé disponible (saisie manuelle) : l'import n'est pas obligatoire.
- OCR uniquement avec accord explicite, document par document.
- Durées de conservation définies et appliquées automatiquement (purges planifiées).
- Droits en libre-service (export, suppression, retrait d'accès, durée du coach).

**Risques et mesures**

| Risque | Sources | Mesures en place | Risque résiduel (à évaluer) |
| --- | --- | --- | --- |
| Accès illégitime aux relevés d'un utilisateur | Autre utilisateur, attaquant externe, membre de l'équipe | RLS par utilisateur (testée), stockage privé, URL signées 60 s, aucun accès courant de l'équipe, accès d'assistance consenti et tracé, double authentification, CSP | Faible |
| Fuite via le prestataire d'IA | OpenAI | Masquage préalable, pas d'entraînement (API), clauses contractuelles types ; OCR non masqué seulement avec accord | Modéré → envisager l'option « zero data retention » d'OpenAI |
| Conclusions erronées sur la situation financière | Erreur d'extraction ou de calcul | Contrôle des soldes, relevé incohérent exclu tant qu'il n'est pas vérifié, moteur déterministe testé (jeux de données contrôlés), pas de calcul confié à l'IA, mentions « estimation » | Faible |
| Mauvaise interprétation par une personne vulnérable | Recommandation mal comprise | Ton non culpabilisant, pas de conseil réglementé, renvoi vers un point conseil budget | Modéré → relecture des textes par un professionnel du surendettement |
| Indisponibilité / perte de données | Incident hébergeur | Sauvegardes quotidiennes Supabase + sauvegardes applicatives chiffrées testées | Faible |
| Conservation excessive | — | Purges automatiques, suppression de compte complète, inactivité 3 ans | Faible |

## À faire pour finaliser

1. Valider les risques résiduels et consigner l'avis du DPO.
2. Décider de l'option de non-conservation chez OpenAI (« zero data retention ») et l'inscrire.
3. Faire relire les textes du diagnostic et des recommandations (public en difficulté).
4. Signer l'AIPD et la réexaminer à chaque évolution majeure (nouvelle source de données,
   connexion bancaire, nouveau prestataire).
