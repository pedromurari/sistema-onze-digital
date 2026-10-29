import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import './webinario/webinario.css';

interface EdicaoPublica {
  id: string; slug: string; titulo: string; headline: string; subheadline: string;
  descricao: string | null; bonus_descricao: string | null; modalidade: 'gratuito' | 'pago';
  valor_centavos: number | null; inicio_em: string | null;
}

export default function WorkshopCaptura() {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const [edicao, setEdicao] = useState<EdicaoPublica | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [nome, setNome] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  useEffect(() => {
    let ativo = true;
    void supabase.from('workshop_edicoes' as never)
      .select('id,slug,titulo,headline,subheadline,descricao,bonus_descricao,modalidade,valor_centavos,inicio_em')
      .eq('slug', slug).eq('ativo', true).maybeSingle().then(({ data }) => {
        if (ativo) { setEdicao(data as EdicaoPublica | null); setCarregando(false); }
      });
    return () => { ativo = false; };
  }, [slug]);

  async function cadastrar(event: FormEvent) {
    event.preventDefault();
    if (!edicao || enviando) return;
    setEnviando(true); setErro('');
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/workshop-registrar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, nome, whatsapp, email, website }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok || !data.inscricaoId) throw new Error(data.erro || 'Não foi possível registrar agora.');
      if (data.pagamentoUrl) {
        sessionStorage.setItem(`workshop_pagamento_${data.inscricaoId}`, data.pagamentoUrl);
        window.location.assign(data.pagamentoUrl);
        return;
      }
      navigate(`/workshop/confirmacao/${data.inscricaoId}`);
    } catch (error) { setErro(error instanceof Error ? error.message : 'Falha de conexão.'); setEnviando(false); }
  }

  if (carregando) return <main className="idm-webinario"><div className="iw-wrap iw-wrap-center"><p className="iw-sub">Carregando workshop...</p></div></main>;
  if (!edicao) return <main className="idm-webinario"><div className="iw-wrap iw-wrap-center"><div className="iw-logo">INSTITUTO DESPERTAMENTE</div><h1 className="iw-h1">Workshop em preparação</h1><p className="iw-sub">Esta edição ainda não está aberta para inscrições.</p><Link to="/">Voltar ao início</Link></div></main>;
  return <main className="idm-webinario"><div className="iw-wrap iw-wrap-center">
    <div className="iw-logo">INSTITUTO DESPERTAMENTE</div>
    <p className="iw-eyebrow">WORKSHOP {edicao.modalidade === 'gratuito' ? 'GRATUITO' : 'COM INGRESSO'} · PSICANÁLISE</p>
    <h1 className="iw-h1">{edicao.headline}</h1>
    <p className="iw-sub">{edicao.subheadline}</p>
    <div className="iw-card iw-theme-copy"><p>{edicao.descricao}</p>
      {edicao.bonus_descricao && <p className="iw-theme-video"><strong>Bônus:</strong> {edicao.bonus_descricao}</p>}
      <p className="iw-theme-video">{edicao.inicio_em ? `Encontro: ${new Date(edicao.inicio_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}` : 'Data e acesso serão informados após a inscrição.'}</p>
      {edicao.modalidade === 'pago' && <p className="iw-theme-highlight">Ingresso: {((edicao.valor_centavos ?? 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>}
    </div>
    <form className="iw-card iw-form" onSubmit={(event) => void cadastrar(event)}>
      <div className="iw-field"><Label htmlFor="workshop-nome" className="iw-label">Nome completo</Label><Input id="workshop-nome" className="iw-input" required minLength={2} maxLength={120} value={nome} onChange={(e) => setNome(e.target.value)} /></div>
      <div className="iw-field"><Label htmlFor="workshop-whatsapp" className="iw-label">WhatsApp com DDD</Label><Input id="workshop-whatsapp" className="iw-input" required inputMode="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="(11) 99999-9999" /></div>
      <div className="iw-field"><Label htmlFor="workshop-email" className="iw-label">E-mail {edicao.modalidade === 'pago' ? '' : '(opcional)'}</Label><Input id="workshop-email" className="iw-input" type="email" required={edicao.modalidade === 'pago'} value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      <input aria-hidden="true" tabIndex={-1} autoComplete="off" className="hidden" value={website} onChange={(e) => setWebsite(e.target.value)} />
      {erro && <p role="alert" className="text-sm text-red-300">{erro}</p>}
      <Button type="submit" className="iw-btn-gold w-full" disabled={enviando}>{enviando ? 'Processando...' : edicao.modalidade === 'pago' ? 'RESERVAR E PAGAR INGRESSO' : 'GARANTIR INSCRIÇÃO GRATUITA'}</Button>
      <p className="iw-privacy">Ao se inscrever, você receberá informações deste workshop no contato informado. Atividade educativa, não atendimento clínico.</p>
    </form>
  </div></main>;
}
