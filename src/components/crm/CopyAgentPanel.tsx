import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, Sparkles, Check, X, Copy, FileText, Video } from 'lucide-react';

interface NPAEventoLite {
  id: string;
  nome: string;
  data_evento: string | null;
  local: string | null;
  valor_ingresso: number | null;
  slogan: string | null;
  professor_convidado: string | null;
}

interface Draft {
  id: string;
  npa_evento_id: string | null;
  tipo: 'anuncio_texto' | 'video_roteiro';
  titulo: string | null;
  conteudo: string;
  status: 'rascunho' | 'aprovado' | 'descartado';
  created_at: string;
}

const fmtData = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
};

// ─── Geração de copy baseada em template (sem custo de API) ────────────────
// Quando o Pedro tiver a chave da OpenAI configurada, isso pode ser trocado
// por uma chamada real ao GPT sem mudar nada no resto do fluxo -- o contrato
// (evento + tom + gancho -> lista de textos) continua igual.

const GANCHOS: Record<string, string[]> = {
  urgencia: ['Vagas acabando', 'Últimas vagas', 'Turma quase fechada'],
  curiosidade: ['Você já parou pra pensar', 'O que ninguém te conta sobre', 'Isso vai mudar sua forma de ver'],
  prova_social: ['Mais de {n} pessoas já', 'A turma que está lotando', 'O evento que todo mundo comenta'],
  direto: ['Garanta sua vaga', 'Chegou a sua vez', 'É hoje que você decide'],
};

function gerarAnuncios(evento: NPAEventoLite, tom: string): string[] {
  const cidade = evento.local?.split(' - ').pop()?.trim() || evento.local || '';
  const dataLabel = fmtData(evento.data_evento);
  const preco = evento.valor_ingresso ? `R$${evento.valor_ingresso.toFixed(2).replace('.', ',')}` : '';
  const ganchos = GANCHOS[tom] ?? GANCHOS.direto;

  return ganchos.map((g) => {
    const gancho = g.replace('{n}', '500');
    return [
      `${gancho}! 🚨`,
      ``,
      `${evento.nome}${dataLabel ? ` — ${dataLabel}` : ''}${cidade ? `, ${cidade}` : ''}.`,
      evento.slogan ? `${evento.slogan}` : `Uma imersão presencial de autoconhecimento que vai te transformar de verdade.`,
      ``,
      preco ? `Por apenas ${preco} você garante sua vaga.` : `Vagas limitadas, garanta a sua.`,
      `Ferramentas práticas, certificado e material de apoio inclusos.`,
      ``,
      `👉 Clica no botão e garante sua vaga agora.`,
    ].join('\n');
  });
}

function gerarRoteiroVideo(evento: NPAEventoLite, tom: string): string {
  const cidade = evento.local?.split(' - ').pop()?.trim() || evento.local || '';
  const dataLabel = fmtData(evento.data_evento);
  const preco = evento.valor_ingresso ? `R$${evento.valor_ingresso.toFixed(2).replace('.', ',')}` : '';

  return [
    `ROTEIRO — ${evento.nome} (tom: ${tom})`,
    `Para: Rodrygo gravar`,
    ``,
    `[GANCHO — primeiros 3 segundos, olhando pra câmera]`,
    `"Se você mora em ${cidade || 'sua cidade'} e ainda não conhece isso, presta atenção."`,
    ``,
    `[DESENVOLVIMENTO]`,
    `"No dia ${dataLabel || '[DATA]'} eu vou estar em ${cidade || '[CIDADE]'} para o ${evento.nome}.`,
    `É uma imersão presencial de dia inteiro, onde você vai sair com ferramentas reais de autoconhecimento —`,
    `não é teoria, é prática. ${evento.professor_convidado ? `Com ${evento.professor_convidado}.` : ''}"`,
    ``,
    `[QUEBRA DE OBJEÇÃO]`,
    `"E não, você não precisa saber nada sobre o assunto antes. É pra todo mundo que quer se entender melhor."`,
    ``,
    `[CTA — olhando pra câmera, direto]`,
    `"${preco ? `Por ${preco}` : 'Por um valor simbólico'} você garante sua vaga. Link na bio / comentário. Vagas limitadas, não deixa pra depois."`,
    ``,
    `[Observação de produção: gravar em local com boa luz natural, câmera na altura dos olhos, roupa neutra]`,
  ].join('\n');
}

