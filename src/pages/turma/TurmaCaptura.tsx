import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
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

// Mesmo conteúdo evergreen usado em todas as turmas do Curso Gratuito --
// não muda por turma, só a copy/datas/link no topo mudam.
const PILARES: Record<number, { titulo: string; itens: string[] }> = {
  1: { titulo: 'O DESPERTAR', itens: ['Teoria do APARELHO', 'Teoria ESTRUTURAL', 'Portas para o INCONSCIENTE'] },
  2: { titulo: 'A CURA', itens: ['Heranças traumáticas', 'Narcisista – Efeitos da Falta e do Excesso', 'Psicanálise Aplicada à Autoestima'] },
  3: { titulo: 'A REVELAÇÃO', itens: ['Pulsão de morte', 'O efeito do ESTRESSE', 'Atos SUICIDAS'] },
};

const DEPOIMENTOS = [
  { videoId: 'wDQiV0VoBT4', texto: 'Transformei minha vida através da psicanálise' },
  { videoId: 'B_lpIOk1RQo', texto: 'Mudança completa de perspectiva sobre a vida' },
  { videoId: 'D4xbxCXSWoM', texto: 'Descobri ferramentas poderosas para o autoconhecimento' },
];

const FAQ: [string, string][] = [
  ['O evento é realmente gratuito?', 'Sim! O curso é 100% gratuito. Não há taxas ocultas ou cobranças. Você terá acesso completo às 3 aulas ao vivo, certificado de participação e material complementar sem nenhum custo.'],
  ['Como posso participar do evento?', 'Após se inscrever, você receberá por e-mail e WhatsApp o link do YouTube onde as aulas acontecerão ao vivo. Também enviaremos lembretes antes de cada aula para que você não perca nenhum conteúdo.'],
  ['Preciso ter conhecimento prévio sobre Psicanálise para participar?', 'Não! O curso foi desenvolvido tanto para iniciantes quanto para quem já tem algum conhecimento na área. Nossa metodologia é didática e acessível, permitindo que qualquer pessoa aprenda.'],
  ['O evento será presencial ou online?', 'O evento é 100% online e ao vivo pelo YouTube. Isso permite que você participe de qualquer lugar do Brasil ou do mundo, precisando apenas de uma conexão com a internet.'],
  ['Vou receber algum material complementar?', 'Sim! Além das aulas ao vivo, você receberá o ebook "Desenvolvimento da Personalidade", certificado de participação e materiais complementares para aprofundar seus estudos.'],
  ['Quanto tempo dura o curso?', 'O curso acontece em 3 dias consecutivos, sempre às 20h. Cada aula tem duração aproximada de 2 horas, totalizando cerca de 6 horas de conteúdo exclusivo.'],
];

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const DIAS_SEMANA_CURTO = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

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
}

function tituloPilar(aula: Aula): string {
  return PILARES[aula.numero]?.titulo ?? aula.titulo.toUpperCase();
}

