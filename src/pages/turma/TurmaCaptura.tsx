import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Flame, CalendarDays, Clock, CheckCircle2, Gift, Users, ShieldCheck,
  Eye, HeartPulse, Sparkles, Quote, HelpCircle, ArrowRight, Play, X,
  Instagram, Facebook, Youtube, Star,
} from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { carregarPixel, trackPixel } from '../webinario/meta-pixel';

const FUNCTIONS_URL = 'https://usqiyekfmwwnvkmkdlej.supabase.co/functions/v1';
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;

const LOGO = 'https://pub-da74b2ec5ddf4847a6f20dec2e542925.r2.dev/turma-assets/logo-idm.png';
const FOTO_RODRYGO = 'https://pub-da74b2ec5ddf4847a6f20dec2e542925.r2.dev/turma-assets/rodrygo.png';
const FOTO_JOCIMARAH = 'https://pub-da74b2ec5ddf4847a6f20dec2e542925.r2.dev/turma-assets/jocimarah.png';
const VIDEO_POSTER = 'https://pub-da74b2ec5ddf4847a6f20dec2e542925.r2.dev/vsl/semana-do-despertar-poster.jpg';
const VIDEO_URL = 'https://pub-da74b2ec5ddf4847a6f20dec2e542925.r2.dev/vsl/semana-do-despertar.mp4';
const LINK_EBOOK = 'https://drive.google.com/file/d/1Wk04rk8msKuEV5loMZa8Iilpowsn3BKq/view?usp=sharing';
const LINK_INSTAGRAM = 'https://www.instagram.com/institutodespertamente/';
const LINK_FACEBOOK = 'https://www.facebook.com/institutodespertamente';
const LINK_YOUTUBE = 'https://www.youtube.com/@institutodespertamente';
const LINK_11DIGITAL = 'https://www.onzedigitalstrategy.com.br/';

// Mesmo conteúdo evergreen usado em todas as turmas do Curso Gratuito --
// não muda por turma, só a copy/datas/link no topo mudam.
const PILARES: Record<number, { titulo: string; itens: string[]; icone: typeof Eye }> = {
  1: { titulo: 'O DESPERTAR', itens: ['Teoria do APARELHO', 'Teoria ESTRUTURAL', 'Portas para o INCONSCIENTE'], icone: Eye },
  2: { titulo: 'A CURA', itens: ['Heranças traumáticas', 'Narcisista – Efeitos da Falta e do Excesso', 'Psicanálise Aplicada à Autoestima'], icone: HeartPulse },
  3: { titulo: 'A REVELAÇÃO', itens: ['Pulsão de morte', 'O efeito do ESTRESSE', 'Atos SUICIDAS'], icone: Sparkles },
};

// Mesmos depoimentos da página de Psicanálise do site institucional
// (apps/membros/.../PsicanaliseContent.tsx), servidos do R2 -- nunca YouTube.
// Vídeos verticais (9:16). Mudou lá, muda aqui.
const R2_DEPOIMENTOS = 'https://pub-da74b2ec5ddf4847a6f20dec2e542925.r2.dev/site/depoimentos';
const DEPOIMENTOS = [
  { id: 'wDQiV0VoBT4', frase: 'Transformei minha vida através da psicanálise.' },
  { id: 'dep-2026-11-24-1', frase: 'O curso de Psicanálise Integrativa me abriu uma nova carreira.' },
  { id: 'g5-wCsj1D_0', frase: 'O método integrativo me deu ferramentas práticas que uso no dia a dia.' },
  { id: 'dep-2026-11-24-2', frase: 'Foi uma jornada fantástica. Vale a pena investir no IDM.' },
  { id: 'B_lpIOk1RQo', frase: 'A metodologia do iDM é única e transformadora.' },
  { id: 'aYncgEhrXgs', frase: 'O iDM me deu as bases que eu precisava como psicanalista.' },
];

const FAQ: [string, string][] = [
  ['O evento é realmente gratuito?', 'Sim! O curso é 100% gratuito. Não há taxas ocultas ou cobranças. Você terá acesso completo às 3 aulas ao vivo, certificado de participação e material complementar sem nenhum custo.'],
  ['Como posso participar do evento?', 'Após se inscrever, você receberá por e-mail e WhatsApp o link do YouTube onde as aulas acontecerão ao vivo. Também enviaremos lembretes antes de cada aula para que você não perca nenhum conteúdo.'],
  ['Preciso ter conhecimento prévio sobre Psicanálise para participar?', 'Não! O curso foi desenvolvido tanto para iniciantes quanto para quem já tem algum conhecimento na área. Nossa metodologia é didática e acessível, permitindo que qualquer pessoa aprenda.'],
  ['O evento será presencial ou online?', 'O evento é 100% online e ao vivo pelo YouTube. Isso permite que você participe de qualquer lugar do Brasil ou do mundo, precisando apenas de uma conexão com a internet.'],
  ['Vou receber algum material complementar?', 'Sim! Além das aulas ao vivo, você receberá o ebook "Desenvolvimento da Personalidade", certificado de participação e materiais complementares para aprofundar seus estudos.'],
  ['Quanto tempo dura o curso?', 'O curso acontece em 3 dias consecutivos, sempre às 20h. Cada aula tem duração aproximada de 2 horas, totalizando cerca de 6 horas de conteúdo exclusivo.'],
];

