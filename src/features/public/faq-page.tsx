import { ChevronDown } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { DEFAULT_FAQ } from '@/config/faq'
import { supabase } from '@/lib/supabase'
import { Container } from '@/components/layout/container'
import { CallToAction, PageHero } from './page-parts'

/** FAQ publiée depuis l'administration ; contenu par défaut si la base est injoignable. */
function useFaq() {
  const faq = useQuery({
    queryKey: ['faq_items'],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('faq_items').select('section, question, answer, sort_order').eq('is_published', true).order('sort_order')
      if (error) throw error
      const sections: typeof DEFAULT_FAQ = []
      for (const row of data) {
        let section = sections.find((s) => s.section === row.section)
        if (!section) sections.push((section = { section: row.section, items: [] }))
        section.items.push({ q: row.question, a: row.answer })
      }
      return sections
    },
  })
  return faq.data?.length ? faq.data : DEFAULT_FAQ
}

export function FaqPage() {
  const FAQ = useFaq()
  return (
    <>
      <PageHero eyebrow="FAQ" title="Questions fréquentes" intro="Les réponses aux questions que l’on nous pose le plus souvent." />
      <Container className="py-14 sm:py-20">
        <div className="mx-auto max-w-3xl space-y-12">
          {FAQ.map((s) => (
            <section key={s.section}>
              <h2 className="text-xl font-semibold tracking-tight">{s.section}</h2>
              <div className="mt-4 divide-y divide-border rounded-xl border border-border bg-surface">
                {s.items.map((item) => (
                  <details key={item.q} className="group">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-medium [&::-webkit-details-marker]:hidden">
                      {item.q}
                      <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
                    </summary>
                    <p className="px-5 pb-5 text-[0.9375rem] text-muted-foreground">{item.a}</p>
                  </details>
                ))}
              </div>
            </section>
          ))}
          <p className="text-center text-muted-foreground">
            Vous ne trouvez pas votre réponse ?{' '}
            <Link to="/contact" className="font-medium text-primary underline-offset-4 hover:underline">
              Contactez-nous
            </Link>
          </p>
        </div>
      </Container>
      <CallToAction />
    </>
  )
}
