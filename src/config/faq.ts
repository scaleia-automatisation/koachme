// Contenu initial de la FAQ (amorçage de la table faq_items et repli hors ligne).
// La FAQ publiée est gérée depuis l’administration.
export const DEFAULT_FAQ: { section: string; items: { q: string; a: string }[] }[] = [
  {
    section: 'Démarrer',
    items: [
      { q: 'Faut-il des connaissances en finance ?', a: 'Non. Economiz pose des questions simples et explique chaque résultat sans jargon. Vous pouvez passer une question si vous ne connaissez pas la réponse.' },
      { q: 'Dois-je obligatoirement importer mes relevés ?', a: 'Non. Vous pouvez renseigner vos revenus et vos charges à la main. Vous pourrez ajouter des relevés plus tard pour affiner votre bilan.' },
      { q: 'Combien de temps faut-il pour obtenir un bilan ?', a: 'Quelques minutes. Un premier bilan est disponible même si certaines informations manquent : Economiz vous indique lesquelles et leur impact sur la fiabilité.' },
    ],
  },
  {
    section: 'Relevés bancaires',
    items: [
      { q: 'Quels relevés puis-je importer ?', a: 'Les relevés de compte au format PDF téléchargés depuis votre espace bancaire en ligne (10 Mo maximum par fichier). Un relevé scanné peut être lu par reconnaissance de caractères (OCR), uniquement si vous l’acceptez pour ce document.' },
      { q: 'Dois-je donner mes identifiants bancaires ?', a: 'Jamais. Economiz ne se connecte pas à votre banque. Vous choisissez les relevés que vous importez.' },
      { q: 'Que se passe-t-il si une opération est mal classée ?', a: 'Corrigez sa catégorie en un clic. La correction est mémorisée et s’applique automatiquement aux opérations du même marchand, y compris lors de vos prochains imports.' },
      { q: 'Mes revenus en espèces n’apparaissent pas sur mes relevés.', a: 'Vous pouvez ajouter les revenus absents des relevés (espèces, loyers perçus, aides versées sur un autre compte…) : ils sont ajoutés à votre bilan sans double comptage.' },
      { q: 'Et si j’importe deux relevés qui se chevauchent ?', a: 'Les opérations présentes dans les deux relevés sont détectées comme doublons et ne sont comptées qu’une fois.' },
    ],
  },
  {
    section: 'Compte et données',
    items: [
      { q: 'Mes données sont-elles revendues ?', a: 'Non, jamais. Elles servent uniquement à calculer votre bilan et à vous accompagner.' },
      { q: 'Comment supprimer mon compte ?', a: 'Depuis « Profil et paramètres », section « Suppression du compte ». Vos relevés et toutes vos données sont définitivement effacés.' },
      { q: 'Puis-je activer la double authentification ?', a: 'Oui, depuis « Profil et paramètres », section « Sécurité », avec une application d’authentification (Google Authenticator, Microsoft Authenticator, 1Password…).' },
      {
        q: 'L’équipe Economiz peut-elle voir mes relevés ?',
        a: 'Non. Personne chez Economiz n’a d’accès courant à vos relevés ni à vos opérations. Si vous avez besoin d’aide, vous pouvez autoriser temporairement l’assistance (24 heures à 7 jours) à consulter l’état technique de votre compte, sans jamais voir vos montants. Chaque consultation apparaît dans votre activité de sécurité.',
      },
    ],
  },
  {
    section: 'Abonnement',
    items: [
      { q: 'L’offre Découverte est-elle vraiment gratuite ?', a: 'Oui, sans limite de durée et sans carte bancaire.' },
      { q: 'Puis-je résilier à tout moment ?', a: 'Oui, en quelques clics depuis votre espace. L’abonnement reste actif jusqu’à la fin de la période déjà payée.' },
    ],
  },
]
