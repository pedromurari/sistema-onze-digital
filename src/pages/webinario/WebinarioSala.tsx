import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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

interface MensagemChat {
  segundo: number;
  autor_nome: string;
  texto: string;
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
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [webinario, setWebinario] = useState<Webinario | null>(null);
  const [mensagens, setMensagens] = useState<MensagemChat[]>([]);
  const [mensagensVisiveis, setMensagensVisiveis] = useState<MensagemChat[]>([]);
  const [mostrarOferta, setMostrarOferta] = useState(false);
  const [carregando, setCarregando] = useState(true);

  const trackingId = sessionStorage.getItem('webinario_tracking_id');

  useEffect(() => {
    if (!sessionId || !trackingId) {
      navigate('/webinario/psicanalise', { replace: true });
      return;
    }

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
      setMensagens((mensagensData as MensagemChat[]) ?? []);

      setCarregando(false);
      track(trackingId, 'enter');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Heartbeat a cada 15s + libera chat fake e CTA conforme o segundo do vídeo.
  const onTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video || !webinario) return;
    const atual = Math.floor(video.currentTime);
    const total = Math.floor(video.duration || webinario.video_duracao_segundos || 0);

    setMensagensVisiveis(mensagens.filter((m) => m.segundo <= atual));

    if (
      webinario.oferta_offset_segundos != null &&
      atual >= webinario.oferta_offset_segundos &&
      !mostrarOferta
    ) {
      setMostrarOferta(true);
      if (trackingId) track(trackingId, 'cta');
    }
  }, [webinario, mensagens, mostrarOferta, trackingId]);

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
  }, [mensagensVisiveis]);

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
        <div className="iw-chat" ref={chatRef}>
          <p className="iw-chat-disclosure">Perguntas-guia preparadas pela equipe IDM · não é chat ao vivo</p>
          {mensagensVisiveis.map((m, i) => (
            <div key={i} className="iw-chat-msg">
              <span className="iw-chat-autor">{m.autor_nome}</span>
              {m.texto}
            </div>
          ))}
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
