import { Link } from 'react-router-dom'
import { LEGAL, PROCESSORS, TERMS_UPDATED_AT } from '@/config/legal'
import { WITHDRAWAL_DAYS } from '@/config/plans'
import { usePublicPlans } from '@/features/finance/billing'
import { formatEuros } from '@/domain'
import { LegalPage } from './page-parts'

export function TermsPage() {
  return (
    <LegalPage title="Conditions générales d’utilisation" updatedAt={TERMS_UPDATED_AT} intro="Les règles d’utilisation du service Economiz. Elles s’appliquent dès la création de votre compte.">
      <h2>1. Objet</h2>
      <p>
        Les présentes conditions générales d’utilisation (CGU) encadrent l’accès et l’utilisation du service {LEGAL.productName}, édité par{' '}
        {LEGAL.companyName} (voir les <Link to="/mentions-legales">mentions légales</Link>). Le service aide ses utilisateurs à analyser leur budget
        personnel à partir d’informations qu’ils déclarent ou de relevés bancaires qu’ils importent.
      </p>

      <h2>2. Nature du service</h2>
      <p>
        {LEGAL.productName} est un outil d’aide à la gestion budgétaire. Les bilans, indicateurs et recommandations sont fournis à titre informatif
        et pédagogique. Ils ne constituent ni un conseil en investissement, ni un conseil juridique ou fiscal, ni une offre de crédit. Les décisions
        financières restent de la seule responsabilité de l’utilisateur.
      </p>
      <p>
        Les calculs reposent sur les informations transmises par l’utilisateur. Leur exactitude dépend de l’exactitude et de l’exhaustivité de ces
        informations ; le service indique les informations manquantes et leur impact sur la fiabilité du bilan.
      </p>

      <h2>3. Création du compte</h2>
      <ul>
        <li>L’inscription est réservée aux personnes physiques majeures agissant pour leurs besoins personnels.</li>
        <li>L’utilisateur fournit une adresse email valide, qu’il confirme, et choisit un mot de passe robuste qu’il garde confidentiel.</li>
        <li>L’utilisateur est responsable des actions effectuées depuis son compte. Il peut activer l’authentification à deux facteurs.</li>
        <li>{LEGAL.productName} ne demande jamais les identifiants, mots de passe ou codes d’accès bancaires de l’utilisateur.</li>
      </ul>

      <h2>4. Utilisation des relevés importés</h2>
      <p>
        L’utilisateur n’importe que des relevés dont il est titulaire ou co-titulaire, ou pour lesquels il dispose d’une autorisation. Les relevés
        sont traités uniquement pour produire son bilan. L’utilisateur peut supprimer un relevé et les opérations associées à tout moment.
      </p>

      <h2>5. Offres et abonnements</h2>
      <p>
        Le service propose une offre gratuite et des offres payantes décrites sur la page <Link to="/tarifs">Tarifs</Link>. Les conditions de
        souscription, de renouvellement, de rétractation et de résiliation sont détaillées sur la page{' '}
        <Link to="/abonnement-resiliation">Abonnement et résiliation</Link>.
      </p>

      <h2>6. Obligations de l’utilisateur</h2>
      <ul>
        <li>Ne pas tenter d’accéder aux données d’autres utilisateurs ni de perturber le fonctionnement du service.</li>
        <li>Ne pas utiliser le service à des fins illicites ou pour le compte de tiers sans autorisation.</li>
        <li>Ne pas extraire ni réutiliser le service ou son contenu de manière automatisée.</li>
      </ul>

      <h2>7. Disponibilité et responsabilité</h2>
      <p>
        L’éditeur met en œuvre les moyens raisonnables pour assurer la disponibilité et la sécurité du service, sans garantir une disponibilité
        ininterrompue. Sa responsabilité ne saurait être engagée en cas de décision financière prise sur la base des informations du service, ni en
        cas d’informations inexactes fournies par l’utilisateur.
      </p>

      <h2>8. Données personnelles</h2>
      <p>
        Le traitement des données personnelles est décrit dans la <Link to="/confidentialite">politique de confidentialité</Link>.
      </p>

      <h2>9. Suspension et suppression du compte</h2>
      <p>
        L’utilisateur peut supprimer son compte à tout moment depuis la page « Profil et paramètres » ; toutes ses données sont alors effacées. L’éditeur
        peut suspendre un compte en cas de manquement grave aux présentes CGU, après en avoir informé l’utilisateur sauf urgence.
      </p>

      <h2>10. Modification des CGU</h2>
      <p>
        Les CGU peuvent évoluer. En cas de modification substantielle, l’utilisateur en est informé et doit les accepter à nouveau pour continuer à
        utiliser le service.
      </p>

      <h2>11. Droit applicable et litiges</h2>
      <p>
        Les présentes CGU sont soumises au droit français. En cas de litige, l’utilisateur peut contacter le service client via la page{' '}
        <Link to="/contact">Contact</Link>, puis recourir gratuitement au médiateur de la consommation : {LEGAL.mediator}. À défaut de résolution
        amiable, les tribunaux compétents sont ceux prévus par le Code de la consommation.
      </p>
    </LegalPage>
  )
}

