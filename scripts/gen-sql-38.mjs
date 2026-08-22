// gen-sql-38.mjs — gera SQL de INSERT para funnel_messages da Turma #38
// node scripts/gen-sql-38.mjs > scripts/funil38.sql

const FUNNEL_NAME = 'Turma #38';
const G1 = '{{grupo_1}}';
const G2 = '{{grupo_2}}';
const SLOGAN = 'Excelente';
const PROF = 'Keila';
const PROF_CONV = null;
const HORA_LIVE = '20:00';
const LINK_CHECKOUT = 'https://www.idmpsi.com.br/lancamento';

const AULAS = [
  { data: '2026-06-30', hora: '20:00', link: 'https://youtube.com/live/VvmEH5LlC_0?feature=share' },
  { data: '2026-07-01', hora: '20:00', link: 'https://youtube.com/live/NxnyXcM7WXE?feature=share' },
  { data: '2026-07-02', hora: '20:00', link: 'https://youtube.com/live/hiBJtMBPgu0?feature=share' },
];

function addDays(base, days) { const d = new Date(base); d.setDate(d.getDate() + days); return d; }
function setTime(date, hora) { const [h,m] = hora.split(':').map(Number); const d = new Date(date); d.setHours(h,m,0,0); return d; }
function fmtDate(iso) { const [,mo,dy] = iso.split('-'); return `${dy}/${mo}`; }
function fmtDayWeek(iso) { return ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'][new Date(iso+'T12:00:00').getDay()]; }
function fmtHora(hhmm) { return hhmm.replace(':00','h').replace(':','h'); }
function checkVar(text) { return /\{\{[^}]+\}\}/.test(text); }
function e(s) { // SQL escape
  if (s === null || s === undefined) return 'NULL';
  return `'${String(s).replace(/'/g, "''")}'`;
}
function ej(obj) { // SQL escape JSON
  if (obj === null || obj === undefined) return 'NULL';
  return `'${JSON.stringify(obj).replace(/'/g, "''")}'::jsonb`;
}
function eb(v) { return v ? 'true' : 'false'; }

const numAulas = AULAS.length;
const profDupla = PROF_CONV ? `${PROF} e ${PROF_CONV}` : PROF;
const classHora = fmtHora(HORA_LIVE);
const firstClassDate = new Date(AULAS[0].data + 'T12:00:00');

const aulaLink = (n) => AULAS[n-1]?.link || `{{link_aula_${n}}}`;
const aulaTit  = (n) => `Aula ${n}`;
const aulaData = (n) => AULAS[n-1]?.data ? fmtDate(AULAS[n-1].data) : `{{data_aula_${n}}}`;
const aulaHora = (n) => AULAS[n-1]?.hora || '20:00';
const aulaH    = (n) => fmtHora(aulaHora(n));

const datesBlock = () => Array.from({length:numAulas},(_,i)=>`📅 Aula ${i+1} - *${aulaTit(i+1)}* (${aulaData(i+1)})`).join('\n');
const linksBlock = () => Array.from({length:numAulas},(_,i)=>`🔗 Aula ${i+1}: ${aulaLink(i+1)}`).join('\n');

