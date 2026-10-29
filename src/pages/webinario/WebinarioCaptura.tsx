import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { BookOpenCheck, Gift, MonitorPlay } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { temaPorSlug } from './webinario-temas';
import './webinario.css';

const FUNCTIONS_URL = 'https://usqiyekfmwwnvkmkdlej.supabase.co/functions/v1';
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;
const IDM_LOGO = 'https://turma47.semanadodespertar.online/lovable-uploads/1b0d4a56-e01f-4ce0-b2f7-0eecf33da536.png';
const RODRYGO_FOTO = 'https://turma47.semanadodespertar.online/lovable-uploads/3a4fb99e-e1bb-4d83-843e-f5fe18a7a8b3.png';
const JOCIMARA_FOTO = 'https://turma47.semanadodespertar.online/lovable-uploads/61fad314-edc1-4a68-84f1-1f53a18d5fc9.png';
const VIDEO_DEMONSTRACAO_R2 = 'https://pub-da74b2ec5ddf4847a6f20dec2e542925.r2.dev/vsl/semana-do-despertar.mp4';

const DEPOIMENTOS = [
  { titulo: 'Transformei minha vida através da psicanálise', video: 'wDQiV0VoBT4' },
  { titulo: 'Mudança completa de perspectiva sobre a vida', video: 'B_lpIOk1RQo' },
  { titulo: 'Descobri ferramentas poderosas para o autoconhecimento', video: 'D4xbxCXSWoM' },
];

