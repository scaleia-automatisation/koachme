-- ============================================================
-- 0010 — Contenu initial de la FAQ (généré depuis src/config/faq.ts)
-- ============================================================
insert into public.faq_items (section, question, answer, sort_order) values
  ('Démarrer', 'Faut-il des connaissances en finance ?', 'Non. Economiz pose des questions simples et explique chaque résultat sans jargon. Vous pouvez passer une question si vous ne connaissez pas la réponse.', 10),
  ('Démarrer', 'Dois-je obligatoirement importer mes relevés ?', 'Non. Vous pouvez renseigner vos revenus et vos charges à la main. Vous pourrez ajouter des relevés plus tard pour affiner votre bilan.', 20),
  ('Démarrer', 'Combien de temps faut-il pour obtenir un bilan ?', 'Quelques minutes. Un premier bilan est disponible même si certaines informations manquent : Economiz vous indique lesquelles et leur impact sur la fiabilité.', 30),
  ('Relevés bancaires', 'Quels relevés puis-je importer ?', 'Les relevés de compte au format PDF téléchargés depuis votre espace bancaire en ligne (10 Mo maximum par fichier). Un relevé scanné peut être lu par reconnaissance de caractères (OCR), uniquement si vous l’acceptez pour ce document.', 40),
  ('Relevés bancaires', 'Dois-je donner mes identifiants bancaires ?', 'Jamais. Economiz ne se connecte pas à votre banque. Vous choisissez les relevés que vous importez.', 50),
  ('Relevés bancaires', 'Que se passe-t-il si une opération est mal classée ?', 'Corrigez sa catégorie en un clic. La correction est mémorisée et s’applique automatiquement aux opérations du même marchand, y compris lors de vos prochains imports.', 60),
  ('Relevés bancaires', 'Mes revenus en espèces n’apparaissent pas sur mes relevés.', 'Vous pouvez ajouter les revenus absents des relevés (espèces, loyers perçus, aides versées sur un autre compte…) : ils sont ajoutés à votre bilan sans double comptage.', 70),
  ('Relevés bancaires', 'Et si j’importe deux relevés qui se chevauchent ?', 'Les opérations présentes dans les deux relevés sont détectées comme doublons et ne sont comptées qu’une fois.', 80),
  ('Compte et données', 'Mes données sont-elles revendues ?', 'Non, jamais. Elles servent uniquement à calculer votre bilan et à vous accompagner.', 90),
  ('Compte et données', 'Comment supprimer mon compte ?', 'Depuis « Mon compte », section « Supprimer mon compte ». Vos relevés et toutes vos données sont définitivement effacés.', 100),
  ('Compte et données', 'Puis-je activer la double authentification ?', 'Oui, depuis « Mon compte », avec une application d’authentification (Google Authenticator, Microsoft Authenticator, 1Password…).', 110),
  ('Abonnement', 'L’offre Découverte est-elle vraiment gratuite ?', 'Oui, sans limite de durée et sans carte bancaire.', 120),
  ('Abonnement', 'Puis-je résilier à tout moment ?', 'Oui, en quelques clics depuis votre espace. L’abonnement reste actif jusqu’à la fin de la période déjà payée.', 130);
