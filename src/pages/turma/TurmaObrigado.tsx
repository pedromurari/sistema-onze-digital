import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { carregarPixel, trackPixel } from '../webinario/meta-pixel';
import './turma-obrigado.css';

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

// Mesmo padrão visual já usado nos "obrigado" das turmas anteriores
// (gratuito-47 e cia): fundo #000a1f, card #13316c, dourado #fab338,
// botões verdes -- NÃO é o mesmo padrão dourado do webinário evergreen,
// são identidades visuais diferentes mantidas de propósito.
const LINK_GRUPO_VIP = 'https://chat.whatsapp.com/JSTbJocjLY02QmesuH0LfL';
const LINK_EBOOK = 'https://drive.google.com/file/d/1Wk04rk8msKuEV5loMZa8Iilpowsn3BKq/view?usp=sharing';

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function formatarDatasEvento(aulas: Aula[]): string {
  if (aulas.length === 0) return '';
  const datas = aulas.map((a) => new Date(a.inicio_em));
  const dias = datas.map((d) => d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit' }));
  const mes = MESES[Number(datas[0].toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', month: 'numeric' })) - 1];
  if (dias.length === 1) return `${dias[0]} de ${mes}`;
  return `${dias.slice(0, -1).join(', ')} e ${dias[dias.length - 1]} de ${mes}`;
}

export default function TurmaObrigado() {
  const { slug = '' } = useParams();
  const [searchParams] = useSearchParams();
  const nome = searchParams.get('nome') || '';
  const primeiroNome = nome.split(' ')[0];

  const [turma, setTurma] = useState<TurmaInfo | null>(null);
  const [aulas, setAulas] = useState<Aula[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    carregarPixel();
    trackPixel('CompleteRegistration', { content_name: `Turma ${slug}` });
  }, [slug]);

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
    return <div className="to-page"><div className="to-wrap"><p className="to-sub">Carregando...</p></div></div>;
  }

  const datasTexto = formatarDatasEvento(aulas);

  return (
    <div className="to-page">
      <div className="to-wrap">
        <h1 className="to-h1">
          🎉 Parabéns{primeiroNome ? `, ${primeiroNome}` : ''} pelo seu cadastro!
        </h1>
        <p className="to-sub">
          Você garantiu sua vaga no nosso <span className="to-gold">Curso Gratuito!</span>
          {datasTexto && <> O evento será nos dias <span className="to-gold">{datasTexto}</span>.</>}
        </p>

        <div className="to-progress">
          <div className="to-progress-fill" />
          <div className="to-progress-label">80% das vagas preenchidas</div>
        </div>

        <div className="to-card">
          <p className="to-card-check">✅ Seu cadastro foi realizado com sucesso!</p>
          <p className="to-card-text">
            <strong>Mas atenção:</strong> para concluir seu cadastro e garantir o acesso às aulas, materiais e
            conteúdos exclusivos, é <strong>obrigatório</strong> clicar no botão abaixo e entrar no grupo do WhatsApp.
          </p>
          {LINK_GRUPO_VIP ? (
            <a href={LINK_GRUPO_VIP} target="_blank" rel="noopener noreferrer" className="to-btn-green">
              📲 Entre no Grupo Vip do Curso Gratuito!
            </a>
          ) : (
            <p className="to-card-text" style={{ margin: 0 }}>
              O link do grupo VIP vai chegar no seu WhatsApp em instantes.
            </p>
          )}
        </div>

        <div className="to-grid">
          <div className="to-mini-card">
            <div className="to-mini-icon to-mini-icon-green">✓</div>
            <p className="to-mini-title">Entre agora no Grupo do Curso</p>
            <p className="to-mini-text">Toque no botão abaixo para entrar no grupo de WhatsApp do curso e acessar as aulas.</p>
            {LINK_GRUPO_VIP ? (
              <a href={LINK_GRUPO_VIP} target="_blank" rel="noopener noreferrer" className="to-btn-green">Acessar Grupo Agora!</a>
            ) : (
              <span className="to-btn-green" style={{ opacity: 0.6, cursor: 'default' }}>Em breve</span>
            )}
          </div>
          <div className="to-mini-card">
            <div className="to-mini-icon to-mini-icon-red">📄</div>
            <p className="to-mini-title">Seu E-book já está liberado</p>
            <p className="to-mini-text">Baixe o e-book Desenvolvimento da Personalidade e já comece a estudar antes do curso começar.</p>
            <a href={LINK_EBOOK} target="_blank" rel="noopener noreferrer" className="to-btn-green">📘 Baixar meu E-book</a>
          </div>
        </div>

        <div className="to-footer">
          <p><strong>Aviso importante:</strong> Este site não é afiliado ao Facebook ou a qualquer entidade do Facebook. Depois que você sair do Facebook, a responsabilidade não é deles e sim do nosso site.</p>
          <p>Fazemos todos os esforços para indicar claramente e mostrar todas as provas do produto e usamos resultados reais.</p>
          <p>© {new Date().getFullYear()} Instituto Despertamente. Todos os direitos reservados.</p>
        </div>
      </div>
    </div>
  );
}
