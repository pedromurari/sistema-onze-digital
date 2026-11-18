import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { MapPin, Play, ShieldCheck, Sparkles, Users } from 'lucide-react';
import { carregarPixel, trackPixel } from './meta-pixel';
import '../webinario/webinario.css';

const IDM_LOGO = 'https://turma47.semanadodespertar.online/lovable-uploads/1b0d4a56-e01f-4ce0-b2f7-0eecf33da536.png';
const VIDEO_URL = 'https://pub-da74b2ec5ddf4847a6f20dec2e542925.r2.dev/npa-assets/video-rodrygo-npa.mp4';

// Links de checkout do Vega -- placeholders até o Pedro criar os produtos e
// mandar as URLs reais. Troca só os valores aqui quando chegarem, nenhuma
// outra parte do componente muda.
const CHECKOUT_URLS: Record<string, { manha: string; tarde: string }> = {
  'sao-paulo': { manha: '', tarde: '' },
  santos: { manha: '', tarde: '' },
};

const FUNCTIONS_URL = 'https://usqiyekfmwwnvkmkdlej.supabase.co/functions/v1';

interface EventoPublico {
  nome: string;
  data_evento: string;
  local: string;
  valor_ingresso: number;
  valor_material_padrao: number;
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
    diaSemana: diaSemana.charAt(0).toUpperCase() + diaSemana.slice(1),
  };
}

function diffParts(msRestantes: number) {
  const total = Math.max(0, Math.floor(msRestantes / 1000));
  return {
    dias: Math.floor(total / 86400),
    horas: Math.floor((total % 86400) / 3600),
    minutos: Math.floor((total % 3600) / 60),
  };
}

function ContadorRegressivo({ alvo }: { alvo: string }) {
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);
  const restante = new Date(`${alvo}T09:00:00-03:00`).getTime() - agora;
  if (restante <= 0) return null;
  const { dias, horas, minutos } = diffParts(restante);
  const unidades = [['Dias', dias], ['Horas', horas], ['Min', minutos]] as const;
  return (
    <div className="iw-replica-countdown" role="timer" aria-label="Tempo restante até o evento">
      {unidades.map(([rotulo, valor]) => (
        <div key={rotulo}>
          <strong>{String(valor).padStart(2, '0')}</strong>
          <span>{rotulo}</span>
        </div>
      ))}
    </div>
  );
}