export function CopyAgentPanel() {
  const [eventos, setEventos] = useState<NPAEventoLite[]>([]);
  const [eventoId, setEventoId] = useState<string>('');
  const [tipo, setTipo] = useState<'anuncio_texto' | 'video_roteiro'>('anuncio_texto');
  const [tom, setTom] = useState('urgencia');
  const [gerando, setGerando] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loadingDrafts, setLoadingDrafts] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState<'rascunho' | 'aprovado' | 'todos'>('rascunho');

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('npa_eventos')
        .select('id, nome, data_evento, local, valor_ingresso, slogan, professor_convidado')
        .eq('ativo', true)
        .order('data_evento', { ascending: true });
      if (data) {
        setEventos(data as NPAEventoLite[]);
        if (data.length > 0) setEventoId(data[0].id);
      }
    })();
  }, []);

  const carregarDrafts = useCallback(async () => {
    setLoadingDrafts(true);
    let query = supabase.from('idm_ads_copy_drafts').select('*').order('created_at', { ascending: false });
    if (filtroStatus !== 'todos') query = query.eq('status', filtroStatus);
    const { data } = await query;
    if (data) setDrafts(data as Draft[]);
    setLoadingDrafts(false);
  }, [filtroStatus]);

  useEffect(() => { carregarDrafts(); }, [carregarDrafts]);

  const handleGerar = async () => {
    const evento = eventos.find(e => e.id === eventoId);
    if (!evento) return;
    setGerando(true);

    const novos: { npa_evento_id: string; tipo: string; titulo: string; conteudo: string; status: string }[] = [];

    if (tipo === 'anuncio_texto') {
      const textos = gerarAnuncios(evento, tom);
      textos.forEach((texto, i) => {
        novos.push({
          npa_evento_id: evento.id,
          tipo: 'anuncio_texto',
          titulo: `${evento.nome} — variação ${i + 1} (${tom})`,
          conteudo: texto,
          status: 'rascunho',
        });
      });
    } else {
      const roteiro = gerarRoteiroVideo(evento, tom);
      novos.push({
        npa_evento_id: evento.id,
        tipo: 'video_roteiro',
        titulo: `${evento.nome} — roteiro (${tom})`,
        conteudo: roteiro,
        status: 'rascunho',
      });
    }

    await supabase.from('idm_ads_copy_drafts').insert(novos);
    await carregarDrafts();
    setGerando(false);
  };

  const atualizarStatusDraft = async (id: string, status: 'aprovado' | 'descartado') => {
    await supabase.from('idm_ads_copy_drafts').update({ status }).eq('id', id);
    setDrafts(prev => filtroStatus === 'todos' ? prev.map(d => d.id === id ? { ...d, status } : d) : prev.filter(d => d.id !== id));
  };

  const copiar = (texto: string) => {
    navigator.clipboard.writeText(texto);
  };

  return (
    <div className="rounded-2xl border border-gray-100 p-5 shadow-sm bg-white">
      <div className="mb-4">
        <h2 className="text-base font-black text-gray-900 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-purple-500" />
          Agente de Copy
        </h2>
        <p className="text-xs text-gray-400 mt-0.5">
          Gera rascunhos de anúncio ou roteiro de vídeo — você aprova antes de qualquer coisa ir pro ar.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mb-4">
        <Select value={eventoId} onValueChange={setEventoId}>
          <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Evento" /></SelectTrigger>
          <SelectContent>
            {eventos.map(e => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={tipo} onValueChange={(v) => setTipo(v as typeof tipo)}>
          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="anuncio_texto">Anúncio (texto)</SelectItem>
            <SelectItem value="video_roteiro">Roteiro de vídeo</SelectItem>
          </SelectContent>
        </Select>

        <Select value={tom} onValueChange={setTom}>
          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="urgencia">Urgência</SelectItem>
            <SelectItem value="curiosidade">Curiosidade</SelectItem>
            <SelectItem value="prova_social">Prova social</SelectItem>
            <SelectItem value="direto">Direto ao ponto</SelectItem>
          </SelectContent>
        </Select>

        <Button onClick={handleGerar} disabled={gerando || !eventoId} className="h-9 gap-1.5 bg-purple-600 hover:bg-purple-700">
          {gerando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Gerar
        </Button>
      </div>

      <div className="flex items-center gap-2 mb-3">
        {(['rascunho', 'aprovado', 'todos'] as const).map(s => (
          <button
            key={s}
            onClick={() => setFiltroStatus(s)}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold capitalize transition-colors ${
              filtroStatus === s ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {loadingDrafts ? (
        <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-gray-300" /></div>
      ) : drafts.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">Nenhum rascunho ainda.</p>
      ) : (
        <div className="space-y-3">
          {drafts.map(d => (
            <div key={d.id} className="rounded-xl border border-gray-100 p-3 bg-gray-50/50">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  {d.tipo === 'video_roteiro' ? <Video className="h-3.5 w-3.5 text-gray-400 shrink-0" /> : <FileText className="h-3.5 w-3.5 text-gray-400 shrink-0" />}
                  <p className="text-xs font-semibold text-gray-700 truncate">{d.titulo}</p>
                </div>
                <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  d.status === 'aprovado' ? 'bg-green-50 text-green-700' :
                  d.status === 'descartado' ? 'bg-gray-100 text-gray-400' : 'bg-amber-50 text-amber-700'
                }`}>{d.status}</span>
              </div>
              <Textarea
                readOnly
                value={d.conteudo}
                className="text-xs font-mono bg-white resize-none mb-2"
                rows={d.tipo === 'video_roteiro' ? 10 : 6}
              />
              {d.status === 'rascunho' && (
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" className="gap-1 text-green-700 border-green-200 hover:bg-green-50" onClick={() => atualizarStatusDraft(d.id, 'aprovado')}>
                    <Check className="h-3.5 w-3.5" /> Aprovar
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1 text-gray-500" onClick={() => atualizarStatusDraft(d.id, 'descartado')}>
                    <X className="h-3.5 w-3.5" /> Descartar
                  </Button>
                  <Button size="sm" variant="ghost" className="gap-1 ml-auto" onClick={() => copiar(d.conteudo)}>
                    <Copy className="h-3.5 w-3.5" /> Copiar
                  </Button>
                </div>
              )}
              {d.status === 'aprovado' && (
                <Button size="sm" variant="ghost" className="gap-1" onClick={() => copiar(d.conteudo)}>
                  <Copy className="h-3.5 w-3.5" /> Copiar pra gerar a peça
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
