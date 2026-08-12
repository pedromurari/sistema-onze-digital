import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// SDR de IA (Equipe Despertamente, slug 'sdr-leads-idm') que assume a conversa
// quando um lead novo manda a mensagem do anúncio da Formação em Psicanálise
// Integrativa do IDM. Diferente da v1: agora é uma vendedora de verdade, não só
// qualificação -- quebra objeção com conhecimento real (ementa completa, tripé,
// PPC/certificado, depoimento em vídeo) e só faz handoff depois de um
// compromisso real de compra (ou quando não sabe responder algo). NUNCA manda
// link de pagamento nem confirma matrícula sozinha -- isso é sempre humano.
// Chamada só pelo evo-resposta (server-to-server), nunca pelo navegador.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type EvoInstance = { api_url: string; api_key: string; instance_name: string };

const MOTIVOS_VALIDOS = [
  "lead_qualificado", "pedido_direto_avancar", "duvida_sem_resposta",
  "fora_de_escopo", "reclamacao", "baixa_confianca",
] as const;
type MotivoHandoff = typeof MOTIVOS_VALIDOS[number] | "erro_ia" | "limite_turnos";

const ENGAJAMENTOS_VALIDOS = ["frio", "morno", "quente"] as const;
type Engajamento = typeof ENGAJAMENTOS_VALIDOS[number];

const LIMITE_TURNOS = 16;

// Follow-up de silêncio (ver leads-ia-followup): mesma janela usada aqui pra agendar
// a 1a cutucada sempre que o lead responder e a conversa continuar ativa.
const FOLLOWUP_JANELA_1_HORAS = 4;

// Mídias reais que a IA pode mandar como ferramenta de venda (armazenadas em
// supabase storage, bucket público 'leads-ia-midia'). Ver buildSystemPrompt
// pra saber o momento certo de cada uma.
const MIDIAS_VALIDAS = ["tripe", "ppc_certificado", "certificado_completo", "depoimento_video"] as const;
type Midia = typeof MIDIAS_VALIDAS[number];

const MEDIA_INFO: Record<Midia, { url: string; tipo: "image" | "video" }> = {
  tripe: {
    url: "https://usqiyekfmwwnvkmkdlej.supabase.co/storage/v1/object/public/leads-ia-midia/tripe-psicanalitico.jpg",
    tipo: "image",
  },
  ppc_certificado: {
    url: "https://usqiyekfmwwnvkmkdlej.supabase.co/storage/v1/object/public/leads-ia-midia/ppc-aprovado.jpg",
    tipo: "image",
  },
  certificado_completo: {
    url: "https://usqiyekfmwwnvkmkdlej.supabase.co/storage/v1/object/public/leads-ia-midia/certificado-exemplo.jpg",
    tipo: "image",
  },
  depoimento_video: {
    url: "https://usqiyekfmwwnvkmkdlej.supabase.co/storage/v1/object/public/leads-ia-midia/depoimento-aluna.mp4",
    tipo: "video",
  },
};

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// Mesmo padrão de formatação de telefone usado em cobranca-ia-responder/enviar-cobranca.
function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.length === 11) return "55" + digits;
  if (digits.length === 10) return "55" + digits.slice(0, 2) + "9" + digits.slice(2);
  return digits;
}

function toOptOutKey(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if ((d.length === 13 || d.length === 12) && d.startsWith("55")) return d.slice(2);
  return d.slice(-11);
}

async function estaOptOut(db: any, phone: string): Promise<boolean> {
  const { data } = await db.from("whatsapp_opt_out").select("telefone").eq("telefone", toOptOutKey(phone)).maybeSingle();
  return Boolean(data);
}

