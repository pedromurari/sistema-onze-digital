import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import '../webinario/webinario.css';

const FUNCTIONS_URL = 'https://usqiyekfmwwnvkmkdlej.supabase.co/functions/v1';

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

// Grupo VIP: link de convite (chat.whatsapp.com/...) precisa ser colado
// aqui manualmente depois que o grupo for criado (Wizard de Lançamento,
// etapa "Grupos WPP") -- o JID salvo em lancamentos.grupo_lancamento_jid
// não é o link público de convite, é o identificador interno.
const LINK_GRUPO_VIP = '';

export default function TurmaObrigado() {
  const { slug = '' } = useParams();
  const [turma, setTurma] = useState<TurmaInfo | null>(null);
  const [aulas, setAulas] = useState<Aula[]>([]);
  const [carregando, setCarregando] = useState(true);

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

  if (carregando) {
    return (
      <div className="idm-webinario">
        <div className="iw-wrap iw-wrap-center"><p className="iw-sub">Carregando...</p></div>
      </div>
    );
  }

  return (
    <div className="idm-webinario">
      <div className="iw-wrap iw-wrap-center">
        <div className="iw-logo">INSTITUTO DESPERTAMENTE</div>
        <h1 className="iw-h1">🎉 Inscrição confirmada!</h1>
        <p className="iw-sub">
          Você garantiu sua vaga na <strong>{turma?.nome ?? 'turma'}</strong>. Anote os horários abaixo e entre no
          grupo VIP pra não perder nenhuma aula.
        </p>

        <div className="iw-card" style={{ textAlign: 'left', display: 'grid', gap: 14 }}>
          {aulas.map((aula) => (
            <div key={aula.numero}>
              <strong>{aula.titulo}</strong>
              <div style={{ opacity: 0.8, fontSize: '0.9rem' }}>
                {new Date(aula.inicio_em).toLocaleString('pt-BR', {
                  timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                })}
              </div>
              {aula.youtube_url ? (
                <a href={aula.youtube_url} target="_blank" rel="noopener noreferrer" className="iw-btn-gold" style={{ display: 'inline-block', marginTop: 8 }}>
                  Assistir no YouTube
                </a>
              ) : (
                <div style={{ opacity: 0.6, fontSize: '0.85rem', marginTop: 4 }}>Link do YouTube ainda será divulgado</div>
              )}
            </div>
          ))}
        </div>

        {LINK_GRUPO_VIP ? (
          <a href={LINK_GRUPO_VIP} target="_blank" rel="noopener noreferrer" className="iw-btn-gold" style={{ display: 'inline-block', marginTop: 24 }}>
            Entrar no Grupo VIP do WhatsApp
          </a>
        ) : (
          <p className="iw-sub" style={{ marginTop: 24 }}>
            O link do grupo VIP do WhatsApp vai chegar no seu WhatsApp em breve.
          </p>
        )}
      </div>
    </div>
  );
}
