'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { updateNpaEventoAdmin, type NpaEventoAdmin } from '@/lib/actions/npaPresencial'

function escolherEventoPadrao(eventos: NpaEventoAdmin[]): NpaEventoAdmin | null {
  if (eventos.length === 0) return null
  const hoje = Date.now()
  const ativos = eventos.filter((e) => e.ativo && e.data_evento)
  const base = ativos.length > 0 ? ativos : eventos

  return [...base].sort((a, b) => {
    if (!a.data_evento) return 1
    if (!b.data_evento) return -1
    const da = Math.abs(new Date(a.data_evento).getTime() - hoje)
    const db = Math.abs(new Date(b.data_evento).getTime() - hoje)
    return da - db
  })[0]
}

export function NpaPresencialAdminClient({ initialEventos }: { initialEventos: NpaEventoAdmin[] }) {
  const [eventos, setEventos] = useState(initialEventos)
  const [selecionadoId, setSelecionadoId] = useState('')
  const [slug, setSlug] = useState('')
  const [ebookUrl, setEbookUrl] = useState('')
  const [telasUrl, setTelasUrl] = useState('')
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    const padrao = escolherEventoPadrao(initialEventos)
    if (padrao) setSelecionadoId(padrao.id)
  }, [initialEventos])

  const selecionado = useMemo(
    () => eventos.find((e) => e.id === selecionadoId) ?? null,
    [eventos, selecionadoId]
  )

  useEffect(() => {
    if (!selecionado) return
    setSlug(selecionado.slug ?? '')
    setEbookUrl(selecionado.ebook_url ?? '')
    setTelasUrl(selecionado.telas_url ?? '')
  }, [selecionado])

  function atualizarLocal(atualizado: NpaEventoAdmin) {
    setEventos((prev) => prev.map((e) => (e.id === atualizado.id ? atualizado : e)))
  }

  function salvar(
    patch: Parameters<typeof updateNpaEventoAdmin>[1],
    sucesso: string
  ) {
    if (!selecionado) return
    startTransition(async () => {
      try {
        const atualizado = await updateNpaEventoAdmin(selecionado.id, patch)
        atualizarLocal(atualizado)
        toast.success(sucesso)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Erro ao salvar.')
      }
    })
  }

  const linkPublico = selecionado?.slug
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/npa-presencial/${selecionado.slug}`
    : ''

  return (
    <div className="max-w-lg mx-auto py-8 px-4">
      <h1 className="font-display text-2xl text-foreground mb-1">NPA Presencial</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Escolha a edição/cidade, configure os links e libere as telas quando quiser.
      </p>

      {eventos.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum evento NPA cadastrado.</p>
      )}

      {eventos.length > 0 && (
        <>
          <label className="block text-xs text-muted-foreground mb-1.5">Evento / cidade</label>
          <select
            value={selecionadoId}
            onChange={(e) => setSelecionadoId(e.target.value)}
            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
          >
            {eventos.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome} {e.data_evento ? `— ${e.data_evento}` : ''}
              </option>
            ))}
          </select>

          {selecionado && (
            <div className="mt-6 flex flex-col gap-4">
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">
                  Slug (caminho da URL)
                </label>
                <Input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="npa-17-campinas"
                />
                {linkPublico && (
                  <p className="text-[11px] text-muted-foreground mt-1 break-all">{linkPublico}</p>
                )}
              </div>

              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">
                  Link do e-book <span className="normal-case">(opcional — o e-book é sempre o mesmo, deixe em branco pra usar o padrão)</span>
                </label>
                <Input
                  value={ebookUrl}
                  onChange={(e) => setEbookUrl(e.target.value)}
                  placeholder="/materiais/ebook-numerologia-do-destino.pdf"
                />
              </div>

              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">Link das telas</label>
                <Input
                  value={telasUrl}
                  onChange={(e) => setTelasUrl(e.target.value)}
                  placeholder="https://..."
                />
              </div>

              <Button
                variant="outline"
                disabled={isPending}
                onClick={() => salvar({ slug, ebook_url: ebookUrl, telas_url: telasUrl }, 'Links salvos.')}
              >
                Salvar links
              </Button>

              {!selecionado.telas_liberado ? (
                <Button
                  disabled={isPending}
                  onClick={() =>
                    salvar(
                      { slug, ebook_url: ebookUrl, telas_url: telasUrl, telas_liberado: true },
                      'Telas liberadas!'
                    )
                  }
                >
                  Liberar telas agora
                </Button>
              ) : (
                <Button
                  variant="destructive"
                  disabled={isPending}
                  onClick={() => salvar({ telas_liberado: false }, 'Telas bloqueadas de novo.')}
                >
                  Bloquear de novo
                </Button>
              )}

              {selecionado.telas_liberado && selecionado.telas_liberado_em && (
                <p className="text-[11px] text-muted-foreground">
                  Liberado em {new Date(selecionado.telas_liberado_em).toLocaleString('pt-BR')}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