function formatarDatasHero(aulas: Aula[]): string {
  if (aulas.length === 0) return '';
  const datas = aulas.map((a) => new Date(a.inicio_em));
  const dias = datas.map((d) => d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit' }));
  const mes = MESES[Number(datas[0].toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', month: 'numeric' })) - 1];
  const diasTxt = dias.length > 1 ? `${dias.slice(0, -1).join(', ')} E ${dias[dias.length - 1]}` : dias[0];
  return `${diasTxt} DE ${mes.toUpperCase()}`;
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
    <div className="w-full max-w-md mx-auto">
      <p className="text-center text-sm text-amber-400 font-semibold mb-3">{MESES[mesIdx].charAt(0).toUpperCase() + MESES[mesIdx].slice(1)}, {ano} · Aulas ao vivo</p>
      <div className="grid grid-cols-7 gap-1 text-center">
        {DIAS_SEMANA_CURTO.map((d) => <div key={d} className="text-[11px] text-slate-400 font-bold py-1">{d}</div>)}
        {celulas.map((dia, i) => (
          <div
            key={i}
            className={`aspect-square flex items-center justify-center rounded-lg text-sm ${
              dia === null ? '' : diasDasAulas.has(dia)
                ? 'bg-amber-400 text-[#000a1f] font-bold'
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

  const datasHero = useMemo(() => formatarDatasHero(aulas), [aulas]);

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
      trackPixel('Lead', { content_name: `Turma ${slug}` });
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
      <input className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-slate-400 focus:outline-none focus:border-amber-400"
        placeholder="Nome completo" autoComplete="name" required value={nome} onChange={(e) => setNome(e.target.value)} />
      <input className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-slate-400 focus:outline-none focus:border-amber-400"
        type="email" placeholder="E-mail" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <div className="flex rounded-lg border border-white/10 bg-white/5 overflow-hidden focus-within:border-amber-400">
        <span className="px-3 py-3 text-slate-300 border-r border-white/10 text-sm">BR +55</span>
        <input className="flex-1 bg-transparent px-3 py-3 text-white placeholder:text-slate-400 focus:outline-none" type="tel" inputMode="tel"
          placeholder="(99) 99999-9999" required maxLength={11} value={whatsapp}
          onChange={(e) => setWhatsapp(e.target.value.replace(/\D/g, '').slice(0, 11))} />
      </div>
      <input className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-slate-400 focus:outline-none focus:border-amber-400"
        placeholder="Cidade" value={cidade} onChange={(e) => setCidade(e.target.value)} />
      <button type="submit" disabled={enviando}
        className="w-full rounded-lg bg-amber-400 hover:bg-amber-300 text-[#000a1f] font-bold py-3.5 text-base transition-colors disabled:opacity-60">
        {enviando ? 'INSCREVENDO...' : 'INSCREVER-SE AGORA!'}
      </button>
      <p className="text-[11px] text-slate-400 leading-relaxed">
        De acordo com a lei 12.965/2014 e 13.709/2018, autorizo enviarem comunicações por e-mail ou qualquer outro meio e concordo com a política de privacidade.
      </p>
    </form>
  );

  return (
    <div className="min-h-screen bg-[#000a1f] text-slate-50">
      {/* HERO */}
      <section className="px-5 pt-14 pb-10 max-w-3xl mx-auto text-center">
        <h1 className="text-3xl sm:text-5xl font-bold leading-tight">
          Curso Gratuito de<br /><span className="text-amber-400">{turma.nome.replace(/^Turma #\d+\s*/i, '') || 'Psicanálise Integrativa'}!</span>
        </h1>
        <p className="mt-4 text-slate-300 text-base sm:text-lg">Uma sequência de 3 aulas ONLINE. 100% Gratuitas com Certificado + Material.</p>

        <div className="mt-6 rounded-xl border border-white/10 bg-[#0d1b3d] px-6 py-4">
          <p className="text-amber-400 font-bold text-sm tracking-wide">{turma.nome.toUpperCase()}</p>
          <p className="text-lg font-bold mt-1">{datasHero}</p>
          {aulas[0] && <p className="text-amber-400 text-sm font-semibold mt-1">AO VIVO NO YOUTUBE ÀS {new Date(aulas[0].inicio_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })} HORAS</p>}
        </div>

        {turma.descricao && (
          <div className="mt-6 rounded-xl border border-amber-400/30 bg-amber-400/5 px-6 py-4 text-left">
            <p className="text-amber-400 font-bold text-sm mb-1">🔥 EDIÇÃO ESPECIAL</p>
            <p className="text-slate-200 text-sm leading-relaxed">{turma.descricao}</p>
          </div>
        )}

        <div className="mt-8 relative w-full overflow-hidden rounded-2xl shadow-2xl border border-white/10 aspect-video bg-black">
          {videoTocando ? (
            <video src={VIDEO_URL} controls autoPlay className="h-full w-full object-cover" />
          ) : (
            <button type="button" aria-label="Assistir ao vídeo" className="group relative block h-full w-full" onClick={() => setVideoTocando(true)}>
              <img src={VIDEO_POSTER} alt="Capa do vídeo" className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-black/30 transition-colors group-hover:bg-black/40" />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="flex h-20 w-20 items-center justify-center rounded-full bg-amber-400/90 shadow-xl transition-transform group-hover:scale-110 animate-pulse">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="h-9 w-9 translate-x-0.5 text-[#000a1f]"><polygon points="6 3 20 12 6 21 6 3" /></svg>
                </span>
              </div>
            </button>
          )}
        </div>

        <div id="cadastro" className="mt-8 rounded-2xl border border-white/10 bg-[#0d1b3d] p-6 text-left">
          {formulario}
        </div>
        <p className="mt-4 text-sm text-slate-300">🎁 Cadastre-se agora e ganhe o EBOOK:<br /><span className="text-amber-400 font-semibold">Desenvolvimento da Personalidade</span>.</p>
      </section>

      {/* CALENDÁRIO */}
      <section className="px-5 py-12 max-w-3xl mx-auto text-center">
        <h2 className="text-2xl sm:text-3xl font-bold">Quando será o Curso Gratuito?</h2>
        <p className="text-slate-300 mt-2">Reserve esses três dias na sua agenda</p>
        <div className="mt-6"><CalendarioMes aulas={aulas} /></div>
        <p className="mt-8 text-amber-400 font-bold tracking-wide text-sm">DATAS DAS AULAS</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {aulas.map((aula) => {
            const d = new Date(aula.inicio_em);
            const diaMes = d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit' });
            const diaSemanaRaw = d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long' });
            const diaSemana = diaSemanaRaw.charAt(0).toUpperCase() + diaSemanaRaw.slice(1);
            const mesNome = MESES[Number(d.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', month: 'numeric' })) - 1];
            return (
              <div key={aula.numero} className="rounded-xl border border-white/10 bg-[#0d1b3d] p-5">
                <p className="text-3xl font-bold text-amber-400">{diaMes}</p>
                <p className="font-semibold mt-1">{diaSemana} — Aula {String(aula.numero).padStart(2, '0')}</p>
                <p className="text-slate-400 text-sm mt-1 capitalize">{mesNome} de {d.getFullYear()} · Online e Gratuito</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* 3 PILARES */}
      <section className="px-5 py-12 max-w-4xl mx-auto text-center">
        <h2 className="text-2xl sm:text-3xl font-bold">VEJA OS <span className="text-amber-400">3 PILARES</span> DO CURSO:</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {aulas.map((aula) => (
            <div key={aula.numero} className="rounded-xl bg-gradient-to-b from-amber-400/20 to-transparent border border-amber-400/30 p-5 text-left">
              <p className="text-amber-400 font-bold text-lg mb-3">{tituloPilar(aula)}</p>
              <ul className="space-y-2 text-sm text-slate-200">
                {(PILARES[aula.numero]?.itens ?? []).map((item) => <li key={item}>• {item}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* DEPOIMENTOS */}
      <section className="px-5 py-12 max-w-5xl mx-auto text-center">
        <h2 className="text-2xl sm:text-3xl font-bold">O que dizem nossos Alunos</h2>
        <p className="text-slate-300 mt-2">Histórias reais de transformação e sucesso profissional através da nossa formação em Psicanálise Clínica Integrativa.</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {DEPOIMENTOS.map((dep) => (
            <div key={dep.videoId} className="rounded-xl border border-white/10 bg-[#0d1b3d] overflow-hidden text-left">
              <a href={`https://www.youtube.com/watch?v=${dep.videoId}`} target="_blank" rel="noopener noreferrer" className="block relative aspect-video bg-black">
                <img src={`https://img.youtube.com/vi/${dep.videoId}/maxresdefault.jpg`} alt={dep.texto} className="h-full w-full object-cover opacity-80" />
                <span className="absolute inset-0 flex items-center justify-center text-amber-400 text-xs font-bold bg-black/30">▷ Ver depoimento</span>
              </a>
              <div className="p-4">
                <p className="font-semibold">"{dep.texto}"</p>
                <p className="text-amber-400 mt-2">★★★★★</p>
                <p className="text-slate-400 text-sm mt-1">Aluno iDM</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* INSTITUTO */}
      <section className="px-5 py-12 max-w-3xl mx-auto text-center">
        <img src={LOGO} alt="Instituto DespertaMente Logo" className="h-20 w-20 object-contain mx-auto mb-4 rounded-full" />
        <h2 className="text-2xl sm:text-3xl font-bold">Instituto DespertaMente</h2>
        <p className="text-slate-300 mt-3 leading-relaxed">
          O Instituto Despertamente é uma escola de desenvolvimento humano especializada no ensino da psicanálise. Nossa missão é tornar o autoconhecimento acessível, ajudando pessoas a compreenderem melhor suas emoções, seus padrões de comportamento e a transformação da mente.
        </p>
        <p className="text-amber-400 font-semibold mt-4">Transforme sua vida através do autoconhecimento!</p>
      </section>

      {/* PROFESSORES */}
      <section className="px-5 py-12 max-w-4xl mx-auto text-center">
        <h2 className="text-2xl sm:text-3xl font-bold">Conheça seus Professores</h2>
        <div className="mt-6 grid gap-6 sm:grid-cols-2 text-left">
          <div className="rounded-xl border border-white/10 bg-[#0d1b3d] p-6">
            <img src={FOTO_RODRYGO} alt="Rodrygo Murari" className="h-24 w-24 rounded-full object-cover mb-4" />
            <p className="font-bold text-lg">Rodrygo Murari</p>
            <p className="text-amber-400 text-sm font-semibold mb-3">Fundador e Professor</p>
            <p className="text-slate-300 text-sm leading-relaxed">
              Com mais de 5 MIL horas de atendimentos somados em Setting Terapêutico, Cursos, Treinamentos e Mentorias. Seu propósito é levar uma "Psicanálise Descomplicada", Honrando os Princípios e gerando Mudanças Breves na vida dos alunos iDM.
            </p>
            <p className="text-slate-300 text-sm leading-relaxed mt-3">
              Especialista em Metafísica comportamental e PNL SISTÊMICA, sua iniciativa de introduzir Módulos Integrativos dentro da Psicanálise, vem revolucionando e facilitando significativamente a vida de centenas e centenas de pessoas no Brasil e na Europa.
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-[#0d1b3d] p-6">
            <img src={FOTO_JOCIMARAH} alt="Jocimarah Carmen" className="h-24 w-24 rounded-full object-cover mb-4" />
            <p className="font-bold text-lg">Jocimarah Carmen</p>
            <p className="text-amber-400 text-sm font-semibold mb-3">Coordenadora e Professora</p>
            <p className="text-slate-300 text-sm leading-relaxed">
              Especialista em Luto e Depressão, sua abordagem Psicanalítica vem carregada de sutileza e mudanças incríveis no Setting Terapêutico. Também é Master Coach com foco em análise comportamental e Practitioner em PNL. Uma professora que abraça 100% a causa de seus alunos, motivando-os a estudarem com leveza, dedicação e responsabilidade.
            </p>
            <p className="text-slate-300 text-sm leading-relaxed mt-3">
              Com mais de 1000 horas focadas no empoderamento feminino, a Professora Carmen, leva a sério em como a Mulher Psicanalista deve ter resultados impressionantes a partir do trabalho profissional e poder viver da Psicanálise.
            </p>
          </div>
        </div>
        <p className="text-slate-400 mt-6">Aprenda com os melhores profissionais da área</p>
      </section>

      {/* FAQ */}
      <section className="px-5 py-12 max-w-2xl mx-auto">
        <div className="text-center mb-6">
          <h2 className="text-2xl sm:text-3xl font-bold">Perguntas Frequentes</h2>
          <p className="text-slate-300 mt-2">Tire suas dúvidas!</p>
        </div>
        <Accordion type="single" collapsible className="space-y-2">
          {FAQ.map(([pergunta, resposta], i) => (
            <AccordionItem key={i} value={`item-${i}`} className="rounded-xl border border-white/10 bg-[#0d1b3d] px-4 border-b-0">
              <AccordionTrigger className="text-left hover:no-underline">{pergunta}</AccordionTrigger>
              <AccordionContent className="text-slate-300">{resposta}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
        <p className="text-center text-slate-400 mt-6 text-sm">Ainda tem dúvidas? Entre em contato conosco!</p>
      </section>

      {/* CTA FINAL */}
      <section className="px-5 py-14 max-w-2xl mx-auto text-center">
        <div className="flex flex-wrap justify-center gap-2 text-xs font-semibold mb-4">
          <span className="rounded-full border border-amber-400/40 text-amber-400 px-3 py-1">Vagas Limitadas</span>
          <span className="rounded-full border border-amber-400/40 text-amber-400 px-3 py-1">Mais de 5000 Inscritos</span>
          <span className="rounded-full border border-amber-400/40 text-amber-400 px-3 py-1">100% Gratuito</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold">Vagas limitadas.<br />Corra para garantir a sua.</h2>
        <p className="text-slate-300 mt-3">
          {turma.descricao
            ? 'Essa condição de Black Friday não se repete. Garanta sua vaga gratuita agora e aproveite enquanto está no ar.'
            : 'Não perca a oportunidade de transformar sua vida através do autoconhecimento. As inscrições podem ser encerradas a qualquer momento.'}
        </p>
        <div className="mt-6 rounded-2xl border border-white/10 bg-[#0d1b3d] p-6 text-left">
          {formulario}
        </div>
        <p className="mt-4 text-sm text-slate-300">🎁 BÔNUS EXCLUSIVO: Ebook <a href={LINK_EBOOK} target="_blank" rel="noopener noreferrer" className="text-amber-400 underline">"Desenvolvimento da Personalidade"</a><br />+ Certificado de Participação + Material Complementar</p>
        <div className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-slate-300">
          <span>✓ Evento 100% Gratuito</span>
          <span>✓ Certificado Incluso</span>
          <span>✓ Material Complementar</span>
          <span>✓ Ao Vivo no YouTube</span>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="px-5 py-10 max-w-3xl mx-auto text-center text-xs text-slate-500 border-t border-white/10 space-y-3">
        <p>© Instituto Despertamente - Copyright {new Date().getFullYear()} Todos os direitos reservados</p>
        <p>Este site não é afiliado ao Facebook ou a qualquer entidade do Facebook. Depois que você sair do Facebook, a responsabilidade não é deles e sim do nosso site. Fazemos todos os esforços para indicar claramente e mostrar todas as provas do produto e usamos resultados reais. Nós não vendemos o seu e-mail ou qualquer informação para terceiros. Jamais fazemos nenhum tipo de spam.</p>
        <p>Se você tiver alguma dúvida, sinta-se à vontade para usar o link de contato e falar conosco em horário comercial de Segunda a Sextas das 09h00 às 18h00. Lemos e respondemos todas as mensagens por ordem de chegada.</p>
        <p className="text-slate-400">Instituto DespertaMente • Psicanálise Integrativa • Desenvolvimento Humano</p>
      </footer>
    </div>
  );
}
