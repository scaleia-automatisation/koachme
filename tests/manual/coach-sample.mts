import { createTestUser, deleteTestUser } from '../helpers.ts'
const u = await createTestUser('coach-sample')
try {
  await u.client.from('budget_entries').insert([
    { category_code: 'salaire', amount_cents: 250000 }, { category_code: 'logement', amount_cents: 85000 },
    { category_code: 'alimentation', amount_cents: 42000 }, { category_code: 'abonnements', amount_cents: 6500 },
    { category_code: 'restaurants_livraisons', amount_cents: 22000 }, { category_code: 'credits_consommation', amount_cents: 18000 },
  ])
  const r = await u.client.functions.invoke('coach', { body: { message: 'Puis-je acheter un vélo à 900 € sans déséquilibrer mon budget ?' } })
  console.log(JSON.stringify({ answer: r.data.message.content, ...r.data.message.structured }, null, 2))
} finally { await deleteTestUser(u) }
