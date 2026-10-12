import { Ban, Calculator, Database, FileLock2, KeyRound, ShieldCheck, Trash2, UserCheck, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Container } from '@/components/layout/container'
import { Card } from '@/components/ui/card'
import { CallToAction, PageHero, Prose } from './page-parts'

const COMMITMENTS: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Ban, title: 'Jamais vos identifiants bancaires', text: 'Economiz ne se connecte pas à votre banque et ne vous demandera jamais vos codes d’accès. Vous choisissez les relevés que vous importez.' },
  { icon: FileLock2, title: 'Relevés dans un espace privé', text: 'Vos fichiers sont stockés dans un espace chiffré, accessible uniquement depuis votre compte.' },
  { icon: Database, title: 'Données isolées', text: 'Chaque donnée est rattachée à votre compte et protégée par des règles d’accès en base : aucun autre utilisateur ne peut la consulter.' },
  { icon: KeyRound, title: 'Connexion protégée', text: 'Mots de passe robustes, vérification de l’adresse email et authentification à deux facteurs disponible.' },
  { icon: Calculator, title: 'Calculs vérifiables', text: 'Vos indicateurs sont calculés par un moteur déterministe. L’IA explique les résultats, elle ne les invente pas.' },
  { icon: UserCheck, title: 'Aucune revente', text: 'Vos données ne sont ni vendues, ni louées, ni utilisées à des fins publicitaires.' },
  { icon: Trash2, title: 'Suppression en un clic', text: 'Supprimez votre compte depuis vos paramètres : vos relevés et toutes vos données sont effacés.' },
  { icon: ShieldCheck, title: 'Hébergement européen', text: 'Base de données et fichiers hébergés dans l’Union européenne (Francfort).' },
]

export function SecurityPage() {
  return (
    <>
      <PageHero
        eyebrow="Sécurité et confidentialité"
        title="Vos finances sont personnelles. Nous les traitons comme telles."
        intro="La sécurité de vos données n’est pas une option : elle est intégrée à chaque étape, de l’import de vos relevés à la suppression de votre compte."
      />
      <Container className="py-14 sm:py-20">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {COMMITMENTS.map((c) => (
            <Card key={c.title} className="p-5">
              <c.icon className="size-5 text-primary" aria-hidden />
              <h2 className="mt-3 font-semibold">{c.title}</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">{c.text}</p>
            </Card>
          ))}
        </div>

        <Prose className="mt-16">
          <h2>Ce qui se passe quand vous importez un relevé</h2>
          <ol>
            <li>Le fichier PDF est envoyé dans votre espace de stockage privé, via une connexion chiffrée (HTTPS).</li>
            <li>Nos serveurs vérifient qu’il s’agit d’un PDF lisible, puis en extraient le texte.</li>
            <li>Vos données d’identification (nom, IBAN, numéros de compte et de carte, coordonnées) sont masquées, puis le texte est structuré en opérations (date, libellé, montant). Seuls les 4 derniers chiffres de votre numéro de compte sont conservés.</li>
            <li>Les montants sont contrôlés avec les soldes indiqués sur le relevé, pour détecter toute erreur de lecture.</li>
            <li>Vous confirmez les seules opérations ambiguës. Vous pouvez supprimer un relevé et ses opérations à tout moment.</li>
          </ol>

          <h2>Intelligence artificielle</h2>
          <p>
            L’IA intervient pour lire la structure de vos relevés et répondre à vos questions. Elle est appelée uniquement depuis nos
            serveurs, jamais depuis votre navigateur. Avant toute transmission, votre identité de titulaire, votre IBAN, vos numéros de
            compte et de carte, ainsi que vos emails et téléphones présents sur le relevé sont masqués : seuls les dates, libellés et
            montants des opérations sont analysés. Exception : un relevé scanné (image) ne peut pas être masqué au préalable ; il n’est lu par reconnaissance de caractères qu’avec votre accord explicite, document par document. Notre prestataire s’engage à ne pas utiliser ces données pour entraîner ses modèles.
          </p>

          <h2>Vos droits</h2>
          <p>
            Vous pouvez accéder à vos données, les corriger ou les supprimer à tout moment. Pour en savoir plus, consultez notre{' '}
            <Link to="/confidentialite">politique de confidentialité</Link> ou <Link to="/contact">contactez-nous</Link>.
          </p>
        </Prose>
      </Container>
      <CallToAction />
    </>
  )
}