const manhasMsgs = {
1:`${SLOGAN} dia! ☀️\n\nFreud disse uma coisa que abalou o mundo científico em 1917:\n\n*"O ego não é senhor em sua própria casa."*\n\nAntes disso, acreditávamos que nossas decisões vinham de um lugar racional e consciente. Que éramos autores plenos das nossas escolhas.\n\nFreud mostrou que não. Que a parte mais determinante de quem somos opera nas sombras — sem que a gente perceba, sem que a gente autorize.\n\nO inconsciente está por trás de cada padrão que você repete, de cada reação que te surpreende, de cada decisão que você não sabe explicar.\n\nNessas aulas, vamos abrir esse acesso. Com profundidade. Com direção.\n\n${datesBlock()}\n\nSempre às *${classHora}*, ao vivo no YouTube.\nCom ${profDupla}.\n\n👉 Ativa o lembrete e deixa o like:\n${aulaLink(1)}\n\nReage com ❤️ pra eu saber que você está aqui!`,
2:`${SLOGAN} dia! ☀️\n\nEm 1920, Freud observou algo perturbador nos seus pacientes:\n\nEles repetiam situações dolorosas. Não porque queriam sofrer — mas porque o inconsciente insistia em reencenar o que ficou irresolvido.\n\nChamou isso de *compulsão à repetição*.\n\nVocê provavelmente conhece bem esse movimento:\n↳ O mesmo tipo de relacionamento que termina sempre do mesmo jeito\n↳ A mesma autossabotagem toda vez que você estava quase chegando lá\n↳ O mesmo conflito — com pessoas diferentes\n\nNão é azar. Não é coincidência.\nÉ o inconsciente tentando te dar uma nova chance — do único jeito que sabe.\n\nNossas aulas chegam em breve. Você vai entender por onde começa a saída.\n\n👉 Ativa o lembrete e deixa o like:\n${aulaLink(1)}\n\nReage com 🔄 se você já se percebeu repetindo um padrão que queria ter quebrado.`,
3:`${SLOGAN} dia! ☀️\n\nAnna Freud — filha de Sigmund e psicanalista por direito próprio — passou anos mapeando algo que todo ser humano faz:\n\n*Defender-se do que dói.*\n\nVocê racionaliza. Projeta. Nega. Intelectualiza.\nFaz humor sobre o que te machuca antes que alguém perceba que machucou.\n\nIsso não é fraqueza. É o aparelho psíquico fazendo o que foi treinado a fazer: proteger você da dor que ainda não tem como ser processada.\n\nO problema é que esses mecanismos, com o tempo, também te impedem de crescer. De sentir. De se conectar de verdade.\n\nA psicanálise não destrói as defesas. Ela te ajuda a entender o que está por baixo delas — para que você possa *escolher*, em vez de apenas reagir.\n\n👉 Ativa o lembrete e deixa o like:\n${aulaLink(1)}\n\nReage com 🛡️ se você se reconhece em algum desses mecanismos.`,
4:`${SLOGAN} dia! ☀️\n\nFreud descobriu algo que virou a base de toda a clínica psicanalítica:\n\nO que sentimos pelas pessoas ao nosso redor raramente é *só* sobre elas.\n\nÉ sobre quem elas *representam* — figuras do passado, imagens internalizadas, afetos que ainda não foram elaborados.\n\nIsso se chama *transferência*.\n\nE ela não acontece só no divã. Ela acontece com seu chefe, seu parceiro, seus filhos — em qualquer relação onde há afeto em jogo.\n\n↳ O julgamento instantâneo de alguém que você mal conhece\n↳ A raiva desproporcional que um comportamento simples desperta\n↳ A admiração que vira dependência antes que você perceba\n\nTudo isso tem uma história. Tudo isso tem um endereço no inconsciente.\n\nEntender a transferência é começar a se relacionar com mais clareza — e com muito mais liberdade.\n\n👉 Ativa o lembrete e deixa o like:\n${aulaLink(1)}\n\nReage com 👁️ se você já viveu uma relação que te ensinou algo profundo sobre você mesmo.`,
5:`${SLOGAN} dia! ☀️\n\nJacques Lacan — um dos pensadores mais radicais da psicanálise — disse uma frase que incomoda:\n\n*"O sintoma é uma metáfora."*\n\nNão é filosofia abstrata. É uma observação precisa sobre como o inconsciente funciona.\n\nO sintoma *fala*. Por baixo de cada compulsão, cada bloqueio, cada dor que persiste sem explicação — há algo que o inconsciente não conseguiu dizer de outra forma.\n\n↳ A ansiedade que não passa, mesmo quando "não tem motivo"\n↳ A procrastinação que aparece toda vez que você está perto de algo importante\n↳ O relacionamento que dói mas você não consegue largar\n\nEsses não são defeitos. São mensagens.\n\nQuando você aprende a escutá-las — em vez de silenciá-las — a relação com você mesmo muda completamente.\n\n👉 Ativa o lembrete e deixa o like:\n${aulaLink(1)}\n\nReage com 💭 se você tem um sintoma que já tentou eliminar e ele sempre volta.`,
6:`${SLOGAN} dia! ☀️\n\nFreud descobriu algo que a maioria das pessoas não quer ouvir:\n\nA voz mais cruel dentro de você não vem de fora. Ela vem de dentro.\n\nChamou-a de *superego* — a instância psíquica que internalizou as exigências do mundo e as transformou em tribunal interno.\n\nEla compara. Ela condena. Ela nunca está satisfeita.\n\nE é, muitas vezes, *mais severa* do que qualquer pessoa real jamais foi com você.\n\n_"Não fiz o suficiente. Deveria ser mais. Os outros conseguem — por que eu não?"_\n\nEssa voz não é a verdade. É uma construção — formada nas primeiras experiências de aprovação e rejeição, de amor condicional, de exigência não dita.\n\nEntender de onde ela vem não a silencia de imediato. Mas tira dela o poder de governar sua vida sem que você perceba.\n\n👉 Ativa o lembrete e deixa o like:\n${aulaLink(1)}\n\nReage com 🔇 se essa voz fala alto demais dentro de você.`,
7:`${SLOGAN} dia! ☀️\n\nLacan disse algo que levou anos para eu entender completamente:\n\n*"O desejo é o desejo do Outro."*\n\nNão é filosofia abstrata. É uma observação devastadoramente precisa sobre como vivemos.\n\nGrande parte do que perseguimos — o sucesso, a aprovação, a conquista — não é o que *nós* queremos de verdade.\n\nÉ o que aprendemos a querer para ser amados. Vistos. Aceitos.\n\nE aí vem o paradoxo que tantos vivem:\nQuando você finalmente conquista aquilo que perseguiu a vida toda, descobre que não era bem isso.\n\nPorque o desejo real estava encoberto pelo desejo que o Outro — a família, a cultura, o olhar social — depositou em você.\n\nDescobrir o que você *realmente* deseja, por baixo de todas essas camadas, é um dos movimentos mais libertadores que a psicanálise pode provocar.\n\n${datesBlock()}\n\n👉 Ativa o lembrete e deixa o like:\n${aulaLink(1)}\n\nReage com 🔍 se você sente que busca uma coisa mas no fundo quer outra.`,
8:`${SLOGAN} dia! ☀️\n\nFreud notou que seus pacientes — mesmo querendo mudar — resistiam ao próprio tratamento.\n\nChegavam atrasados. Esqueciam o que haviam dito na sessão anterior. Mudavam de assunto nos momentos de maior avanço.\n\nChamou isso de *resistência*.\n\nE a descoberta mais importante: a resistência não é fraqueza nem falta de vontade.\n\nÉ proteção.\n\nO inconsciente prefere o sofrimento *conhecido* ao desconhecido que a mudança traz. Porque mudar significa abandonar uma identidade — por mais dolorosa que seja — antes de saber quem você vai ser do outro lado.\n\nPor isso você se sabota quando está quase chegando.\nPor isso a mudança parece impossível mesmo quando você já sabe o que precisa fazer.\n\nA resistência não precisa ser vencida pela força. Ela precisa ser *compreendida*.\n\nE é exatamente isso que começa amanhã.\n\n👉 Ativa o lembrete e deixa o like:\n${aulaLink(1)}\n\nReage com 🚧 se você já se percebeu se sabotando quando estava quase chegando lá.`,
9:`${SLOGAN} dia! ☀️\n\nWinnicott — psicanalista inglês que dedicou a vida a entender como nos tornamos quem somos — falou sobre o *self verdadeiro*:\n\nA parte de você que foi se escondendo com o tempo.\nQue aprendeu a performar, a agradar, a caber no espaço que o mundo oferecia.\n\n*Amanhã começa um espaço diferente.*\n\nVocê passou por 8 dias de reflexão — cada mensagem foi uma semente plantada no solo certo.\n\nO inconsciente. A repetição. Os mecanismos de defesa.\nA transferência. O sintoma. O superego. O desejo. A resistência.\n\nAmanhã, ao vivo, começamos a aprofundar cada um desses fios — juntos.\n\n${PROF} conduz essa jornada.\n\n👉 Ativa o lembrete e deixa o like — começa amanhã:\n${aulaLink(1)}\n\nReage com 🙌 se você vai estar ao vivo amanhã!`,
};

