import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import './webinario.css';

const SUPABASE_FUNCTIONS_URL = 'https://usqiyekfmwwnvkmkdlej.supabase.co/functions/v1';

interface Sessao {
  id: string;
  webinario_id: string;
  inicio_em: string;
}

interface Webinario {
  id: string;
  nome: string;
  slug: string;
  video_url: string | null;
  video_duracao_segundos: number | null;
  oferta_offset_segundos: number | null;
  grupo_whatsapp_url: string | null;
}

interface MensagemRoteiro {
  segundo: number;
  autor_nome: string;
  texto: string;
}

interface MensagemExibida {
  id: string;
  autor: string;
  texto: string;
  real: boolean;
  ordem: number; // timestamp (ms) usado só pra ordenar a timeline unificada
}

// Mensagens roteirizadas podem usar o placeholder {periodo} (ex: "Excelente
// {periodo}, gente!") -- como o webinário é evergreen, o mesmo segundo do
// vídeo pode cair de manhã numa sessão e de noite em outra, então o
// período tem que ser calculado em cima do horário real (America/Sao_Paulo)
// do momento em que a mensagem apareceria, não um texto fixo no banco.
function periodoPorHorario(ms: number): 'dia' | 'tarde' | 'noite' {
  const hora = Number(new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hourCycle: 'h23' }).format(new Date(ms)));
  if (hora < 12) return 'dia';
  if (hora < 18) return 'tarde';
  return 'noite';
}

