-- Libellés de la FAQ alignés sur l'espace « Profil et paramètres ».
update public.faq_items set answer = 'Depuis « Profil et paramètres », section « Suppression du compte ». Vos relevés et toutes vos données sont définitivement effacés.'
  where question = 'Comment supprimer mon compte ?';
update public.faq_items set answer = 'Oui, depuis « Profil et paramètres », section « Sécurité », avec une application d’authentification (Google Authenticator, Microsoft Authenticator, 1Password…).'
  where question = 'Puis-je activer la double authentification ?';
insert into public.faq_items (section, question, answer, sort_order)
select 'Compte et données', 'L’équipe Economiz peut-elle voir mes relevés ?',
  'Non. Personne chez Economiz n’a d’accès courant à vos relevés ni à vos opérations. Si vous avez besoin d’aide, vous pouvez autoriser temporairement l’assistance (24 heures à 7 jours) à consulter l’état technique de votre compte, sans jamais voir vos montants. Chaque consultation apparaît dans votre activité de sécurité.',
  coalesce(max(sort_order), 0) + 1
from public.faq_items where section = 'Compte et données'
  and not exists (select 1 from public.faq_items where question = 'L’équipe Economiz peut-elle voir mes relevés ?');