const enquetesDias = {
2:{intro:`${SLOGAN} tarde! ☀️\n\nHoje falamos sobre compulsão à repetição — os padrões que se repetem sem que a gente perceba.\n\nUma pergunta direta:\n\nSeleciona a opção que mais combina com você 👇\n\nReage com um 💡 nessa mensagem!`,nome:'O que você mais se pega repetindo na sua vida?',opcoes:['Relacionamentos que seguem sempre o mesmo roteiro','Me saboto quando estou perto de conquistar algo','Brigas e conflitos com as mesmas pessoas','Promessas que faço e não cumpro pra mim mesmo']},
3:{intro:`${SLOGAN} tarde! ☀️\n\nHoje falamos sobre mecanismos de defesa — as formas que a mente encontra de se proteger do que dói.\n\nAgora a sua vez de olhar para dentro:\n\nSeleciona a opção que mais combina com você 👇\n\nReage com um 💡 nessa mensagem!`,nome:'Como você reage quando algo te machuca de verdade?',opcoes:['Finjo que não afetou tanto','Racionalizo e tento entender tudo','Fico irritado com outras coisas sem perceber','Me isolo e processo sozinho']},
5:{intro:`${SLOGAN} tarde! ☀️\n\nO sintoma é uma mensagem do inconsciente — não um defeito a ser eliminado.\n\nQual é o sintoma que mais aparece na sua vida?\n\nSeleciona a opção que mais combina com você 👇\n\nReage com um 💡 nessa mensagem!`,nome:'Qual sintoma mais aparece na sua vida hoje?',opcoes:['Ansiedade constante que não consigo parar','Procrastinação que me trava na hora de agir','Relacionamento que dói mas não consigo largar','Sensação de vazio mesmo quando tudo está bem']},
6:{intro:`${SLOGAN} tarde! ☀️\n\nFalamos sobre o superego — a voz interna que cobra, compara e exige mais de você.\n\nDe que forma essa voz aparece mais forte em você?\n\nSeleciona a opção que mais combina com você 👇\n\nReage com um 💡 nessa mensagem!`,nome:'Como a autocrítica aparece mais forte em você?',opcoes:['Me comparo com os outros o tempo todo','Nunca acho que fiz o suficiente','Me cobro por erros que já deveriam ter passado','Tenho medo de parecer fraco ou incapaz']},
8:{intro:`${SLOGAN} tarde! ☀️\n\nA resistência é o psiquismo protegendo o familiar — mesmo que seja doloroso.\n\nO que mais te impede de mudar quando você já sabe o que precisa?\n\nSeleciona a opção que mais combina com você 👇\n\nReage com um 💡 nessa mensagem!`,nome:'O que mais te impede de mudar quando você já sabe o que precisa?',opcoes:['Medo de falhar de novo','Conforto no que é familiar, mesmo que doa','Não me sentir pronto ou merecedor','Medo do que as pessoas vão pensar']},
9:{intro:`${SLOGAN} tarde! ☀️\n\nAmanhã começa nossa jornada — esta é a última enquete antes das aulas.\n\nUma pergunta que vai te carregar para dentro da primeira aula:\n\nSeleciona a opção que mais combina com você 👇\n\nReage com um 💡 nessa mensagem!`,nome:'Qual é a maior transformação que você quer carregar das nossas aulas?',opcoes:['Parar de me sabotar e agir com mais coragem','Entender por que repito os mesmos padrões','Me libertar da autocrítica que me paralisa','Criar relacionamentos mais honestos e reais']},
};

