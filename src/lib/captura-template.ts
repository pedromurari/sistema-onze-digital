export interface CapturaTemplateData {
  titulo: string;
  subtitulo?: string;
  cta_texto: string;
  html_extra?: string;
  cor_primaria: string;
}

export interface CapturaLancamentoData {
  nome: string;
  produto: string;
  data_live?: string;   // ISO date string
  hora_live?: string;
  link_formulario?: string; // URL do formulário externo
}

function fmtDataLive(iso?: string, hora?: string): string {
  if (!iso) return '';
  const [, mo, dy] = iso.split('-');
  const data = `${dy}/${mo}`;
  return hora ? `${data} às ${hora}` : data;
}

export function buildCapturaHTML(
  template: CapturaTemplateData,
  lancamento: CapturaLancamentoData,
): string {
  const cor     = template.cor_primaria || '#7C3AED';
  const dataStr = fmtDataLive(lancamento.data_live, lancamento.hora_live);
  const action  = lancamento.link_formulario || '#';

  // Escapa para uso em atributos HTML
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(template.titulo)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0f0f13;
      color: #f0f0f0;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    a { color: inherit; text-decoration: none; }

    /* ── Hero ── */
    .hero {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 3rem 1.5rem 2rem;
      text-align: center;
      background: radial-gradient(ellipse 80% 50% at 50% 0%, ${cor}22 0%, transparent 70%);
    }
    .badge {
      display: inline-block;
      background: ${cor}22;
      color: ${cor};
      border: 1px solid ${cor}44;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      padding: 0.3rem 1rem;
      margin-bottom: 1.5rem;
    }
    .hero h1 {
      font-size: clamp(2rem, 6vw, 3.5rem);
      font-weight: 800;
      line-height: 1.1;
      max-width: 820px;
      letter-spacing: -0.02em;
      margin-bottom: 1.25rem;
    }
    .hero h1 span { color: ${cor}; }
    .hero p {
      font-size: clamp(1rem, 2.5vw, 1.25rem);
      color: #a1a1aa;
      max-width: 560px;
      line-height: 1.6;
      margin-bottom: 2.5rem;
    }

    /* ── Data badge ── */
    .data-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      background: #1a1a22;
      border: 1px solid #2a2a36;
      border-radius: 0.75rem;
      padding: 0.6rem 1.2rem;
      font-size: 0.9rem;
      color: #d4d4d8;
      margin-bottom: 2.5rem;
    }
    .data-badge .dot { width: 8px; height: 8px; border-radius: 50%; background: #22c55e; animation: pulse 2s infinite; }
    @keyframes pulse { 0%,100%{opacity:1}50%{opacity:.4} }

    /* ── Form ── */
    .form-card {
      background: #1a1a22;
      border: 1px solid #2a2a36;
      border-radius: 1rem;
      padding: 2rem;
      width: 100%;
      max-width: 440px;
      margin: 0 auto;
    }
    .form-card input {
      width: 100%;
      background: #0f0f13;
      border: 1px solid #3a3a4a;
      border-radius: 0.5rem;
      color: #f0f0f0;
      font-size: 1rem;
      padding: 0.75rem 1rem;
      margin-bottom: 0.75rem;
      outline: none;
      transition: border-color 0.2s;
    }
    .form-card input:focus { border-color: ${cor}; }
    .form-card input::placeholder { color: #52525b; }
    .form-card button {
      width: 100%;
      background: ${cor};
      color: #fff;
      font-size: 1rem;
      font-weight: 700;
      border: none;
      border-radius: 0.5rem;
      padding: 0.9rem 1rem;
      cursor: pointer;
      transition: opacity 0.2s, transform 0.1s;
      margin-top: 0.25rem;
    }
    .form-card button:hover { opacity: 0.9; transform: translateY(-1px); }
    .form-card button:active { transform: translateY(0); }
    .form-privacidade {
      font-size: 0.72rem;
      color: #52525b;
      text-align: center;
      margin-top: 0.75rem;
    }

    /* ── Extra ── */
    .extra {
      max-width: 900px;
      margin: 3rem auto;
      padding: 0 1.5rem;
      width: 100%;
    }

    /* ── Footer ── */
    footer {
      text-align: center;
      padding: 1.5rem;
      font-size: 0.75rem;
      color: #3f3f46;
      border-top: 1px solid #1a1a22;
    }

    @media (max-width: 640px) {
      .form-card { padding: 1.5rem; }
    }
  </style>
</head>
<body>

  <main class="hero">
    <!-- EDITAR: badge do produto -->
    <span class="badge">${esc(lancamento.produto.toUpperCase())}</span>

    <!-- EDITAR: título principal -->
    <h1>${esc(template.titulo)}</h1>

    <!-- EDITAR: subtítulo/promessa -->
    ${template.subtitulo ? `<p>${esc(template.subtitulo)}</p>` : ''}

    <!-- EDITAR: data/hora do evento (preenche automaticamente via sistema) -->
    ${dataStr ? `
    <div class="data-badge">
      <span class="dot"></span>
      <span>Evento ao vivo: <strong>${esc(dataStr)}</strong></span>
    </div>` : ''}

    <!-- FORMULÁRIO: action aponta para o seu form externo -->
    <div class="form-card">
      <form action="${esc(action)}" method="GET" target="_blank">
        <input type="text"  name="nome"      placeholder="Seu nome completo" required />
        <input type="email" name="email"     placeholder="Seu melhor e-mail" required />
        <input type="tel"   name="whatsapp"  placeholder="WhatsApp (com DDD)" />
        <!-- EDITAR: texto do botão CTA -->
        <button type="submit">${esc(template.cta_texto)}</button>
        <p class="form-privacidade">Seus dados estão seguros. Sem spam.</p>
      </form>
    </div>
  </main>

  <!-- EDITAR: bloco extra — depoimentos, garantia, sobre o professor, etc. -->
  ${template.html_extra ? `<section class="extra">${template.html_extra}</section>` : `
  <section class="extra">
    <!-- EDITAR: adicione depoimentos, bônus, sobre o professor aqui -->
  </section>`}

  <footer>
    &copy; ${new Date().getFullYear()} ${esc(lancamento.nome)} — Todos os direitos reservados
  </footer>

</body>
</html>`;
}