const FAQ_BLACK_FRIDAY: [string, string][] = [
  ['O que muda nessa edição de Black Friday?', 'Três coisas: cada aula tem um convidado diferente, o conteúdo foi remontado do zero (não é reprise de turma anterior) e, no encerramento da terceira aula, abrimos uma condição de Black Friday pra Formação Completa em Psicanálise, com bônus que não entram em nenhuma outra turma.'],
  ['Preciso pagar alguma coisa pra assistir às três aulas?', 'Não. As três aulas são gratuitas, com certificado e material inclusos. A condição de Black Friday é uma oferta opcional, apresentada só no fim da terceira noite pra quem quiser continuar na formação.'],
  ['Até quando vale a condição de Black Friday?', 'Ela é apresentada no encerramento da terceira aula e fica no ar por tempo limitado. Quem está inscrito recebe o aviso por WhatsApp e e-mail quando abrir e quando estiver perto de fechar.'],
];

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const DIAS_SEMANA_CURTO = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

// Fundo sólido padrão de todos os cards (nada de gradiente translúcido
// colorido sobre o navy -- em alguns monitores isso pisa pra um tom
// esverdeado/oliva, foi reportado e trocado por isso aqui).
const CARD_BG = 'bg-[#0d1b3d]';

interface Aula {
  numero: number;
  titulo: string;
  inicio_em: string;
  youtube_url: string | null;
}

interface TurmaInfo {
  nome: string;
  slogan: string | null;
  descricao: string | null;
  tema_campanha?: string | null;
}

// O que muda numa edicao tematica. A pagina e a mesma pra toda turma, entao
// nada disso pode ser hardcode solto -- so aparece quando a turma declara o
// tema no banco (lancamentos.tema_campanha).
const DIFERENCIAIS_BF: { titulo: string; texto: string; icone: typeof Eye }[] = [
  {
    titulo: 'Um convidado diferente por aula',
    texto: 'Cada uma das três noites tem um convidado próprio, com a bagagem clínica dele. Nenhuma turma anterior teve isso.',
    icone: Users,
  },
  {
    titulo: 'Conteúdo inédito',
    texto: 'Não é reprise do que já foi dado nas outras turmas. Os três temas foram remontados do zero pra esta edição.',
    icone: Sparkles,
  },
  {
    titulo: 'Condição de Black Friday na última aula',
    texto: 'No encerramento abrimos uma condição de Black Friday pra Formação Completa em Psicanálise, com bônus que não entram em nenhuma outra turma.',
    icone: Flame,
  },
];