async function track(trackingId: string, evento: string, extra?: Record<string, unknown>) {
  try {
    await fetch(`${SUPABASE_FUNCTIONS_URL}/webinario-track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trackingId, evento, ...extra }),
    });
  } catch {
    // tracking nao pode travar a experiencia do lead -- falha silenciosa
  }
}

export default function WebinarioSala() {
  const { sessionId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [webinario, setWebinario] = useState<Webinario | null>(null);
  const [mensagensRoteiro, setMensagensRoteiro] = useState<MensagemRoteiro[]>([]);
  const [roteiroVisivel, setRoteiroVisivel] = useState<MensagemRoteiro[]>([]);
  const [mensagensReais, setMensagensReais] = useState<{ id: string; nome: string; texto: string; criado_em: string }[]>([]);
  const [novaMensagem, setNovaMensagem] = useState('');
  const [enviandoMsg, setEnviandoMsg] = useState(false);
  const [mostrarOferta, setMostrarOferta] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [nomeLead, setNomeLead] = useState(sessionStorage.getItem('webinario_nome') || 'Participante');

  // Prioriza o token `t` da URL (link mandado por WhatsApp, funciona em
  // qualquer aparelho) e cai pro sessionStorage de quem clicou "entrar na
  // sala" vindo da própria página de obrigado, no mesmo navegador.
  const trackingId = searchParams.get('t') || sessionStorage.getItem('webinario_tracking_id');
  const leadIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!sessionId || !trackingId) {
      navigate('/webinario/psicanalise', { replace: true });
      return;
    }
    sessionStorage.setItem('webinario_tracking_id', trackingId);

    (async () => {
      const { data: sessaoData } = await supabase
        .from('webinario_sessoes')
        .select('id, webinario_id, inicio_em')
        .eq('id', sessionId)
        .maybeSingle();

      if (!sessaoData) {
        navigate('/webinario/psicanalise', { replace: true });
        return;
      }
      setSessao(sessaoData as Sessao);

      const { data: webinarioData } = await supabase
        .from('webinarios')
        .select('id, nome, slug, video_url, video_duracao_segundos, oferta_offset_segundos, grupo_whatsapp_url')
        .eq('id', sessaoData.webinario_id)
        .maybeSingle();
      setWebinario(webinarioData as Webinario);

      const { data: mensagensData } = await supabase
        .from('webinario_mensagens_chat')
        .select('segundo, autor_nome, texto')
        .eq('webinario_id', sessaoData.webinario_id)
        .order('segundo', { ascending: true });
      setMensagensRoteiro((mensagensData as MensagemRoteiro[]) ?? []);

      const { data: trackingData } = await supabase
        .from('webinario_tracking')
        .select('lead_id')
        .eq('id', trackingId)
        .maybeSingle();
      const leadId = (trackingData as { lead_id: string } | null)?.lead_id ?? null;
      leadIdRef.current = leadId;

      if (leadId) {
        const { data: leadData } = await supabase.from('leads').select('nome').eq('id', leadId).maybeSingle();
        const nomeDb = (leadData as { nome: string } | null)?.nome;
        if (nomeDb) {
          setNomeLead(nomeDb);
          sessionStorage.setItem('webinario_nome', nomeDb);
        }
      }

      const { data: reaisData } = await supabase
        .from('webinario_chat_mensagens')
        .select('id, nome, texto, criado_em')
        .eq('sessao_id', sessionId)
        .order('criado_em', { ascending: true });
      setMensagensReais(reaisData ?? []);

      setCarregando(false);
      track(trackingId, 'enter');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Chat ao vivo de verdade: qualquer mensagem inserida por quem está nessa
  // mesma sessão (sessao_id) chega em tempo real via Realtime do Supabase
  // pra todo mundo que está assistindo junto.
  useEffect(() => {
    if (!sessionId) return;
    const canal = supabase
      .channel(`webinario-chat-${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'webinario_chat_mensagens', filter: `sessao_id=eq.${sessionId}` },
        (payload) => {
          const nova = payload.new as { id: string; nome: string; texto: string; criado_em: string };
          setMensagensReais((prev) => (prev.some((m) => m.id === nova.id) ? prev : [...prev, nova]));
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(canal); };
  }, [sessionId]);

  const enviarMensagem = async (event: React.FormEvent) => {
    event.preventDefault();
    const texto = novaMensagem.trim();
    if (!texto || !sessionId || enviandoMsg) return;
    setEnviandoMsg(true);
    const { error } = await supabase.from('webinario_chat_mensagens').insert({
      sessao_id: sessionId,
      lead_id: leadIdRef.current,
      nome: nomeLead,
      texto: texto.slice(0, 300),
    });
    if (!error) setNovaMensagem('');
    setEnviandoMsg(false);
  };

  // Timeline unificada: mensagens roteirizadas (reveladas conforme o vídeo
  // avança) e mensagens reais de outros participantes (chegam ao vivo),
  // ordenadas pelo momento real em que apareceriam -- início da sessão +
  // segundo do roteiro, ou o timestamp real de quem mandou.
  const timeline: MensagemExibida[] = [
    ...roteiroVisivel.map((m, i): MensagemExibida => {
      const ordem = sessao ? new Date(sessao.inicio_em).getTime() + m.segundo * 1000 : m.segundo;
      return {
        id: `roteiro-${i}`,
        autor: m.autor_nome,
        texto: m.texto.includes('{periodo}') ? m.texto.replace('{periodo}', periodoPorHorario(ordem)) : m.texto,
        real: false,
        ordem,
      };
    }),
    ...mensagensReais.map((m): MensagemExibida => ({
      id: m.id,
      autor: m.nome,
      texto: m.texto,
      real: true,
      ordem: new Date(m.criado_em).getTime(),
    })),
  ].sort((a, b) => a.ordem - b.ordem);

  // Heartbeat a cada 15s + libera chat roteirizado e CTA conforme o segundo do vídeo.
  const onTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video || !webinario) return;
    const atual = Math.floor(video.currentTime);
    const total = Math.floor(video.duration || webinario.video_duracao_segundos || 0);

    setRoteiroVisivel(mensagensRoteiro.filter((m) => m.segundo <= atual));

    if (
      webinario.oferta_offset_segundos != null &&
      atual >= webinario.oferta_offset_segundos &&
      !mostrarOferta
    ) {
      setMostrarOferta(true);
      if (trackingId) track(trackingId, 'cta');
    }
  }, [webinario, mensagensRoteiro, mostrarOferta, trackingId]);

  useEffect(() => {
    if (!trackingId) return;
    const id = setInterval(() => {
      const video = videoRef.current;
      if (!video) return;
      track(trackingId, 'heartbeat', {
        currentSecond: Math.floor(video.currentTime),
        totalSeconds: Math.floor(video.duration || webinario?.video_duracao_segundos || 0),
      });
    }, 15000);
    return () => clearInterval(id);
  }, [trackingId, webinario]);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' });
  }, [timeline.length]);

  // Entra no segundo certo (elapsed desde o inicio_em da sessao) e nunca
  // deixa voltar/avançar manualmente -- mesma regra do protótipo original
  // (sem seek, assistir é "ao vivo" de verdade).
  const onLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video || !sessao) return;
    const elapsedMs = Date.now() - new Date(sessao.inicio_em).getTime();
    const elapsedS = Math.max(0, Math.floor(elapsedMs / 1000));
    if (elapsedS < video.duration) {
      video.currentTime = elapsedS;
    }
    video.play().catch(() => {});
  };

  const ultimoTempoPermitido = useRef(0);
  const onSeeking = () => {
    const video = videoRef.current;
    if (!video) return;
    const diff = Math.abs(video.currentTime - ultimoTempoPermitido.current);
    if (diff > 2) video.currentTime = ultimoTempoPermitido.current;
  };
  const onPlaying = () => {
    if (videoRef.current) ultimoTempoPermitido.current = videoRef.current.currentTime;
  };

  const irParaOferta = () => {
    if (trackingId) track(trackingId, 'offer');
    navigate(`/webinario/oferta/${webinario?.slug ?? 'psicanalise'}`);
  };

  if (carregando) {
    return (
      <div className="idm-webinario">
        <div className="iw-wrap iw-wrap-center">
          <p className="iw-sub">Carregando a sala...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="idm-webinario">
      <div className="iw-sala">
        <div className="iw-video-wrap">
          {webinario?.video_url && (
            <video
              ref={videoRef}
              src={webinario.video_url}
              onLoadedMetadata={onLoadedMetadata}
              onTimeUpdate={onTimeUpdate}
              onSeeking={onSeeking}
              onPlaying={onPlaying}
              playsInline
              controls={false}
              autoPlay
            />
          )}
        </div>
        <div className="iw-chat-panel">
          <div className="iw-chat" ref={chatRef}>
            <p className="iw-chat-disclosure">Chat ao vivo · mensagens da equipe IDM e de outros participantes</p>
            {timeline.map((m) => (
              <div key={m.id} className={`iw-chat-msg ${m.real ? 'iw-chat-msg-real' : ''}`}>
                <span className="iw-chat-autor">{m.autor}</span>
                {m.texto}
              </div>
            ))}
          </div>
          <form className="iw-chat-form" onSubmit={(event) => void enviarMensagem(event)}>
            <label className="sr-only" htmlFor="sala-chat-input">Digite sua mensagem</label>
            <input
              id="sala-chat-input"
              type="text"
              placeholder="Digite sua mensagem..."
              maxLength={300}
              value={novaMensagem}
              onChange={(event) => setNovaMensagem(event.target.value)}
            />
            <button type="submit" disabled={enviandoMsg || !novaMensagem.trim()}>Enviar</button>
          </form>
        </div>
      </div>

      {mostrarOferta && (
        <div className="iw-cta-overlay">
          <div className="iw-logo">INSTITUTO DESPERTAMENTE</div>
          <h2 className="iw-h1" style={{ fontSize: '1.5rem' }}>
            Chegou a hora de dar o próximo passo 🚀
          </h2>
          <p className="iw-sub">Clica no botão abaixo pra conhecer a oferta especial de hoje.</p>
          <div className="iw-card" style={{ width: '100%', maxWidth: 360 }}>
            <Button className="iw-btn-gold w-full" onClick={irParaOferta}>
              QUERO GARANTIR MINHA VAGA
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
