import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import '../webinario/webinario.css';

const FUNCTIONS_URL = 'https://usqiyekfmwwnvkmkdlej.supabase.co/functions/v1';
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;

interface Aula {
  numero: number;
  titulo: string;
  inicio_em: string;
  youtube_url: string | null;
}

interface TurmaInfo {
  nome: string;
  slogan: string | null;
}

// Página de captura das turmas do Curso Gratuito (Semana do Despertar),
// agora rodando dentro do próprio sistema -- sem repositório/domínio
// separado por turma (era o padrão antigo, gerava retrabalho e
// inconsistência entre turmas). O slug vem da rota /turma/:slug.
export default function TurmaCaptura() {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const [turma, setTurma] = useState<TurmaInfo | null>(null);
  const [aulas, setAulas] = useState<Aula[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [website, setWebsite] = useState(''); // honeypot

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
      navigate(`/turma/${slug}/obrigado`, { replace: true });
    } catch {
      toast.error('Erro de conexão. Tente novamente.');
      setEnviando(false);
    }
  };

  if (carregando) {
    return (
      <div className="idm-webinario">
        <div className="iw-wrap iw-wrap-center">
          <p className="iw-sub">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!turma) {
    return (
      <div className="idm-webinario">
        <div className="iw-wrap iw-wrap-center">
          <p className="iw-sub">Turma não encontrada ou inscrições encerradas.</p>
        </div>
      </div>
    );
  }

  return (
    <main className="idm-webinario iw-replica">
      <section className="iw-replica-hero" id="inicio">
        <div className="iw-replica-orb iw-replica-orb-one" aria-hidden="true" />
        <div className="iw-replica-orb iw-replica-orb-two" aria-hidden="true" />
        <div className="iw-replica-hero-inner">
          <h1><span>{turma.nome}</span></h1>
          {turma.slogan && <h2>{turma.slogan}</h2>}
          <div className="iw-replica-event-box">
            <strong>EVENTO GRATUITO</strong>
            <span>3 aulas ao vivo</span>
            <b>INSCRIÇÃO GRATUITA · VAGAS LIMITADAS</b>
          </div>

          {aulas.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, margin: '16px 0', display: 'grid', gap: 8 }}>
              {aulas.map((aula) => (
                <li key={aula.numero} style={{ color: 'var(--iw-text)', fontSize: '0.9rem' }}>
                  📅 <strong>{aula.titulo}</strong> —{' '}
                  {new Date(aula.inicio_em).toLocaleString('pt-BR', {
                    timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                  })}
                </li>
              ))}
            </ul>
          )}

          <div className="iw-replica-form-card" id="cadastro">
            <form onSubmit={handleSubmit}>
              <input
                type="text" value={website} onChange={(e) => setWebsite(e.target.value)}
                autoComplete="off" tabIndex={-1} aria-hidden="true"
                style={{ position: 'absolute', left: '-9999px', width: 1, height: 1 }}
              />
              <label className="sr-only" htmlFor="t-nome">Nome completo</label>
              <input id="t-nome" autoComplete="name" required placeholder="Insira seu nome" value={nome} onChange={(event) => setNome(event.target.value)} />
              <label className="sr-only" htmlFor="t-email">E-mail</label>
              <input id="t-email" type="email" autoComplete="email" placeholder="Insira seu melhor e-mail (opcional)" value={email} onChange={(event) => setEmail(event.target.value)} />
              <label className="sr-only" htmlFor="t-whatsapp">WhatsApp</label>
              <div className="iw-replica-phone"><span>BR +55</span><input id="t-whatsapp" type="tel" inputMode="tel" autoComplete="tel" required maxLength={11} placeholder="WhatsApp - (99) 99999-9999" value={whatsapp} onChange={(event) => setWhatsapp(event.target.value.replace(/\D/g, '').slice(0, 11))} /></div>
              <button type="submit" disabled={enviando}>{enviando ? 'INSCREVENDO...' : 'GARANTIR MINHA VAGA GRATUITA'}</button>
            </form>
            <p>Ao se inscrever, você aceita receber informações sobre este evento por WhatsApp e e-mail. A inscrição não obriga nenhuma compra.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
