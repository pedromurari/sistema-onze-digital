/**
 * PagarParcela.tsx — página pública de pagamento de parcela.
 * URL: /pagar/:token   (token = pagamentos.checkout_token)
 *
 * Existe porque a SyncPay não tem checkout hospedado: o cash-in dela
 * devolve só o `pix_code`, sem nenhuma URL. Então a página é nossa e o
 * motor é deles. Como o link é nosso, ela serve igual pra qualquer
 * gateway que entrar depois (Efí, Mercado Pago).
 *
 * Visual no padrão navy + dourado do IDM (mesmas variáveis de
 * matricula-reference.css). O Pedro já reprovou cartão branco genérico
 * antes — "parecia phishing" (13/11/2026) — então aqui tem marca,
 * nome do aluno e selos de segurança.
 *
 * A página faz polling do status a cada 5s: quando o webhook da SyncPay
 * dá baixa na parcela, a tela vira "pagamento confirmado" sozinha, sem o
 * aluno precisar recarregar.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { ensurePoppinsFontLoaded } from './matricula/theme';

const FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/checkout-parcela`;
const IDM_LOGO = 'https://turma47.semanadodespertar.online/lovable-uploads/1b0d4a56-e01f-4ce0-b2f7-0eecf33da536.png';

interface Dados {
  ok: boolean;
  nome?: string;
  nome_completo?: string;
  parcela?: number;
  total_parcelas?: number | null;
  valor?: number;
  vencimento?: string;
  produto?: string;
  pago?: boolean;
  gateway?: string | null;
  pix_code?: string | null;
  boleto_url?: string | null;
  erro?: string;
  erro_pix?: string;
}

/**
 * Nome do produto como o ALUNO conhece, não o slug interno.
 * `numerologia` é "Mentoria NPS" (mesmo nome de /matricula/nps), e
 * `psicanalise` é o nome completo que aparece no contrato e na Voomp.
 */
const PRODUTOS: Record<string, string> = {
  psicanalise: 'Formação em Psicanálise Clínica Integrativa',
  numerologia: 'Mentoria NPS',
  nps: 'Mentoria NPS',
  'pnl-master': 'Master em PNL',
  'pnl-practitioner': 'PNL Practitioner',
  'sociedade-idm': 'Sociedade IDM',
  'diva-idm': 'Divã IDM',
  npa: 'NPA — O Despertar dos Números',
};

/**
 * Produtos que são ASSINATURA, não curso parcelado. Nesses o aluno pode
 * cancelar e reativar quando quiser, e o acesso à área de membros depende
 * de estar em dia — então "parcela 7 de 10" não existe e confunde: passa a
 * ideia de que acaba em 10. Mostramos o mês de referência no lugar.
 */
const ASSINATURAS = new Set(['numerologia', 'nps', 'sociedade-idm', 'diva-idm']);

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function mesDeReferencia(iso?: string) {
  if (!iso) return '';
  const [ano, mes] = iso.split('-');
  return `${MESES[Number(mes) - 1]} de ${ano}`;
}

