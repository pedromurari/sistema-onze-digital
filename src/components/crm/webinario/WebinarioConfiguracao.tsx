import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { excluirMensagem, listarMensagens, salvarMensagem, salvarWebinario, type MensagemChat, type Webinario } from './webinario-data';
import roteiroEscuta from '../../../../docs/campanhas/WEBINARIO-01-ESCUTA.md?raw';
import roteiroPadroes from '../../../../docs/campanhas/WEBINARIO-02-PADROES.md?raw';
import roteiroFormacao from '../../../../docs/campanhas/WEBINARIO-03-FORMACAO.md?raw';
import producaoEscuta from '../../../../docs/campanhas/WEBINARIO-01-PRODUCAO.md?raw';
import producaoPadroes from '../../../../docs/campanhas/WEBINARIO-02-PRODUCAO.md?raw';
import producaoFormacao from '../../../../docs/campanhas/WEBINARIO-03-PRODUCAO.md?raw';

const ROTEIROS: Record<string, string> = {
  'escuta-psicanalitica': roteiroEscuta,
  'padroes-emocionais': roteiroPadroes,
  'formacao-psicanalise': roteiroFormacao,
};
const PRODUCAO: Record<string, string> = {
  'escuta-psicanalitica': producaoEscuta,
  'padroes-emocionais': producaoPadroes,
  'formacao-psicanalise': producaoFormacao,
};

type Formulario = {
  nome: string; slug: string; video_url: string; captura_video_url: string; video_duracao_segundos: string;
  oferta_offset_segundos: string; grupo_whatsapp_url: string; ativo: boolean;
};
const doWebinario = (item: Webinario): Formulario => ({
  nome: item.nome, slug: item.slug, video_url: item.video_url ?? '', captura_video_url: item.captura_video_url ?? '',
  video_duracao_segundos: item.video_duracao_segundos?.toString() ?? '',
  oferta_offset_segundos: item.oferta_offset_segundos?.toString() ?? '',
  grupo_whatsapp_url: item.grupo_whatsapp_url ?? '', ativo: item.ativo,
});
const urlValida = (valor: string) => !valor || (() => { try { return new URL(valor).protocol === 'https:'; } catch { return false; } })();

