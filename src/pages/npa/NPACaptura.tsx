import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Calendar, MapPin, Phone, Play, User } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { carregarPixel, trackPixel } from './meta-pixel';
import './npa.css';

const FUNCTIONS_URL = 'https://usqiyekfmwwnvkmkdlej.supabase.co/functions/v1';
const LOGO = 'https://pub-da74b2ec5ddf4847a6f20dec2e542925.r2.dev/turma-assets/logo-idm.png';
const FOTO_RODRYGO = 'https://pub-da74b2ec5ddf4847a6f20dec2e542925.r2.dev/turma-assets/rodrygo.png';

// Vídeo real do NPA (Rodrygo falando sobre o IDM Pelo Brasil Numerologia),
// baixado do YouTube da última turma de verdade (Rio #22, enYdWdV5zGM) e
// subido pro R2 -- não é mais o vídeo de Psicanálise que tinha sido
// reaproveitado por engano da pasta antiga, nem o embed do YouTube (que
// expõe sugestões de outros vídeos e sai do nosso controle de avanço).
const VIDEO_URL = 'https://pub-da74b2ec5ddf4847a6f20dec2e542925.r2.dev/npa-assets/video-rodrygo-npa.mp4';
const VIDEO_POSTER = 'https://img.youtube.com/vi/enYdWdV5zGM/maxresdefault.jpg';

// Links de checkout do Vega -- placeholders até o Pedro criar os produtos e
// mandar as URLs reais. Troca só os valores aqui quando chegarem.
const CHECKOUT_URLS: Record<string, { manha: string; tarde: string }> = {
  'sao-paulo': { manha: '', tarde: '' },
  santos: { manha: '', tarde: '' },
};

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;

