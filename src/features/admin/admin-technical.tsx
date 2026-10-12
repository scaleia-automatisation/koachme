// Erreurs techniques (journal sans donnée sensible) et imports en échec
// (métadonnées seulement : jamais le fichier ni son contenu).
import { useState } from 'react'
import { ErrorState, LoadingState } from '@/components/feedback/states'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select } from '@/components/ui/form-controls'
import { IMPORT_ERRORS } from '@/features/app/import-meta'
import { useAppLogs, useFailedImports } from './admin-api'

const dateTime = (iso: string) => new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })

export function AdminTechnicalPage() {
  const [level, setLevel] = useState<'all' | 'error' | 'warn'>('error')
  const logs = useAppLogs(level)
  const failed = useFailedImports()

  const byCode = new Map<string, number>()
  for (const f of failed.data ?? []) byCode.set(f.error_code ?? 'inconnu', (byCode.get(f.error_code ?? 'inconnu') ?? 0) + 1)

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Erreurs et imports</h1>

      <Card>
        <CardHeader>
          <CardTitle>Imports en échec</CardTitle>
          <CardDescription>Les 100 derniers. Le contenu des relevés n’est jamais visible ; pour aider un utilisateur, demandez-lui d’accorder un accès temporaire.</CardDescription>
        </CardHeader>
        <CardContent>
          {failed.isLoading ? (
            <LoadingState />
          ) : failed.error ? (
            <ErrorState onRetry={() => void failed.refetch()} />
          ) : !failed.data?.length ? (
            <p className="text-sm text-muted-foreground">Aucun import en échec.</p>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap gap-2">
                {[...byCode.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .map(([code, n]) => (
                    <Badge key={code} tone="danger">
                      {IMPORT_ERRORS[code]?.title ?? code} · {n}
                    </Badge>
                  ))}
              </div>
              <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Imports en échec">
                <table className="w-full min-w-[36rem] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="py-2 font-medium">Date</th>
                      <th className="py-2 font-medium">Erreur</th>
                      <th className="py-2 font-medium">Méthode</th>
                      <th className="py-2 text-right font-medium">Tentatives</th>
                      <th className="py-2 text-right font-medium">Taille</th>
                      <th className="py-2 font-medium">Utilisateur</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {failed.data.map((f) => (
                      <tr key={f.id}>
                        <td className="py-2">{dateTime(f.created_at)}</td>
                        <td className="py-2">{f.error_code ?? '—'}</td>
                        <td className="py-2">{f.extraction_method ?? '—'}</td>
                        <td className="tabular py-2 text-right">{f.attempts}</td>
                        <td className="tabular py-2 text-right">{Math.round(f.file_size / 1024)} Ko</td>
                        <td className="py-2 font-mono text-xs text-muted-foreground">{f.user_id.slice(0, 8)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Journal technique</CardTitle>
            <CardDescription>Conservé 90 jours. Ne contient ni donnée bancaire, ni contenu de relevé, ni message utilisateur.</CardDescription>
          </div>
          <Select aria-label="Niveau" className="w-40" value={level} onChange={(e) => setLevel(e.target.value as typeof level)}>
            <option value="error">Erreurs</option>
            <option value="warn">Avertissements</option>
            <option value="all">Tout</option>
          </Select>
        </CardHeader>
        <CardContent>
          {logs.isLoading ? (
            <LoadingState />
          ) : logs.error ? (
            <ErrorState onRetry={() => void logs.refetch()} />
          ) : !logs.data?.length ? (
            <p className="text-sm text-muted-foreground">Rien à signaler.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {logs.data.map((l) => (
                <li key={l.id} className="py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={l.level === 'error' ? 'danger' : l.level === 'warn' ? 'warning' : 'neutral'}>{l.level}</Badge>
                    <span className="font-medium">{l.source}</span>
                    <span className="font-mono text-xs">{l.code}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{dateTime(l.created_at)}</span>
                  </div>
                  {l.message && <p className="mt-1 text-muted-foreground">{l.message}</p>}
                  {Object.keys(l.context ?? {}).length > 0 && <pre className="mt-1 overflow-x-auto rounded bg-muted px-2 py-1 text-xs">{JSON.stringify(l.context)}</pre>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  )
}