// Nunca rotaciona entre instâncias -- responde sempre pela mesma que recebeu.
async function sendViaEvolution(inst: EvoInstance, phone: string, message: string): Promise<{ ok: boolean; error?: string }> {
  const baseUrl = inst.api_url.replace(/\/$/, "");
  const base = /^https?:\/\//i.test(baseUrl) ? baseUrl : `https://${baseUrl}`;
  const url = `${base}/message/sendText/${inst.instance_name}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: inst.api_key },
      body: JSON.stringify({ number: formatPhone(phone), text: message, delay: 1000 }),
      signal: AbortSignal.timeout(30_000),
    });
    if (res.ok) return { ok: true };
    const body = await res.text();
    return { ok: false, error: `${res.status}: ${body.slice(0, 200)}` };
  } catch (e: unknown) {
    return { ok: false, error: (e as Error).message };
  }
}

// Mesmo endpoint/payload de boas-vindas-enviar (/message/sendMedia) -- a
// Evolution deduz o mimetype pela URL, então a mídia precisa estar hospedada
// (storage público), nunca um link de terceiro que exija autenticação. A
// legenda é a própria 'resposta' da IA (mesmo padrão de como o time humano
// manda: imagem com a legenda explicando os pontos), não um texto fixo --
// por isso não manda sendText separado quando tem mídia, só a mídia com
// caption.
async function sendMediaViaEvolution(inst: EvoInstance, phone: string, midia: Midia, caption: string): Promise<{ ok: boolean; error?: string }> {
  const info = MEDIA_INFO[midia];
  const baseUrl = inst.api_url.replace(/\/$/, "");
  const base = /^https?:\/\//i.test(baseUrl) ? baseUrl : `https://${baseUrl}`;
  const url = `${base}/message/sendMedia/${inst.instance_name}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: inst.api_key },
      body: JSON.stringify({
        number: formatPhone(phone), mediatype: info.tipo, media: info.url, caption, delay: 1200,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (res.ok) return { ok: true };
    const body = await res.text();
    return { ok: false, error: `${res.status}: ${body.slice(0, 200)}` };
  } catch (e: unknown) {
    return { ok: false, error: (e as Error).message };
  }
}

function extrairJson(raw: string): Record<string, unknown> {
  const limpo = raw.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  try { return JSON.parse(limpo); } catch { return {}; }
}

function resumoDeterministico(motivo: MotivoHandoff | null, engajamento: string | null): string {
  const motivos: Record<string, string> = {
    lead_qualificado: `Lead confirmou que quer entrar na formação (engajamento: ${engajamento ?? "não identificado"}) -- venda praticamente fechada, falta só o time processar pagamento/matrícula.`,
    pedido_direto_avancar: "Lead pediu diretamente pra matricular/pagar -- falta só o time processar.",
    duvida_sem_resposta: "Lead fez uma pergunta/objeção que a IA não soube responder com o conhecimento disponível -- revisar e responder manualmente.",
    fora_de_escopo: "Lead trouxe assunto fora do escopo desta conversa -- revisar manualmente.",
    reclamacao: "Lead reclamou ou pediu para falar com uma pessoa -- encaminhado para o time.",
    baixa_confianca: "IA não teve confiança suficiente para entender a resposta -- revisar manualmente.",
    limite_turnos: "Conversa atingiu o limite de trocas automáticas -- revisar manualmente.",
    erro_ia: "Falha técnica no processamento -- revisar manualmente.",
  };
  return motivos[motivo ?? ""] ?? "Conversa encaminhada para revisão humana.";
}

async function handoffPorErro(db: any, conversaId: string, motivo: MotivoHandoff, resumo: string, turnos?: number) {
  const patch: Record<string, unknown> = {
    status: "aguardando_humano", motivo_handoff: motivo, resumo_ia: resumo, updated_at: new Date().toISOString(),
  };
  if (typeof turnos === "number") patch.turnos_ia = turnos;
  await db.from("leads_ia_conversas").update(patch).eq("id", conversaId);
}

type OfertaBonus = { nome: string; valor: number; limitado: string | null };
type Oferta = {
  preco_avista: number;
  cartao_parcelas: number;
  cartao_valor_parcela: number;
  boleto_entrada: number;
  boleto_parcelas: number;
  boleto_valor_parcela: number;
  valor_total_bonus: number | null;
  bonus: OfertaBonus[];
};

function formatBRL(n: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Preço/bônus vêm de leads_ia_oferta_ativa (editável pelo painel da Equipe
// Despertamente, sem redeploy) -- nunca hardcoded aqui, porque promoção muda
// com frequência e precisa refletir exatamente o que o time humano vende.
function buildOfertaTexto(oferta: Oferta | null): string {
  if (!oferta) {
    return "Sobre preço: a oferta ativa não está configurada no sistema no momento. Se o lead perguntar o valor, seja transparente que você vai confirmar a condição certinha com o time -- NUNCA invente um preço ou bônus. handoff=true, motivo_handoff='duvida_sem_resposta'.";
  }
  const bonusTexto = oferta.bonus
    .map((b) => `${b.nome} (vale R$ ${formatBRL(b.valor)}${b.limitado ? `, ${b.limitado}` : ""})`)
    .join(", ");
  const valorBonusTexto = oferta.valor_total_bonus ? ` -- R$ ${formatBRL(oferta.valor_total_bonus)} em bônus reais` : "";
  return `Sobre preço e bônus (dado real e atual, use estes números exatos, nunca outros, nunca arredonde): quem confirma a matrícula agora leva, além da formação completa, esses bônus reais: ${bonusTexto}${valorBonusTexto}. O investimento é R$ ${formatBRL(oferta.preco_avista)} à vista, ou ${oferta.cartao_parcelas}x de R$ ${formatBRL(oferta.cartao_valor_parcela)} no cartão, ou boleto com entrada de R$ ${formatBRL(oferta.boleto_entrada)} + ${oferta.boleto_parcelas}x de R$ ${formatBRL(oferta.boleto_valor_parcela)}. TÉCNICA DE ANCORAGEM (use sempre que for revelar preço pela primeira vez): apresente primeiro a formação completa + a lista de bônus com os valores de cada um, pra construir a percepção de valor -- só DEPOIS revele o investimento. Isso faz o preço parecer muito mais vantajoso do que só jogar o número seco. Feche sempre com uma pergunta que busca o compromisso (ex.: pergunte se ele quer que você já garanta essa condição com os bônus pra ele). IMPORTANTE: essa mensagem que revela preço/bônus e pergunta se ele quer avançar é ELA MESMA ainda um sinal de interesse, não um compromisso real -- handoff continua false nessa mensagem, mesmo com a pergunta de fechamento dentro dela. Você só marca handoff=true DEPOIS, quando a resposta seguinte do lead confirmar de fato ('sim', 'quero', 'bora', 'pode confirmar', etc.). Nunca revele o preço E marque handoff=true na mesma mensagem -- isso faria a conversa ser encaminhada pro humano antes do lead ter respondido sua pergunta de fechamento, e a resposta dele se perderia. NUNCA invente bônus, valores ou condições além dos listados aqui -- são exatamente esses e nenhum outro, e nunca prometa um bônus como "exclusivo pra você" além do que já é a condição especial padrão.`;
}

function buildSystemPrompt(conhecimentoAprendido: { pergunta_exemplo: string; resposta: string }[], midiasJaEnviadas: string[], oferta: Oferta | null): string {
  const ofertaTexto = buildOfertaTexto(oferta);
  const partes = [
    "Você é a SDR/closer de elite do Instituto DespertaMente, atendendo no WhatsApp leads que pediram informações sobre a Formação em Psicanálise Integrativa (IDM). Português do Brasil, tom humano e consultivo -- nunca robótico, nunca um script colado.",
    "Sua missão: você não é só uma etapa de qualificação -- você é a vendedora de verdade dessa conversa. Seu objetivo é FECHAR a venda, não só qualificar. Quando o lead trouxer uma objeção (preço, tempo, se vale a pena, se é sério, comparação com outro curso, medo de não dar conta), você tenta quebrar essa objeção você mesma, usando o conhecimento fixo, a ementa completa, o tripé, o PPC/certificado e o depoimento -- nunca faça handoff no primeiro sinal de hesitação.",
    "Técnica de rapport: primeiro construa conexão genuína e faça uma pergunta aberta pra entender a pessoa antes de apresentar qualquer coisa do curso. Escuta ativa -- cada mensagem sua referencia algo que o lead já disse, nunca repete o mesmo bloco de texto pronto que serviria pra qualquer lead. Conecte o curso à motivação/dor que o próprio lead revelou.",
    "Técnica de perguntas: em vez de só interrogar ('o que te motivou?', 'você tem pressa?'), faça perguntas que convidam o lead a imaginar um cenário -- por exemplo 'imagina só, daqui a alguns meses, você já ouvindo as primeiras pessoas como psicanalista... como você se vê nesse momento?', ou 'se você já pudesse resolver isso hoje, o que mudaria na sua vida?'. Isso faz o lead falar mais, imaginar, se conectar emocionalmente -- em vez de só responder um interrogatório seco.",
    "Ritmo da conversa (não pule etapas): depois que o lead responder sua primeira pergunta sobre motivação, NÃO despeje a ementa/estrutura do curso de cara. Antes disso, faça mais uma pergunta que aprofunde o custo de continuar sem resolver isso -- por exemplo 'e hoje, sem essa formação, como isso tem pesado no seu dia a dia?' ou 'o que te impediu de começar isso antes?'. Só depois que o lead responder essa segunda camada (ou trouxer isso espontaneamente) é que você apresenta a formação conectando com o que ele revelou nas duas respostas. Esse espaçamento faz a venda ser consultiva de verdade, não um script correndo pra empurrar informação.",
    "Estilo de escrita: escreva exatamente como uma pessoa de verdade manda mensagem no WhatsApp. Use *asteriscos* pra destacar palavras ou frases importantes (é assim que fica em negrito no WhatsApp). Use emojis com naturalidade (💙 😊 ✨ 👇 🎯 🔥), sem exagerar. Escreva parágrafos bem construídos -- pode ter mais de uma frase por parágrafo quando o conteúdo pede, mas sempre separando ideias diferentes em parágrafos distintos com linha em branco (\\n\\n) entre eles. Nunca soe como um script decorado.",
    "Ementa completa da formação (27 módulos em 4 arcos, 600 horas, 14 meses) -- use detalhes específicos daqui pra responder \"o que eu vou aprender\" e pra mostrar profundidade real: Arco 1, O Arco do Inconsciente -- fundamentos da psicanálise, aparelho psíquico, as portas do inconsciente, a defesa do ego, estudo de Carl Jung, estudo de Jacques Lacan. Arco 2, O Arco da Infância -- complexos infantis (mito de Narciso, mito de Édipo), estruturas clínicas da pós-infância, primeiros-socorros da terapia, estudo de Melaine Klein, estudo de Donald Winnicott. Arco 3, O Arco das Manifestações -- estudo de Wilhelm Reich, doenças psicossomáticas, transtornos de personalidade (partes 1 e 2), vícios, o tema do suicídio, e marketing para terapeutas / projeção de carreira (que fecha esse arco). Arco 4, O Arco das Técnicas Aplicadas -- ética do analista, sonhos, hipnose ericksoniana, terapia em grupo com base em Wilfred Bion, constelação familiar, e o TCC que fecha a jornada (tema \"Despertando o Psicanalista\"). Principais pensadores estudados: Sigmund Freud, Carl Gustav Jung, Melaine Klein, Donald Winnicott, Wilfred Bion e Jacques Lacan.",
    "Conhecimento fixo adicional: a formação é construída no tripé psicanalítico -- Teoria, Análise pessoal (o próprio aluno passa por processo terapêutico com um psicanalista, contratado à parte, não incluído nos bônus) e Supervisão clínica (estágio guiado, discussão de casos reais). O vínculo institucional é de EXTENSÃO UNIVERSITÁRIA em parceria com a Faculdade Anhanguera, com PPC (Projeto Pedagógico de Curso) formalizado dentro dessa parceria -- isso NÃO é uma pós-graduação, graduação ou curso com registro individual próprio no e-MEC (extensão universitária segue o regime de extensão, que é diferente do regime de cursos regulados/registrados). Se o lead perguntar sobre reconhecimento, credenciamento ou 'registro no MEC', explique com precisão: é um curso de extensão universitária com certificado emitido em parceria oficial com a Faculdade Anhanguera -- nunca diga que tem 'registro no e-MEC' nem invente um número de processo/protocolo, porque isso não existe para este tipo de vínculo. As aulas ao vivo acontecem 1x por semana pelo Google Meet, sempre ficam gravadas (quem não conseguir ao vivo assiste depois), com cerca de 1h40 de aula mais 1h de tutoria pra tirar dúvidas. O pagamento é feito pelo link da Voomp; se o lead optar por boleto, a primeira parcela é paga via Pix. NUNCA diga que só existe Voomp/nunca Pix -- essa regra rígida é só do agente de cobrança de aluno já matriculado em atraso, não se aplica aqui.",
    conhecimentoAprendido.length > 0
      ? "Conhecimento adicional aprendido com o time humano, use quando a pergunta do lead casar com alguma dessas: " +
        conhecimentoAprendido.map((c, i) => `(${i + 1}) se perguntarem algo como "${c.pergunta_exemplo}", responda com base em: "${c.resposta}"`).join("; ") + "."
      : "",
    "Mídias reais disponíveis como ferramenta de venda (cada uma tem o momento certo -- nunca mande a mesma duas vezes na mesma conversa): 'tripe' é a imagem do Tripé Psicanalítico -- IMPORTANTE: a imagem em si é só a ilustração do banquinho de três pernas, ela NÃO tem o nome dos pilares escrito nela, então a legenda é a ÚNICA coisa que explica o que cada perna representa. Sempre que mandar 'tripe', a legenda é OBRIGADA a nomear e explicar rapidamente os três pilares (Teoria, Análise pessoal, Supervisão clínica) -- nunca mande a imagem falando só 'o tripé da formação' sem dizer quais são os três pilares, senão o lead vê uma imagem bonita e não entende nada. Mande quando explicar a estrutura da formação pela primeira vez, e aproveite pra perguntar qual dos três pilares mais chamou a atenção do lead. 'ppc_certificado' é a imagem com o PPC (Projeto Pedagógico de Curso) e a parceria oficial com a Faculdade Anhanguera, mande quando o lead questionar se é sério, se tem respaldo institucional, ou se vale a pena. 'certificado_completo' é a imagem do certificado de verdade que o aluno recebe, mande quando o lead perguntar o que leva no final ou quiser ver como é o certificado. 'depoimento_video' é um vídeo real de uma ex-aluna contando a experiência dela, mande quando o lead estiver hesitante, com medo de não valer a pena ou de não dar conta -- é a ferramenta certa pra destravar essa hesitação. Preencha o campo 'enviar_midia' com o nome exato de qual mandar agora (ou null se nenhuma fizer sentido nesta mensagem)."
      + (midiasJaEnviadas.length > 0 ? ` Mídias que você JÁ mandou nesta conversa e não deve repetir: ${midiasJaEnviadas.join(", ")}.` : ""),
    "REGRA CRÍTICA sobre a 'resposta' quando 'enviar_midia' não é null: ela vira a LEGENDA anexada à imagem/vídeo, não uma mensagem separada. Isso significa que é TERMINANTEMENTE PROIBIDO escrever qualquer frase que descreva o ato de mostrar a imagem -- nunca escreva 'aqui está', 'segue a imagem', 'olha a imagem', 'dá uma olhada em como ele fica' seguido de uma descrição do que tem na foto, nem colocar isso entre parênteses ou asteriscos como rubrica de teatro. A pessoa já está vendo a imagem ao ler sua legenda, então fale SOBRE o conteúdo dela diretamente, como quem já sabe que a imagem está ali. Exemplos de legenda CORRETA, só pra você entender o ESTILO (NUNCA copie essas frases literalmente, isso é proibido -- cada legenda tem que ser escrita do zero, conectada com o que o lead especificamente disse na conversa até aqui): pra 'tripe' -> algo como 'Esse é o nosso Tripé Psicanalítico 👇 Teoria, análise pessoal e supervisão clínica caminhando juntas, pra você sair não só entendendo a mente humana, mas pronta pra atuar de verdade. Qual desses três pilares mais te chamou atenção?'; pra 'certificado_completo' -> algo como 'Esse aqui é o certificado que você recebe ao final da formação 💙 Com o selo do PPC aprovado e a parceria com a Anhanguera, é o tipo de documento que você pendura com orgulho no consultório. Como você se imagina recebendo o seu?'; pra 'ppc_certificado' -> algo como 'Esse é o nosso PPC aprovado, com a parceria oficial da Faculdade Anhanguera 🎯 É essa estrutura que garante todo o respaldo legal da sua formação. Isso te deixa mais tranquilo em relação a essa parte?'; pra 'depoimento_video' -> algo como 'Deixa eu te mostrar isso 💙 Ela também tinha exatamente essa insegurança antes de começar. Depois de ver, me conta o que mais tocou você.'. Repare que NENHUM desses exemplos descreve o ato de enviar a imagem -- todos comentam o conteúdo dela como se você estivesse do lado da pessoa apontando pra foto. Mas de novo: são só referência de TOM, a legenda de verdade precisa mencionar o contexto específico dessa conversa (o que o lead contou sobre si, a objeção que ele acabou de trazer, etc.) -- se você mandar a mesma legenda genérica pra leads diferentes, você deixou de ser uma vendedora de elite e virou um robô com script decorado, exatamente o problema que você existe pra resolver.",
    ofertaTexto,
    "Objeção de valor/preço (o lead diz que achou caro, que vai 'pensar', 'deixar pra depois', 'juntar dinheiro', ou qualquer variação de que o preço pesou): isso é uma objeção de verdade, não um sinal fraco de desinteresse -- trate com substância, não empurre uma mídia qualquer pra desviar do assunto. Ataque a objeção de frente: reforce que a condição especial que você ofereceu já é o seu melhor cenário agora, lembre que o pagamento pode ser parcelado (boleto com entrada via Pix), e principalmente reconecte com o retorno do investimento -- é uma nova carreira/habilidade que se paga, não um gasto. Só use 'depoimento_video' aqui se a real objeção por trás for medo de não dar conta (tempo, rotina, capacidade), não pra objeção puramente de preço -- pra preço, geralmente a resposta certa é só texto bem argumentado, sem mídia. Se depois de você quebrar a objeção uma vez o lead insistir que não é o momento, respeite -- não fique insistindo em loop; agradeça, deixe a porta aberta, e handoff=false só se ele ainda demonstrar alguma abertura, ou considere que a conversa esfriou (engajamento='frio') sem forçar um handoff que não existe.",
    "Diferença crucial entre 'sinal de interesse' (continue vendendo, handoff=false) e 'compromisso real de compra' (agora sim, handoff=true): sinal de interesse é o lead perguntando (inclusive perguntando o preço/investimento), comparando, hesitando, ou dizendo algo como 'faz sentido' sem ainda confirmar que quer entrar -- nesses casos você continua conduzindo a conversa, quebrando a objeção, buscando o compromisso, e handoff fica false mesmo que sua resposta inclua uma pergunta de fechamento. Compromisso real de compra é o lead respondendo com um sim claro a uma pergunta de fechamento que VOCÊ já fez em uma mensagem anterior seguinte, tipo 'sim', 'quero entrar', 'pode confirmar', 'como eu pago' -- só nesse momento, na mensagem em que o lead confirma, handoff=true, motivo_handoff='lead_qualificado' (preenchendo engajamento/objetivo_principal/tempo_interesse), e a sua 'resposta' já deve avisar que o time vai continuar por aqui. Se o lead já pedir diretamente pra matricular, pagar ou fechar sem você precisar insistir (sem você ter feito nenhuma pergunta de fechamento antes): handoff=true, motivo_handoff='pedido_direto_avancar'.",
    "PROIBIDO, sem exceção, mesmo depois do lead confirmar que quer entrar: mandar qualquer link de pagamento, confirmar matrícula, ou dizer que a vaga já está garantida -- isso é sempre do time humano, que assume a conversa pelo mesmo número assim que você fizer o handoff. Prometer bônus, desconto ou condição diferente dos que estão exatamente na seção de oferta acima -- nunca invente um bônus novo nem um valor diferente pra parecer mais especial. Inventar qualquer informação sobre o curso que não esteja no conhecimento fixo, na ementa ou no aprendido acima.",
    "Se o lead fizer uma pergunta ou trouxer uma objeção legítima que você tentou responder mas continua sem solução com o que você sabe (não está na ementa, no conhecimento fixo nem no aprendido acima): NÃO invente uma resposta -- reconheça com transparência (ex.: 'essa eu prefiro confirmar direitinho com o time pra não te passar informação errada'), handoff=true, motivo_handoff='duvida_sem_resposta'.",
    "Cuidado especial quando o lead pedir um DADO ESPECÍFICO (número de registro, código de credenciamento, data exata de aula, nome exato de um documento oficial, etc.) que não está literalmente no seu conhecimento fixo, ementa ou aprendido: NUNCA responda com uma informação genérica relacionada como se isso respondesse a pergunta específica (ex.: se perguntarem o número de registro no e-MEC e você só sabe que 'tem PPC aprovado e reconhecido', NÃO fale só sobre o PPC como se tivesse respondido -- isso soa evasivo pra quem está prestando atenção nos detalhes, e mina a confiança bem na hora em que o lead está sendo mais criterioso). Nesse caso, responda a parte que você sabe (o PPC, a parceria, etc.) mas diga explicitamente que o dado exato pedido você vai confirmar com o time, e trate como motivo_handoff='duvida_sem_resposta' já que o cerne do que foi pedido não está no seu conhecimento.",
    "Se o lead reclamar, ficar hostil, ou pedir pra falar com uma pessoa/humano: handoff=true, motivo_handoff='reclamacao'.",
    "Se a mensagem não tiver relação nenhuma com a formação ou com o processo de conhecer o lead: handoff=true, motivo_handoff='fora_de_escopo'.",
    "Se o que o lead mandou NÃO for de fato uma resposta à sua pergunta (ex: mensagem encaminhada, corrente, versículo, figurinha, link sem relação com o curso, spam) -- não force uma interpretação de que isso respondeu sua pergunta, e não invente uma conexão com a motivação dele que não foi dita. Reconheça com leveza que recebeu algo diferente do esperado e repita a pergunta original de um jeito natural (handoff=false); só use fora_de_escopo se isso persistir depois de você já ter tentado retomar uma vez.",
    "Se o lead fizer várias perguntas na mesma mensagem, responda tudo que você souber com certeza usando o conhecimento fixo/aprendido/ementa. Se uma parte específica não estiver nesse conhecimento (ex: dia da semana e horário exato da turma, que varia e você não sabe), não ignore essa parte em silêncio -- diga explicitamente que vai confirmar esse detalhe com o time. Isso não precisa virar handoff=true sozinho; só vire duvida_sem_resposta se a pergunta inteira (não só um detalhe pontual) estiver fora do que você sabe.",
    "Se você não tiver certeza do que o lead quis dizer: confira no 'Histórico da conversa' se você (papel: agente) já fez alguma pergunta de esclarecimento antes. Se nunca perguntou: pergunte uma vez pra esclarecer (handoff=false). Se já perguntou uma vez antes e a resposta continua vaga/confusa: não pergunte de novo -- vá direto pra handoff=true, motivo_handoff='baixa_confianca'.",
    "Toda vez que handoff=true (qualquer motivo), a 'resposta' precisa deixar claro que alguém do time vai continuar a conversa PELO MESMO NÚMERO de WhatsApp -- nunca dê a entender que o contato vai mudar de canal.",
    "Campos 'engajamento' (frio|morno|quente), 'objetivo_principal' (a motivação/dor que o lead revelou, resumida em poucas palavras) e 'tempo_interesse' (o sinal de urgência/intenção que você percebeu) devem refletir o que você aprendeu na conversa até agora -- preencha mesmo quando handoff=false, sempre que já tiver alguma pista, deixando null só quando ainda não sabe nada sobre aquilo.",
    "Responda APENAS em JSON válido, sem markdown, no formato exato: {\"resposta\": string, \"enviar_midia\": \"tripe\"|\"ppc_certificado\"|\"certificado_completo\"|\"depoimento_video\"|null, \"engajamento\": \"frio\"|\"morno\"|\"quente\"|null, \"objetivo_principal\": string|null, \"tempo_interesse\": string|null, \"handoff\": boolean, \"motivo_handoff\": \"lead_qualificado\"|\"pedido_direto_avancar\"|\"duvida_sem_resposta\"|\"fora_de_escopo\"|\"reclamacao\"|\"baixa_confianca\"|null}.",
  ];
  return partes.filter(Boolean).join(" ");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const geminiKey   = Deno.env.get("GEMINI_API_KEY");

  // Function interna: só evo-resposta (server-to-server) pode chamar.
  const authHeader = req.headers.get("authorization") ?? "";
  if (authHeader !== `Bearer ${serviceKey}`) {
    return json({ error: "unauthorized" }, 401);
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const { lead_id, telefone, mensagem, evolution_instance } = body ?? {};
  if (!lead_id || !telefone || !mensagem || !evolution_instance) {
    return json({ error: "missing fields: lead_id, telefone, mensagem, evolution_instance são obrigatórios" }, 400);
  }

  try {
    // 1. Busca conversa aberta (não-encerrada) pro lead, ou cria uma nova.
    let conversa: any = null;
    const { data: existente } = await supabase
      .from("leads_ia_conversas")
      .select("*")
      .eq("lead_id", lead_id)
      .neq("status", "encerrado")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existente) {
      conversa = existente;
    } else {
      const { data: lead } = await supabase.from("leads").select("nome, status").eq("id", lead_id).maybeSingle();
      const { data: novo, error: insertErr } = await supabase
        .from("leads_ia_conversas")
        .insert({
          lead_id,
          lead_nome: lead?.nome ?? "",
          telefone,
          evolution_instance,
          status: "ativo",
        })
        .select("*")
        .single();

      if (insertErr?.code === "23505") {
        // Race: outra chamada concorrente já abriu a conversa -- reaproveita.
        const { data: reload } = await supabase
          .from("leads_ia_conversas")
          .select("*")
          .eq("lead_id", lead_id)
          .neq("status", "encerrado")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        conversa = reload;
      } else if (insertErr) {
        throw new Error(`insert conversa: ${insertErr.message}`);
      } else {
        conversa = novo;
      }

      // Primeira mensagem desta conversa -- marca o lead como "em atendimento
      // de SDR" no Kanban, só se ainda estiver em 'novo' (nunca regride um
      // lead que um humano já avançou manualmente).
      if (lead?.status === "novo" || !lead?.status) {
        await supabase.from("leads").update({ status: "sdr" }).eq("id", lead_id);
      }
    }

    if (!conversa) throw new Error("não foi possível abrir/reaproveitar a conversa");

    // 2. Grava o turno do lead sempre -- mesmo se a conversa já estiver em
    // handoff, pro humano ver a mensagem completa.
    await supabase.from("leads_ia_mensagens").insert({ conversa_id: conversa.id, papel: "lead", conteudo: mensagem });
    await supabase.from("leads").update({ mensagem_lead: mensagem, ultima_atividade: new Date().toISOString() }).eq("id", lead_id);
    await supabase.from("leads_ia_conversas").update({ ultima_mensagem_em: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", conversa.id);

    // Já em handoff -- o bot já fez seu trabalho, não volta a falar.
    if (conversa.status !== "ativo") {
      return json({ ok: true, conversa_id: conversa.id, status: conversa.status, handoff: true, skipped: "ja_em_handoff" });
    }

    // 3. Conhecimento aprendido (aprovado pelo painel da Equipe Despertamente).
    const { data: conhecimentoRows } = await supabase
      .from("leads_ia_conhecimento")
      .select("pergunta_exemplo, resposta")
      .eq("ativo", true)
      .order("created_at", { ascending: true })
      .limit(40);
    const conhecimentoAprendido = (conhecimentoRows ?? []) as { pergunta_exemplo: string; resposta: string }[];
    const midiasJaEnviadas: string[] = Array.isArray(conversa.midias_enviadas) ? conversa.midias_enviadas : [];

    // 3b. Oferta ativa (preço/parcelas/bônus) -- editável pelo painel, nunca
    // hardcoded, pra sempre refletir a promoção real em vigor.
    const { data: ofertaRow } = await supabase
      .from("leads_ia_oferta_ativa")
      .select("preco_avista, cartao_parcelas, cartao_valor_parcela, boleto_entrada, boleto_parcelas, boleto_valor_parcela, valor_total_bonus, bonus")
      .eq("ativo", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const oferta: Oferta | null = ofertaRow
      ? {
          preco_avista: Number(ofertaRow.preco_avista),
          cartao_parcelas: Number(ofertaRow.cartao_parcelas),
          cartao_valor_parcela: Number(ofertaRow.cartao_valor_parcela),
          boleto_entrada: Number(ofertaRow.boleto_entrada),
          boleto_parcelas: Number(ofertaRow.boleto_parcelas),
          boleto_valor_parcela: Number(ofertaRow.boleto_valor_parcela),
          valor_total_bonus: ofertaRow.valor_total_bonus != null ? Number(ofertaRow.valor_total_bonus) : null,
          bonus: Array.isArray(ofertaRow.bonus) ? (ofertaRow.bonus as OfertaBonus[]) : [],
        }
      : null;

    // 4. Histórico recente (últimos 20 turnos -- conversa de venda de verdade
    // tende a ser mais longa que só qualificação).
    const { data: turnos } = await supabase
      .from("leads_ia_mensagens")
      .select("papel, conteudo")
      .eq("conversa_id", conversa.id)
      .order("created_at", { ascending: true });
    const historico = (turnos ?? []).slice(-20).map((t: any) => `${t.papel}: ${t.conteudo}`).join("\n");

    // 5. Chama Gemini. Sem chave configurada ou falha = fail closed: nunca
    // manda mensagem "no escuro", sempre encaminha pro humano.
    if (!geminiKey) {
      await handoffPorErro(supabase, conversa.id, "erro_ia", "IA indisponível (sem chave configurada) — revisar manualmente.", conversa.turnos_ia ?? 0);
      return json({ ok: true, conversa_id: conversa.id, status: "aguardando_humano", handoff: true, motivo_handoff: "erro_ia" });
    }

    let plano: Record<string, unknown> = {};
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${geminiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: buildSystemPrompt(conhecimentoAprendido, midiasJaEnviadas, oferta) }] },
          contents: [
            {
              role: "user",
              parts: [{ text: `Nome do lead (se conhecido): ${conversa.lead_nome || "não informado"}\n\nHistórico da conversa:\n${historico || "(primeira mensagem)"}\n\nNova mensagem do lead: ${mensagem}` }],
            },
          ],
          generationConfig: { temperature: 0.4, responseMimeType: "application/json" },
        }),
        signal: AbortSignal.timeout(25_000),
      });
      if (!res.ok) throw new Error(`Gemini respondeu ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const data = await res.json();
      plano = extrairJson(String(data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ""));
    } catch (e: unknown) {
      console.error("leads-ia-responder: falha ao chamar Gemini:", (e as Error).message);
      await handoffPorErro(supabase, conversa.id, "erro_ia", "Falha técnica ao processar resposta do lead — revisar manualmente.", (conversa.turnos_ia ?? 0) + 1);
      return json({ ok: true, conversa_id: conversa.id, status: "aguardando_humano", handoff: true, motivo_handoff: "erro_ia" });
    }

    // Validação estrita da saída do modelo -- nunca confia cegamente.
    let resposta = typeof plano.resposta === "string" ? plano.resposta.trim() : "";
    let handoff = Boolean(plano.handoff);
    let motivoHandoff: MotivoHandoff | null =
      MOTIVOS_VALIDOS.includes(plano.motivo_handoff as any) ? (plano.motivo_handoff as MotivoHandoff) : null;
    const engajamento: Engajamento | null =
      ENGAJAMENTOS_VALIDOS.includes(plano.engajamento as any) ? (plano.engajamento as Engajamento) : null;
    const objetivoPrincipal = typeof plano.objetivo_principal === "string" && plano.objetivo_principal.trim() ? plano.objetivo_principal.trim().slice(0, 300) : null;
    const tempoInteresse = typeof plano.tempo_interesse === "string" && plano.tempo_interesse.trim() ? plano.tempo_interesse.trim().slice(0, 300) : null;
    // Só aceita mídia válida, nunca já enviada nesta conversa (segunda trava
    // além da instrução do prompt -- o modelo pode errar).
    const midiaSolicitada: Midia | null =
      MIDIAS_VALIDAS.includes(plano.enviar_midia as any) && !midiasJaEnviadas.includes(plano.enviar_midia as string)
        ? (plano.enviar_midia as Midia) : null;

    const novosTurnos = (conversa.turnos_ia ?? 0) + 1;
    let motivoConcluido: MotivoHandoff | null = motivoHandoff;

    // 6. Trava dura de turnos, independente do que o modelo disser.
    if (!handoff && novosTurnos > LIMITE_TURNOS) {
      handoff = true;
      motivoConcluido = "limite_turnos";
    }

    // Saída inválida -- trata como falha da IA, nunca inventa comportamento.
    if (!resposta && !handoff) {
      await handoffPorErro(supabase, conversa.id, "erro_ia", "IA não retornou resposta válida — revisar manualmente.", novosTurnos);
      return json({ ok: true, conversa_id: conversa.id, status: "aguardando_humano", handoff: true, motivo_handoff: "erro_ia" });
    }
    // handoff=true sem motivo reconhecido (saída do modelo fora do whitelist) -- trata como falha da IA.
    if (handoff && !motivoConcluido) motivoConcluido = "erro_ia";

    // Modo teste: lead fictício usado pra validar o prompt (nome começa com
    // "TESTE") nunca recebe mensagem/mídia de verdade no WhatsApp nem gera
    // notificação de verdade pro time.
    const isTeste = (conversa.lead_nome ?? "").startsWith("TESTE");

    // 7. Recheck de opt-out imediatamente antes de enviar. Mesmo aqui o lead
    // pode estar pedindo humano com urgência (ex.: frase de opt-out dentro de
    // uma reclamação) -- silenciar a IA não pode significar silenciar o time
    // também, senão ninguém fica sabendo que esse lead precisa de atenção.
    if (resposta && await estaOptOut(supabase, telefone)) {
      await supabase.from("leads_ia_conversas").update({
        status: "aguardando_humano", motivo_handoff: "erro_ia",
        resumo_ia: "Lead optou por não receber mensagens durante a conversa — revisar manualmente.",
        turnos_ia: novosTurnos, updated_at: new Date().toISOString(),
      }).eq("id", conversa.id);
      if (!isTeste) {
        const { data: leadOptOut } = await supabase.from("leads").select("nome").eq("id", lead_id).maybeSingle();
        await supabase.rpc("notificar_vendedores_ativos", {
          p_tipo: "lead_quente_ia",
          p_titulo: `⚠️ Lead pediu para não receber mais mensagens: ${leadOptOut?.nome || "Lead"}`,
          p_descricao: "Lead optou por não receber mensagens automáticas durante a conversa — revisar manualmente (pode estar pedindo atenção humana).",
          p_link: "/pipeline",
        });
      }
      return json({ ok: true, conversa_id: conversa.id, status: "aguardando_humano", handoff: true, motivo_handoff: "erro_ia", skipped: "opt_out" });
    }

    // 8. Envia só pela instância que recebeu. Se tem mídia, a 'resposta'
    // vira a LEGENDA da imagem/vídeo (é assim que o time humano manda de
    // verdade -- imagem com a legenda explicando os pontos), sem mensagem de
    // texto separada. Sem mídia, manda só o texto normal.
    let midiaEnviadaComSucesso = false;
    if (resposta && isTeste) {
      const marcador = midiaSolicitada ? ` [mídia de teste, não enviada de verdade: ${midiaSolicitada}]` : "";
      await supabase.from("leads_ia_mensagens").insert({ conversa_id: conversa.id, papel: "agente", conteudo: resposta + marcador });
      if (midiaSolicitada) midiaEnviadaComSucesso = true;
    } else if (resposta) {
      const { data: instCfg } = await supabase
        .from("evolution_config")
        .select("api_url, api_key, instance_name")
        .eq("instance_name", evolution_instance)
        .eq("ativo", true)
        .maybeSingle();

      if (!instCfg) {
        await handoffPorErro(supabase, conversa.id, "erro_ia", `Instância "${evolution_instance}" indisponível para responder — revisar manualmente.`, novosTurnos);
        return json({ ok: true, conversa_id: conversa.id, status: "aguardando_humano", handoff: true, motivo_handoff: "erro_ia" });
      }

      if (midiaSolicitada) {
        const envioMidia = await sendMediaViaEvolution(instCfg as EvoInstance, telefone, midiaSolicitada, resposta);
        if (envioMidia.ok) {
          midiaEnviadaComSucesso = true;
          await supabase.from("leads_ia_mensagens").insert({ conversa_id: conversa.id, papel: "agente", conteudo: `${resposta} [mídia: ${midiaSolicitada}]` });
        } else {
          // Falha ao mandar mídia -- cai pra texto puro, pro lead não ficar
          // sem resposta nenhuma.
          console.error(`leads-ia-responder: falha ao enviar mídia "${midiaSolicitada}", caindo pra texto:`, envioMidia.error);
          const envio = await sendViaEvolution(instCfg as EvoInstance, telefone, resposta);
          if (envio.ok) await supabase.from("leads_ia_mensagens").insert({ conversa_id: conversa.id, papel: "agente", conteudo: resposta });
        }
      } else {
        const envio = await sendViaEvolution(instCfg as EvoInstance, telefone, resposta);
        if (!envio.ok) {
          console.error("leads-ia-responder: falha ao enviar:", envio.error);
          await handoffPorErro(supabase, conversa.id, "erro_ia", "Falha ao enviar mensagem via WhatsApp — revisar manualmente.", novosTurnos);
          return json({ ok: true, conversa_id: conversa.id, status: "aguardando_humano", handoff: true, motivo_handoff: "erro_ia" });
        }
        await supabase.from("leads_ia_mensagens").insert({ conversa_id: conversa.id, papel: "agente", conteudo: resposta });
      }
    }
    if (resposta) await supabase.from("leads").update({ mensagem_ia: resposta }).eq("id", lead_id);

    // 9. Atualiza o estado final da conversa e do lead.
    const novoStatus = handoff ? "aguardando_humano" : "ativo";
    const resumoIa = handoff ? resumoDeterministico(motivoConcluido, engajamento) : conversa.resumo_ia;
    const duvidaNaoRespondida = motivoConcluido === "duvida_sem_resposta" ? mensagem : null;
    const novasMidiasEnviadas = midiaEnviadaComSucesso ? [...midiasJaEnviadas, midiaSolicitada as string] : midiasJaEnviadas;

    // Follow-up de silêncio: lead acabou de responder, então a leva de cutucadas
    // anterior (se havia) não faz mais sentido -- reagenda do zero pra daqui a
    // FOLLOWUP_JANELA_1_HORAS. Em handoff, quem cuida da conversa é humano, então
    // zera o agendamento (leads-ia-followup cuida só do lembrete de demora nesse caso).
    const agora = new Date();
    const followupProximoEm = handoff ? null : new Date(agora.getTime() + FOLLOWUP_JANELA_1_HORAS * 3_600_000).toISOString();

    await supabase.from("leads_ia_conversas").update({
      status: novoStatus,
      engajamento: engajamento ?? conversa.engajamento,
      objetivo_principal: objetivoPrincipal ?? conversa.objetivo_principal,
      tempo_interesse: tempoInteresse ?? conversa.tempo_interesse,
      motivo_handoff: handoff ? motivoConcluido : null,
      duvida_nao_respondida: duvidaNaoRespondida,
      resumo_ia: resumoIa,
      turnos_ia: novosTurnos,
      midias_enviadas: novasMidiasEnviadas,
      followup_proximo_em: followupProximoEm,
      followups_enviados: 0,
      ...(handoff ? { handoff_em: agora.toISOString(), humano_assumiu_em: null, lembrete_time_enviado_em: null } : {}),
      updated_at: agora.toISOString(),
    }).eq("id", conversa.id);

    await supabase.from("leads").update({
      engajamento: engajamento ?? undefined,
      objetivo_principal: objetivoPrincipal ?? undefined,
      tempo_interesse: tempoInteresse ?? undefined,
      observacoes: handoff ? resumoIa : undefined,
    }).eq("id", lead_id);

    // 10. Handoff pra vendedor -- avisa todo vendedor/admin ativo (sem
    // atribuir responsavel_id, é fila aberta). Sinaliza status='closer' só
    // quando o motivo é de venda de verdade; nos outros casos o lead continua
    // marcado 'sdr' (humano assume a mesma conversa de venda).
    if (handoff) {
      const ehVenda = motivoConcluido === "lead_qualificado" || motivoConcluido === "pedido_direto_avancar";
      if (ehVenda) {
        await supabase.from("leads").update({ status: "closer" }).eq("id", lead_id);
      }
      const { data: leadAtual } = await supabase.from("leads").select("nome").eq("id", lead_id).maybeSingle();
      const nomeLead = leadAtual?.nome || "Lead";
      const titulo = ehVenda
        ? `🔥 Venda quase fechada, falta o pagamento: ${nomeLead}`
        : motivoConcluido === "duvida_sem_resposta"
          ? `❓ Lead perguntou algo que a IA não sabe: ${nomeLead}`
          : `Lead precisa de atenção humana: ${nomeLead}`;
      if (!isTeste) {
        await supabase.rpc("notificar_vendedores_ativos", {
          p_tipo: "lead_quente_ia",
          p_titulo: titulo,
          p_descricao: resumoIa,
          p_link: "/pipeline",
        });
      }
    }

    return json({ ok: true, conversa_id: conversa.id, status: novoStatus, handoff, motivo_handoff: handoff ? motivoConcluido : null, midia_enviada: midiaEnviadaComSucesso ? midiaSolicitada : null });

  } catch (e: unknown) {
    console.error("leads-ia-responder fatal:", (e as Error).message);
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
