// Client Stripe (clé secrète exclusivement côté serveur).
import Stripe from 'npm:stripe@17.7.0'

export function stripeConfigured(): boolean {
  return Boolean(Deno.env.get('STRIPE_SECRET_KEY'))
}

export function stripeClient(): Stripe {
  // Sans clé, le client sert uniquement à vérifier la signature des webhooks.
  return new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || 'sk_test_non_configure', {
    httpClient: Stripe.createFetchHttpClient(),
  })
}

export const cryptoProvider = Stripe.createSubtleCryptoProvider()
export type { Stripe }