function reais(v?: number) {
  return (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function dataBR(iso?: string) {
  if (!iso) return '';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

function diasDeAtraso(iso?: string) {
  if (!iso) return 0;
  const venc = new Date(`${iso}T12:00:00-03:00`).getTime();
  const hoje = new Date().getTime();
  return Math.floor((hoje - venc) / 86400000);
}

export default function PagarParcela() {
  const { token } = useParams<{ token: string }>();
  const [dados, setDados] = useState<Dados | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [qr, setQr] = useState<string>('');
  const [copiado, setCopiado] = useState(false);
  const poll = useRef<number | null>(null);

  useEffect(() => { ensurePoppinsFontLoaded(); }, []);

  const buscar = useCallback(async (apenasStatus = false) => {
    try {
      const res = apenasStatus
        ? await fetch(FN, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, acao: 'status' }),
          })
        : await fetch(`${FN}?token=${encodeURIComponent(token ?? '')}`);
      const j: Dados = await res.json();
      setDados((anterior) => (apenasStatus && anterior ? { ...anterior, pago: j.pago } : j));
      return j;
    } catch {
      setDados({ ok: false, erro: 'não consegui carregar' });
      return null;
    } finally {
      setCarregando(false);
    }
  }, [token]);

  useEffect(() => { void buscar(); }, [buscar]);

  // Gera a imagem do QR a partir do copia-e-cola.
  useEffect(() => {
    if (!dados?.pix_code) { setQr(''); return; }
    QRCode.toDataURL(dados.pix_code, { width: 520, margin: 1, errorCorrectionLevel: 'M' })
      .then(setQr)
      .catch(() => setQr(''));
  }, [dados?.pix_code]);

  // Enquanto não pagou, pergunta o status a cada 5s.
  useEffect(() => {
    if (!dados || dados.pago || !dados.ok) return;
    poll.current = window.setInterval(() => { void buscar(true); }, 5000);
    return () => { if (poll.current) window.clearInterval(poll.current); };
  }, [dados, buscar]);

  async function copiar() {
    if (!dados?.pix_code) return;
    try {
      await navigator.clipboard.writeText(dados.pix_code);
    } catch {
      const el = document.createElement('textarea');
      el.value = dados.pix_code;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopiado(true);
    window.setTimeout(() => setCopiado(false), 2600);
  }

  const atraso = diasDeAtraso(dados?.vencimento);
  const assinatura = ASSINATURAS.has(dados?.produto ?? '');

  return (
    <div className="idm-pagar">
      <style>{CSS}</style>

      <header className="pg-top">
        <img src={IDM_LOGO} alt="Instituto Despertamente" />
      </header>

      <main className="pg-wrap">
        {carregando && (
          <div className="pg-card pg-centro">
            <div className="pg-spin" />
            <p className="pg-muted">Carregando…</p>
          </div>
        )}

        {!carregando && !dados?.ok && (
          <div className="pg-card pg-centro">
            <div className="pg-icone pg-icone-erro">!</div>
            <h1 className="pg-h1">Link inválido</h1>
            <p className="pg-muted">
              Esse link de pagamento não existe ou expirou. Chama a gente no WhatsApp
              que a gente te manda outro.
            </p>
          </div>
        )}

        {!carregando && dados?.ok && dados.pago && (
          <div className="pg-card pg-centro pg-ok">
            <div className="pg-icone pg-icone-ok">✓</div>
            <h1 className="pg-h1">Pagamento confirmado!</h1>
            <p className="pg-muted">
              {assinatura ? (
                <>Recebemos a sua <strong>mensalidade de {mesDeReferencia(dados.vencimento)}</strong> de {reais(dados.valor)}. Obrigado, {dados.nome}!</>
              ) : (
                <>Recebemos a sua <strong>parcela {dados.parcela}</strong> de {reais(dados.valor)}. Obrigado, {dados.nome}!</>
              )}
            </p>
            <p className="pg-mini">
              {assinatura
                ? 'Seu acesso à área de membros segue liberado. Pode fechar esta página.'
                : 'Não precisa fazer mais nada. Pode fechar esta página.'}
            </p>
          </div>
        )}

        {!carregando && dados?.ok && !dados.pago && (
          <>
            <div className="pg-card">
              <div className="pg-resumo">
                <span className="pg-tag">
                  {atraso > 0 ? `Vencida há ${atraso} ${atraso === 1 ? 'dia' : 'dias'}` : 'Em aberto'}
                </span>
                <h1 className="pg-h1">
                  Olá, {dados.nome_completo || dados.nome}
                </h1>
                <p className="pg-sub">
                  {PRODUTOS[dados.produto ?? ''] ?? 'Instituto Despertamente'}
                </p>

                <div className="pg-linhas">
                  {assinatura ? (
                    <div><span>Mensalidade</span><strong>{mesDeReferencia(dados.vencimento)}</strong></div>
                  ) : (
                    <div><span>Parcela</span><strong>{dados.parcela}{dados.total_parcelas ? ` de ${dados.total_parcelas}` : ''}</strong></div>
                  )}
                  <div><span>Vencimento</span><strong>{dataBR(dados.vencimento)}</strong></div>
                </div>

                <div className="pg-total">
                  <span>Total a pagar</span>
                  <strong>{reais(dados.valor)}</strong>
                </div>
              </div>
            </div>

            {dados.gateway === 'voomp' && dados.boleto_url && (
              <div className="pg-card">
                <h2 className="pg-h2">Pague pelo boleto</h2>
                <p className="pg-muted">O boleto abre numa nova aba. Pode pagar pelo app do seu banco.</p>
                <a className="pg-btn" href={dados.boleto_url} target="_blank" rel="noreferrer">
                  Abrir boleto
                </a>
              </div>
            )}

            {dados.pix_code && (
              <div className="pg-card">
                <h2 className="pg-h2">Pague com PIX</h2>
                <p className="pg-muted">Abra o app do seu banco, escolha PIX e aponte para o código.</p>

                {qr && (
                  <div className="pg-qr">
                    <img src={qr} alt="QR Code do PIX" />
                  </div>
                )}

                <button className={`pg-btn ${copiado ? 'pg-btn-ok' : ''}`} onClick={copiar}>
                  {copiado ? '✓  Código copiado!' : 'Copiar código PIX'}
                </button>

                <p className="pg-mini">
                  Ou copie o código abaixo e cole no seu banco:
                </p>
                <code className="pg-code">{dados.pix_code}</code>

                <div className="pg-aguardando">
                  <span className="pg-pulse" />
                  Aguardando o pagamento — esta página confirma sozinha
                </div>
              </div>
            )}

            {!dados.pix_code && !dados.boleto_url && (
              <div className="pg-card pg-centro">
                <div className="pg-icone pg-icone-erro">!</div>
                <h2 className="pg-h2">Não consegui gerar o PIX agora</h2>
                <p className="pg-muted">
                  Foi um problema nosso, não seu. Chama a gente no WhatsApp que resolvemos na hora.
                </p>
              </div>
            )}
          </>
        )}

        <footer className="pg-rodape">
          <div className="pg-selos">
            <span>🔒 Pagamento seguro</span>
            <span>Instituto Despertamente</span>
          </div>
          <p>CNPJ 55.184.481/0001-24 · Av. Paulista, 1636 — São Paulo/SP</p>
        </footer>
      </main>
    </div>
  );
}

const CSS = `
.idm-pagar {
  --navy: #1C2B4A; --navy-dark: #111C30; --navy-deeper: #0A1020;
  --surface: #FAFAF7; --surface-alt: #F0EFE9;
  --text: #1C1C1A; --text-muted: #6B6B5F;
  --gold: #B8960C; --gold-light: #D4A817; --gold-pale: #F5ECC8;
  --border: rgba(28,43,74,0.12); --ok: #1F7A4D;
  font-family: 'Poppins', system-ui, sans-serif;
  color: var(--text);
  background: var(--navy-deeper);
  min-height: 100vh;
}
.idm-pagar * { box-sizing: border-box; }
.pg-top {
  background: var(--navy); padding: 20px 16px; text-align: center;
  border-bottom: 2px solid var(--gold);
}
.pg-top img { height: 46px; width: auto; }
.pg-wrap {
  max-width: 480px; margin: 0 auto; padding: 24px 16px 48px;
  display: flex; flex-direction: column; gap: 16px;
}
.pg-card {
  background: #fff; border-radius: 14px; padding: 24px;
  box-shadow: 0 8px 28px rgba(0,0,0,0.18);
  border-top: 3px solid var(--gold);
}
.pg-centro { text-align: center; }
.pg-tag {
  display: inline-block; font-size: 11px; font-weight: 600; letter-spacing: .06em;
  text-transform: uppercase; color: var(--gold); background: var(--gold-pale);
  padding: 5px 11px; border-radius: 999px; margin-bottom: 12px;
}
.pg-h1 { font-size: 22px; font-weight: 700; margin: 0 0 4px; color: var(--navy); line-height: 1.25; }
.pg-h2 { font-size: 17px; font-weight: 600; margin: 0 0 6px; color: var(--navy); }
.pg-sub { margin: 0 0 18px; font-size: 14px; color: var(--text-muted); }
.pg-muted { font-size: 14px; color: var(--text-muted); margin: 0 0 16px; line-height: 1.55; }
.pg-mini { font-size: 12px; color: var(--text-muted); margin: 16px 0 6px; }
.pg-linhas { border-top: 1px solid var(--border); }
.pg-linhas > div {
  display: flex; justify-content: space-between; align-items: center;
  padding: 11px 0; border-bottom: 1px solid var(--border); font-size: 14px;
}
.pg-linhas span { color: var(--text-muted); }
.pg-linhas strong { color: var(--navy); font-weight: 600; }
.pg-total {
  display: flex; justify-content: space-between; align-items: center;
  margin-top: 18px; padding: 16px; border-radius: 10px;
  background: var(--surface-alt);
}
.pg-total span { font-size: 14px; color: var(--text-muted); }
.pg-total strong { font-size: 26px; font-weight: 700; color: var(--navy); letter-spacing: -0.5px; }
.pg-qr {
  display: flex; justify-content: center; margin: 18px 0;
  padding: 14px; background: #fff; border: 1px solid var(--border); border-radius: 12px;
}
.pg-qr img { width: 100%; max-width: 230px; height: auto; display: block; }
.pg-btn {
  display: block; width: 100%; text-align: center; cursor: pointer;
  background: var(--gold); color: #fff; border: none; border-radius: 10px;
  padding: 16px; font-size: 15px; font-weight: 600; font-family: inherit;
  text-decoration: none; transition: background .18s, transform .18s;
}
.pg-btn:hover { background: var(--gold-light); }
.pg-btn:active { transform: scale(0.985); }
/* precisa vencer o :hover, que tem especificidade maior e fica ativo logo
   depois do clique -- senão a confirmação de "copiado" continua dourada */
.pg-btn-ok, .pg-btn-ok:hover { background: var(--ok); }
.pg-code {
  display: block; font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 11px; line-height: 1.5; color: var(--text-muted);
  background: var(--surface-alt); border-radius: 8px; padding: 12px;
  word-break: break-all; user-select: all; max-height: 92px; overflow-y: auto;
}
.pg-aguardando {
  display: flex; align-items: center; justify-content: center; gap: 9px;
  margin-top: 18px; font-size: 13px; color: var(--text-muted);
}
.pg-pulse {
  width: 9px; height: 9px; border-radius: 50%; background: var(--gold);
  animation: pgPulse 1.5s ease-in-out infinite;
}
@keyframes pgPulse { 0%,100% { opacity: .25; } 50% { opacity: 1; } }
.pg-icone {
  width: 58px; height: 58px; border-radius: 50%; margin: 0 auto 16px;
  display: flex; align-items: center; justify-content: center;
  font-size: 28px; font-weight: 700; color: #fff;
}
.pg-icone-ok { background: var(--ok); }
.pg-icone-erro { background: #8B1A1A; }
.pg-ok { border-top-color: var(--ok); }
.pg-spin {
  width: 34px; height: 34px; margin: 0 auto 14px; border-radius: 50%;
  border: 3px solid var(--border); border-top-color: var(--gold);
  animation: pgSpin .8s linear infinite;
}
@keyframes pgSpin { to { transform: rotate(360deg); } }
.pg-rodape { text-align: center; margin-top: 10px; }
.pg-selos {
  display: flex; justify-content: center; gap: 18px; flex-wrap: wrap;
  font-size: 12px; color: rgba(255,255,255,0.75); margin-bottom: 8px;
}
.pg-rodape p { font-size: 11px; color: rgba(255,255,255,0.45); margin: 0; line-height: 1.6; }
@media (max-width: 400px) {
  .pg-card { padding: 20px 17px; }
  .pg-total strong { font-size: 23px; }
}
`;