function row(m) {
  const status = (m.message_type === 'text' && checkVar(m.message_text)) ? 'draft' : 'scheduled';
  const pollOps = m.poll_options ? ej(m.poll_options) : 'NULL';
  return `(${e(m.funnel_name)},${m.day_number},${e(m.scheduled_at)},${e(m.recipient_type)},${e(m.recipient_id)},${e(m.message_type)},${e(m.message_text||'')},${eb(m.link_preview||false)},${eb(m.mention_everyone||false)},${eb(m.send_header_image||false)},${eb(m.update_group_picture||false)},${e(m.subtipo||null)},${e(m.poll_name||null)},${pollOps},${m.poll_selectable_count||'NULL'},${e(status)})`;
}

const COLS = `(funnel_name,day_number,scheduled_at,recipient_type,recipient_id,message_type,message_text,link_preview,mention_everyone,send_header_image,update_group_picture,subtipo,poll_name,poll_options,poll_selectable_count,status)`;

const msgs = [];
const warmupDays = 9;

function tm(fn,day,sat,recip,text,opts={}) {
  return {funnel_name:fn,day_number:day,scheduled_at:sat.toISOString(),recipient_type:'group',recipient_id:recip,message_type:'text',message_text:text,link_preview:false,mention_everyone:false,send_header_image:false,update_group_picture:false,...opts};
}
function pm(fn,day,sat,recip,pollName,pollOptions) {
  return {funnel_name:fn,day_number:day,scheduled_at:sat.toISOString(),recipient_type:'group',recipient_id:recip,message_type:'poll',message_text:'',link_preview:false,mention_everyone:false,send_header_image:false,update_group_picture:false,poll_name:pollName,poll_options:pollOptions,poll_selectable_count:1};
}

