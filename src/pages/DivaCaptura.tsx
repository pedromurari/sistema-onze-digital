import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { HeartHandshake, ShieldCheck, Wallet } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import './webinario/webinario.css';

const IDM_LOGO = 'https://turma47.semanadodespertar.online/lovable-uploads/1b0d4a56-e01f-4ce0-b2f7-0eecf33da536.png';
const RODRYGO_FOTO = 'https://turma47.semanadodespertar.online/lovable-uploads/3a4fb99e-e1bb-4d83-843e-f5fe18a7a8b3.png';
const JOCIMARA_FOTO = 'https://turma47.semanadodespertar.online/lovable-uploads/61fad314-edc1-4a68-84f1-1f53a18d5fc9.png';
// Placeholder até o Rodrygo gravar o vídeo real do Divã — mesmo princípio usado no Webinário:
// reaproveita um vídeo que já está no Cloudflare pra página não ficar sem vídeo nenhum.
const VIDEO_PLACEHOLDER = 'https://pub-da74b2ec5ddf4847a6f20dec2e542925.r2.dev/vsl/semana-do-despertar.mp4';

export default function DivaCaptura() {
  const navigate = useNavigate();
  const [nome, setNome] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [website, setWebsite] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [videoCapturaUrl, setVideoCapturaUrl] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    void supabase.from('diva_config' as never).select('video_captura_url').eq('id', true).maybeSingle()
      .then(({ data }) => {
        if (ativo) setVideoCapturaUrl((data as { video_captura_url: string | null } | null)?.video_captura_url ?? null);
      });
    return () => { ativo = false; };
  }, []);

  async function enviar(event: FormEvent) {
    event.preventDefault();
    if (enviando) return;
    setEnviando(true); setErro('');
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/diva-registrar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, whatsapp, email, mensagem, website }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok || !data.leadId) throw new Error(data.erro || 'Não foi possível registrar agora.');
      navigate(`/diva/confirmacao/${data.leadId}`);
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Falha de conexão.');
      setEnviando(false);
    }
  }

  return (
    <main className="idm-webinario iw-replica">
      <section className="iw-replica-hero" id="inicio">
        <div className="iw-replica-orb iw-replica-orb-one" aria-hidden="true" />
        <div className="iw-replica-orb iw-replica-orb-two" aria-hidden="true" />
        <div className="iw-replica-hero-inner">
          <h1><span>Terapia</span><br /><em>com quem entende do assunto</em></h1>
          <h2>Sessões de psicanálise com terapeutas credenciados pelo Instituto Despertamente — você não precisa ter certeza de nada, só precisa começar.</h2>
          <div className="iw-replica-event-box">
            <strong>TERAPIA SOCIAL · DIVÃ IDM</strong>
            <span>Sessões 100% online com terapeutas credenciados</span>
            <b>A PARTIR DE R$ 80 · SEM FILA DE ESPERA</b>
          </div>

          <div className="iw-replica-media">
            <video
              src={videoCapturaUrl || VIDEO_PLACEHOLDER}
              controls
              playsInline
              preload="metadata"
              aria-label={videoCapturaUrl ? 'Vídeo de apresentação do Divã IDM' : 'Vídeo institucional do IDM'}
            />
          </div>
          {!videoCapturaUrl && <p className="iw-replica-video-disclosure">Conheça o Instituto Despertamente neste vídeo institucional.</p>}

          <div className="iw-replica-form-card" id="cadastro">
            <form onSubmit={(event) => void enviar(event)}>
              <label className="sr-only" htmlFor="diva-nome">Nome completo</label>
              <input id="diva-nome" autoComplete="name" required minLength={2} maxLength={120} placeholder="Insira seu nome" value={nome} onChange={(e) => setNome(e.target.value)} />
              <label className="sr-only" htmlFor="diva-email">E-mail</label>
              <input id="diva-email" type="email" autoComplete="email" placeholder="Insira seu melhor e-mail (opcional)" value={email} onChange={(e) => setEmail(e.target.value)} />
              <label className="sr-only" htmlFor="diva-whatsapp">WhatsApp</label>
              <div className="iw-replica-phone"><span>BR +55</span><input id="diva-whatsapp" type="tel" inputMode="tel" autoComplete="tel" required placeholder="WhatsApp - (99) 99999-9999" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} /></div>
              <label className="sr-only" htmlFor="diva-mensagem">Quer contar algo antes da gente ligar?</label>
              <textarea id="diva-mensagem" maxLength={500} placeholder="Quer contar algo antes da gente ligar? (opcional)" value={mensagem} onChange={(e) => setMensagem(e.target.value)} />
              <input aria-hidden="true" tabIndex={-1} autoComplete="off" className="sr-only" value={website} onChange={(e) => setWebsite(e.target.value)} />
              {erro && <p role="alert" style={{ color: '#f87171', fontSize: '0.85em' }}>{erro}</p>}
              <button type="submit" disabled={enviando}>{enviando ? 'ENVIANDO...' : 'QUERO MINHA SESSÃO'}</button>
            </form>
            <p>Ao se cadastrar, nosso time entra em contato pelo WhatsApp pra você escolher o melhor terapeuta credenciado pra você.</p>
          </div>
        </div>
      </section>

      <section className="iw-replica-section iw-replica-pillars">
        <div className="iw-replica-container">
          <h2>POR QUE FAZER TERAPIA NO <em>DIVÃ IDM</em>:</h2>
          <div className="iw-replica-pillar-grid">
            <article>
              <div className="iw-replica-pillar-top"><span aria-hidden="true">✺</span><h3>Terapeuta certo pra você</h3></div>
              <div className="iw-replica-pillar-bottom"><p>Você não escolhe sozinho: nosso time conversa com você e indica o terapeuta credenciado mais adequado pro seu momento.</p></div>
            </article>
            <article>
              <div className="iw-replica-pillar-top"><span aria-hidden="true">♡</span><h3>Sigilo e acolhimento</h3></div>
              <div className="iw-replica-pillar-bottom"><p>Sessões 100% online, sem julgamento, com profissionais credenciados pelo Instituto Despertamente.</p></div>
            </article>
            <article>
              <div className="iw-replica-pillar-top"><span aria-hidden="true">◎</span><h3>Acessível de verdade</h3></div>
              <div className="iw-replica-pillar-bottom"><p>Sessões a partir de R$80, com pacotes pra quem quer continuidade — sem fila de espera pra começar.</p></div>
            </article>
          </div>
        </div>
      </section>

      <section className="iw-replica-section iw-replica-testimonials">
        <div className="iw-replica-container">
          <h2>Achando que terapia <em>não é pra você</em>?</h2>
          <p>Quase todo mundo que começa pensava a mesma coisa. Veja o que costuma segurar as pessoas — e por que não precisa ser assim.</p>
          <div className="iw-replica-pillar-grid">
            <article>
              <div className="iw-replica-pillar-top"><span aria-hidden="true">💭</span><h3>"Terapia é só pra quem tá em crise"</h3></div>
              <div className="iw-replica-pillar-bottom"><p>Terapia também é espaço de autoconhecimento e cuidado contínuo. Não precisa estar em crise pra merecer um espaço de escuta.</p></div>
            </article>
            <article>
              <div className="iw-replica-pillar-top"><span aria-hidden="true">💭</span><h3>"Eu consigo resolver sozinho(a)"</h3></div>
              <div className="iw-replica-pillar-bottom"><p>Ter um espaço de escuta profissional, sem julgamento, muda a forma como você enxerga os próprios padrões. Sozinho é mais difícil ver o que está por trás.</p></div>
            </article>
            <article>
              <div className="iw-replica-pillar-top"><span aria-hidden="true">💭</span><h3>"Terapia é cara e demorada pra começar"</h3></div>
              <div className="iw-replica-pillar-bottom"><p>No Divã IDM, sessões a partir de R$80, com terapeutas credenciados disponíveis, sem fila de espera.</p></div>
            </article>
          </div>
        </div>
      </section>

      <section className="iw-replica-section iw-replica-institute">
        <div className="iw-replica-container">
          <img src={IDM_LOGO} alt="Instituto Despertamente" loading="lazy" />
          <h2>Instituto <em>Despertamente</em></h2>
          <p>O Instituto Despertamente é uma escola de desenvolvimento humano especializada no ensino da psicanálise. O Divã IDM é o programa de terapia social do Instituto: conecta você a terapeutas credenciados, formados e supervisionados dentro da nossa proposta de Psicanálise Integrativa.</p>
          <div>Cada processo é único — não prometemos resultado específico, mas oferecemos profissionais credenciados, comprometidos com ética e sigilo.</div>
        </div>
      </section>

      <section className="iw-replica-section iw-replica-teachers">
        <div className="iw-replica-container">
          <h2>Quem está por trás do <em>Divã IDM</em></h2>
          <div className="iw-replica-teacher-grid">
            <article><div className="iw-replica-teacher-photo"><img src={RODRYGO_FOTO} alt="Rodrygo Murari" loading="lazy" /><strong>Rodrygo Murari</strong></div><div className="iw-replica-teacher-body"><h3>Fundador do Instituto Despertamente</h3><p>Rodrygo idealizou o Divã IDM pra tornar a terapia mais acessível, conectando quem precisa de escuta a terapeutas credenciados pelo Instituto.</p></div></article>
            <article><div className="iw-replica-teacher-photo"><img src={JOCIMARA_FOTO} alt="Jocimara Anjos" loading="lazy" /><strong>Jocimara Anjos</strong></div><div className="iw-replica-teacher-body"><h3>Coordenadora Pedagógica</h3><p>Jocimara supervisiona a formação dos terapeutas credenciados, garantindo ética e qualidade em cada sessão do Divã.</p></div></article>
          </div>
        </div>
      </section>

      <section className="iw-replica-section iw-replica-faq">
        <div className="iw-replica-container">
          <h2>Perguntas <em>Frequentes</em></h2><p>Tire suas dúvidas!</p>
          <div className="iw-replica-faq-list">
            <details><summary>As sessões são gratuitas?</summary><p>Não. As sessões custam a partir de R$80. O cadastro aqui é gratuito — serve só pra nosso time te indicar o terapeuta certo.</p></details>
            <details><summary>Como eu escolho o terapeuta?</summary><p>Você não precisa escolher sozinho: depois do cadastro, nosso time conversa com você e indica o terapeuta credenciado mais adequado pro seu caso.</p></details>
            <details><summary>As sessões são online?</summary><p>Sim, 100% online, com terapeutas credenciados pelo Instituto Despertamente.</p></details>
            <details><summary>Existe pacote de sessões?</summary><p>Sim. Pacotes a partir de 3 sessões saem com desconto. Nosso time te explica as opções depois do cadastro.</p></details>
            <details><summary>Terapia realmente funciona?</summary><p>Cada processo é único. Terapia é um espaço de escuta e cuidado contínuo — não prometemos resultado específico, mas oferecemos profissionais credenciados e comprometidos com ética.</p></details>
          </div>
          <a href="https://wa.me/5511930439385" target="_blank" rel="noopener noreferrer" className="iw-replica-help">Ainda tem dúvidas? Entre em contato conosco!</a>
        </div>
      </section>

      <section className="iw-replica-final">
        <div className="iw-replica-container">
          <div className="iw-replica-benefits" aria-label="O que você recebe ao se cadastrar">
            <article className="iw-replica-benefit"><div className="iw-replica-benefit-icon"><HeartHandshake aria-hidden="true" /></div><h3>Terapeuta indicado pra você</h3><p>Nosso time escolhe com você</p></article>
            <article className="iw-replica-benefit"><div className="iw-replica-benefit-icon"><Wallet aria-hidden="true" /></div><h3>A partir de R$80</h3><p>Sem fila de espera</p></article>
            <article className="iw-replica-benefit"><div className="iw-replica-benefit-icon"><ShieldCheck aria-hidden="true" /></div><h3>Terapeutas credenciados</h3><p>Sigilo e acolhimento</p></article>
          </div>
          <div className="iw-replica-final-card">
            <h2>Você não precisa ter certeza.<br /><em>Só precisa começar.</em></h2>
            <p>Cadastre-se e nosso time te ajuda a escolher o terapeuta certo pra você, com sessões a partir de R$80.</p>
            <a href="#cadastro">QUERO MINHA SESSÃO</a>
            <div>Cadastro gratuito · nosso time entra em contato por WhatsApp.</div>
          </div>
          <p className="iw-replica-final-line">✓ Sessões 100% online &nbsp; ✓ A partir de R$80 &nbsp; ✓ Terapeutas credenciados pelo IDM</p>
        </div>
      </section>
      <footer className="iw-replica-footer">
        © Instituto Despertamente · Divã IDM · Conteúdo educativo e terapêutico, não substitui emergência psiquiátrica. Em crise ou risco, ligue 188 (CVV) ou procure uma emergência.
      </footer>
    </main>
  );
}
