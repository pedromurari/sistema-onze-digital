import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import './webinario/webinario.css';

export default function WorkshopConfirmacao() {
  const { inscricaoId = '' } = useParams();
  const [status, setStatus] = useState('consultando');
  useEffect(() => {
    if (!inscricaoId) return;
    let ativo = true;
    const consultar = async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/workshop-status`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inscricaoId }),
        });
        const json = await res.json();
        if (ativo) setStatus(res.ok && json.ok ? json.status : 'indisponivel');
      } catch { if (ativo) setStatus('indisponivel'); }
    };
    void consultar();
    const timer = window.setInterval(() => { void consultar(); }, 10000);
    return () => { ativo = false; window.clearInterval(timer); };
  }, [inscricaoId]);
  const pago = status === 'pago' || status === 'interessado';
  const inscrito = status === 'inscrito';
  const pagamentoUrl = sessionStorage.getItem(`workshop_pagamento_${inscricaoId}`);
  return <main className="idm-webinario"><div className="iw-wrap iw-wrap-center">
    <div className="iw-logo">INSTITUTO DESPERTAMENTE</div>
    <h1 className="iw-h1">{pago || inscrito ? 'Inscrição confirmada!' : status === 'pendente_pagamento' ? 'Aguardando pagamento' : 'Consultando inscrição'}</h1>
    <p className="iw-sub">{pago || inscrito ? 'Seus dados foram registrados. A equipe informará os próximos passos pelo contato cadastrado.' : status === 'pendente_pagamento' ? 'A inscrição só será confirmada após o gateway aprovar o pagamento. Esta página atualiza automaticamente.' : 'Estamos verificando o estado da inscrição. Se não atualizar, fale com nossa equipe.'}</p>
    {(pago || inscrito) && <a className="iw-btn-gold inline-flex items-center justify-center px-5 no-underline" href="/checklist-formacao-psicanalise.md" download>BAIXAR CHECKLIST BÔNUS</a>}
    {status === 'pendente_pagamento' && pagamentoUrl && <Button className="iw-btn-gold" onClick={() => window.location.assign(pagamentoUrl)}>RETOMAR PAGAMENTO</Button>}
  </div></main>;
}
