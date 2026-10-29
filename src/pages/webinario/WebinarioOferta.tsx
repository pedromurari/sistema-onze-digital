import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import './webinario.css';

// Leva o lead pro fluxo de matrícula JÁ EXISTENTE (Asaas/Mercado Pago),
// pré-preenchendo os dados dele. Nenhum checkout novo -- reaproveita
// MatriculaTimeComercial.tsx via /matricula/helen (rodízio hoje só tem a
// Helen, mesma atribuição feita no handoff do webinario-track).
export default function WebinarioOferta() {
  const navigate = useNavigate();

  const nome = sessionStorage.getItem('webinario_nome') || '';
  const email = sessionStorage.getItem('webinario_email') || '';
  const whatsapp = sessionStorage.getItem('webinario_whatsapp') || '';

  const irParaMatricula = () => {
    const params = new URLSearchParams();
    if (nome) params.set('nome', nome);
    if (email) params.set('email', email);
    if (whatsapp) params.set('whatsapp', whatsapp);
    navigate(`/matricula/helen?${params.toString()}`);
  };

  return (
    <div className="idm-webinario">
      <div className="iw-wrap iw-wrap-center">
        <div className="iw-logo">INSTITUTO DESPERTAMENTE</div>
        <h1 className="iw-h1">🚨 Matrículas abertas</h1>
        <p className="iw-sub">
          Formação em Psicanálise Clínica Integrativa — a mesma formação que você acabou
          de conhecer no webinário, com condição especial por tempo limitado.
        </p>
        <div className="iw-card">
          <Button className="iw-btn-gold w-full" onClick={irParaMatricula}>
            VER CONDIÇÕES E GARANTIR MINHA VAGA
          </Button>
        </div>
      </div>
    </div>
  );
}
