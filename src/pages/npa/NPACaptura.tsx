import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowRight, MapPin, Play } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { carregarPixel, trackPixel } from './meta-pixel';
import './npa-fds.css';

const FUNCTIONS_URL = 'https://usqiyekfmwwnvkmkdlej.supabase.co/functions/v1';
const LOGO = 'https://pub-da74b2ec5ddf4847a6f20dec2e542925.r2.dev/turma-assets/logo-idm.png';
const FOTO_RODRYGO = 'https://pub-da74b2ec5ddf4847a6f20dec2e542925.r2.dev/turma-assets/rodrygo.png';

// Vídeo real do NPA (Rodrygo falando sobre o IDM Pelo Brasil Numerologia),
// baixado do YouTube da última turma de verdade (Rio #22, enYdWdV5zGM) e
// subido pro R2 -- não é mais o vídeo de Psicanálise que tinha sido
// reaproveitado por engano da pasta antiga, nem o embed do YouTube (que
// expõe sugestões de outros vídeos e sai do nosso controle de avanço).
const VIDEO_URL = 'https://pub-da74b2ec5ddf4847a6f20dec2e542925.r2.dev/npa-assets/video-rodrygo-npa.mp4';
// hqdefault (480x360) em vez de maxresdefault (1920x1080, ~10x mais pesado) --
// a imagem só aparece atrás do botão de play num card de 672px no máximo,
// não precisa de resolução full HD pra isso.
const VIDEO_POSTER = 'https://img.youtube.com/vi/enYdWdV5zGM/hqdefault.jpg';

// Links de checkout do Vega -- placeholders até o Pedro criar os produtos e
// mandar as URLs reais. Troca só os valores aqui quando chegarem.
const CHECKOUT_URLS: Record<string, { manha: string; tarde: string }> = {
  'sao-paulo': {
    manha: 'https://checkout.institutodespertamente.shop/VCCL1O8SDC5B',
    tarde: 'https://checkout.institutodespertamente.shop/VCCL1O8SDC77',
  },
  santos: { manha: '', tarde: '' },
};

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;

