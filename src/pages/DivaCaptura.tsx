import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import './webinario/webinario.css';

interface TerapeutaPublico {
  id: string; nome: string; especialidade: string | null; bio: string | null; foto_url: string | null;
}

export default function DivaCaptura() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [terapeutas, setTerapeutas] = useState<TerapeutaPublico[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [terapeutaId, setTerapeutaId] = useState(searchParams.get('terapeuta') ?? '');
  const [nome, setNome] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [website, setWebsite] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let ativo = true;
    void supabase.from('diva_terapeutas' as never)
      .select('id,nome,especialidade,bio,foto_url')
      .eq('status', 'aprovado')
      .then(({ data }) => { if (ativo) { setTerapeutas((data as TerapeutaPublico[] | null) ?? []); setCarregando(false); } });
    return () => { ativo = false; };
  }, []);

  async function enviar(event: FormEvent) {
    event.preventDefault();
    if (enviando) return;
    setEnviando(true); setErro('');
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/diva-registrar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, whatsapp, email, mensagem, terapeuta_id: terapeutaId || undefined, website }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok || !data.leadId) throw new Error(data.erro || 'Não foi possível registrar agora.');
      navigate(`/diva/confirmacao/${data.leadId}`);
    } catch (error) { setErro(error instanceof Error ? error.message : 'Falha de conexão.'); setEnviando(false); }
  }

  const terapeutaSelecionado = terapeutas.find(t => t.id === terapeutaId);

  return <main className="idm-webinario"><div className="iw-wrap iw-wrap-center">
    <div className="iw-logo">DIVÃ IDM</div>
    <p className="iw-eyebrow">TERAPIA SOCIAL · INSTITUTO DESPERTAMENTE</p>
    <h1 className="iw-h1">Terapia com quem entende do assunto</h1>
    <p className="iw-sub">Sessões com terapeutas credenciados pelo IDM, a partir de R$80. Preencha seu interesse e nosso time entra em contato pra combinar tudo.</p>

    {!carregando && terapeutas.length > 0 && (
      <div className="iw-card iw-theme-copy">
        <p><strong>Terapeutas credenciados:</strong></p>
        <div style={{ display: 'grid', gap: '12px', marginTop: '12px' }}>
          {terapeutas.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTerapeutaId(t.id === terapeutaId ? '' : t.id)}
              style={{
                textAlign: 'left', padding: '12px', borderRadius: '10px',
                border: t.id === terapeutaId ? '2px solid #D4AF37' : '1px solid rgba(255,255,255,0.2)',
                background: t.id === terapeutaId ? 'rgba(212,175,55,0.1)' : 'transparent', cursor: 'pointer',
              }}
            >
              <strong>{t.nome}</strong>{t.especialidade ? ` — ${t.especialidade}` : ''}
              {t.bio && <p style={{ margin: '4px 0 0', fontSize: '0.9em', opacity: 0.85 }}>{t.bio}</p>}
            </button>
          ))}
        </div>
      </div>
    )}

    <form className="iw-card iw-form" onSubmit={(event) => void enviar(event)}>
      <div className="iw-field">
        <Label htmlFor="diva-nome" className="iw-label">Nome completo</Label>
        <Input id="diva-nome" className="iw-input" required minLength={2} maxLength={120} value={nome} onChange={(e) => setNome(e.target.value)} />
      </div>
      <div className="iw-field">
        <Label htmlFor="diva-whatsapp" className="iw-label">WhatsApp com DDD</Label>
        <Input id="diva-whatsapp" className="iw-input" required inputMode="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="(11) 99999-9999" />
      </div>
      <div className="iw-field">
        <Label htmlFor="diva-email" className="iw-label">E-mail (opcional)</Label>
        <Input id="diva-email" className="iw-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="iw-field">
        <Label htmlFor="diva-mensagem" className="iw-label">Quer contar algo antes da gente ligar? (opcional)</Label>
        <Textarea id="diva-mensagem" className="iw-input" maxLength={500} value={mensagem} onChange={(e) => setMensagem(e.target.value)} />
      </div>
      <input aria-hidden="true" tabIndex={-1} autoComplete="off" className="hidden" value={website} onChange={(e) => setWebsite(e.target.value)} />
      {erro && <p role="alert" className="text-sm text-red-300">{erro}</p>}
      <Button type="submit" className="iw-btn-gold w-full" disabled={enviando}>
        {enviando ? 'Enviando...' : terapeutaSelecionado ? `QUERO FALAR COM ${terapeutaSelecionado.nome.toUpperCase()}` : 'QUERO MINHA SESSÃO'}
      </Button>
      <p className="iw-privacy">Ao enviar, você autoriza o contato do nosso time pelo WhatsApp/e-mail informado.</p>
    </form>
  </div></main>;
}