for (let offset = -warmupDays; offset <= -1; offset++) {
  const l=Math.abs(offset), day=warmupDays+offset+1, dayDate=addDays(firstClassDate,offset);
  msgs.push(tm(FUNNEL_NAME,day,setTime(dayDate,'08:00'),G1,manhasMsgs[day],{link_preview:true}));
  if(l%3===0){
    const txt=`${SLOGAN} tarde! ☀️\n\n🎙️ *Áudio sugerido da Prof. ${PROF}:*\n\n"${SLOGAN}, pessoal! Estamos chegando muito perto da nossa primeira aula. Quero te encontrar ao vivo no dia ${aulaData(1)}, às ${classHora}, para abrir essa jornada com profundidade e direção."\n\n👉 ${aulaLink(1)}\n\nReage com um ❤️ depois de ouvir!`;
    msgs.push(tm(FUNNEL_NAME,day,setTime(dayDate,'15:00'),G1,txt,{subtipo:'audio'}));
  } else {
    const eq=enquetesDias[day];
    msgs.push(tm(FUNNEL_NAME,day,setTime(dayDate,'15:00'),G1,eq.intro));
    msgs.push(pm(FUNNEL_NAME,day,new Date(setTime(dayDate,'15:00').getTime()+3*60*1000),G1,eq.nome,eq.opcoes));
  }
  const noiteTxt=offset===-1
    ?`${SLOGAN} noite! 🌙\n\n*AMANHÃ, ${classHora}. Ao vivo.*\n\nAula 1 - *${aulaTit(1)}*.\n\nSe você ativar só um lembrete agora, que seja esse:\n\n👉 ${aulaLink(1)}\n\nE já aproveita pra ativar os lembretes das próximas aulas:\n${linksBlock()}\n\nReage com um 🚀 - amanhã a gente se encontra!`
    :`${SLOGAN} noite! 🌙\n\nFaltam *${l} dias* pra ${FUNNEL_NAME}.\n\n${numAulas} aulas ao vivo que podem mudar a forma como você se enxerga.\n\n👉 Já ativa os lembretes e deixa o like:\n\n${linksBlock()}\n\nReage com um 🔥 se você já está ansioso pra começar!`;
  msgs.push(tm(FUNNEL_NAME,day,setTime(dayDate,offset===-1?HORA_LIVE:'20:00'),G1,noiteTxt,{link_preview:true}));
}