export default function NPACaptura() {
  const { slug = '' } = useParams();
  const [evento, setEvento] = useState<EventoPublico | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [nome, setNome] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [turno, setTurno] = useState<'manha' | 'tarde'>('manha');
  const [website, setWebsite] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const maxAssistidoRef = useRef(0);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [videoProgressPct, setVideoProgressPct] = useState(0);

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

  const dataFormatada = useMemo(() => (evento ? formatarData(evento.data_evento) : null), [evento]);
  const mapsUrl = useMemo(() => (evento ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(evento.local)}` : '#'), [evento]);

  async function enviar(event: FormEvent) {
    event.preventDefault();
    if (website) return; // honeypot
    if (!nome.trim() || whatsapp.replace(/\D/g, '').length < 10) {
      setErro('Preencha nome e WhatsApp corretamente.');
      return;
    }
    const checkoutUrl = CHECKOUT_URLS[slug]?.[turno];
    if (!checkoutUrl) {
      setErro('As inscrições abrem em instantes — tenta de novo em alguns minutos.');
      return;
    }
    setEnviando(true);
    setErro('');
    trackPixel('Lead', { content_name: `NPA ${slug} - ${turno}` });
    const params = new URLSearchParams(window.location.search);
    const digitos = whatsapp.replace(/\D/g, '');
    params.set('nome', nome.trim());
    params.set('whatsapp', digitos);
    if (email.trim()) params.set('email', email.trim());
    window.location.href = `${checkoutUrl}${checkoutUrl.includes('?') ? '&' : '?'}${params.toString()}`;
  }

  if (carregando) {
    return <div className="iw-replica" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><p>Carregando...</p></div>;
  }

  if (!evento) {
    return <div className="iw-replica" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><p>Turma não encontrada ou inscrições encerradas.</p></div>;
  }

  const cidade = evento.nome.replace(/^NPA #\d+\s*/i, '');

  return (
    <main className="idm-webinario iw-replica">
      <section className="iw-replica-hero" id="inicio">
        <div className="iw-replica-orb iw-replica-orb-one" aria-hidden="true" />
        <div className="iw-replica-orb iw-replica-orb-two" aria-hidden="true" />
        <div className="iw-replica-hero-inner">
          <h1><span>IDM Pelo Brasil</span><br /><em>Numerologia em {cidade}</em></h1>
          <h2>Um evento presencial para você descobrir o seu Caminho de Vida, o número do seu nome e o ciclo que você está vivendo — com o psicanalista Rodrygo Murari.</h2>

          <div className="iw-replica-event-box">
            <strong>NPA · NUMEROLOGIA PRESENCIAL · {cidade.toUpperCase()}</strong>
            <span>{dataFormatada?.diaSemana}, {dataFormatada?.curta} · Manhã (09h-13h) ou Tarde (14h-18h)</span>
            <b>INGRESSO: R$ {evento.valor_ingresso.toFixed(2).replace('.', ',')}</b>
          </div>

          <ContadorRegressivo alvo={evento.data_evento} />

          <div
            className="iw-replica-media iw-replica-media--custom"
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
              playsInline
              preload="metadata"
              aria-label="Vídeo de apresentação do NPA - IDM Pelo Brasil"
              onPlay={() => setVideoPlaying(true)}
              onPause={() => setVideoPlaying(false)}
              onTimeUpdate={(event) => {
                const video = event.currentTarget;
                const t = video.currentTime;
                if (t > maxAssistidoRef.current + 1.5) video.currentTime = maxAssistidoRef.current;
                else if (t > maxAssistidoRef.current) maxAssistidoRef.current = t;
                if (video.duration) setVideoProgressPct((video.currentTime / video.duration) * 100);
              }}
              onSeeking={(event) => {
                const video = event.currentTarget;
                if (video.currentTime > maxAssistidoRef.current + 0.5) video.currentTime = maxAssistidoRef.current;
              }}
              onSeeked={(event) => {
                const video = event.currentTarget;
                if (video.currentTime > maxAssistidoRef.current + 0.5) video.currentTime = maxAssistidoRef.current;
              }}
            />
            {!videoPlaying && (
              <div className="iw-replica-media-playbtn iw-replica-media-playbtn--pulse" aria-hidden="true">
                <Play fill="currentColor" />
              </div>
            )}
            <div className="iw-replica-media-bar">
              <div className="iw-replica-media-bar-fill" style={{ width: `${videoProgressPct}%` }} />
            </div>
          </div>

          <div className="iw-replica-form-card" id="cadastro">
            <form onSubmit={(event) => void enviar(event)}>
              <label className="sr-only" htmlFor="npa-turno">Turno</label>
              <div className="iw-replica-phone" style={{ marginBottom: '0.6rem' }}>
                <select id="npa-turno" value={turno} onChange={(e) => setTurno(e.target.value as 'manha' | 'tarde')}
                  style={{ width: '100%', background: 'transparent', color: 'inherit', border: 0, padding: '0.75rem' }}>
                  <option value="manha">Manhã · 09h às 13h</option>
                  <option value="tarde">Tarde · 14h às 18h</option>
                </select>
              </div>
              <label className="sr-only" htmlFor="npa-nome">Nome completo</label>
              <input id="npa-nome" autoComplete="name" required minLength={2} maxLength={120} placeholder="Insira seu nome" value={nome} onChange={(e) => setNome(e.target.value)} />
              <label className="sr-only" htmlFor="npa-email">E-mail</label>
              <input id="npa-email" type="email" autoComplete="email" placeholder="Insira seu melhor e-mail (opcional)" value={email} onChange={(e) => setEmail(e.target.value)} />
              <label className="sr-only" htmlFor="npa-whatsapp">WhatsApp</label>
              <div className="iw-replica-phone"><span>BR +55</span><input id="npa-whatsapp" type="tel" inputMode="tel" autoComplete="tel" required maxLength={11} placeholder="WhatsApp - (99) 99999-9999" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value.replace(/\D/g, '').slice(0, 11))} /></div>
              <input aria-hidden="true" tabIndex={-1} autoComplete="off" className="sr-only" value={website} onChange={(e) => setWebsite(e.target.value)} />
              {erro && <p role="alert" style={{ color: '#f87171', fontSize: '0.85em' }}>{erro}</p>}
              <button type="submit" disabled={enviando}>{enviando ? 'REDIRECIONANDO...' : 'GARANTIR MINHA VAGA'}</button>
            </form>
            <p>Vaga garantida só após a confirmação do pagamento — você será redirecionado(a) pro checkout seguro.</p>
          </div>

          <p className="iw-replica-video-disclosure">
            <MapPin aria-hidden="true" style={{ display: 'inline', width: '1em', height: '1em', verticalAlign: '-0.15em' }} /> {evento.local} —{' '}
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer">ver no Google Maps</a>
          </p>
        </div>
      </section>

      <section className="iw-replica-section iw-replica-pillars">
        <div className="iw-replica-container">
          <h2>O QUE VOCÊ VAI <em>DESCOBRIR</em>:</h2>
          <div className="iw-replica-pillar-grid">
            <article>
              <div className="iw-replica-pillar-top"><span aria-hidden="true">🧭</span><h3>Seu Caminho de Vida</h3></div>
              <div className="iw-replica-pillar-bottom"><p>O número calculado a partir da sua data de nascimento, que revela seus talentos naturais e os desafios que mais se repetem.</p></div>
            </article>
            <article>
              <div className="iw-replica-pillar-top"><span aria-hidden="true">✨</span><h3>O número do seu nome</h3></div>
              <div className="iw-replica-pillar-bottom"><p>Como você é percebido(a) pelo mundo — e se isso combina com quem você realmente é.</p></div>
            </article>
            <article>
              <div className="iw-replica-pillar-top"><span aria-hidden="true">🔄</span><h3>O ciclo de 9 anos</h3></div>
              <div className="iw-replica-pillar-bottom"><p>Em que ano do seu ciclo pessoal você está, e como parar de nadar contra a maré.</p></div>
            </article>
            <article>
              <div className="iw-replica-pillar-top"><span aria-hidden="true">🎓</span><h3>Certificado de participação</h3></div>
              <div className="iw-replica-pillar-bottom"><p>Evento presencial com {evento.professor_convidado ?? 'Rodrygo Murari'}, com direito a certificado.</p></div>
            </article>
          </div>
        </div>
      </section>

      <section className="iw-replica-section iw-replica-pillars">
        <div className="iw-replica-container">
          <h2>COMO FUNCIONA, <em>NA PRÁTICA</em>:</h2>
          <div className="iw-replica-pillar-grid">
            <article>
              <div className="iw-replica-pillar-top"><span aria-hidden="true">①</span><h3>Garanta sua vaga aqui</h3></div>
              <div className="iw-replica-pillar-bottom"><p>Ingresso de R$ {evento.valor_ingresso.toFixed(2).replace('.', ',')}, pago no ato — é o que garante seu lugar.</p></div>
            </article>
            <article>
              <div className="iw-replica-pillar-top"><span aria-hidden="true">②</span><h3>Entre no grupo VIP</h3></div>
              <div className="iw-replica-pillar-bottom"><p>Após o pagamento, você recebe o link do grupo do WhatsApp da sua turma, com todas as orientações.</p></div>
            </article>
            <article>
              <div className="iw-replica-pillar-top"><span aria-hidden="true">③</span><h3>{dataFormatada?.diaSemana}, {dataFormatada?.curta}</h3></div>
              <div className="iw-replica-pillar-bottom"><p>Chegue com uns 15 minutinhos de antecedência pro credenciamento. Leve caderno, caneta e 1kg de alimento não perecível.</p></div>
            </article>
            <article>
              <div className="iw-replica-pillar-top"><span aria-hidden="true">④</span><h3>Experiência única, ao vivo</h3></div>
              <div className="iw-replica-pillar-bottom"><p>Não existe gravação — o que acontece no evento existe só naquele dia, pra quem estiver lá.</p></div>
            </article>
          </div>
        </div>
      </section>

      <section className="iw-replica-section iw-replica-institute">
        <div className="iw-replica-container">
          <img src={IDM_LOGO} alt="Instituto Despertamente" loading="lazy" />
          <h2>Instituto <em>Despertamente</em></h2>
          <p>
            O Instituto Despertamente é uma escola de desenvolvimento humano especializada no ensino da psicanálise. O IDM Pelo Brasil leva esse conteúdo, de forma presencial, pelas principais cidades do país — unindo numerologia, autoconhecimento e psicanálise integrativa num só evento.
          </p>
          <div>Ingresso: R$ {evento.valor_ingresso.toFixed(2).replace('.', ',')} — vagas limitadas.</div>
        </div>
      </section>

      <section className="iw-replica-section iw-replica-faq">
        <div className="iw-replica-container">
          <h2>Perguntas <em>Frequentes</em></h2><p>Tire suas dúvidas!</p>
          <div className="iw-replica-faq-list">
            <details><summary>Quanto custa o ingresso?</summary><p>R$ {evento.valor_ingresso.toFixed(2).replace('.', ',')}, pago no ato pra garantir sua vaga — as vagas são limitadas.</p></details>
            <details><summary>Preciso ter conhecimento prévio sobre numerologia?</summary><p>Não! O evento foi pensado tanto pra quem nunca ouviu falar do assunto quanto pra quem já estuda psicanálise ou numerologia.</p></details>
            <details><summary>Onde vai ser o evento?</summary><p>{evento.local}. O link do Google Maps está logo acima do formulário de inscrição.</p></details>
            <details><summary>O evento é presencial ou online?</summary><p>100% presencial, em {cidade}, no dia {dataFormatada?.curta}.</p></details>
            <details><summary>Vou receber confirmação?</summary><p>Sim — após o pagamento, você entra automaticamente no grupo VIP do WhatsApp da sua turma, com todos os lembretes e orientações.</p></details>
            <details><summary>O que eu preciso levar?</summary><p>Caderno, caneta e 1kg de alimento não perecível pra doação.</p></details>
          </div>
        </div>
      </section>

      <section className="iw-replica-final">
        <div className="iw-replica-container">
          <div className="iw-replica-benefits" aria-label="O que você recebe ao se inscrever">
            <article className="iw-replica-benefit"><div className="iw-replica-benefit-icon"><Sparkles aria-hidden="true" /></div><h3>Seu mapa numerológico</h3><p>Ao vivo, na hora</p></article>
            <article className="iw-replica-benefit"><div className="iw-replica-benefit-icon"><Users aria-hidden="true" /></div><h3>Grupo VIP da turma</h3><p>Todas as orientações</p></article>
            <article className="iw-replica-benefit"><div className="iw-replica-benefit-icon"><ShieldCheck aria-hidden="true" /></div><h3>Certificado incluso</h3><p>Participação presencial</p></article>
          </div>
          <div className="iw-replica-final-card">
            <h2>Vagas limitadas.<br /><em>Garanta a sua agora.</em></h2>
            <p>{dataFormatada?.diaSemana}, {dataFormatada?.curta} · {cidade} · Manhã ou Tarde</p>
            <a href="#cadastro">GARANTIR MINHA VAGA</a>
            <div>Ingresso: R$ {evento.valor_ingresso.toFixed(2).replace('.', ',')} — garante sua vaga no evento.</div>
          </div>
          <p className="iw-replica-final-line">✓ Evento presencial &nbsp; ✓ Certificado incluso &nbsp; ✓ Grupo VIP no WhatsApp</p>
        </div>
      </section>

      <footer className="iw-replica-footer-full">
        <div className="iw-replica-container iw-replica-footer-top">
          <img src={IDM_LOGO} alt="Instituto Despertamente" loading="lazy" />
        </div>
        <p className="iw-replica-footer-legal">
          © Instituto Despertamente · IDM Pelo Brasil · Este site não é afiliado ao Facebook ou a qualquer entidade do Facebook.
        </p>
      </footer>
    </main>
  );
}
