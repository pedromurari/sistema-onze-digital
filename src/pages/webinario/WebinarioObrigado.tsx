import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { TEMAS_WEBINARIO } from './webinario-temas';
import { supabase } from '@/integrations/supabase/client';
import './webinario.css';

function diffParts(msRestantes: number) {
  const total = Math.max(0, Math.floor(msRestantes / 1000));
  return {
    horas: Math.floor(total / 3600),
    minutos: Math.floor((total % 3600) / 60),
    segundos: total % 60,
  };
}

export default function WebinarioObrigado() {
  const { slug = 'psicanalise' } = useParams();
  const navigate = useNavigate();
  const [agora, setAgora] = useState(Date.now());

  const sessaoId = sessionStorage.getItem('webinario_sessao_id');
  const inicioEmStr = sessionStorage.getItem('webinario_inicio_em');
  const nome = sessionStorage.getItem('webinario_nome') || '';

  // A aula depende de gravação real -- não dá pra decidir isso por uma
  // lista fixa de temas (fica desatualizada assim que o vídeo é gravado).
  // Confere direto no banco se o webinário já tem video_url configurado.
  const [temVideo, setTemVideo] = useState<boolean | null>(null);

  useEffect(() => {
    if (!sessaoId || !inicioEmStr) {
      navigate(`/webinario/${slug}`, { replace: true });
    }
  }, [sessaoId, inicioEmStr, slug, navigate]);

  useEffect(() => {
    let ativo = true;
    void supabase.from('webinarios').select('video_url').eq('slug', slug).maybeSingle()
      .then(({ data }) => { if (ativo) setTemVideo(Boolean((data as { video_url: string | null } | null)?.video_url)); });
    return () => { ativo = false; };
  }, [slug]);

  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!sessaoId || !inicioEmStr || temVideo === null) return null;

  if (!temVideo) return (
    <div className="idm-webinario"><div className="iw-wrap iw-wrap-center">
      <div className="iw-logo">INSTITUTO DESPERTAMENTE</div>
      <h1 className="iw-h1">Cadastro recebido{nome ? `, ${nome.split(' ')[0]}` : ''}!</h1>
      <p className="iw-sub">Seu interesse em “{TEMAS_WEBINARIO[slug]?.titulo ?? 'nossa aula'}” foi registrado. Confira as próximas orientações pelo contato informado.</p>
      <div className="iw-card"><p>Esta página é a confirmação do cadastro, não uma sala ao vivo. Você não precisa aguardar um horário agora.</p></div>
    </div></div>
  );

  const inicioEm = new Date(inicioEmStr).getTime();
  const restante = inicioEm - agora;
  // Botão liberado 2min antes da sessão (mesma regra do protótipo original).
  const liberado = restante <= 2 * 60 * 1000;
  const { horas, minutos, segundos } = diffParts(restante);

  return (
    <div className="idm-webinario">
      <div className="iw-wrap iw-wrap-center">
        <div className="iw-logo">INSTITUTO DESPERTAMENTE</div>
        <h1 className="iw-h1">🎉 Vaga garantida{nome ? `, ${nome.split(' ')[0]}` : ''}!</h1>
        <p className="iw-sub">
          {liberado
            ? 'A sala já está liberada — é só entrar.'
            : 'Guarda esse horário: sua aula ao vivo está prestes a começar.'}
        </p>

        {!liberado && (
          <div className="iw-countdown">
            <div className="iw-countdown-box">
              <div className="iw-countdown-num">{String(horas).padStart(2, '0')}</div>
              <div className="iw-countdown-label">Horas</div>
            </div>
            <div className="iw-countdown-box">
              <div className="iw-countdown-num">{String(minutos).padStart(2, '0')}</div>
              <div className="iw-countdown-label">Min</div>
            </div>
            <div className="iw-countdown-box">
              <div className="iw-countdown-num">{String(segundos).padStart(2, '0')}</div>
              <div className="iw-countdown-label">Seg</div>
            </div>
          </div>
        )}

        <div className="iw-card">
          <Button
            className="iw-btn-gold w-full"
            disabled={!liberado}
            onClick={() => navigate(`/webinario/sala/${sessaoId}`)}
          >
            {liberado ? 'ENTRAR NA SALA AGORA' : 'Aguardando o horário...'}
          </Button>
        </div>
      </div>
    </div>
  );
}
