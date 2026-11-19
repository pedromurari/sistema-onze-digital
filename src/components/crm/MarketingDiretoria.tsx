import { useCallback, useEffect, useState } from 'react';
import { CalendarCheck2, Clapperboard, Clock3, DollarSign, Heart, Megaphone, MessageCircle, RefreshCw, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { SectionBar, StatTile } from '@/components/crm/ui/premium';

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

interface IgPost {
  post_id: string;
  ig_username: string;
  caption: string | null;
  like_count: number;
  comments_count: number;
  permalink: string | null;
  publicado_em: string | null;
  atualizado_em: string;
}

const ETAPAS = [
  { id: 'ideia', label: 'Planejado' },
  { id: 'roteiro', label: 'Roteiro' },
  { id: 'gravando', label: 'Em criação' },
  { id: 'editando', label: 'Em revisão' },
  { id: 'aprovado', label: 'Aprovado' },
  { id: 'agendado', label: 'Programado' },
  { id: 'publicado', label: 'Publicado' },
] as const;

const GRUPO_MARKETING_URL = 'https://chat.whatsapp.com/EiK326SLt4Q71qfFOO4CbW';

const DECISOES = [
  { titulo: 'Um único pipeline editorial', texto: 'Reels, vídeos, posts estáticos e carrosséis usam o mesmo Kanban de Social Media. O formato é um filtro, não outro quadro.' },
  { titulo: 'Publicação ainda manual', texto: 'Mover para Programado organiza a data no calendário; mover para Publicado registra o trabalho concluído. Nenhuma das duas ações publica automaticamente no Instagram.' },
  { titulo: 'Mídia e aprovação', texto: 'Antes de programar ou publicar, conferir arquivo/link, legenda e data. A passagem por aprovação deve ser revisada pela equipe responsável.' },
  { titulo: 'Tráfego pago é outra frente', texto: 'O Gestor de Tráfego acompanha Meta Ads e regras de automação. A conexão de anúncios não autoriza postagem orgânica automática.' },
  { titulo: 'Responsabilidades', texto: 'Pedro acompanha prioridades como Diretor de Marketing; a gerência operacional está vaga. O fluxo de conteúdo deve permitir trabalho de social media e editor sem abrir o restante do CRM.' },
];

function intervaloMesBrasil() {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
  const ano = Number(partes.find(p => p.type === 'year')?.value);
  const mes = Number(partes.find(p => p.type === 'month')?.value);
  return {
    inicio: `${ano}-${String(mes).padStart(2, '0')}-01`,
    fim: `${mes === 12 ? ano + 1 : ano}-${String(mes === 12 ? 1 : mes + 1).padStart(2, '0')}-01`,
  };
}

export function MarketingDiretoria() {
  const [contagens, setContagens] = useState<Record<string, number>>({});
  const [publicadosMes, setPublicadosMes] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const [gastoTrafego, setGastoTrafego] = useState<number | null>(null);
  const [leadsTrafego, setLeadsTrafego] = useState<number | null>(null);
  const [erroTrafego, setErroTrafego] = useState('');
  const [carregandoTrafego, setCarregandoTrafego] = useState(true);

  const [posts, setPosts] = useState<IgPost[]>([]);
  const [atualizadoEmIg, setAtualizadoEmIg] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    const { inicio, fim } = intervaloMesBrasil();
    const [porEtapa, publicados] = await Promise.all([
      Promise.all(ETAPAS.map(etapa => supabase.from('conteudo_calendario').select('id', { count: 'exact', head: true }).eq('status', etapa.id))),
      supabase.from('conteudo_calendario').select('id', { count: 'exact', head: true })
        .eq('status', 'publicado').gte('data_publicacao', inicio).lt('data_publicacao', fim),
    ]);
    const falha = porEtapa.find(res => res.error)?.error ?? publicados.error;
    if (falha) {
      setErro('Não foi possível carregar os indicadores de conteúdo. Confira seu acesso e tente novamente.');
    } else {
      setContagens(Object.fromEntries(ETAPAS.map((etapa, i) => [etapa.id, porEtapa[i].count ?? 0])));
      setPublicadosMes(publicados.count ?? 0);
    }
    setCarregando(false);
  }, []);

  const carregarTrafego = useCallback(async () => {
    setCarregandoTrafego(true);
    setErroTrafego('');
    const { data, error } = await supabase.functions.invoke('meta-ads', { body: { action: 'listar', dias: 30 } });
    if (error || !data?.ok) {
      setErroTrafego(data?.error || error?.message || 'Não foi possível carregar os dados de tráfego pago.');
      setGastoTrafego(null);
      setLeadsTrafego(null);
    } else {
      const moeda = data.conta?.moeda ?? 'BRL';
      const totais = (data.campanhas as any[]).reduce(
        (acc, c) => ({
          gasto: acc.gasto + (moeda === 'BRL' ? c.gasto : (c.gasto_brl ?? c.gasto)),
          leads: acc.leads + c.leads,
        }),
        { gasto: 0, leads: 0 },
      );
      setGastoTrafego(totais.gasto);
      setLeadsTrafego(totais.leads);
    }
    setCarregandoTrafego(false);
  }, []);

  const carregarInstagram = useCallback(async () => {
    const { data } = await supabase.from('trafego_ig_posts_cache').select('*').order('publicado_em', { ascending: false }).limit(5);
    if (data) {
      setPosts(data);
      setAtualizadoEmIg(data[0]?.atualizado_em ?? null);
    }
  }, []);

  useEffect(() => {
    void carregar();
    void carregarTrafego();
    void carregarInstagram();
  }, [carregar, carregarTrafego, carregarInstagram]);

  const emProducao = ['ideia', 'roteiro', 'gravando', 'editando'].reduce((total, etapa) => total + (contagens[etapa] ?? 0), 0);

  return <div className="min-h-full bg-background p-4 sm:p-6 lg:p-8">
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><Megaphone className="h-5 w-5" /></div><h1 className="text-2xl font-bold tracking-tight">Diretoria — DP Marketing</h1></div>
          <p className="max-w-3xl text-sm text-muted-foreground">Acompanhe o pipeline de conteúdo do IDM e decida onde a produção precisa avançar. Dados do Social Media; playbook abaixo.</p>
        </div>
        <Button variant="outline" onClick={() => { void carregar(); void carregarTrafego(); void carregarInstagram(); }} disabled={carregando || carregandoTrafego}><RefreshCw className="mr-2 h-4 w-4" />Atualizar</Button>
      </header>

      {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
      <Card className="border-border/70 shadow-sm"><CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
        <div><h2 className="flex items-center gap-2 text-sm font-semibold"><MessageCircle className="h-4 w-4 text-primary" />Grupo do departamento de Marketing</h2><p className="mt-1 text-xs text-muted-foreground">Canal indicado por Pedro para alinhamento da equipe. Os roteiros de gravação ficam em Social Media.</p><p className="mt-1 text-xs text-muted-foreground">Avisos para os grupos de departamento: enviar por +55 11 93043-9385 (ADM do IDM / instância Instituto Despertamente), nunca por um número pessoal.</p></div>
        <Button asChild variant="outline"><a href={GRUPO_MARKETING_URL} target="_blank" rel="noopener noreferrer">Abrir grupo no WhatsApp</a></Button>
      </CardContent></Card>
      <section aria-label="Indicadores de marketing" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Em produção" value={carregando ? '—' : emProducao} icon={Clapperboard} />
        <StatTile label="Em revisão" value={carregando ? '—' : contagens.editando ?? 0} icon={Clock3} tom={(contagens.editando ?? 0) > 0 ? 'atencao' : 'padrao'} />
        <StatTile label="Prontos / programados" value={carregando ? '—' : `${contagens.aprovado ?? 0} / ${contagens.agendado ?? 0}`} icon={CalendarCheck2} />
        <StatTile label="Marcados como publicados no mês" value={carregando ? '—' : publicadosMes} hint="Pela data editorial; não confirma publicação na rede" icon={Megaphone} tom="bom" />
      </section>

      <Card className="border-border/70 shadow-sm"><CardContent className="space-y-3 p-4 sm:p-5">
        <SectionBar title="Pipeline editorial" subtitle="Quantidade atual em cada etapa do Kanban único de Social Media." icon={Clapperboard} />
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{ETAPAS.map(etapa => <div key={etapa.id} className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 p-3 text-sm"><span>{etapa.label}</span><strong className="tabular-nums">{carregando ? '—' : contagens[etapa.id] ?? 0}</strong></div>)}</div>
      </CardContent></Card>

      <Card className="border-border/70 shadow-sm"><CardContent className="space-y-3 p-4 sm:p-5">
        <SectionBar title="Tráfego pago" subtitle="Últimos 30 dias, conta Onze Digital USA #02. Dados ao vivo do Gestor de Tráfego." icon={DollarSign} />
        {erroTrafego && <p role="alert" className="text-sm text-destructive">{erroTrafego}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <StatTile label="Gasto (30d)" value={carregandoTrafego ? '—' : gastoTrafego !== null ? fmtBRL(gastoTrafego) : '—'} icon={DollarSign} />
          <StatTile label="Leads (30d)" value={carregandoTrafego ? '—' : leadsTrafego ?? '—'} icon={Users} />
        </div>
      </CardContent></Card>

      <Card className="border-border/70 shadow-sm"><CardContent className="space-y-3 p-4 sm:p-5">
        <SectionBar
          title="Instagram — engajamento"
          subtitle={`@institutodespertamente, últimos posts. ${atualizadoEmIg ? `Foto de ${new Date(atualizadoEmIg).toLocaleDateString('pt-BR')} — não atualiza sozinho ainda (precisa de permissão instagram_basic no token).` : 'Sem dados ainda.'}`}
          icon={Heart}
        />
        {posts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum post em cache ainda.</p>
        ) : (
          <div className="space-y-2">
            {posts.map(post => (
              <a
                key={post.post_id}
                href={post.permalink ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 p-3 text-sm hover:bg-muted/40 transition-colors"
              >
                <span className="truncate flex-1 text-xs text-muted-foreground">{post.caption ?? '(sem legenda)'}</span>
                <span className="shrink-0 flex items-center gap-3 text-xs font-medium">
                  <span className="flex items-center gap-1"><Heart className="h-3 w-3" />{post.like_count}</span>
                  <span className="flex items-center gap-1"><MessageCircle className="h-3 w-3" />{post.comments_count}</span>
                </span>
              </a>
            ))}
          </div>
        )}
      </CardContent></Card>

      <Card className="border-border/70 shadow-sm"><CardContent className="space-y-3 p-4 sm:p-5">
        <SectionBar title="Playbook e decisões" icon={Megaphone} />
        <div className="grid gap-3 sm:grid-cols-2">{DECISOES.map(decisao => <div key={decisao.titulo} className="rounded-xl border border-border/60 bg-muted/20 p-3"><h3 className="text-sm font-semibold">{decisao.titulo}</h3><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{decisao.texto}</p></div>)}</div>
      </CardContent></Card>
    </div>
  </div>;
}
