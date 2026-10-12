import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom'
import { AppLayout, RequireAuth } from '@/components/layout/app-layout'
import { PublicLayout } from '@/components/layout/public-layout'
import { AuthLayout } from '@/features/auth/auth-layout'
import {
  AuthConfirmPage,
  CheckEmailPage,
  ForgotPasswordPage,
  MfaChallengePage,
  ResetPasswordPage,
  SignInPage,
  SignUpPage,
} from '@/features/auth/auth-pages'
import { NotFoundPage, RouteErrorPage } from '@/features/errors/error-pages'
import { LandingPage } from '@/features/landing/landing-page'
import { ContactPage } from '@/features/public/contact-page'
import { FaqPage } from '@/features/public/faq-page'
import { FeaturesPage } from '@/features/public/features-page'
import { CookiesPage, LegalNoticePage, PrivacyPage, SubscriptionPage, TermsPage } from '@/features/public/legal-pages'
import { PricingPage } from '@/features/public/pricing-page'
import { SecurityPage } from '@/features/public/security-page'

const publicRoutes: RouteObject[] = [
  { index: true, element: <LandingPage /> },
  { path: 'fonctionnalites', element: <FeaturesPage /> },
  { path: 'tarifs', element: <PricingPage /> },
  { path: 'securite', element: <SecurityPage /> },
  { path: 'faq', element: <FaqPage /> },
  { path: 'contact', element: <ContactPage /> },
  { path: 'cgu', element: <TermsPage /> },
  { path: 'confidentialite', element: <PrivacyPage /> },
  { path: 'cookies', element: <CookiesPage /> },
  { path: 'mentions-legales', element: <LegalNoticePage /> },
  { path: 'abonnement-resiliation', element: <SubscriptionPage /> },
]

if (import.meta.env.DEV) {
  publicRoutes.push({
    path: 'design',
    lazy: async () => ({ Component: (await import('@/features/design-system/design-system-page')).DesignSystemPage }),
  })
}

// Les pages de l’espace connecté sont chargées à la demande (premier affichage plus léger).
export const routes: RouteObject[] = [
  {
    errorElement: <RouteErrorPage />,
    children: [
      {
        element: <PublicLayout />,
        children: [...publicRoutes, { path: '*', element: <NotFoundPage /> }],
      },
      {
        element: <AuthLayout />,
        children: [
          { path: 'connexion', element: <SignInPage /> },
          { path: 'connexion/verification', element: <MfaChallengePage /> },
          { path: 'inscription', element: <SignUpPage /> },
          { path: 'verifier-email', element: <CheckEmailPage /> },
          { path: 'mot-de-passe-oublie', element: <ForgotPasswordPage /> },
          { path: 'reinitialiser-mot-de-passe', element: <ResetPasswordPage /> },
          { path: 'auth/confirmation', element: <AuthConfirmPage /> },
        ],
      },
      {
        path: 'app',
        element: <RequireAuth />,
        children: [
          {
            element: <AppLayout />,
            children: [
              { index: true, lazy: async () => ({ Component: (await import('@/features/app/bilan-page')).BilanPage }) },
              { path: 'bienvenue', lazy: async () => ({ Component: (await import('@/features/app/welcome-page')).WelcomePage }) },
              { path: 'budget', lazy: async () => ({ Component: (await import('@/features/app/budget-page')).BudgetPage }) },
              { path: 'releves', lazy: async () => ({ Component: (await import('@/features/app/statements-page')).StatementsPage }) },
              { path: 'releves/:id', lazy: async () => ({ Component: (await import('@/features/app/review-page')).ReviewPage }) },
              { path: 'depenses', lazy: async () => ({ Component: (await import('@/features/app/expenses-page')).ExpensesPage }) },
              { path: 'coach', lazy: async () => ({ Component: (await import('@/features/app/coach-page')).CoachPage }) },
              { path: 'objectifs', lazy: async () => ({ Component: (await import('@/features/app/goals-page')).GoalsPage }) },
              { path: 'progression', lazy: async () => ({ Component: (await import('@/features/app/progress-page')).ProgressPage }) },
              { path: 'progression/:period', lazy: async () => ({ Component: (await import('@/features/app/monthly-report-page')).MonthlyReportPage }) },
              { path: 'parametres', lazy: async () => ({ Component: (await import('@/features/app/account-page')).AccountPage }) },
              { path: 'abonnement', lazy: async () => ({ Component: (await import('@/features/app/subscription-page')).SubscriptionPage }) },
              { path: 'compte', element: <Navigate to="/app/parametres" replace /> },
            ],
          },
        ],
      },
      {
        path: 'admin',
        element: <RequireAuth />,
        children: [
          {
            lazy: async () => ({ Component: (await import('@/features/admin/admin-layout')).AdminLayout }),
            children: [
              { index: true, lazy: async () => ({ Component: (await import('@/features/admin/admin-overview')).AdminOverviewPage }) },
              { path: 'ia', lazy: async () => ({ Component: (await import('@/features/admin/admin-overview')).AdminAiPage }) },
              { path: 'assistance', lazy: async () => ({ Component: (await import('@/features/admin/admin-support')).AdminSupportPage }) },
              { path: 'technique', lazy: async () => ({ Component: (await import('@/features/admin/admin-technical')).AdminTechnicalPage }) },
              { path: 'offres', lazy: async () => ({ Component: (await import('@/features/admin/admin-settings')).AdminPlansPage }) },
              { path: 'faq', lazy: async () => ({ Component: (await import('@/features/admin/admin-settings')).AdminFaqPage }) },
              { path: 'securite', lazy: async () => ({ Component: (await import('@/features/admin/admin-settings')).AdminSecurityPage }) },
              { path: 'equipe', lazy: async () => ({ Component: (await import('@/features/admin/admin-settings')).AdminTeamPage }) },
            ],
          },
        ],
      },
    ],
  },
]

export const router = createBrowserRouter(routes)