export default function WebinarioCaptura() {
  const { slug = 'psicanalise' } = useParams();
  const tema = temaPorSlug(slug);
  const navigate = useNavigate();
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [capturaVideoUrl, setCapturaVideoUrl] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    void supabase.from('webinarios').select('captura_video_url').eq('slug', slug).eq('ativo', true).maybeSingle()
      .then(({ data }) => {
        if (ativo) {
          setCapturaVideoUrl(data?.captura_video_url ?? null);
        }
      });
    return () => { ativo = false; };
  }, [slug]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!nome.trim() || !whatsapp.trim()) {
      toast.error('Preencha seu nome e WhatsApp para continuar.');
      return;
    }
    const digitos = whatsapp.replace(/\D/g, '');
    if (![10, 11, 12, 13].includes(digitos.length)) {
      toast.error('Confira o WhatsApp com DDD.');
      return;
    }
    setEnviando(true);
    try {
      const whatsappLimpo = `+55${digitos.startsWith('55') ? digitos.slice(2) : digitos}`;
      const params = new URLSearchParams(window.location.search);
      const utms = Object.fromEntries(UTM_KEYS.map((key) => [key, params.get(key) ?? '']));
      const res = await fetch(`${FUNCTIONS_URL}/webinario-registrar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webinarioSlug: slug,
          nome: nome.trim(),
          email: email.trim() || undefined,
          whatsapp: whatsappLimpo,
          device: /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
          ...utms,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        toast.error(data.erro || 'Não foi possível concluir seu cadastro agora.');
        return;
      }
      sessionStorage.setItem('webinario_tracking_id', data.trackingId);
      sessionStorage.setItem('webinario_sessao_id', data.sessaoId);
      sessionStorage.setItem('webinario_inicio_em', data.inicioEm);
      sessionStorage.setItem('webinario_nome', nome.trim());
      sessionStorage.setItem('webinario_email', email.trim());
      sessionStorage.setItem('webinario_whatsapp', whatsappLimpo);
      sessionStorage.setItem('webinario_slug', slug);
      navigate(`/webinario/obrigado/${slug}`);
    } catch {
      toast.error('Erro de conexão. Tente novamente.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <main className="idm-webinario iw-replica">
      <section className="iw-replica-hero" id="inicio">
        <div className="iw-replica-orb iw-replica-orb-one" aria-hidden="true" />
        <div className="iw-replica-orb iw-replica-orb-two" aria-hidden="true" />
        <div className="iw-replica-hero-inner">
          <h1><span>{tema.heroLinhaUm}</span><br /><em>{tema.heroLinhaDois}</em></h1>
          <h2>{tema.heroSubheadline}</h2>
          <div className="iw-replica-event-box">
            <strong>WEBINÁRIO GRATUITO</strong>
            <span>{tema.titulo}</span>
            <b>INSCRIÇÃO GRATUITA · SESSÕES ONLINE CONTÍNUAS</b>
          </div>

          <div className="iw-replica-media">
            <video src={capturaVideoUrl || VIDEO_DEMONSTRACAO_R2} controls playsInline preload="metadata" poster="https://pub-da74b2ec5ddf4847a6f20dec2e542925.r2.dev/vsl/semana-do-despertar-poster.jpg" aria-label={capturaVideoUrl ? `Vídeo de apresentação: ${tema.titulo}` : 'Vídeo institucional do IDM'} />
          </div>
          {!capturaVideoUrl && <p className="iw-replica-video-disclosure">Conheça o Instituto Despertamente neste vídeo institucional.</p>}

          <div className="iw-replica-form-card" id="cadastro">
            <form onSubmit={handleSubmit}>
              <label className="sr-only" htmlFor="web-nome">Nome completo</label>
              <input id="web-nome" autoComplete="name" required placeholder="Insira seu nome" value={nome} onChange={(event) => setNome(event.target.value)} />
              <label className="sr-only" htmlFor="web-email">E-mail</label>
              <input id="web-email" type="email" autoComplete="email" placeholder="Insira seu melhor e-mail (opcional)" value={email} onChange={(event) => setEmail(event.target.value)} />
              <label className="sr-only" htmlFor="web-whatsapp">WhatsApp</label>
              <div className="iw-replica-phone"><span>BR +55</span><input id="web-whatsapp" type="tel" inputMode="tel" autoComplete="tel" required placeholder="WhatsApp - (99) 99999-9999" value={whatsapp} onChange={(event) => setWhatsapp(event.target.value)} /></div>
              <button type="submit" disabled={enviando}>{enviando ? 'INSCREVENDO...' : 'INSCREVER-SE AGORA!'}</button>
            </form>
            <p>Ao se inscrever, você aceita receber informações sobre esta aula por WhatsApp e e-mail. A inscrição não obriga nenhuma compra.</p>
          </div>
        </div>
      </section>

      <section className="iw-replica-section iw-replica-pillars">
        <div className="iw-replica-container">
          <h2>VEJA OS <em>3 PILARES</em> DO WEBINÁRIO:</h2>
          <div className="iw-replica-pillar-grid">{tema.pilares.map((pilar, indice) => (
            <article key={pilar.titulo}>
              <div className="iw-replica-pillar-top"><span aria-hidden="true">{['✺', '♡', '◎'][indice]}</span><h3>{pilar.titulo}</h3></div>
              <div className="iw-replica-pillar-bottom"><p>{pilar.descricao}</p><small>{tema.aprendizados[indice]}</small></div>
            </article>
          ))}</div>
        </div>
      </section>

      <section className="iw-replica-section iw-replica-testimonials">
        <div className="iw-replica-container">
          <h2>O que dizem nossos <em>Alunos</em></h2>
          <p>Depoimentos sobre a formação no IDM, não sobre este webinar específico.</p>
          <div className="iw-replica-testimonial-grid">{DEPOIMENTOS.map(({ titulo, video }) => (
            <a key={video} href={`https://www.youtube.com/watch?v=${video}`} target="_blank" rel="noopener noreferrer">
              <img src={`https://img.youtube.com/vi/${video}/hqdefault.jpg`} alt="" loading="lazy" />
              <strong>“{titulo}”</strong><span>★★★★★</span><small>Aluno IDM · Ver depoimento ↗</small>
            </a>
          ))}</div>
        </div>
      </section>

      <section className="iw-replica-section iw-replica-institute">
        <div className="iw-replica-container">
          <img src={IDM_LOGO} alt="Instituto Despertamente" loading="lazy" />
          <h2>Instituto <em>Despertamente</em></h2>
          <p>O Instituto Despertamente é uma escola de desenvolvimento humano especializada no ensino da psicanálise. Nossa missão é tornar o estudo e o autoconhecimento acessíveis, ajudando pessoas a compreender melhor emoções, relações e padrões de comportamento.</p>
          <div>{tema.destaque}</div>
        </div>
      </section>

      <section className="iw-replica-section iw-replica-teachers">
        <div className="iw-replica-container">
          <h2>Conheça seus <em>Professores</em></h2>
          <div className="iw-replica-teacher-grid">
            <article><div className="iw-replica-teacher-photo"><img src={RODRYGO_FOTO} alt="Rodrygo Murari" loading="lazy" /><strong>Rodrygo Murari</strong></div><div className="iw-replica-teacher-body"><h3>Fundador e Professor</h3><p>Rodrygo apresenta o tema com exemplos e mostra como esse estudo se conecta à Psicanálise Integrativa no IDM.</p></div></article>
            <article><div className="iw-replica-teacher-photo"><img src={JOCIMARA_FOTO} alt="Jocimara Anjos" loading="lazy" /><strong>Jocimara Anjos</strong></div><div className="iw-replica-teacher-body"><h3>Coordenadora e Professora</h3><p>Jocimara participa da proposta pedagógica desta aula. A participação final em vídeo depende da gravação.</p></div></article>
          </div>
        </div>
      </section>

      <section className="iw-replica-section iw-replica-faq">
        <div className="iw-replica-container">
          <h2>Perguntas <em>Frequentes</em></h2><p>Tire suas dúvidas!</p>
          <div className="iw-replica-faq-list">
            <details><summary>O webinar é realmente gratuito?</summary><p>Sim. A inscrição e a aula introdutória não têm custo. A formação completa, se apresentada depois, é uma oferta separada e opcional.</p></details>
            <details><summary>Como faço minha inscrição?</summary><p>Preencha seu nome e WhatsApp no formulário acima. A inscrição é gratuita e não obriga nenhuma compra.</p></details>
            <details><summary>Preciso ter conhecimento prévio?</summary><p>Não. O conteúdo é introdutório e foi preparado para quem quer conhecer o tema com responsabilidade.</p></details>
            <details><summary>Vou receber certificado ou material?</summary><p>Não há certificado nem material complementar anunciado para este webinar. Se isso mudar, a informação será atualizada aqui.</p></details>
            {tema.perguntas.map((item) => <details key={item.pergunta}><summary>{item.pergunta}</summary><p>{item.resposta}</p></details>)}
          </div>
          <a href="https://wa.me/5511930439385" target="_blank" rel="noopener noreferrer" className="iw-replica-help">Ainda tem dúvidas? Entre em contato conosco!</a>
        </div>
      </section>

      <section className="iw-replica-final">
        <div className="iw-replica-container">
          <div className="iw-replica-benefits" aria-label="O que você recebe ao se inscrever">
            <article className="iw-replica-benefit"><div className="iw-replica-benefit-icon"><MonitorPlay aria-hidden="true" /></div><h3>Aula online</h3><p>Assista de onde estiver</p></article>
            <article className="iw-replica-benefit"><div className="iw-replica-benefit-icon"><BookOpenCheck aria-hidden="true" /></div><h3>Conteúdo educativo</h3><p>Aprenda com a equipe IDM</p></article>
            <article className="iw-replica-benefit"><div className="iw-replica-benefit-icon"><Gift aria-hidden="true" /></div><h3>100% gratuito</h3><p>Inscrição sem custo</p></article>
          </div>
          <div className="iw-replica-final-card"><h2>Uma aula gratuita.<br /><em>Um novo jeito de olhar para {tema.fechamento}.</em></h2><p>{tema.subheadline}</p><a href="#cadastro">FAZER INSCRIÇÃO GRATUITA!</a><div>Inscrição gratuita · sem obrigação de compra.</div></div>
          <p className="iw-replica-final-line">✓ Aula online gratuita &nbsp; ✓ Tema: {tema.titulo} &nbsp; ✓ Sem obrigação de compra</p>
        </div>
      </section>
      <footer className="iw-replica-footer">© Instituto Despertamente · Psicanálise Integrativa · Conteúdo educativo, não substitui atendimento clínico.</footer>
    </main>
  );
}