export function WebinarioConfiguracao({ webinario, podeEditar, onSaved }: { webinario: Webinario; podeEditar: boolean; onSaved: () => void }) {
  const [form, setForm] = useState(() => doWebinario(webinario));
  const [mensagens, setMensagens] = useState<MensagemChat[]>([]);
  const [rascunho, setRascunho] = useState({ segundo: '', autor_nome: '', texto: '' });
  const [salvando, setSalvando] = useState(false);
  const [salvandoMensagem, setSalvandoMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);

  const recarregarMensagens = useCallback(async () => {
    try { setMensagens(await listarMensagens(webinario.id)); setErro(''); }
    catch (error) { setErro(error instanceof Error ? error.message : 'Erro ao carregar mensagens.'); }
    finally { setCarregando(false); }
  }, [webinario.id]);
  useEffect(() => { void recarregarMensagens(); }, [recarregarMensagens]);

  async function salvarConfiguracao(event: FormEvent) {
    event.preventDefault();
    if (!podeEditar || salvando) return;
    const duracao = form.video_duracao_segundos ? Number(form.video_duracao_segundos) : null;
    const oferta = form.oferta_offset_segundos ? Number(form.oferta_offset_segundos) : null;
    if (!form.nome.trim() || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug)) return setErro('Informe nome e slug válido (letras minúsculas, números e hífen).');
    if (!urlValida(form.video_url) || !urlValida(form.captura_video_url) || !urlValida(form.grupo_whatsapp_url)) return setErro('Os links precisam começar com https://.');
    if ((duracao != null && (!Number.isInteger(duracao) || duracao <= 0)) || (oferta != null && (!Number.isInteger(oferta) || oferta < 0 || (duracao != null && oferta > duracao)))) return setErro('Confira a duração e o segundo da oferta.');
    setSalvando(true); setErro('');
    try {
      await salvarWebinario(webinario.id, {
        nome: form.nome.trim(), slug: form.slug, video_url: form.video_url.trim() || null,
        captura_video_url: form.captura_video_url.trim() || null,
        video_duracao_segundos: duracao, oferta_offset_segundos: oferta,
        grupo_whatsapp_url: form.grupo_whatsapp_url.trim() || null, ativo: form.ativo,
      });
      toast.success('Configuração salva.');
      onSaved();
    } catch (error) { setErro(error instanceof Error ? error.message : 'Não foi possível salvar.'); }
    finally { setSalvando(false); }
  }

  async function gravarMensagem(valores: { segundo: number; autor_nome: string; texto: string }, id?: string) {
    if (!podeEditar || salvandoMensagem) return;
    if (!Number.isInteger(valores.segundo) || valores.segundo < 0 || !valores.autor_nome.trim() || !valores.texto.trim()) {
      setErro('Preencha segundo válido, autor e mensagem.'); return;
    }
    setSalvandoMensagem(id ?? 'nova'); setErro('');
    try {
      await salvarMensagem(webinario.id, { segundo: valores.segundo, autor_nome: valores.autor_nome.trim(), texto: valores.texto.trim() }, id);
      if (!id) setRascunho({ segundo: '', autor_nome: '', texto: '' });
      await recarregarMensagens(); toast.success(id ? 'Mensagem atualizada.' : 'Mensagem adicionada.');
    } catch (error) { setErro(error instanceof Error ? error.message : 'Não foi possível salvar a mensagem.'); }
    finally { setSalvandoMensagem(null); }
  }

  async function removerMensagem(id: string) {
    if (!podeEditar || !window.confirm('Excluir esta mensagem do roteiro?')) return;
    setSalvandoMensagem(id);
    try { await excluirMensagem(id); await recarregarMensagens(); toast.success('Mensagem removida.'); }
    catch (error) { setErro(error instanceof Error ? error.message : 'Não foi possível excluir.'); }
    finally { setSalvandoMensagem(null); }
  }

  return <div className="space-y-4">
    {!podeEditar && <p className="rounded-lg border p-3 text-sm text-muted-foreground">Seu acesso é somente para consulta. Peça a permissão de edição do Webinário para alterar estes dados.</p>}
    {erro && <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{erro}</p>}
    <Card><CardHeader><CardTitle className="text-base">Dados do webinário</CardTitle></CardHeader><CardContent>
      <form onSubmit={(event) => void salvarConfiguracao(event)} className="space-y-4"><fieldset disabled={!podeEditar || salvando} className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2"><Label htmlFor="web-nome">Nome</Label><Input id="web-nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required /></div>
        <div className="space-y-1"><Label htmlFor="web-slug">Slug da página</Label><Input id="web-slug" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} required /><p className="text-xs text-muted-foreground">Alterar o slug quebra links de cadastro já divulgados.</p></div>
        <div className="space-y-1"><Label htmlFor="web-grupo">Link do grupo WhatsApp</Label><Input id="web-grupo" type="url" value={form.grupo_whatsapp_url} onChange={(e) => setForm({ ...form, grupo_whatsapp_url: e.target.value })} placeholder="https://..." /></div>
        <div className="space-y-1 sm:col-span-2"><Label htmlFor="web-video">URL do vídeo no R2</Label><Input id="web-video" type="url" value={form.video_url} onChange={(e) => setForm({ ...form, video_url: e.target.value })} placeholder="https://..." /><p className="text-xs text-muted-foreground">Use o vídeo real do webinário; o vídeo atual pode ser apenas um placeholder.</p></div>
        <div className="space-y-1 sm:col-span-2"><Label htmlFor="web-captura-video">URL do vídeo curto da captura</Label><Input id="web-captura-video" type="url" value={form.captura_video_url} onChange={(e) => setForm({ ...form, captura_video_url: e.target.value })} placeholder="https://..." /><p className="text-xs text-muted-foreground">Aparece acima do formulário da página pública quando a gravação curta estiver pronta. Não substitui a aula longa.</p></div>
        <div className="space-y-1"><Label htmlFor="web-duracao">Duração do vídeo (segundos)</Label><Input id="web-duracao" type="number" min="1" value={form.video_duracao_segundos} onChange={(e) => setForm({ ...form, video_duracao_segundos: e.target.value })} /></div>
        <div className="space-y-1"><Label htmlFor="web-oferta">Mostrar oferta no segundo</Label><Input id="web-oferta" type="number" min="0" value={form.oferta_offset_segundos} onChange={(e) => setForm({ ...form, oferta_offset_segundos: e.target.value })} /></div>
        <label className="flex min-h-11 items-center gap-3 sm:col-span-2"><Switch checked={form.ativo} onCheckedChange={(valor) => setForm({ ...form, ativo: valor })} /> Ativo para novos cadastros</label>
      </fieldset><Button type="submit" disabled={!podeEditar || salvando} className="w-full sm:w-auto">{salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Salvar configuração</Button></form>
    </CardContent></Card>
    <Card><CardHeader><CardTitle className="text-base">Mensagens roteirizadas do chat</CardTitle><p className="text-sm text-muted-foreground">Aparecem na sala conforme o segundo do vídeo. Não são mensagens reais de espectadores.</p></CardHeader><CardContent className="space-y-4">
      {carregando && <Loader2 className="h-4 w-4 animate-spin" />}
      {mensagens.map((item) => <MensagemEditavel key={item.id} mensagem={item} disabled={!podeEditar || Boolean(salvandoMensagem)} onSave={gravarMensagem} onDelete={removerMensagem} />)}
      {mensagens.length === 0 && !carregando && <p className="text-sm text-muted-foreground">Nenhuma mensagem cadastrada.</p>}
      <div className="space-y-2 rounded-lg border border-dashed p-3"><p className="text-sm font-medium">Nova mensagem</p>
        <div className="grid gap-2 sm:grid-cols-[110px_180px_1fr]"><Input aria-label="Segundo da nova mensagem" type="number" min="0" placeholder="Segundo" value={rascunho.segundo} onChange={(e) => setRascunho({ ...rascunho, segundo: e.target.value })} disabled={!podeEditar} /><Input aria-label="Autor da nova mensagem" placeholder="Autor" value={rascunho.autor_nome} onChange={(e) => setRascunho({ ...rascunho, autor_nome: e.target.value })} disabled={!podeEditar} /><Textarea aria-label="Texto da nova mensagem" placeholder="Mensagem" value={rascunho.texto} onChange={(e) => setRascunho({ ...rascunho, texto: e.target.value })} disabled={!podeEditar} /></div>
        <Button type="button" variant="outline" disabled={!podeEditar || Boolean(salvandoMensagem) || !rascunho.segundo.trim()} className="w-full sm:w-auto" onClick={() => void gravarMensagem({ segundo: Number(rascunho.segundo), autor_nome: rascunho.autor_nome, texto: rascunho.texto })}><Plus className="mr-2 h-4 w-4" />Adicionar</Button>
      </div>
    </CardContent></Card>
    {ROTEIROS[webinario.slug] && <Card><CardHeader><CardTitle className="text-base">Roteiro da aula · Rodrygo e Jocimara</CardTitle><p className="text-sm text-muted-foreground">Texto para revisão dos dois apresentadores e do pedagógico antes da gravação.</p></CardHeader><CardContent>
      <details className="rounded-lg border p-3"><summary className="cursor-pointer font-medium">Abrir roteiro completo</summary>
        <pre className="mt-3 max-h-[70vh] overflow-auto whitespace-pre-wrap break-words text-sm font-sans leading-relaxed">{ROTEIROS[webinario.slug]}</pre>
      </details>
    </CardContent></Card>}
    {PRODUCAO[webinario.slug] && <Card><CardHeader><CardTitle className="text-base">Pacote de produção · captura, anúncio e intervenções</CardTitle><p className="text-sm text-muted-foreground">Copy completa do vídeo curto e do anúncio, estratégia AIDA e perguntas-guia sincronizadas à aula.</p></CardHeader><CardContent>
      <details className="rounded-lg border p-3"><summary className="cursor-pointer font-medium">Abrir pacote completo</summary>
        <pre className="mt-3 max-h-[70vh] overflow-auto whitespace-pre-wrap break-words text-sm font-sans leading-relaxed">{PRODUCAO[webinario.slug]}</pre>
      </details>
    </CardContent></Card>}
  </div>;
}