export function PrivacyPage() {
  return (
    <LegalPage title="Politique de confidentialité" updatedAt={TERMS_UPDATED_AT} intro="Quelles données nous traitons, pourquoi, combien de temps, et comment exercer vos droits.">
      <h2>Responsable du traitement</h2>
      <p>
        {LEGAL.companyName}, {LEGAL.address}. Contact pour vos données personnelles : {LEGAL.dpoEmail}.
      </p>

      <h2>Données traitées</h2>
      <table>
        <thead>
          <tr>
            <th>Données</th>
            <th>Finalité</th>
            <th>Base légale</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Email, mot de passe (chiffré), prénom facultatif</td>
            <td>Création et sécurité du compte</td>
            <td>Exécution du contrat</td>
          </tr>
          <tr>
            <td>Revenus, charges, situation (épargne, dettes, foyer, objectif)</td>
            <td>Calcul du bilan et recommandations</td>
            <td>Exécution du contrat</td>
          </tr>
          <tr>
            <td>Relevés bancaires PDF et opérations extraites</td>
            <td>Analyse des dépenses et des revenus</td>
            <td>Exécution du contrat</td>
          </tr>
          <tr>
            <td>Relevé scanné lu par reconnaissance de caractères (OCR)</td>
            <td>Lecture d’un document sans couche texte, transmis sans masquage préalable</td>
            <td>Consentement, demandé pour chaque document</td>
          </tr>
          <tr>
            <td>Questions posées au coach IA et réponses</td>
            <td>Réponses personnalisées à partir de votre bilan</td>
            <td>Exécution du contrat</td>
          </tr>
          <tr>
            <td>Messages envoyés à l’assistance</td>
            <td>Réponse à vos demandes</td>
            <td>Intérêt légitime</td>
          </tr>
          <tr>
            <td>Accès temporaire de l’assistance à l’état technique de votre compte</td>
            <td>Résolution d’un problème que vous signalez</td>
            <td>Consentement, révocable à tout moment</td>
          </tr>
          <tr>
            <td>Rappels et notifications (dont emails de rappel mensuel)</td>
            <td>Suivi de votre budget</td>
            <td>Exécution du contrat ; rappel par email selon votre choix</td>
          </tr>
          <tr>
            <td>Journal de sécurité et journal technique (sans donnée bancaire)</td>
            <td>Sécurité du service, prévention des abus, diagnostic des erreurs</td>
            <td>Intérêt légitime</td>
          </tr>
          <tr>
            <td>Données de facturation (via notre prestataire de paiement)</td>
            <td>Gestion de l’abonnement</td>
            <td>Exécution du contrat, obligations légales</td>
          </tr>
        </tbody>
      </table>
      <p>
        Nous ne collectons jamais vos identifiants bancaires. Seuls les 4 derniers chiffres de votre numéro de compte sont conservés pour distinguer
        vos comptes.
      </p>

      <h2>Données financières</h2>
      <p>
        Les informations financières sont des données personnelles particulièrement sensibles pour vous. Elles sont accessibles uniquement depuis
        votre compte, protégées par des règles d’accès strictes en base de données, et ne sont jamais vendues, louées ni utilisées à des fins
        publicitaires.
      </p>

      <h2>Destinataires et sous-traitants</h2>
      <table>
        <thead>
          <tr>
            <th>Prestataire</th>
            <th>Rôle</th>
            <th>Localisation</th>
          </tr>
        </thead>
        <tbody>
          {PROCESSORS.map((p) => (
            <tr key={p.name}>
              <td>{p.name}</td>
              <td>{p.purpose}</td>
              <td>{p.location}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Transferts hors de l’Union européenne</h2>
      <p>
        Certains prestataires sont établis aux États-Unis (voir le tableau ci-dessus). Ces transferts sont encadrés par les clauses contractuelles
        types de la Commission européenne et, le cas échéant, par le cadre de protection des données UE–États-Unis. Avant toute lecture par
        l’IA, l’identité, l’IBAN, les numéros de carte et les coordonnées figurant sur un relevé sont masqués ; les données transmises ne sont pas
        utilisées pour entraîner les modèles.
      </p>

      <h2>Décisions automatisées</h2>
      <p>
        Le bilan, le statut de votre situation et les recommandations sont calculés automatiquement à partir de vos données, à titre informatif.
        Aucune décision produisant des effets juridiques ou vous affectant de manière significative n’est prise sur cette base : vous restez seul
        juge des suites à donner.
      </p>

      <h2>Durées de conservation</h2>
      <ul>
        <li>Données du compte, du budget et des relevés : pendant toute la durée d’utilisation du compte, puis supprimées dès la suppression du compte.</li>
        <li>Conversations avec le coach IA : 1 mois, 3 mois, 1 an (par défaut) ou 2 ans, selon votre choix dans « Profil et paramètres ».</li>
        <li>Un compte inactif depuis 3 ans est supprimé, 30 jours après un email de prévenance.</li>
        <li>Messages à l’assistance : 3 ans après leur envoi.</li>
        <li>Journal technique : 90 jours. Notifications lues : 180 jours. Journal de sécurité : durée du compte.</li>
        <li>Sauvegardes chiffrées : 30 jours glissants.</li>
        <li>Pièces comptables liées à l’abonnement : 10 ans (obligation légale), conservées par notre prestataire de paiement.</li>
      </ul>

      <h2>Vos droits</h2>
      <p>
        Vous disposez d’un droit d’accès, de rectification, d’effacement, de limitation, d’opposition et de portabilité de vos données, ainsi que du
        droit de définir des directives sur leur sort après votre décès. Depuis « Profil et paramètres », vous pouvez exporter toutes vos données
        (format JSON), retirer un accès accordé à l’assistance et supprimer votre compte vous-même ; vous pouvez aussi écrire à {LEGAL.dpoEmail}.
        Nous répondons dans un délai d’un mois. Vous pouvez également introduire une réclamation auprès de la CNIL (www.cnil.fr).
      </p>

      <h2>Sécurité</h2>
      <p>
        Connexions chiffrées (HTTPS), stockage chiffré, isolation des données par utilisateur, mots de passe robustes et authentification à deux
        facteurs disponible. Voir la page <Link to="/securite">Sécurité</Link>.
      </p>

      <h2>Cookies</h2>
      <p>
        Voir notre <Link to="/cookies">politique relative aux cookies</Link>.
      </p>
    </LegalPage>
  )
}

export function CookiesPage() {
  return (
    <LegalPage title="Cookies et traceurs" updatedAt={TERMS_UPDATED_AT} intro="Economiz n’utilise aucun cookie publicitaire ni de mesure d’audience.">
      <h2>Ce que nous utilisons</h2>
      <p>
        Pour vous garder connecté, Economiz enregistre un jeton de session dans le stockage local de votre navigateur. Ce traceur est strictement
        nécessaire au fonctionnement du service : il est exempté de consentement et aucun bandeau n’est donc nécessaire.
      </p>
      <table>
        <thead>
          <tr>
            <th>Nom</th>
            <th>Finalité</th>
            <th>Durée</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>sb-…-auth-token</td>
            <td>Maintenir votre session de connexion</td>
            <td>Jusqu’à la déconnexion</td>
          </tr>
        </tbody>
      </table>

      <h2>Ce que nous n’utilisons pas</h2>
      <ul>
        <li>Aucun cookie publicitaire ou de ciblage.</li>
        <li>Aucun outil de mesure d’audience tiers.</li>
        <li>Aucun bouton de partage de réseau social déposant des traceurs.</li>
      </ul>
      <p>Si cela devait changer, votre consentement serait demandé au préalable et cette page serait mise à jour.</p>

      <h2>Supprimer ces données</h2>
      <p>Vous déconnecter supprime le jeton de session. Vous pouvez aussi effacer les données du site depuis les réglages de votre navigateur.</p>
    </LegalPage>
  )
}

export function LegalNoticePage() {
  return (
    <LegalPage title="Mentions légales" updatedAt={TERMS_UPDATED_AT}>
      <h2>Éditeur</h2>
      <ul>
        <li>Raison sociale : {LEGAL.companyName}</li>
        <li>Forme juridique et capital : {LEGAL.legalForm} — {LEGAL.shareCapital}</li>
        <li>Immatriculation : {LEGAL.registration}</li>
        <li>TVA intracommunautaire : {LEGAL.vatNumber}</li>
        <li>Siège social : {LEGAL.address}</li>
        <li>Directeur de la publication : {LEGAL.publicationDirector}</li>
        <li>Contact : {LEGAL.contactEmail}</li>
      </ul>

      <h2>Hébergement</h2>
      <ul>
        <li>Application web : {LEGAL.frontendHost}</li>
        <li>Données : {LEGAL.dataHost}</li>
      </ul>

      <h2>Propriété intellectuelle</h2>
      <p>
        La marque {LEGAL.productName}, le logo, les textes et l’interface du service sont protégés. Toute reproduction sans autorisation est
        interdite.
      </p>

      <h2>Médiation</h2>
      <p>Médiateur de la consommation : {LEGAL.mediator}.</p>
    </LegalPage>
  )
}

export function SubscriptionPage() {
  const paid = usePublicPlans().filter((p) => p.monthly_price_cents > 0)
  return (
    <LegalPage title="Abonnement et résiliation" updatedAt={TERMS_UPDATED_AT} intro="Comment fonctionnent les offres payantes, et comment les arrêter simplement.">
      <h2>Les offres</h2>
      <ul>
        <li>
          <strong>Découverte</strong> : gratuite, sans limite de durée ni carte bancaire.
        </li>
        {paid.map((p) => (
          <li key={p.id}>
            <strong>{p.name}</strong> : {formatEuros(p.monthly_price_cents)} par mois{p.yearly_price_cents ? ` ou ${formatEuros(p.yearly_price_cents)} par an` : ''}, TTC.
          </li>
        ))}
      </ul>

      <h2>Souscription et paiement</h2>
      <p>
        L’abonnement se souscrit depuis votre espace. Le paiement est traité par notre prestataire de paiement sécurisé : nous ne conservons jamais
        votre numéro de carte. Un récapitulatif vous est envoyé par email.
      </p>

      <h2>Renouvellement</h2>
      <p>
        L’abonnement se renouvelle automatiquement à chaque échéance (mensuelle ou annuelle). Pour un abonnement annuel, un rappel vous est envoyé
        avant le renouvellement.
      </p>

      <h2>Résilier</h2>
      <ol>
        <li>Ouvrez « Profil et paramètres », puis « Mon abonnement ».</li>
        <li>Choisissez « Résilier mon abonnement » : l’écran de résiliation de notre prestataire de paiement s’ouvre directement.</li>
        <li>Confirmez la résiliation. Une confirmation vous est affichée et envoyée par email.</li>
      </ol>
      <p>
        La résiliation est sans frais et prend effet à la fin de la période déjà payée : vous gardez l’accès à votre offre jusqu’à cette date, puis
        votre compte repasse sur l’offre Découverte. Vos données sont conservées.
      </p>

      <h2>Droit de rétractation</h2>
      <p>
        Vous disposez de {WITHDRAWAL_DAYS} jours à compter de la souscription pour vous rétracter, sans avoir à vous justifier. Si vous avez commencé
        à utiliser les fonctionnalités payantes pendant ce délai à votre demande expresse, le montant correspondant à la période utilisée peut être
        retenu. Pour exercer ce droit, <Link to="/contact">contactez-nous</Link> en choisissant le sujet « Mon abonnement ».
      </p>

      <h2>Changer d’offre</h2>
      <p>
        Vous pouvez passer de la formule mensuelle à la formule annuelle (ou l’inverse) depuis « Gérer mon abonnement » : la différence est
        calculée au prorata par notre prestataire de paiement.
      </p>

      <h2>Échec de paiement et remboursement</h2>
      <p>
        Si un prélèvement échoue, vous êtes prévenu par email et dans l’application, et votre accès est maintenu pendant les nouvelles tentatives
        de paiement. Sans régularisation, l’abonnement prend fin et votre compte repasse sur l’offre Découverte, sans perte de données. En cas
        de rétractation, l’abonnement est clôturé et remboursé, et l’accès Premium prend fin.
      </p>
    </LegalPage>
  )
}