for(let i=1;i<=numAulas;i++){
  const aulaDateObj=new Date(AULAS[i-1].data+'T12:00:00');
  const dayNum=warmupDays+i;
  const aulaDateHora=setTime(aulaDateObj,aulaHora(i));
  msgs.push(tm(FUNNEL_NAME,dayNum,setTime(aulaDateObj,'08:00'),G1,`${SLOGAN} dia! ☀️\n\n*HOJE é o dia.*\n\nHoje às ${aulaH(i)} começa a Aula ${i} - *${aulaTit(i)}*.\n\n${profDupla} vão ao vivo conduzir essa experiência.\n\nSepara o caderno. Avisa a família. Hoje você tem um compromisso com você mesmo.\n\n👉 ${aulaLink(i)}\n\nReage com um 🔥 se você vai estar lá HOJE!`,{link_preview:true}));
  msgs.push(tm(FUNNEL_NAME,dayNum,setTime(aulaDateObj,'15:00'),G1,`${SLOGAN} tarde! ☀️\n\nHoje às ${aulaH(i)} temos a Aula ${i} - *${aulaTit(i)}*! 🔴\n\n*Como você está chegando para a aula de hoje?*\n\nSeleciona a sua resposta 👇\n\nReage com um ✨ nessa mensagem!`));
  msgs.push(pm(FUNNEL_NAME,dayNum,new Date(setTime(aulaDateObj,'15:00').getTime()+3*60*1000),G1,'Como você está chegando para a aula de hoje?',['Ansioso - mal posso esperar','Curioso - quero ver o que vai rolar','Reflexivo - já cheguei pensando','Pronto - bora viver isso ao vivo']));
  for(const[offH,txt,]of[[-3,`⏰ *Faltam 3 HORAS pra Aula ${i} - ${aulaTit(i)}!*\n\nHoje às ${aulaH(i)}, ao vivo. Você não vai querer perder o início.\n\n👉 ${aulaLink(i)}\n\nReage com um ⏰!`],[-2,`⏰ *Faltam 2 HORAS!*\n\nJá separa o caderno, o fone e um lugar tranquilo. Essa aula pede atenção total.\n\n👉 ${aulaLink(i)}\n\nReage com um 📝!`],[-1,`⏰ *Falta 1 HORA pra começar!*\n\nDaqui a 60 minutos, ${profDupla} entram ao vivo.\n\n👉 ${aulaLink(i)}\n\nReage com um 🚀 se já está se preparando!`]]){
    msgs.push(tm(FUNNEL_NAME,dayNum,new Date(aulaDateHora.getTime()+offH*3600*1000),G1,txt,{link_preview:true,mention_everyone:offH===-1}));
  }
  msgs.push(tm(FUNNEL_NAME,dayNum,aulaDateHora,G1,`🔴 *ESTAMOS AO VIVO!*\n\nAula ${i} - *${aulaTit(i)}* - começou AGORA!\n\nCorre pra não perder o início 👇\n\n👉 ${aulaLink(i)}\n\nReage com um ❤️ e entra AGORA!`,{link_preview:true,mention_everyone:true}));
  for(const[min,txt,]of[[10,`⚡ A aula já começou e a energia está absurda!\n\nSe você ainda não entrou, esse é o momento. Vem 👇\n👉 ${aulaLink(i)}`],[20,`🧠 ${PROF} está ao vivo conduzindo pontos profundos agora.\n\nNão deixa pra depois - entra agora 👇\n👉 ${aulaLink(i)}`],[30,`🌟 O ao vivo tem algo que o replay nunca vai te dar: a experiência de viver isso em tempo real.\n\nAinda dá tempo. Entra 👇\n👉 ${aulaLink(i)}`],[40,`🎁 Atenção! Vai rolar *SORTEIO* pra quem está ao vivo!\n\nEntra agora e ainda dá tempo de participar 👇\n👉 ${aulaLink(i)}`]]){
    msgs.push(tm(FUNNEL_NAME,dayNum,new Date(aulaDateHora.getTime()+min*60*1000),G1,txt,{link_preview:true}));
  }
}