function MensagemEditavel({ mensagem, disabled, onSave, onDelete }: { mensagem: MensagemChat; disabled: boolean; onSave: (valores: { segundo: number; autor_nome: string; texto: string }, id: string) => Promise<void>; onDelete: (id: string) => Promise<void> }) {
  const [segundo, setSegundo] = useState(String(mensagem.segundo));
  const [autor, setAutor] = useState(mensagem.autor_nome);
  const [texto, setTexto] = useState(mensagem.texto);
  return <div className="space-y-2 rounded-lg border p-3"><div className="grid gap-2 sm:grid-cols-[110px_180px_1fr]">
    <Input aria-label="Segundo da mensagem" type="number" min="0" value={segundo} onChange={(e) => setSegundo(e.target.value)} disabled={disabled} />
    <Input aria-label="Autor da mensagem" value={autor} onChange={(e) => setAutor(e.target.value)} disabled={disabled} />
    <Textarea aria-label="Texto da mensagem" value={texto} onChange={(e) => setTexto(e.target.value)} disabled={disabled} />
  </div><div className="flex gap-2"><Button type="button" size="sm" variant="outline" disabled={disabled || !segundo.trim()} onClick={() => void onSave({ segundo: Number(segundo), autor_nome: autor, texto }, mensagem.id)}>Salvar</Button><Button type="button" size="sm" variant="ghost" className="text-destructive" disabled={disabled} onClick={() => void onDelete(mensagem.id)} aria-label="Excluir mensagem"><Trash2 className="h-4 w-4" /></Button></div></div>;
}