interface EventoPublico {
  id: string;
  nome: string;
  data_evento: string;
  local: string;
  valor_ingresso: number;
  professor_convidado: string | null;
  slug: string;
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function formatarData(dataISO: string) {
  const d = new Date(`${dataISO}T12:00:00`);
  const diaSemana = d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long' });
  const dia = d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit' });
  const mesIdx = Number(d.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', month: 'numeric' })) - 1;
  return {
    curta: `${dia} de ${MESES[mesIdx]}`,
    diaMes: `${dia}/${String(mesIdx + 1).padStart(2, '0')}`,
    diaSemana: diaSemana.charAt(0).toUpperCase() + diaSemana.slice(1),
  };
}

function formatarWhatsApp(value: string) {
  const n = value.replace(/\D/g, '');
  if (n.length <= 2) return n;
  if (n.length <= 6) return `(${n.slice(0, 2)}) ${n.slice(2)}`;
  if (n.length <= 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7, 11)}`;
}

function VideoPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const maxAssistidoRef = useRef(0);
  const [tocando, setTocando] = useState(false);
  const [progressoPct, setProgressoPct] = useState(0);

  return (
    <div
      className="nfd-video group"
      onClick={() => {
        const v = videoRef.current;
        if (!v) return;
        if (v.paused) v.play().catch(() => {});
        else v.pause();
      }}
    >
      <video
        ref={videoRef}
        src={VIDEO_URL}
        poster={VIDEO_POSTER}
        playsInline
        preload="metadata"
        className="absolute inset-0 h-full w-full object-cover"
        onPlay={() => setTocando(true)}
        onPause={() => setTocando(false)}
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          const t = v.currentTime;
          if (t > maxAssistidoRef.current + 1.5) v.currentTime = maxAssistidoRef.current;
          else if (t > maxAssistidoRef.current) maxAssistidoRef.current = t;
          if (v.duration) setProgressoPct((v.currentTime / v.duration) * 100);
        }}
        onSeeking={(e) => {
          const v = e.currentTarget;
          if (v.currentTime > maxAssistidoRef.current + 0.5) v.currentTime = maxAssistidoRef.current;
        }}
        onSeeked={(e) => {
          const v = e.currentTarget;
          if (v.currentTime > maxAssistidoRef.current + 0.5) v.currentTime = maxAssistidoRef.current;
        }}
      />
      {/* Sem barra de progresso arrastável de propósito -- só play/pause
          (clique em qualquer lugar do vídeo), pra ninguém pular o teaser
          pra frente. Barra abaixo é só visual. */}
      {!tocando && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 bg-black/45 transition-colors group-hover:bg-black/35">
          <span className="flex h-16 w-16 md:h-[72px] md:w-[72px] items-center justify-center rounded-full transition-transform group-hover:scale-105" style={{ background: 'var(--accent)' }}>
            <Play className="h-6 w-6 md:h-7 md:w-7 translate-x-0.5" style={{ color: 'var(--accent-ink)', fill: 'var(--accent-ink)' }} />
          </span>
          <p className="nfd-small" style={{ color: 'var(--ink)' }}>Assista antes de se inscrever</p>
        </div>
      )}
      <div className="absolute left-0 right-0 bottom-0 h-1 bg-black/40 pointer-events-none">
        <div className="h-full" style={{ width: `${progressoPct}%`, background: 'var(--accent)' }} />
      </div>
    </div>
  );
}

const PILARES = [
  {
    icone: '🧠', titulo: 'Domine os fundamentos', subtitulo: 'Calcule e interprete seus números com precisão',
    itens: [
      'Cálculo correto do número de destino — entenda a rota da sua vida e tome decisões mais assertivas',
      'Interpretação completa dos números de 1 a 9 — descubra o significado por trás de cada número',
      'Estrutura base da numerologia pitagórica — aprenda o sistema milenar usado pelos maiores mestres',
      'Técnicas práticas de cálculo — domine o método passo a passo e aplique imediatamente',
    ],
    rodape: 'Aprenda o método exato usado por profissionais',
  },
  {
    icone: '❤️', titulo: 'Seu mapa pessoal', subtitulo: 'Desvende sua essência e potencial único',
    itens: [
      'Número da alma — descubra sua essência interior e o que realmente te motiva',
      'Número de expressão — entenda como você se manifesta e é percebido pelo mundo',
      'Leitura do mapa numerológico completo — saia do encontro com seu mapa pronto em mãos',
      'Padrões de comportamento — compreenda por que você age de determinada forma',
    ],
    rodape: 'Entenda sua personalidade de forma profunda',
  },
  {
    icone: '👁️', titulo: 'Numerologia na prática', subtitulo: 'Transforme teoria em resultados concretos para o dia a dia',
    itens: [
      'Numerologia residencial — harmonize a energia da sua casa e melhore o ambiente',
      'Energia da assinatura e nome profissional — potencialize sua marca pessoal',
      'Harmonizações simples para o dia a dia — aplique ajustes rápidos com resultados reais',
      'Numerologia em decisões importantes — use os números como guia estratégico',
    ],
    rodape: 'Ferramentas práticas que você usa imediatamente',
  },
];

export default function NPACaptura() {
  const { slug = '' } = useParams();
  const [evento, setEvento] = useState<EventoPublico | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [nome, setNome] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [turno, setTurno] = useState<'manha' | 'tarde' | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => { carregarPixel(); }, []);

  useEffect(() => {
    let ativo = true;
    fetch(`${FUNCTIONS_URL}/npa-evento-publico?slug=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!ativo) return;
        if (data.ok) setEvento(data.evento);
        setCarregando(false);
      })
      .catch(() => ativo && setCarregando(false));
    return () => { ativo = false; };
  }, [slug]);

  const dataFmt = useMemo(() => (evento ? formatarData(evento.data_evento) : null), [evento]);
  const mapsUrl = useMemo(() => (evento ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(evento.local)}` : '#'), [evento]);
  const cidade = evento ? evento.nome.replace(/^NPA #\d+\s*/i, '') : '';
  const preco = evento ? evento.valor_ingresso.toFixed(0) : '29';

  function handleWhatsapp(e: ChangeEvent<HTMLInputElement>) {
    setWhatsapp(formatarWhatsApp(e.target.value));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (nome.trim().length < 3) { toast.error('Digite seu nome completo.'); return; }
    const digitos = whatsapp.replace(/\D/g, '');
    if (digitos.length < 10 || digitos.length > 11) { toast.error('Digite um WhatsApp válido com DDD.'); return; }
    if (!turno) { toast.error('Escolha a turma (manhã ou tarde).'); return; }
    if (!evento) return;

    setEnviando(true);
    const phoneToSend = `55${digitos}`;
    const checkoutUrl = CHECKOUT_URLS[slug]?.[turno];

    // Pré-registra o interesse no CRM mesmo antes do pagamento -- não trava
    // o fluxo se falhar. O webhook do Vega confirma o pagamento depois e
    // atualiza esse mesmo lead (casa por whatsapp+evento). supabase-js só
    // dispara a chamada quando o builder é "then"ado/esperado -- sem await
    // aqui o insert nunca sai do papel.
    try {
      await supabase.from('npa_evento_leads').insert({
        npa_evento_id: evento.id,
        nome: nome.trim(),
        whatsapp: phoneToSend,
        turma: turno,
        fase: 'novo',
      } as never);
    } catch (err) {
      console.error('Erro ao pré-registrar lead NPA:', err);
    }

    // nome/whatsapp vão só pra API de Conversões, hasheados no servidor --
    // é o que permite a Meta casar o evento com a pessoa mesmo quando o pixel
    // do navegador é bloqueado.
    trackPixel('Lead', { content_name: `NPA ${slug} - ${turno}` }, { nome: nome.trim(), whatsapp: phoneToSend });

    if (!checkoutUrl) {
      toast.success('Interesse registrado! Assim que o checkout abrir, avisamos você pelo WhatsApp.');
      setEnviando(false);
      return;
    }

    toast.success('Redirecionando para o pagamento...');
    const params = new URLSearchParams(window.location.search);
    const url = new URL(checkoutUrl);
    url.searchParams.set('name', nome.trim());
    url.searchParams.set('customer_name', nome.trim());
    url.searchParams.set('phone_number', digitos);
    url.searchParams.set('cellphone', phoneToSend);
    UTM_KEYS.forEach((key) => {
      const v = params.get(key);
      if (v) url.searchParams.set(key, v);
    });
    trackPixel('InitiateCheckout', { content_name: evento.nome, content_type: 'product', value: evento.valor_ingresso, currency: 'BRL' }, { nome: nome.trim(), whatsapp: phoneToSend });
    setTimeout(() => { window.location.href = url.toString(); }, 1200);
  }

  if (carregando) {
    return <div className="nfd" style={{ display: 'grid', placeItems: 'center' }}><p className="nfd-meta">Carregando…</p></div>;
  }
  if (!evento || !dataFmt) {
    return <div className="nfd" style={{ display: 'grid', placeItems: 'center' }}><p className="nfd-body">Turma não encontrada ou inscrições encerradas.</p></div>;
  }

  const professor = evento.professor_convidado ?? 'Rodrygo Murari';
  const irParaFormulario = () => document.getElementById('inscricao')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const formulario = (
    <form id="inscricao" onSubmit={handleSubmit} className="nfd-card" style={{ scrollMarginTop: 24 }}>
      <p className="nfd-eyebrow">Inscrição · {cidade}</p>
      <h2 className="nfd-h3" style={{ marginTop: 12 }}>Garanta sua vaga</h2>
      <p className="nfd-small" style={{ marginTop: 8 }}>{dataFmt.diaSemana}, {dataFmt.curta} · vagas limitadas pelo tamanho da sala.</p>

      <div style={{ marginTop: 28, display: 'grid', gap: 20 }}>
        <div>
          <label htmlFor="npa-nome" className="nfd-label">Nome completo</label>
          <input id="npa-nome" className="nfd-input" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Como no seu documento" autoComplete="name" required />
        </div>
        <div>
          <label htmlFor="npa-whatsapp" className="nfd-label">WhatsApp com DDD</label>
          <input id="npa-whatsapp" className="nfd-input" type="tel" value={whatsapp} onChange={handleWhatsapp} placeholder="(11) 90000-0000" autoComplete="tel" required />
        </div>
        <div>
          <p className="nfd-label">Escolha sua turma</p>
          <div style={{ display: 'grid', gap: 10 }}>
            {([
              { key: 'manha' as const, rotulo: 'Manhã', horario: '09h às 13h' },
              { key: 'tarde' as const, rotulo: 'Tarde', horario: '14h às 18h' },
            ]).map((t) => (
              <button key={t.key} type="button" onClick={() => setTurno(t.key)} aria-pressed={turno === t.key} className="nfd-turno">
                <span style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span className="nfd-radio" />
                  <span style={{ flex: 1 }}>
                    <span style={{ display: 'block', fontWeight: 600 }}>{t.rotulo} · {t.horario}</span>
                    <span className="nfd-small" style={{ display: 'block', marginTop: 2 }}>{dataFmt.diaSemana}, {dataFmt.curta}</span>
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
        <button type="submit" disabled={enviando} className="nfd-btn nfd-btn--primary">
          {enviando ? 'Processando…' : <>Garantir minha vaga por R$ {preco} <ArrowRight size={16} /></>}
        </button>
        <p className="nfd-small" style={{ textAlign: 'center' }}>Pagamento seguro · seus dados ficam protegidos</p>
      </div>
    </form>
  );

  return (
    <div className="nfd">
      {/* ── TOPO ───────────────────────────────────── */}
      <header className="nfd-deep" style={{ borderBottom: '1px solid var(--line)' }}>
        <div className="nfd-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBlock: 18 }}>
          <img src={LOGO} alt="Instituto DespertaMente" style={{ height: 40, width: 'auto' }} fetchPriority="high" decoding="async" />
          <button type="button" onClick={irParaFormulario} className="nfd-btn nfd-btn--primary" style={{ width: 'auto', padding: '10px 18px', fontSize: '.875rem' }}>
            Garantir vaga
          </button>
        </div>
      </header>

      {/* ── HERO + FORMULÁRIO ─────────────────────── */}
      <section className="nfd-deep" style={{ paddingBlock: 'clamp(48px, 8vw, 96px)' }}>
        <div className="nfd-wrap nfd-hero-grid">
          <div>
            <p className="nfd-eyebrow">IDM pelo Brasil · Numerologia · {cidade}</p>
            <h1 className="nfd-display" style={{ marginTop: 18 }}>
              Numerologia na prática, <span className="nfd-accent">ao vivo</span> em {cidade}.
            </h1>
            <p className="nfd-lead" style={{ marginTop: 22, maxWidth: 560 }}>
              Uma experiência presencial com {professor} pra aprender, vivenciar e aplicar a numerologia com clareza.
              Você sai com o seu mapa numerológico pronto, certificado e material de apoio.
            </p>
            <div className="nfd-line" style={{ marginTop: 32, paddingTop: 24, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 16 }}>
              <div><p className="nfd-meta">Data</p><p style={{ marginTop: 6, fontWeight: 600 }}>{dataFmt.diaMes} · {dataFmt.diaSemana.split('-')[0]}</p></div>
              <div><p className="nfd-meta">Turmas</p><p style={{ marginTop: 6, fontWeight: 600 }}>Manhã ou tarde</p></div>
              <div><p className="nfd-meta">Ingresso</p><p style={{ marginTop: 6, fontWeight: 600 }} className="nfd-accent">R$ {preco}</p></div>
            </div>
            <div style={{ marginTop: 32 }}><VideoPlayer /></div>
            <p className="nfd-small" style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <MapPin size={14} /> {evento.local} · <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="nfd-accent">ver no mapa</a>
            </p>
          </div>
          <div className="nfd-sticky">{formulario}</div>
        </div>
      </section>

      {/* ── O QUE VOCÊ VAI APRENDER ───────────────── */}
      <section className="nfd-section">
        <div className="nfd-wrap">
          <p className="nfd-eyebrow">O conteúdo</p>
          <h2 className="nfd-h2" style={{ marginTop: 14, maxWidth: 760 }}>
            Três frentes, aplicadas <span className="nfd-accent">no mesmo dia</span>.
          </h2>
          <div className="nfd-grid-3" style={{ marginTop: 48 }}>
            {PILARES.map((p, i) => (
              <div key={p.titulo}>
                <p className="nfd-meta">{String(i + 1).padStart(2, '0')}</p>
                <h3 className="nfd-h3" style={{ marginTop: 14 }}>{p.titulo}</h3>
                <p className="nfd-small" style={{ marginTop: 6 }}>{p.subtitulo}</p>
                <ul style={{ marginTop: 22, display: 'grid', gap: 12 }}>
                  {p.itens.map((item) => <li key={item} className="nfd-check nfd-small" style={{ color: 'var(--ink-2)' }}>{item}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PROFESSOR ─────────────────────────────── */}
      <section className="nfd-section nfd-band">
        <div className="nfd-wrap" style={{ display: 'grid', gap: 48, alignItems: 'center', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          <img src={FOTO_RODRYGO} alt="Rodrygo Murari" loading="lazy" decoding="async"
            style={{ width: '100%', maxWidth: 420, aspectRatio: '1', objectFit: 'cover', borderRadius: 10, border: '1px solid var(--line)' }} />
          <div>
            <p className="nfd-eyebrow">Quem conduz</p>
            <h2 className="nfd-h2" style={{ marginTop: 14 }}>Rodrygo Murari</h2>
            <p className="nfd-meta" style={{ marginTop: 10 }}>Fundador do Instituto Despertamente</p>
            <p className="nfd-body" style={{ marginTop: 24 }}>
              Mais de <span style={{ color: 'var(--ink)' }}>5.000 horas</span> de atendimentos, treinamentos e mentorias.
              Especialista em Metafísica Comportamental e PNL Sistêmica, criador do Método NPS de Numerologia Pitagórica Sistêmica.
            </p>
            <p className="nfd-body" style={{ marginTop: 14 }}>
              O propósito dele é uma numerologia descomplicada, que você entende e usa no dia a dia.
            </p>
          </div>
        </div>
      </section>

      {/* ── INVESTIMENTO ─────────────────────────── */}
      <section className="nfd-section">
        <div className="nfd-wrap" style={{ display: 'grid', gap: 48, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', alignItems: 'start' }}>
          <div>
            <p className="nfd-eyebrow">Investimento</p>
            <h2 className="nfd-h2" style={{ marginTop: 14 }}>
              Por que só <span className="nfd-accent">R$ {preco}</span>?
            </h2>
            <p className="nfd-body" style={{ marginTop: 22 }}>
              A missão do Instituto é tornar o autoconhecimento acessível. O valor do ingresso garante o seu compromisso
              com o encontro e cobre a organização. É presencial, com a profundidade e a troca que só o contato direto dá.
            </p>
          </div>
          <div className="nfd-card">
            <p className="nfd-meta">O que está incluso</p>
            <ul style={{ marginTop: 20, display: 'grid', gap: 14 }}>
              {['Encontro presencial de 4 horas', 'Seu mapa numerológico pronto', 'Certificado de conclusão', 'Material de apoio exclusivo', 'Grupo dos participantes no WhatsApp'].map((item) => (
                <li key={item} className="nfd-check nfd-body">{item}</li>
              ))}
            </ul>
            <div className="nfd-line" style={{ marginTop: 28, paddingTop: 24, display: 'flex', alignItems: 'end', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <p className="nfd-small" style={{ textDecoration: 'line-through' }}>R$ 497</p>
                <p style={{ fontFamily: 'var(--serif)', fontWeight: 600, fontSize: 44, lineHeight: 1 }}>R$ {preco}</p>
              </div>
              <p className="nfd-meta" style={{ textAlign: 'right' }}>ingresso<br />único</p>
            </div>
            <button type="button" onClick={irParaFormulario} className="nfd-btn nfd-btn--primary" style={{ marginTop: 24 }}>
              Garantir minha vaga <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────── */}
      <section className="nfd-section nfd-band">
        <div className="nfd-narrow">
          <p className="nfd-eyebrow">Dúvidas</p>
          <h2 className="nfd-h2" style={{ marginTop: 14 }}>Perguntas frequentes</h2>
          <div className="nfd-faq" style={{ marginTop: 40 }}>
            {[
              ['Nunca estudei numerologia. É pra mim?', 'Sim. O encontro foi pensado pra quem está começando do zero. Você sai sabendo calcular e interpretar o seu próprio mapa.'],
              [`Por que o ingresso custa R$ ${preco}?`, 'Não tem pegadinha. A missão do Instituto é tornar o autoconhecimento acessível: o valor garante o seu compromisso e cobre os custos de organização.'],
              ['O certificado é reconhecido?', 'Você recebe o certificado de conclusão do Instituto Despertamente, que comprova a participação e o aprendizado em Numerologia Pitagórica Sistêmica.'],
              ['Quando e onde vai ser?', `${dataFmt.diaSemana}, ${dataFmt.curta}, com duas turmas: manhã (09h às 13h) e tarde (14h às 18h), em ${evento.local}. Os detalhes chegam pelo WhatsApp depois da inscrição.`],
              ['E se eu não puder ir depois de pagar?', 'Fale com a gente com 48 horas de antecedência. A gente avalia transferir a sua vaga pra próxima turma ou fazer o reembolso.'],
              ['Preciso levar algum material?', 'Não. O material está incluso. Se quiser, leve um caderno pras suas anotações.'],
              ['O pagamento é seguro?', 'Sim. O pagamento é feito em ambiente seguro e você recebe a confirmação na hora.'],
            ].map(([q, a]) => (
              <details key={q}><summary>{q}</summary><p className="nfd-body">{a}</p></details>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ─────────────────────────────── */}
      <section className="nfd-deep" style={{ paddingBlock: 'clamp(64px, 10vw, 120px)', textAlign: 'center' }}>
        <div className="nfd-narrow">
          <p className="nfd-eyebrow">{dataFmt.diaSemana}, {dataFmt.curta} · {cidade}</p>
          <h2 className="nfd-h2" style={{ marginTop: 14 }}>
            Quando a sala lota, <span className="nfd-accent">lotou</span>.
          </h2>
          <div style={{ maxWidth: 420, margin: '32px auto 0' }}>
            <button type="button" onClick={irParaFormulario} className="nfd-btn nfd-btn--primary">
              Garantir minha vaga por R$ {preco} <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </section>

      <footer style={{ borderTop: '1px solid var(--line)', paddingBlock: 40 }}>
        <div className="nfd-wrap" style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center', justifyContent: 'space-between' }}>
          <img src={LOGO} alt="Instituto DespertaMente" style={{ height: 32, width: 'auto' }} loading="lazy" decoding="async" />
          <div style={{ display: 'flex', gap: 20 }} className="nfd-small">
            <a href="https://www.instagram.com/institutodespertamente/" target="_blank" rel="noopener noreferrer">Instagram</a>
            <a href="https://www.youtube.com/@institutodespertamente" target="_blank" rel="noopener noreferrer">YouTube</a>
            <a href="https://www.idmpsi.com.br" target="_blank" rel="noopener noreferrer">idmpsi.com.br</a>
          </div>
          <p className="nfd-small">© {new Date().getFullYear()} Instituto Despertamente</p>
        </div>
      </footer>
    </div>
  );
}