const diaOferta=addDays(firstClassDate,numAulas);
const baseDay=warmupDays+numAulas;
msgs.push(tm(FUNNEL_NAME,baseDay+1,setTime(diaOferta,'10:00'),G2,`Você acabou de passar por algo que a maioria das pessoas nunca vai ter acesso.\n\n${numAulas} aulas que foram fundo no que está por trás dos seus padrões.\n\nE agora você tem duas opções:\n\n1️⃣ Levar o que aprendeu e tentar aplicar sozinho — como já fez outras vezes.\n\n2️⃣ Continuar esse trabalho com estrutura, suporte e profundidade real.\n\nPara quem quer ir além, as matrículas abriram agora.\n\nSão vagas limitadas — e quem passou pelas aulas ao vivo tem prioridade.\n\n👉 ${LINK_CHECKOUT}\n\nAs vagas não esperam.`,{link_preview:true,mention_everyone:true}));
msgs.push(tm(FUNNEL_NAME,baseDay+2,setTime(addDays(diaOferta,1),'19:00'),G2,`Ontem abriram as matrículas. E muita gente já garantiu a vaga.\n\nSe você ainda está pensando — entendo. Toda decisão real exige coragem.\n\nMas deixa eu te perguntar algo:\n\nO que vai ser diferente daqui a 6 meses se você continuar do jeito que está?\n\nOs mesmos padrões. Os mesmos ciclos. A mesma sensação de quase lá.\n\n👉 ${LINK_CHECKOUT}\n\nVagas ainda disponíveis — mas não por muito tempo.`,{link_preview:true,mention_everyone:true}));
msgs.push(tm(FUNNEL_NAME,baseDay+3,setTime(addDays(diaOferta,2),'18:00'),G2,`⚠️ *Amanhã encerram as matrículas.*\n\nSe você saiu das aulas sentindo que algo virou — o próximo passo está disponível agora.\n\nDepois de amanhã, não tem como garantir vaga.\n\n👉 ${LINK_CHECKOUT}`,{link_preview:true,mention_everyone:true}));
msgs.push(tm(FUNNEL_NAME,baseDay+4,setTime(addDays(diaOferta,3),'12:00'),G2,`🔒 *Hoje é o último dia.*\n\nAs matrículas fecham à meia-noite.\n\nO momento certo não existe. Existe a decisão que você toma antes de estar completamente pronto.\n\nEssa decisão, tomada hoje, pode mudar o que vem depois.\n\n👉 ${LINK_CHECKOUT}\n\nDepois da meia-noite, a porta fecha.`,{link_preview:true,mention_everyone:true}));

// output SQL em batches de 10
const BATCH = 10;
for(let i=0;i<msgs.length;i+=BATCH){
  const batch=msgs.slice(i,i+BATCH);
  const vals=batch.map(row).join(',\n');
  process.stdout.write(`INSERT INTO funnel_messages ${COLS} VALUES\n${vals};\n\n`);
}
process.stderr.write(`Total: ${msgs.length} mensagens, ${Math.ceil(msgs.length/BATCH)} lotes\n`);
