/**
 * Link de matrícula pública da Mentoria NPS (Numerologia) -- /matricula/nps.
 * Pedido do Pedro (16/11/2026): forma rápida de matricular gente nova sem
 * passar pelo CRM. Form mínimo (nome, whatsapp, email, CPF) -> PIX na hora
 * via nps-matricula-criar. Essa mensalidade é assinatura (nunca um lote de
 * parcelas): a próxima só nasce depois que essa for paga, e isso acontece
 * no backend (webhook/polling), não aqui.
 *
 * Reaproveita o visual/CSS de /matricula/:vendedor (matricula-reference.css,
 * classes .idm-matricula/.pix-container/etc.) só que num form bem mais
 * curto -- essa página não tem wizard de 3 passos, é um único formulário.
 */
import { useState, useRef, useEffect } from 'react';
import { Loader2, CheckCircle2, XCircle, QrCode, Copy } from 'lucide-react';
import logoIdm from '@/assets/logo-idm.png';
import './matricula/matricula-reference.css';
import { ensurePoppinsFontLoaded } from './matricula/theme';

const SUPABASE_FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function formatCpf(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function StatusBadge({ status }: { status: 'pending' | 'approved' | 'timeout' }) {
  const map = {
    pending: { texto: 'Aguardando pagamento', cor: '#8A6100', bg: '#FFF6DF' },
    approved: { texto: 'Aprovado', cor: '#1A5C2A', bg: '#E9F5EC' },
    timeout: { texto: 'Aguardando pagamento', cor: '#8A6100', bg: '#FFF6DF' },
  } as const;
  const info = map[status];
  return (
    <span style={{ display: 'inline-block', padding: '4px 12px', borderRadius: 999, fontSize: '0.75rem', fontWeight: 600, color: info.cor, background: info.bg }}>
      {info.texto}
    </span>
  );
}

export default function MatriculaNPS() {
  useEffect(() => { ensurePoppinsFontLoaded(); }, []);

  const [nome, setNome] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [cpf, setCpf] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  const [pix, setPix] = useState<{ qrCodeBase64: string | null; qrCode: string | null; paymentId: string | number; valor: number } | null>(null);
  const [pixStatus, setPixStatus] = useState<'pending' | 'approved' | 'timeout'>('pending');
  const pollRef = useRef<{ tentativas: number; timer: ReturnType<typeof setInterval> | null }>({ tentativas: 0, timer: null });
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (!pix || pixStatus !== 'pending') return;
    const poll = () => {
      pollRef.current.tentativas += 1;
      fetch(`${SUPABASE_FUNCTIONS_URL}/nps-matricula-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId: pix.paymentId }),
      })
        .then(r => r.json())
        .then(d => {
          if (d.ok && d.status === 'approved') {
            setPixStatus('approved');
            if (pollRef.current.timer) clearInterval(pollRef.current.timer);
            return;
          }
          if (pollRef.current.tentativas >= 60) {
            setPixStatus('timeout');
            if (pollRef.current.timer) clearInterval(pollRef.current.timer);
          }
        })
        .catch(() => {});
    };
    pollRef.current.timer = setInterval(poll, 4000);
    return () => { if (pollRef.current.timer) clearInterval(pollRef.current.timer); };
  }, [pix, pixStatus]);

  async function enviar() {
    setErro('');
    if (!nome.trim() || !whatsapp.trim() || !email.trim() || cpf.replace(/\D/g, '').length !== 11) {
      setErro('Preencha nome, WhatsApp, e-mail e CPF (válido) pra continuar.');
      return;
    }
    setEnviando(true);
    try {
      const r = await fetch(`${SUPABASE_FUNCTIONS_URL}/nps-matricula-criar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, whatsapp, email, cpf }),
      });
      const d = await r.json();
      if (!d.ok) { setErro(d.erro || 'Não foi possível gerar o PIX.'); setEnviando(false); return; }
      setPix({ qrCodeBase64: d.qrCodeBase64, qrCode: d.qrCode, paymentId: d.paymentId, valor: d.valor });
      setEnviando(false);
    } catch {
      setErro('Erro ao enviar. Tente novamente.');
      setEnviando(false);
    }
  }

  return (
    <div className="idm-matricula">
      <header className="site-header">
        <div className="header-deco"></div>
        <div className="header-inner">
          <div className="header-badge">
            <span className="badge-line"></span>
            <span className="badge-text">Instituto Despertamente</span>
            <span className="badge-line"></span>
          </div>
          <div className="header-seal">
            <img src={logoIdm} alt="Logo IDM" style={{ width: 80, height: 80, objectFit: 'contain' }} />
          </div>
          <p className="header-kicker">Numerologia · NPS</p>
          <h1 className="header-title">
            Matrícula da<br /><em>Mentoria NPS</em>
          </h1>
        </div>
      </header>

      <main style={{ maxWidth: 560, margin: '0 auto', padding: '32px 16px 64px' }}>
        {!pix && (
          <section className="form-section">
            <div className="section-header">
              <p className="section-eyebrow">Dados</p>
              <h2 className="section-title">Seus dados</h2>
            </div>
            <div className="section-rule"></div>

            <div className="field-grid cols-2">
              <div className="field span-full">
                <label className="field-label" htmlFor="nome">Nome completo <span className="field-required">*</span></label>
                <div className="field-control">
                  <input type="text" id="nome" autoComplete="name" placeholder="Conforme documento de identidade" value={nome} onChange={e => setNome(e.target.value)} />
                </div>
              </div>
              <div className="field">
                <label className="field-label" htmlFor="email">E-mail <span className="field-required">*</span></label>
                <div className="field-control">
                  <input type="email" id="email" autoComplete="email" placeholder="seu@email.com" value={email} onChange={e => setEmail(e.target.value)} />
                </div>
              </div>
              <div className="field">
                <label className="field-label" htmlFor="telefone">WhatsApp <span className="field-required">*</span></label>
                <div className="field-control">
                  <input type="tel" id="telefone" autoComplete="tel" placeholder="+55 (11) 9 0000-0000" value={whatsapp} onChange={e => setWhatsapp(e.target.value)} />
                </div>
              </div>
              <div className="field span-full">
                <label className="field-label" htmlFor="cpf">CPF <span className="field-required">*</span></label>
                <div className="field-control">
                  <input type="text" id="cpf" maxLength={14} inputMode="numeric" placeholder="000.000.000-00" value={cpf} onChange={e => setCpf(formatCpf(e.target.value))} />
                </div>
              </div>
            </div>

            {erro && (
              <div style={{ background: '#FFF5F5', borderLeft: '3px solid var(--error)', color: 'var(--error)', fontSize: '0.875rem', padding: '12px 16px', marginTop: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <XCircle className="h-4 w-4 flex-shrink-0" /> {erro}
              </div>
            )}

            <button type="button" className={`btn-submit${enviando ? ' loading' : ''}`} disabled={enviando} onClick={enviar} style={{ marginTop: 24 }}>
              <span className="btn-text">Gerar PIX e matricular</span>
              <span className="btn-icon">→</span>
              <span className="btn-spinner"><Loader2 className="h-4 w-4 animate-spin" /></span>
            </button>
          </section>
        )}

        {pix && (
          <div className="pix-container">
            <div className="pix-amount-badge">
              <span className="pix-amount-label">Mensalidade Mentoria NPS</span>
              <span className="pix-amount-value">R$ {fmtBRL(pix.valor)}</span>
            </div>

            <div className="qr-wrapper">
              {pixStatus === 'approved' ? (
                <CheckCircle2 className="h-14 w-14" style={{ color: '#1A5C2A' }} />
              ) : pix.qrCodeBase64 ? (
                <img src={`data:image/png;base64,${pix.qrCodeBase64}`} alt="QR Code Pix" />
              ) : (
                <Loader2 className="h-10 w-10 animate-spin" />
              )}
            </div>

            <StatusBadge status={pixStatus} />

            {pixStatus === 'pending' && pix.qrCode && (
              <>
                <div className="pix-code-wrap">
                  <p className="pix-code-label">Código Pix copia e cola</p>
                  <div className="pix-code-box">
                    <div className="pix-code-input">
                      <QrCode className="h-3.5 w-3.5" style={{ display: 'inline', marginRight: 6, verticalAlign: '-2px' }} />
                      {pix.qrCode}
                    </div>
                    <button
                      type="button" className={`btn-copy${copiado ? ' copied' : ''}`}
                      onClick={() => { navigator.clipboard?.writeText(pix.qrCode!); setCopiado(true); setTimeout(() => setCopiado(false), 2000); }}
                    >
                      <Copy className="h-3.5 w-3.5" style={{ display: 'inline', marginRight: 4, verticalAlign: '-2px' }} />
                      {copiado ? 'Copiado!' : 'Copiar'}
                    </button>
                  </div>
                </div>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Aguardando confirmação do pagamento...</p>
              </>
            )}

            {pixStatus === 'timeout' && (
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', lineHeight: 1.6, textAlign: 'center', maxWidth: 360 }}>
                Ainda não identificamos o pagamento — sua matrícula já foi registrada, o PIX pode
                levar alguns minutos para confirmar. Você pode fechar esta página.
              </p>
            )}

            {pixStatus === 'approved' && (
              <p style={{ fontSize: '0.9375rem', color: 'var(--text)', fontWeight: 600, textAlign: 'center' }}>
                Pagamento confirmado! Em breve você recebe por WhatsApp/e-mail a confirmação e o acesso
                à área de membros da Mentoria NPS.
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