function formatarDatasHero(aulas: Aula[]): string {
  if (aulas.length === 0) return '';
  const datas = aulas.map((a) => new Date(a.inicio_em));
  const dias = datas.map((d) => d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit' }));
  const mes = MESES[Number(datas[0].toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', month: 'numeric' })) - 1];
  const diasTxt = dias.length > 1 ? `${dias.slice(0, -1).join(', ')} E ${dias[dias.length - 1]}` : dias[0];
  return `${diasTxt} DE ${mes.toUpperCase()}`;
}

function diffParts(msRestantes: number) {
  const total = Math.max(0, Math.floor(msRestantes / 1000));
  return {
    dias: Math.floor(total / 86400),
    horas: Math.floor((total % 86400) / 3600),
    minutos: Math.floor((total % 3600) / 60),
    segundos: total % 60,
  };
}

function ContadorRegressivo({ alvo }: { alvo: string }) {
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const restante = new Date(alvo).getTime() - agora;
  if (restante <= 0) return null;
  const { dias, horas, minutos, segundos } = diffParts(restante);
  const unidades = [['Dias', dias], ['Horas', horas], ['Min', minutos], ['Seg', segundos]] as const;
  return (
    <div className="mt-5 flex justify-center lg:justify-start gap-2 sm:gap-3">
      {unidades.map(([rotulo, valor]) => (
        <div key={rotulo} className="w-16 sm:w-20 rounded-xl border border-amber-400/30 bg-[#0a1630] px-2 py-2.5 text-center shadow-[0_0_20px_-8px_rgba(251,191,36,0.5)]">
          <p className="text-xl sm:text-2xl font-extrabold text-amber-400 tabular-nums">{String(valor).padStart(2, '0')}</p>
          <p className="text-[10px] uppercase tracking-wide text-slate-400">{rotulo}</p>
        </div>
      ))}
    </div>
  );
}

function CalendarioMes({ aulas }: { aulas: Aula[] }) {
  if (aulas.length === 0) return null;
  const base = new Date(aulas[0].inicio_em);
  const ano = Number(base.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric' }));
  const mesIdx = Number(base.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', month: 'numeric' })) - 1;
  const diasDoMes = new Date(ano, mesIdx + 1, 0).getDate();
  const primeiroDiaSemana = new Date(ano, mesIdx, 1).getDay();
  const diasDasAulas = new Set(aulas.map((a) => Number(new Date(a.inicio_em).toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', day: 'numeric' }))));

  const celulas: (number | null)[] = [...Array(primeiroDiaSemana).fill(null), ...Array.from({ length: diasDoMes }, (_, i) => i + 1)];

  return (
    <div className={`w-full rounded-2xl border border-white/10 ${CARD_BG} p-6 shadow-xl`}>
      <p className="text-center text-base text-amber-400 font-bold mb-4 flex items-center justify-center gap-2">
        <CalendarDays className="h-5 w-5" />{MESES[mesIdx].charAt(0).toUpperCase() + MESES[mesIdx].slice(1)}, {ano} · Aulas ao vivo
      </p>
      <div className="grid grid-cols-7 gap-1.5 text-center">
        {DIAS_SEMANA_CURTO.map((d) => <div key={d} className="text-xs text-slate-400 font-bold py-1">{d}</div>)}
        {celulas.map((dia, i) => (
          <div
            key={i}
            className={`aspect-square flex items-center justify-center rounded-lg text-base transition-transform ${
              dia === null ? '' : diasDasAulas.has(dia)
                ? 'bg-amber-400 text-[#000a1f] font-bold shadow-[0_0_14px_rgba(251,191,36,0.65)] scale-105'
                : 'bg-white/5 text-slate-300'
            }`}
          >
            {dia ?? ''}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TurmaCaptura() {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const [turma, setTurma] = useState<TurmaInfo | null>(null);
  const [aulas, setAulas] = useState<Aula[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [cidade, setCidade] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [website, setWebsite] = useState(''); // honeypot
  const [videoTocando, setVideoTocando] = useState(false);
  const [depoimentoAberto, setDepoimentoAberto] = useState<string | null>(null);

  useEffect(() => { carregarPixel(); }, []);

  useEffect(() => {
    let ativo = true;
    fetch(`${FUNCTIONS_URL}/turma-registrar?slug=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!ativo) return;
        if (data.ok) {
          setTurma(data.lancamento);
          setAulas(data.aulas);
        }
        setCarregando(false);
      })
      .catch(() => ativo && setCarregando(false));
    return () => { ativo = false; };
  }, [slug]);

  // Fecha o pop-up de depoimento com Esc
  useEffect(() => {
    if (!depoimentoAberto) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDepoimentoAberto(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [depoimentoAberto]);

  const datasHero = useMemo(() => formatarDatasHero(aulas), [aulas]);
  const ehBlackFriday = turma?.tema_campanha === 'black_friday';

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (website) return; // honeypot: bot preencheu campo escondido
    if (!nome.trim() || whatsapp.replace(/\D/g, '').length < 10) {
      toast.error('Preencha nome e WhatsApp corretamente.');
      return;
    }
    setEnviando(true);
    try {
      const digitos = whatsapp.replace(/\D/g, '');
      const whatsappLimpo = `+55${digitos.startsWith('55') ? digitos.slice(2) : digitos}`;
      const params = new URLSearchParams(window.location.search);
      const utms = Object.fromEntries(UTM_KEYS.map((key) => [key, params.get(key) ?? '']));
      const res = await fetch(`${FUNCTIONS_URL}/turma-registrar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          nome: nome.trim(),
          email: email.trim() || undefined,
          whatsapp: whatsappLimpo,
          cidade: cidade.trim() || undefined,
          device: /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
          ...utms,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        toast.error('Não foi possível concluir sua inscrição. Tente novamente.');
        setEnviando(false);
        return;
      }
      // nome/e-mail/whatsapp vão só pra API de Conversões, hasheados no
      // servidor -- é o que permite a Meta casar o evento com a pessoa mesmo
      // quando o pixel do navegador é bloqueado.
      trackPixel('Lead', { content_name: `Turma ${slug}` }, {
        nome: nome.trim(),
        email: email.trim() || undefined,
        whatsapp: whatsappLimpo,
      });
      navigate(`/turma/${slug}/obrigado?nome=${encodeURIComponent(nome.trim())}`, { replace: true });
    } catch {
      toast.error('Erro de conexão. Tente novamente.');
      setEnviando(false);
    }
  };

  if (carregando) {
    return <div className="min-h-screen bg-[#000a1f] flex items-center justify-center"><p className="text-slate-300">Carregando...</p></div>;
  }

  if (!turma) {
    return <div className="min-h-screen bg-[#000a1f] flex items-center justify-center"><p className="text-slate-300">Turma não encontrada ou inscrições encerradas.</p></div>;
  }

  const formulario = (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input
        type="text" value={website} onChange={(e) => setWebsite(e.target.value)}
        autoComplete="off" tabIndex={-1} aria-hidden="true"
        style={{ position: 'absolute', left: '-9999px', width: 1, height: 1 }}
      />
      <input className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-slate-400 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/40 transition-colors"
        placeholder="Nome completo" autoComplete="name" required value={nome} onChange={(e) => setNome(e.target.value)} />
      <input className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-slate-400 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/40 transition-colors"
        type="email" placeholder="E-mail" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <div className="flex rounded-lg border border-white/10 bg-white/5 overflow-hidden focus-within:border-amber-400 focus-within:ring-1 focus-within:ring-amber-400/40 transition-colors">
        <span className="px-3 py-3 text-slate-300 border-r border-white/10 text-sm">BR +55</span>
        <input className="flex-1 bg-transparent px-3 py-3 text-white placeholder:text-slate-400 focus:outline-none" type="tel" inputMode="tel"
          placeholder="(99) 99999-9999" required maxLength={11} value={whatsapp}
          onChange={(e) => setWhatsapp(e.target.value.replace(/\D/g, '').slice(0, 11))} />
      </div>
      <input className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-slate-400 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/40 transition-colors"
        placeholder="Cidade" value={cidade} onChange={(e) => setCidade(e.target.value)} />
      <button type="submit" disabled={enviando}
        className="group w-full rounded-lg bg-gradient-to-r from-amber-400 to-amber-300 hover:from-amber-300 hover:to-amber-200 text-[#000a1f] font-bold py-3.5 text-base transition-all disabled:opacity-60 shadow-[0_8px_30px_-8px_rgba(251,191,36,0.6)] hover:shadow-[0_8px_40px_-6px_rgba(251,191,36,0.8)] flex items-center justify-center gap-2">
        {enviando ? 'INSCREVENDO...' : <>INSCREVER-SE AGORA! <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></>}
      </button>
      <p className="text-[11px] text-slate-400 leading-relaxed">
        De acordo com a lei 12.965/2014 e 13.709/2018, autorizo enviarem comunicações por e-mail ou qualquer outro meio e concordo com a política de privacidade.
      </p>
    </form>
  );

  return (
    <div className="min-h-screen bg-[#000a1f] text-slate-50 overflow-x-hidden">
      {/* HERO -- duas colunas no desktop (texto/oferta à esquerda, vídeo+form à direita), empilha no celular */}
      <section className="relative px-5 sm:px-8 lg:px-12 pt-8 pb-10 sm:pt-14 sm:pb-16 max-w-7xl mx-auto">
        <div className="pointer-events-none absolute -top-24 left-1/4 h-96 w-96 rounded-full bg-amber-400/15 blur-[120px]" aria-hidden="true" />
        <div className="pointer-events-none absolute top-40 right-0 h-72 w-72 rounded-full bg-purple-500/10 blur-[120px]" aria-hidden="true" />

        <div className="relative grid lg:grid-cols-[1.05fr_0.95fr] gap-10 lg:gap-16 items-start">
          {/* Coluna texto */}
          <div className="text-center lg:text-left">
            <img src={LOGO} alt="Instituto DespertaMente" className="h-16 w-16 object-contain mx-auto lg:mx-0 mb-5" />

            {ehBlackFriday && (
              <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-amber-400/50 bg-amber-400/10 px-4 py-1.5 text-xs font-bold tracking-widest text-amber-400">
                <Flame className="h-3.5 w-3.5 animate-pulse" /> EDIÇÃO BLACK FRIDAY
              </p>
            )}

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.1]">
              Curso Gratuito de<br /><span className="bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500 bg-clip-text text-transparent">{turma.nome.replace(/^Turma #\d+\s*/i, '') || 'Psicanálise Integrativa'}!</span>
            </h1>
            <p className="mt-5 text-slate-300 text-lg lg:text-xl max-w-xl mx-auto lg:mx-0">
              {ehBlackFriday
                ? 'Três aulas ao vivo, conteúdo inédito e um convidado diferente em cada noite. 100% gratuitas, com certificado e material.'
                : 'Uma sequência de 3 aulas ONLINE. 100% Gratuitas com Certificado + Material.'}
            </p>

            <div className={`mt-7 rounded-2xl border border-white/10 ${CARD_BG} px-6 py-5 shadow-xl max-w-md mx-auto lg:mx-0`}>
              <p className="text-amber-400 font-bold text-sm tracking-wide">{turma.nome.toUpperCase()}</p>
              <p className="text-xl font-bold mt-1">{datasHero}</p>
              {aulas[0] && (
                <p className="text-amber-400 text-sm font-semibold mt-1 flex items-center justify-center lg:justify-start gap-1.5">
                  <Clock className="h-3.5 w-3.5" /> AO VIVO NO YOUTUBE ÀS {new Date(aulas[0].inicio_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })} HORAS
                </p>
              )}
              {aulas[0] && (
                <>
                  <p className="text-[11px] uppercase tracking-widest text-slate-400 mt-4 text-center lg:text-left">Começa em</p>
                  <ContadorRegressivo alvo={aulas[0].inicio_em} />
                </>
              )}
            </div>

            {turma.descricao && (
              <div className="mt-6 rounded-2xl border border-amber-400/40 bg-[#1a1308] px-6 py-5 text-left shadow-[0_0_30px_-10px_rgba(251,191,36,0.35)] max-w-md mx-auto lg:mx-0">
                <p className="text-amber-400 font-bold text-sm mb-1.5 flex items-center gap-1.5">
                  <Flame className="h-4 w-4 animate-pulse" /> {ehBlackFriday ? 'O QUE TEM DE DIFERENTE' : 'EDIÇÃO ESPECIAL'}
                </p>
                <p className="text-slate-200 text-sm leading-relaxed">{turma.descricao}</p>
              </div>
            )}
          </div>

          {/* Coluna vídeo + formulário */}
          <div className="lg:sticky lg:top-8">
            <div className="relative w-full overflow-hidden rounded-2xl shadow-2xl border border-white/10 aspect-video bg-black">
              {videoTocando ? (
                // Pedido do Pedro: só o play. Sem controles: não pausa, não
                // adianta, não muda velocidade. Ao terminar, volta a capa.
                <video
                  src={VIDEO_URL}
                  autoPlay
                  playsInline
                  disablePictureInPicture
                  controlsList="nodownload noplaybackrate nofullscreen"
                  onContextMenu={(e) => e.preventDefault()}
                  onEnded={() => setVideoTocando(false)}
                  className="h-full w-full object-cover"
                />
              ) : (
                <button type="button" aria-label="Assistir ao vídeo" className="group relative block h-full w-full" onClick={() => setVideoTocando(true)}>
                  <img src={VIDEO_POSTER} alt="Capa do vídeo" className="h-full w-full object-cover" />
                  <div className="absolute inset-0 bg-black/30 transition-colors group-hover:bg-black/40" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="flex h-20 w-20 items-center justify-center rounded-full bg-amber-400/90 shadow-[0_0_40px_rgba(251,191,36,0.6)] transition-transform group-hover:scale-110 animate-pulse">
                      <Play className="h-9 w-9 translate-x-0.5 text-[#000a1f] fill-[#000a1f]" />
                    </span>
                  </div>
                </button>
              )}
            </div>

            <div id="cadastro" className={`mt-6 rounded-2xl border border-white/10 ${CARD_BG} p-6 text-left shadow-2xl`}>
              {formulario}
            </div>
            <p className="mt-4 text-sm text-slate-300 flex items-center justify-center gap-1.5 text-center">
              <Gift className="h-4 w-4 text-amber-400 shrink-0" /> Cadastre-se agora e ganhe o EBOOK: <span className="text-amber-400 font-semibold">Desenvolvimento da Personalidade</span>
            </p>
          </div>
        </div>
      </section>

      {/* CALENDÁRIO -- calendário e datas lado a lado no desktop */}
      <section className="px-5 sm:px-8 lg:px-12 py-10 sm:py-16 max-w-6xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-3xl sm:text-4xl font-bold">Quando será o Curso Gratuito?</h2>
          <p className="text-slate-300 mt-2 text-lg">Reserve esses três dias na sua agenda</p>
        </div>
        <div className="grid lg:grid-cols-[1fr_0.8fr] gap-8 items-start">
          <CalendarioMes aulas={aulas} />
          <div className="space-y-4">
            <p className="text-amber-400 font-bold tracking-wide text-sm">DATAS DAS AULAS</p>
            {aulas.map((aula) => {
              const d = new Date(aula.inicio_em);
              const diaMes = d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit' });
              const diaSemanaRaw = d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long' });
              const diaSemana = diaSemanaRaw.charAt(0).toUpperCase() + diaSemanaRaw.slice(1);
              const mesNome = MESES[Number(d.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', month: 'numeric' })) - 1];
              return (
                <div key={aula.numero} className={`flex items-center gap-4 rounded-2xl border border-white/10 ${CARD_BG} p-5 shadow-lg transition-transform hover:-translate-y-0.5 hover:shadow-xl`}>
                  <p className="text-4xl font-bold text-amber-400 w-16 shrink-0 text-center">{diaMes}</p>
                  <div>
                    <p className="font-semibold text-lg">{diaSemana} — Aula {String(aula.numero).padStart(2, '0')}</p>
                    <p className="text-slate-400 text-sm mt-0.5 capitalize">{mesNome} de {d.getFullYear()} · Online e Gratuito</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 3 PILARES */}
      <section className="px-5 sm:px-8 lg:px-12 py-10 sm:py-16 max-w-6xl mx-auto text-center">
        <h2 className="text-3xl sm:text-4xl font-bold">VEJA OS <span className="text-amber-400">3 PILARES</span> DO CURSO:</h2>
        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          {aulas.map((aula) => {
            const pilar = PILARES[aula.numero];
            const Icone = pilar?.icone ?? Sparkles;
            return (
              <div key={aula.numero} className={`rounded-2xl border border-amber-400/30 ${CARD_BG} p-7 text-left shadow-lg transition-transform hover:-translate-y-1 hover:shadow-[0_0_30px_-10px_rgba(251,191,36,0.5)]`}>
                <div className="h-12 w-12 rounded-xl bg-amber-400/15 border border-amber-400/30 flex items-center justify-center mb-4">
                  <Icone className="h-6 w-6 text-amber-400" />
                </div>
                <p className="text-amber-400 font-bold text-2xl mb-4">{pilar?.titulo ?? aula.titulo.toUpperCase()}</p>
                <ul className="space-y-3 text-base text-slate-200">
                  {(pilar?.itens ?? []).map((item) => (
                    <li key={item} className="flex items-start gap-2.5">
                      <CheckCircle2 className="h-5 w-5 text-amber-400/80 shrink-0 mt-0.5" />{item}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      {/* O QUE MUDA NESTA EDIÇÃO -- só em edição temática */}
      {ehBlackFriday && (
        <section className="px-5 sm:px-8 lg:px-12 py-10 sm:py-16 max-w-6xl mx-auto text-center">
          <p className="inline-flex items-center gap-2 rounded-full border border-amber-400/50 bg-amber-400/10 px-4 py-1.5 text-xs font-bold tracking-widest text-amber-400">
            <Flame className="h-3.5 w-3.5" /> BLACK FRIDAY
          </p>
          <h2 className="mt-5 text-3xl sm:text-4xl font-bold">O que muda <span className="text-amber-400">nesta edição</span></h2>
          <p className="text-slate-300 mt-3 text-lg max-w-2xl mx-auto">
            A Semana do Despertar acontece várias vezes por ano. Esta é a única com estes três pontos.
          </p>
          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            {DIFERENCIAIS_BF.map((item) => {
              const Icone = item.icone;
              return (
                <div key={item.titulo} className={`rounded-2xl border border-amber-400/30 ${CARD_BG} p-7 text-left shadow-lg transition-transform hover:-translate-y-1 hover:shadow-[0_0_30px_-10px_rgba(251,191,36,0.5)]`}>
                  <div className="h-12 w-12 rounded-xl bg-amber-400/15 border border-amber-400/30 flex items-center justify-center mb-4">
                    <Icone className="h-6 w-6 text-amber-400" />
                  </div>
                  <p className="text-amber-400 font-bold text-xl mb-3">{item.titulo}</p>
                  <p className="text-base text-slate-200 leading-relaxed">{item.texto}</p>
                </div>
              );
            })}
          </div>
          <p className="mt-8 text-slate-300 text-base max-w-2xl mx-auto">
            As três aulas continuam <span className="text-amber-400 font-semibold">100% gratuitas</span>. A condição de Black Friday é pra quem quiser seguir depois — e só aparece no fim da terceira noite.
          </p>
        </section>
      )}

      {/* DEPOIMENTOS */}
      <section className="px-5 sm:px-8 lg:px-12 py-10 sm:py-16 max-w-6xl mx-auto text-center">
        <h2 className="text-3xl sm:text-4xl font-bold">O que dizem nossos Alunos</h2>
        <p className="text-slate-300 mt-3 text-lg max-w-2xl mx-auto">Histórias reais de transformação e sucesso profissional através da nossa formação em Psicanálise Clínica Integrativa.</p>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {DEPOIMENTOS.map(({ id, frase }) => (
            <button
              key={id}
              type="button"
              onClick={() => setDepoimentoAberto(id)}
              className="group rounded-[10px] border border-white/10 bg-white/[0.015] p-4 text-left transition-colors hover:border-white/20"
              aria-label={`Ver depoimento: ${frase}`}
            >
              <div className="relative overflow-hidden rounded-md">
                <img
                  src={`${R2_DEPOIMENTOS}/${id}.jpg`}
                  alt=""
                  loading="lazy"
                  className="h-72 w-full object-cover object-top transition-opacity group-hover:opacity-80"
                />
                <span className="absolute inset-0 flex items-center justify-center bg-black/25">
                  <Play className="h-8 w-8 text-amber-400" />
                </span>
              </div>
              <div className="mt-4 flex gap-1">
                {Array.from({ length: 5 }).map((_, k) => (
                  <Star key={k} className="h-3 w-3 text-amber-400 fill-amber-400" />
                ))}
              </div>
              <p className="mt-3 text-sm text-slate-300">&ldquo;{frase}&rdquo;</p>
              <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.1em] text-slate-500">Aluno IDM · Ver depoimento</p>
            </button>
          ))}
        </div>
      </section>

      {/* POP-UP de depoimento em vídeo (R2, vertical) */}
      {depoimentoAberto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4"
          onClick={() => setDepoimentoAberto(null)}
        >
          <div className="relative w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <button
              type="button" aria-label="Fechar"
              className="absolute -top-11 right-0 flex items-center gap-1.5 text-slate-200 hover:text-amber-400 text-sm font-semibold"
              onClick={() => setDepoimentoAberto(null)}
            >
              <X className="h-5 w-5" /> Fechar
            </button>
            <div className="w-full overflow-hidden rounded-lg bg-black shadow-2xl" style={{ aspectRatio: '9 / 16' }}>
              <video
                src={`${R2_DEPOIMENTOS}/${depoimentoAberto}.mp4`}
                poster={`${R2_DEPOIMENTOS}/${depoimentoAberto}.jpg`}
                controls
                autoPlay
                playsInline
                className="h-full w-full"
              />
            </div>
          </div>
        </div>
      )}

      {/* INSTITUTO */}
      <section className="relative px-5 sm:px-8 lg:px-12 py-10 sm:py-16 max-w-4xl mx-auto text-center">
        <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 h-56 w-56 rounded-full bg-amber-400/10 blur-[90px]" aria-hidden="true" />
        <img src={LOGO} alt="Instituto DespertaMente Logo" className="relative h-24 w-24 object-contain mx-auto mb-4" />
        <h2 className="relative text-3xl sm:text-4xl font-bold">Instituto DespertaMente</h2>
        <p className="relative text-slate-300 mt-4 leading-relaxed text-lg">
          O Instituto Despertamente é uma escola de desenvolvimento humano especializada no ensino da psicanálise. Nossa missão é tornar o autoconhecimento acessível, ajudando pessoas a compreenderem melhor suas emoções, seus padrões de comportamento e a transformação da mente.
        </p>
        <p className="relative text-amber-400 font-semibold mt-5 text-lg">Transforme sua vida através do autoconhecimento!</p>
      </section>

      {/* PROFESSORES */}
      <section className="px-5 sm:px-8 lg:px-12 py-10 sm:py-16 max-w-6xl mx-auto text-center">
        <h2 className="text-3xl sm:text-4xl font-bold">Conheça seus Professores</h2>
        <div className="mt-10 grid gap-8 lg:grid-cols-2 text-left">
          <div className={`rounded-2xl border border-white/10 ${CARD_BG} p-7 shadow-lg transition-transform hover:-translate-y-1`}>
            <img src={FOTO_RODRYGO} alt="Rodrygo Murari" className="h-24 w-24 rounded-full object-cover mb-4 ring-2 ring-amber-400/40 shadow-lg" />
            <p className="font-bold text-xl">Rodrygo Murari</p>
            <p className="text-amber-400 text-sm font-semibold mb-3">Fundador e Professor</p>
            <p className="text-slate-300 leading-relaxed">
              Com mais de 5 MIL horas de atendimentos somados em Setting Terapêutico, Cursos, Treinamentos e Mentorias. Seu propósito é levar uma "Psicanálise Descomplicada", Honrando os Princípios e gerando Mudanças Breves na vida dos alunos iDM.
            </p>
            <p className="text-slate-300 leading-relaxed mt-3">
              Especialista em Metafísica comportamental e PNL SISTÊMICA, sua iniciativa de introduzir Módulos Integrativos dentro da Psicanálise, vem revolucionando e facilitando significativamente a vida de centenas e centenas de pessoas no Brasil e na Europa.
            </p>
          </div>
          <div className={`rounded-2xl border border-white/10 ${CARD_BG} p-7 shadow-lg transition-transform hover:-translate-y-1`}>
            <img src={FOTO_JOCIMARAH} alt="Jocimarah Carmen" className="h-24 w-24 rounded-full object-cover mb-4 ring-2 ring-amber-400/40 shadow-lg" />
            <p className="font-bold text-xl">Jocimarah Carmen</p>
            <p className="text-amber-400 text-sm font-semibold mb-3">Coordenadora e Professora</p>
            <p className="text-slate-300 leading-relaxed">
              Especialista em Luto e Depressão, sua abordagem Psicanalítica vem carregada de sutileza e mudanças incríveis no Setting Terapêutico. Também é Master Coach com foco em análise comportamental e Practitioner em PNL. Uma professora que abraça 100% a causa de seus alunos, motivando-os a estudarem com leveza, dedicação e responsabilidade.
            </p>
            <p className="text-slate-300 leading-relaxed mt-3">
              Com mais de 1000 horas focadas no empoderamento feminino, a Professora Carmen, leva a sério em como a Mulher Psicanalista deve ter resultados impressionantes a partir do trabalho profissional e poder viver da Psicanálise.
            </p>
          </div>
        </div>
        <p className="text-slate-400 mt-8 text-lg">Aprenda com os melhores profissionais da área</p>
      </section>

      {/* FAQ */}
      <section className="px-5 sm:px-8 lg:px-12 py-10 sm:py-16 max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <h2 className="text-3xl sm:text-4xl font-bold">Perguntas Frequentes</h2>
          <p className="text-slate-300 mt-2 text-lg">Tire suas dúvidas!</p>
        </div>
        <Accordion type="single" collapsible className="space-y-2">
          {(ehBlackFriday ? [...FAQ_BLACK_FRIDAY, ...FAQ] : FAQ).map(([pergunta, resposta], i) => (
            <AccordionItem key={i} value={`item-${i}`} className={`rounded-xl border border-white/10 ${CARD_BG} px-5 border-b-0 shadow-md`}>
              <AccordionTrigger className="text-left hover:no-underline text-base">
                <span className="flex items-center gap-2.5"><HelpCircle className="h-5 w-5 text-amber-400 shrink-0" />{pergunta}</span>
              </AccordionTrigger>
              <AccordionContent className="text-slate-300 text-base">{resposta}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
        <p className="text-center text-slate-400 mt-6">Ainda tem dúvidas? Entre em contato conosco!</p>
      </section>

      {/* CTA FINAL -- mesma lógica de duas colunas do hero, pra não ficar uma faixa estreita sobrando espaço nos dois lados no desktop */}
      <section className="relative px-5 sm:px-8 lg:px-12 py-10 sm:py-16 max-w-6xl mx-auto">
        <div className="pointer-events-none absolute top-10 left-1/2 -translate-x-1/2 h-72 w-72 rounded-full bg-amber-400/15 blur-[100px]" aria-hidden="true" />
        <div className="relative grid lg:grid-cols-[1.1fr_0.9fr] gap-10 lg:gap-16 items-center">
          <div className="text-center lg:text-left">
            <div className="flex flex-wrap justify-center lg:justify-start gap-2 text-xs font-semibold mb-4">
              <span className="flex items-center gap-1.5 rounded-full border border-amber-400/40 text-amber-400 px-3 py-1.5"><ShieldCheck className="h-3.5 w-3.5" />Vagas Limitadas</span>
              <span className="flex items-center gap-1.5 rounded-full border border-amber-400/40 text-amber-400 px-3 py-1.5"><Users className="h-3.5 w-3.5" />Mais de 5000 Inscritos</span>
              <span className="flex items-center gap-1.5 rounded-full border border-amber-400/40 text-amber-400 px-3 py-1.5"><Gift className="h-3.5 w-3.5" />100% Gratuito</span>
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold">
              {ehBlackFriday
                ? <>Três noites.<br />Uma única vez no ano.</>
                : <>Vagas limitadas.<br />Corra para garantir a sua.</>}
            </h2>
            <p className="text-slate-300 mt-4 text-lg max-w-md mx-auto lg:mx-0">
              {ehBlackFriday
                ? 'Convidado diferente em cada noite, conteúdo inédito e uma condição de Black Friday que não se repete. A inscrição continua gratuita — garanta a sua enquanto está no ar.'
                : 'Não perca a oportunidade de transformar sua vida através do autoconhecimento. As inscrições podem ser encerradas a qualquer momento.'}
            </p>
            <p className="mt-6 text-sm text-slate-300">🎁 BÔNUS EXCLUSIVO: Ebook <a href={LINK_EBOOK} target="_blank" rel="noopener noreferrer" className="text-amber-400 underline">"Desenvolvimento da Personalidade"</a><br />+ Certificado de Participação + Material Complementar</p>
            <div className="mt-6 flex flex-wrap justify-center lg:justify-start gap-x-5 gap-y-2 text-sm text-slate-300">
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-amber-400" />Evento 100% Gratuito</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-amber-400" />Certificado Incluso</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-amber-400" />Material Complementar</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-amber-400" />Ao Vivo no YouTube</span>
            </div>
          </div>

          <div className={`rounded-2xl border border-white/10 ${CARD_BG} p-6 text-left shadow-2xl`}>
            {formulario}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="px-5 py-12 max-w-3xl mx-auto text-center border-t border-white/10">
        <img src={LOGO} alt="Instituto DespertaMente" className="h-12 w-12 object-contain mx-auto mb-5" />

        <div className="flex items-center justify-center gap-3 mb-6">
          <a href={LINK_INSTAGRAM} target="_blank" rel="noopener noreferrer" aria-label="Instagram do Instituto Despertamente"
            className="h-10 w-10 rounded-full border border-white/10 bg-[#0d1b3d] flex items-center justify-center text-slate-300 hover:text-amber-400 hover:border-amber-400/40 transition-colors">
            <Instagram className="h-5 w-5" />
          </a>
          <a href={LINK_FACEBOOK} target="_blank" rel="noopener noreferrer" aria-label="Facebook do Instituto Despertamente"
            className="h-10 w-10 rounded-full border border-white/10 bg-[#0d1b3d] flex items-center justify-center text-slate-300 hover:text-amber-400 hover:border-amber-400/40 transition-colors">
            <Facebook className="h-5 w-5" />
          </a>
          <a href={LINK_YOUTUBE} target="_blank" rel="noopener noreferrer" aria-label="YouTube do Instituto Despertamente"
            className="h-10 w-10 rounded-full border border-white/10 bg-[#0d1b3d] flex items-center justify-center text-slate-300 hover:text-amber-400 hover:border-amber-400/40 transition-colors">
            <Youtube className="h-5 w-5" />
          </a>
        </div>

        <div className="text-xs text-slate-500 space-y-3">
          <p>© Instituto Despertamente - Copyright {new Date().getFullYear()} Todos os direitos reservados</p>
          <p>Este site não é afiliado ao Facebook ou a qualquer entidade do Facebook. Depois que você sair do Facebook, a responsabilidade não é deles e sim do nosso site. Fazemos todos os esforços para indicar claramente e mostrar todas as provas do produto e usamos resultados reais. Nós não vendemos o seu e-mail ou qualquer informação para terceiros. Jamais fazemos nenhum tipo de spam.</p>
          <p>Se você tiver alguma dúvida, sinta-se à vontade para usar o link de contato e falar conosco em horário comercial de Segunda a Sextas das 09h00 às 18h00. Lemos e respondemos todas as mensagens por ordem de chegada.</p>
          <p className="text-slate-400">Instituto DespertaMente • Psicanálise Integrativa • Desenvolvimento Humano</p>
        </div>

        <a href={LINK_11DIGITAL} target="_blank" rel="noopener noreferrer"
          className="mt-6 inline-flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-amber-400 transition-colors">
          Desenvolvido por <span className="font-semibold">11 Digital</span>
        </a>
      </footer>
    </div>
  );
}