interface EventoPublico {
  id: string;
  nome: string;
  data_evento: string;
  local: string;
  valor_ingresso: number;
  professor_convidado: string | null;
  slug: string;
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function formatarData(dataISO: string) {
  const d = new Date(`${dataISO}T12:00:00`);
  const diaSemana = d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long' });
  const dia = d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit' });
  const mesIdx = Number(d.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', month: 'numeric' })) - 1;
  return {
    curta: `${dia} de ${MESES[mesIdx]}`,
    diaMes: `${dia}/${String(mesIdx + 1).padStart(2, '0')}`,
    diaSemana: diaSemana.charAt(0).toUpperCase() + diaSemana.slice(1),
  };
}

function formatarWhatsApp(value: string) {
  const n = value.replace(/\D/g, '');
  if (n.length <= 2) return n;
  if (n.length <= 6) return `(${n.slice(0, 2)}) ${n.slice(2)}`;
  if (n.length <= 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7, 11)}`;
}

function VideoPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const maxAssistidoRef = useRef(0);
  const [tocando, setTocando] = useState(false);
  const [progressoPct, setProgressoPct] = useState(0);

  return (
    <div
      className="npa-video-wrap group cursor-pointer"
      onClick={() => {
        const v = videoRef.current;
        if (!v) return;
        if (v.paused) v.play().catch(() => {});
        else v.pause();
      }}
    >
      <video
        ref={videoRef}
        src={VIDEO_URL}
        poster={VIDEO_POSTER}
        playsInline
        preload="metadata"
        className="absolute inset-0 h-full w-full object-cover"
        onPlay={() => setTocando(true)}
        onPause={() => setTocando(false)}
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          const t = v.currentTime;
          if (t > maxAssistidoRef.current + 1.5) v.currentTime = maxAssistidoRef.current;
          else if (t > maxAssistidoRef.current) maxAssistidoRef.current = t;
          if (v.duration) setProgressoPct((v.currentTime / v.duration) * 100);
        }}
        onSeeking={(e) => {
          const v = e.currentTarget;
          if (v.currentTime > maxAssistidoRef.current + 0.5) v.currentTime = maxAssistidoRef.current;
        }}
        onSeeked={(e) => {
          const v = e.currentTarget;
          if (v.currentTime > maxAssistidoRef.current + 0.5) v.currentTime = maxAssistidoRef.current;
        }}
      />
      {/* Sem barra de progresso arrastável de propósito -- só play/pause
          (clique em qualquer lugar do vídeo), pra ninguém pular o teaser
          pra frente. Barra abaixo é só visual. */}
      {!tocando && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 bg-black/35 transition-colors group-hover:bg-black/25">
          <span className="flex h-16 w-16 md:h-20 md:w-20 items-center justify-center rounded-full bg-amber-400 shadow-[0_0_20px_rgba(234,179,8,0.4)] transition-transform group-hover:scale-110">
            <Play className="h-7 w-7 md:h-9 md:w-9 translate-x-0.5 text-[#0d1420] fill-[#0d1420]" />
          </span>
          <p className="text-white font-bold text-sm md:text-xl drop-shadow-lg text-center">▶ ASSISTA ANTES DE SE INSCREVER</p>
        </div>
      )}
      <div className="absolute left-0 right-0 bottom-0 h-1 bg-black/40 pointer-events-none">
        <div className="h-full bg-amber-400" style={{ width: `${progressoPct}%` }} />
      </div>
    </div>
  );
}

const PILARES = [
  {
    icone: '🧠', titulo: 'Domine os fundamentos', subtitulo: 'Calcule e interprete seus números com precisão',
    itens: [
      'Cálculo correto do número de destino — entenda a rota da sua vida e tome decisões mais assertivas',
      'Interpretação completa dos números de 1 a 9 — descubra o significado por trás de cada número',
      'Estrutura base da numerologia pitagórica — aprenda o sistema milenar usado pelos maiores mestres',
      'Técnicas práticas de cálculo — domine o método passo a passo e aplique imediatamente',
    ],
    rodape: 'Aprenda o método exato usado por profissionais',
  },
  {
    icone: '❤️', titulo: 'Seu mapa pessoal', subtitulo: 'Desvende sua essência e potencial único',
    itens: [
      'Número da alma — descubra sua essência interior e o que realmente te motiva',
      'Número de expressão — entenda como você se manifesta e é percebido pelo mundo',
      'Leitura do mapa numerológico completo — saia do encontro com seu mapa pronto em mãos',
      'Padrões de comportamento — compreenda por que você age de determinada forma',
    ],
    rodape: 'Entenda sua personalidade de forma profunda',
  },
  {
    icone: '👁️', titulo: 'Numerologia na prática', subtitulo: 'Transforme teoria em resultados concretos para o dia a dia',
    itens: [
      'Numerologia residencial — harmonize a energia da sua casa e melhore o ambiente',
      'Energia da assinatura e nome profissional — potencialize sua marca pessoal',
      'Harmonizações simples para o dia a dia — aplique ajustes rápidos com resultados reais',
      'Numerologia em decisões importantes — use os números como guia estratégico',
    ],
    rodape: 'Ferramentas práticas que você usa imediatamente',
  },
];

export default function NPACaptura() {
  const { slug = '' } = useParams();
  const [evento, setEvento] = useState<EventoPublico | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [nome, setNome] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [turno, setTurno] = useState<'manha' | 'tarde' | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => { carregarPixel(); }, []);

  useEffect(() => {
    let ativo = true;
    fetch(`${FUNCTIONS_URL}/npa-evento-publico?slug=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!ativo) return;
        if (data.ok) setEvento(data.evento);
        setCarregando(false);
      })
      .catch(() => ativo && setCarregando(false));
    return () => { ativo = false; };
  }, [slug]);

  const dataFmt = useMemo(() => (evento ? formatarData(evento.data_evento) : null), [evento]);
  const mapsUrl = useMemo(() => (evento ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(evento.local)}` : '#'), [evento]);
  const cidade = evento ? evento.nome.replace(/^NPA #\d+\s*/i, '') : '';
  const preco = evento ? evento.valor_ingresso.toFixed(0) : '26';

  function handleWhatsapp(e: ChangeEvent<HTMLInputElement>) {
    setWhatsapp(formatarWhatsApp(e.target.value));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (nome.trim().length < 3) { toast.error('Digite seu nome completo.'); return; }
    const digitos = whatsapp.replace(/\D/g, '');
    if (digitos.length < 10 || digitos.length > 11) { toast.error('Digite um WhatsApp válido com DDD.'); return; }
    if (!turno) { toast.error('Escolha a turma (manhã ou tarde).'); return; }
    if (!evento) return;

    setEnviando(true);
    const phoneToSend = `55${digitos}`;
    const checkoutUrl = CHECKOUT_URLS[slug]?.[turno];

    // Pré-registra o interesse no CRM mesmo antes do pagamento -- não trava
    // o fluxo se falhar. O webhook do Vega confirma o pagamento depois e
    // atualiza esse mesmo lead (casa por whatsapp+evento). supabase-js só
    // dispara a chamada quando o builder é "then"ado/esperado -- sem await
    // aqui o insert nunca sai do papel.
    try {
      await supabase.from('npa_evento_leads').insert({
        npa_evento_id: evento.id,
        nome: nome.trim(),
        whatsapp: phoneToSend,
        turma: turno,
        fase: 'novo',
      } as never);
    } catch (err) {
      console.error('Erro ao pré-registrar lead NPA:', err);
    }

    trackPixel('Lead', { content_name: `NPA ${slug} - ${turno}` });

    if (!checkoutUrl) {
      toast.success('Interesse registrado! Assim que o checkout abrir, avisamos você pelo WhatsApp.');
      setEnviando(false);
      return;
    }

    toast.success('Redirecionando para o pagamento...');
    const params = new URLSearchParams(window.location.search);
    const url = new URL(checkoutUrl);
    url.searchParams.set('name', nome.trim());
    url.searchParams.set('customer_name', nome.trim());
    url.searchParams.set('phone_number', digitos);
    url.searchParams.set('cellphone', phoneToSend);
    UTM_KEYS.forEach((key) => {
      const v = params.get(key);
      if (v) url.searchParams.set(key, v);
    });
    trackPixel('InitiateCheckout', { content_name: evento.nome, content_type: 'product', value: evento.valor_ingresso, currency: 'BRL' });
    setTimeout(() => { window.location.href = url.toString(); }, 1200);
  }

  if (carregando) {
    return <div className="npa-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><p>Carregando...</p></div>;
  }
  if (!evento || !dataFmt) {
    return <div className="npa-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><p>Turma não encontrada ou inscrições encerradas.</p></div>;
  }

  const formulario = (
    <form onSubmit={handleSubmit} className="npa-form-card">
      <div className="text-center mb-6">
        <h3 className="text-2xl md:text-3xl font-bold text-white mb-2">SIM! Quero minha vaga no IDM Pelo Brasil!</h3>
        <p className="text-slate-300">Garanta sua vaga agora e comece sua jornada de autodescoberta!</p>
      </div>
      <div className="space-y-5">
        <div>
          <Label htmlFor="npa-nome" className="text-white font-medium">Nome completo</Label>
          <div className="relative mt-2">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            <Input id="npa-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Digite seu nome completo"
              className="pl-11 h-12 bg-white/5 border-white/15 text-white placeholder:text-slate-400 focus-visible:ring-amber-400" required />
          </div>
        </div>
        <div>
          <Label htmlFor="npa-whatsapp" className="text-white font-medium">WhatsApp</Label>
          <div className="relative mt-2">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
              <Phone className="h-5 w-5 text-slate-400" /><span className="text-sm font-semibold text-slate-400">+55</span>
            </div>
            <Input id="npa-whatsapp" type="tel" value={whatsapp} onChange={handleWhatsapp} placeholder="(00) 00000-0000"
              className="pl-20 h-12 bg-white/5 border-white/15 text-white placeholder:text-slate-400 focus-visible:ring-amber-400" required />
          </div>
        </div>
        <div>
          <Label className="text-white font-medium flex items-center gap-2 mb-3">
            <Calendar className="h-5 w-5" /> Escolha sua turma — {dataFmt.curta}
          </Label>
          <div className="space-y-3">
            {([
              { key: 'manha' as const, icone: '☀️', horario: '09:00 às 13:00' },
              { key: 'tarde' as const, icone: '🌇', horario: '14:00 às 18:00' },
            ]).map((t) => (
              <button key={t.key} type="button" onClick={() => setTurno(t.key)}
                className={`npa-turma-option ${turno === t.key ? 'npa-selected' : ''}`}>
                <div className="flex items-start gap-3">
                  <div className={`w-5 h-5 mt-0.5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${turno === t.key ? 'border-amber-400 bg-amber-400' : 'border-slate-400'}`}>
                    {turno === t.key && <div className="w-2 h-2 rounded-full bg-[#0d1420]" />}
                  </div>
                  <div className="text-left flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-lg">{t.icone}</span>
                      <p className="font-semibold text-white">{dataFmt.curta}</p>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-400">{dataFmt.diaSemana}</span>
                    </div>
                    <p className="text-sm text-slate-300 mt-1">{t.horario}</p>
                    <p className="text-xs mt-1 flex items-center gap-1 text-slate-400"><MapPin className="h-3 w-3" />{evento.local}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
        <button type="submit" disabled={enviando} className="npa-cta-button">
          {enviando ? 'Processando...' : `Garanta Sua Vaga por R$${preco}!`}
        </button>
        <div className="flex flex-col gap-1.5 text-center text-sm text-slate-400">
          <p>Vagas limitadas!</p>
          <p>Seus dados estão 100% seguros</p>
          <p>Pagamento seguro</p>
        </div>
      </div>
    </form>
  );

  return (
    <div className="npa-page">
      <div className="npa-geometric-numbers" aria-hidden="true">
        {Array.from({ length: 9 }, (_, i) => <div key={i} className="npa-number-float">{i + 1}</div>)}
      </div>

      <section className="relative z-10 px-4 py-6 md:py-12">
        <div className="max-w-6xl mx-auto">
          <div className="flex justify-center mb-8">
            <img src={LOGO} alt="Instituto DespertaMente" className="h-20 md:h-28 w-auto object-contain" />
          </div>

          <div className="text-center mb-8">
            <h1 className="npa-hero-headline">
              <span className="npa-headline-line npa-highlight text-xl md:text-3xl">
                IDM Pelo Brasil Numerologia: Uma experiência presencial em {cidade} para quem quer aprender, vivenciar e aplicar a numerologia com clareza.
              </span>
            </h1>
            <h2 className="text-base md:text-xl text-slate-300 mt-4 mb-6 font-semibold max-w-2xl mx-auto">
              Com {evento.professor_convidado ?? 'Rodrygo Murari'}: Saia com seu mapa numerológico pronto, certificado e material de apoio exclusivo para aplicar imediatamente.
            </h2>

            <VideoPlayer />

            <div className="max-w-xl mx-auto">
              <div className="rounded-xl border-2 border-amber-400/40 bg-white/5 p-5 mb-6">
                <p className="text-amber-400 font-bold text-lg mb-1">{dataFmt.curta} em {cidade} - SP!</p>
                <p className="font-semibold text-white">Vagas limitadas! Garanta sua vaga agora.</p>
              </div>
              <div className="flex flex-wrap justify-center gap-4 text-sm text-slate-300 mb-4">
                <span>Certificado de conclusão</span>
                <span>Material de apoio exclusivo</span>
                <span>Vagas limitadas</span>
              </div>
              <p className="npa-price-shine text-2xl md:text-3xl font-bold mb-6">Garanta sua vaga por apenas R${preco} reais.</p>
            </div>
          </div>

          <div>{formulario}</div>
        </div>
      </section>

      <section className="relative z-10 px-4">
        <div className="npa-section-container npa-section-highlight">
          <h2 className="text-2xl md:text-4xl font-bold text-center text-white mb-3">O QUE VOCÊ VAI DESCOBRIR NESTA EXPERIÊNCIA PRESENCIAL</h2>
          <p className="text-center text-slate-300 mb-10 text-lg">Os 3 pilares do IDM Pelo Brasil Numerologia — conteúdo prático que você aplica no mesmo dia</p>
          <div className="grid md:grid-cols-3 gap-6">
            {PILARES.map((p) => (
              <div key={p.titulo} className="npa-pillar npa-hover-lift">
                <div className="text-5xl mb-4 text-center">{p.icone}</div>
                <h3 className="text-xl font-bold text-white mb-1.5 text-center">{p.titulo}</h3>
                <p className="text-amber-400 font-semibold mb-4 text-center">{p.subtitulo}</p>
                <ul className="space-y-2.5 mb-5">
                  {p.itens.map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-slate-300 text-sm">
                      <span className="text-amber-400 mt-0.5">✓</span><span>{item}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-sm text-slate-400 italic text-center pt-3 border-t border-white/10">{p.rodape}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative z-10 px-4">
        <div className="npa-section-container text-center max-w-4xl">
          <img src={LOGO} alt="Instituto DespertaMente" className="h-20 w-auto object-contain mx-auto mb-6" />
          <h2 className="text-2xl md:text-4xl font-bold text-white mb-6">QUEM ESTÁ POR TRÁS DESTE PROJETO?</h2>
          <div className="text-lg text-slate-300 space-y-4 leading-relaxed">
            <p>O Instituto DespertaMente é referência em desenvolvimento humano, integrando Psicanálise, PNL, Hipnose e Numerologia Pitagórica Sistêmica.</p>
            <p>Nossa missão é clara: tornar o autoconhecimento acessível através de experiências transformadoras, vivências profundas e formações de altíssima qualidade.</p>
            <p className="npa-price-shine font-semibold text-xl">Não é apenas teoria. É transformação real na vida de centenas de participantes.</p>
          </div>
        </div>
      </section>

      <section className="relative z-10 px-4">
        <div className="npa-section-container max-w-5xl">
          <h2 className="text-2xl md:text-4xl font-bold text-center text-white mb-10">CONHEÇA SEU PROFESSOR</h2>
          <div className="flex flex-col md:flex-row items-center gap-8 md:gap-12">
            <div className="flex-shrink-0 text-center">
              <img src={FOTO_RODRYGO} alt="Rodrygo Murari" className="w-56 h-56 md:w-72 md:h-72 rounded-2xl object-cover border-4 border-amber-400/30 shadow-2xl mx-auto" />
              <p className="text-xl font-bold text-white mt-4">Rodrygo Murari</p>
              <p className="text-amber-400 font-semibold">Fundador e Professor Especialista</p>
            </div>
            <div className="text-slate-300 space-y-4 leading-relaxed text-center md:text-left">
              <p>Com mais de <span className="text-amber-400 font-bold">5.000 HORAS</span> de atendimentos somados em setting terapêutico, experiências, treinamentos e mentorias, Rodrygo Murari é especialista em Metafísica Comportamental e PNL Sistêmica.</p>
              <p>Seu propósito? Levar uma "Numerologia Descomplicada".</p>
              <p>Sua abordagem revolucionária da Numerologia Sistêmica tem transformado a vida de centenas de pessoas no Brasil e na Europa.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-10 px-4">
        <div className="npa-section-container npa-section-highlight max-w-4xl">
          <h2 className="text-xl md:text-4xl font-bold text-center text-white mb-6">POR QUE UMA EXPERIÊNCIA PRESENCIAL TÃO ACESSÍVEL?</h2>
          <div className="text-lg text-slate-300 space-y-4 leading-relaxed mb-8 text-center">
            <p>Você deve estar se perguntando: "Como uma experiência presencial com certificado pode custar apenas R${preco}?"</p>
            <p className="npa-price-shine font-semibold text-xl">A resposta é simples: nossa missão é democratizar o autoconhecimento.</p>
            <p className="font-semibold text-white">Este não é um encontro online genérico. É uma experiência presencial, com a profundidade e a interação que só o contato direto pode oferecer.</p>
            <p>Queremos que VOCÊ tenha acesso a ferramentas poderosas de transformação, independente da sua situação financeira.</p>
            <p>O investimento de R${preco} garante seu compromisso e nossa capacidade de organizar o melhor evento possível.</p>
          </div>

          <div className="bg-white/5 border-2 border-amber-400/40 rounded-2xl p-6 md:p-8 text-center">
            <div className="flex justify-center gap-8 mb-6 flex-wrap">
              <div><p className="text-sm text-slate-400 mb-1">Valor real da experiência:</p><p className="text-2xl md:text-3xl font-bold line-through text-slate-400">R$ 497</p></div>
              <div><p className="text-sm text-slate-400 mb-1">Seu investimento hoje:</p><p className="npa-price-shine text-3xl md:text-4xl font-bold">R${preco}</p></div>
              <div><p className="text-sm text-slate-400 mb-1">Economia:</p><p className="text-2xl md:text-3xl font-bold text-amber-400">R$ {497 - Number(preco)}</p></div>
            </div>
            <p className="npa-price-shine text-xl md:text-2xl font-bold">Sim, você está economizando mais de 90%!</p>
          </div>

          <div className="mt-8 bg-white/5 border border-amber-400/20 rounded-xl p-6">
            <h3 className="text-xl font-bold text-center text-amber-400 mb-5">O QUE ESTÁ INCLUSO:</h3>
            <div className="grid md:grid-cols-2 gap-2.5 text-slate-300 text-sm">
              {['Encontro presencial completo (4 horas)', 'Certificado de conclusão', 'Material de apoio exclusivo', 'Seu mapa numerológico pronto', 'Suporte durante o evento', 'Acesso ao grupo exclusivo de participantes'].map((item) => (
                <p key={item} className="flex items-center gap-2"><span className="text-amber-400">✓</span>{item}</p>
              ))}
            </div>
            <p className="npa-price-shine text-center text-lg font-bold mt-5">TUDO ISSO POR R${preco}!</p>
          </div>
        </div>
      </section>

      <section className="relative z-10 px-4 py-10 text-center">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-4xl font-bold text-white mb-4">VAGAS LIMITADAS!</h2>
          <p className="text-lg text-slate-300 mb-8">{dataFmt.diaSemana}, {dataFmt.curta} · {cidade} · Manhã ou Tarde</p>
          <a href="#inicio" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
            <button className="npa-cta-button max-w-md mx-auto">Garantir Minha Vaga por R${preco}!</button>
          </a>
        </div>
      </section>

      <section className="relative z-10 px-4">
        <div className="npa-section-container max-w-4xl">
          <h2 className="text-2xl md:text-4xl font-bold text-center text-white mb-2">PERGUNTAS FREQUENTES</h2>
          <p className="text-center text-slate-300 mb-10">Tire suas dúvidas antes de garantir sua vaga</p>
          <Accordion type="single" collapsible className="space-y-3">
            <AccordionItem value="faq-1" className="border-white/10">
              <AccordionTrigger className="text-left text-white hover:text-amber-400">Nunca estudei numerologia. Esta experiência é para mim?</AccordionTrigger>
              <AccordionContent className="text-slate-300">SIM! Este encontro foi desenvolvido especialmente para iniciantes. Você não precisa de conhecimento prévio. Vamos começar do zero e você sairá do evento já sabendo calcular e interpretar seu próprio mapa numerológico.</AccordionContent>
            </AccordionItem>
            <AccordionItem value="faq-2" className="border-white/10">
              <AccordionTrigger className="text-left text-white hover:text-amber-400">Por que o ingresso custa R${preco}? Qual é a pegadinha?</AccordionTrigger>
              <AccordionContent className="text-slate-300">Não há pegadinha! Nossa missão é democratizar o autoconhecimento. O valor garante seu compromisso com a experiência e cobre custos básicos de organização. Queremos que o máximo de pessoas possam ter acesso a essa transformação.</AccordionContent>
            </AccordionItem>
            <AccordionItem value="faq-3" className="border-white/10">
              <AccordionTrigger className="text-left text-white hover:text-amber-400">O certificado é reconhecido?</AccordionTrigger>
              <AccordionContent className="text-slate-300">Sim! Você receberá um certificado de conclusão emitido pelo Instituto DespertaMente, válido como comprovação de participação e aprendizado em Numerologia Pitagórica Sistêmica.</AccordionContent>
            </AccordionItem>
            <AccordionItem value="faq-4" className="border-white/10">
              <AccordionTrigger className="text-left text-white hover:text-amber-400">Quando e onde será a experiência?</AccordionTrigger>
              <AccordionContent className="text-slate-300">
                A experiência será realizada no dia {dataFmt.diaMes} ({dataFmt.diaSemana}), com duas turmas: Manhã (09h às 13h) e Tarde (14h às 18h), presencial em {evento.local}. As informações detalhadas serão enviadas por WhatsApp logo após sua inscrição.{' '}
                <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="text-amber-400 underline">Ver no Google Maps</a>.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="faq-5" className="border-white/10">
              <AccordionTrigger className="text-left text-white hover:text-amber-400">E se eu não puder comparecer depois de pagar?</AccordionTrigger>
              <AccordionContent className="text-slate-300">Entre em contato conosco com 48h de antecedência. Avaliaremos a possibilidade de transferir sua vaga para a próxima turma ou realizar o reembolso integral.</AccordionContent>
            </AccordionItem>
            <AccordionItem value="faq-6" className="border-white/10">
              <AccordionTrigger className="text-left text-white hover:text-amber-400">Preciso levar algum material?</AccordionTrigger>
              <AccordionContent className="text-slate-300">Não! Todo material didático está incluso. Você só precisa levar você mesmo, com mente aberta e vontade de aprender. Recomendamos trazer caderno extra se quiser fazer anotações pessoais.</AccordionContent>
            </AccordionItem>
            <AccordionItem value="faq-7" className="border-white/10">
              <AccordionTrigger className="text-left text-white hover:text-amber-400">Vou conseguir fazer cálculos numerológicos depois do encontro?</AccordionTrigger>
              <AccordionContent className="text-slate-300">COM CERTEZA! A experiência é 100% prática. Você vai calcular seu próprio mapa durante o evento e sairá de lá apto a calcular para outras pessoas. É aprender fazendo!</AccordionContent>
            </AccordionItem>
            <AccordionItem value="faq-8" className="border-white/10">
              <AccordionTrigger className="text-left text-white hover:text-amber-400">O pagamento é seguro?</AccordionTrigger>
              <AccordionContent className="text-slate-300">Absolutamente! Seus dados estão protegidos e você recebe a confirmação do pagamento na hora.</AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </section>

      <footer className="relative z-10 px-4 py-12 border-t border-white/10 text-center">
        <div className="max-w-3xl mx-auto space-y-5">
          <img src={LOGO} alt="Instituto DespertaMente" className="h-14 w-auto object-contain mx-auto" />
          <p className="text-lg font-semibold text-white">Instituto DespertaMente</p>
          <p className="text-slate-400">Transformando vidas através do autoconhecimento</p>
          <div className="space-y-1 text-slate-400 text-sm">
            <p>{evento.local}</p>
          </div>
          <div className="flex justify-center gap-6 pt-2 text-sm">
            <a href="https://www.instagram.com/institutodespertamente/" target="_blank" rel="noopener noreferrer" className="text-amber-400 hover:text-amber-300">Instagram</a>
            <a href="https://www.facebook.com/institutodespertamente" target="_blank" rel="noopener noreferrer" className="text-amber-400 hover:text-amber-300">Facebook</a>
            <a href="https://www.youtube.com/@institutodespertamente" target="_blank" rel="noopener noreferrer" className="text-amber-400 hover:text-amber-300">YouTube</a>
          </div>
          <div className="pt-6 border-t border-white/10 text-xs text-slate-500">
            <p>© {new Date().getFullYear()} Instituto DespertaMente. Todos os direitos reservados.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
