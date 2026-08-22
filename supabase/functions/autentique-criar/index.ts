/**
 * autentique-criar
 * Recebe dados do formulário de contrato, atualiza o aluno no DB,
 * cria o documento na API Autentique (GraphQL) e envia WPP com link de assinatura.
 *
 * Template do contrato idêntico ao usado em produção pela edge function
 * `gerar-contrato` (mesmo texto jurídico completo de 19 cláusulas).
 *
 * Body: { aluno_id, cpf, data_nascimento, endereco, cep, cidade_estado, enviar_wpp? }
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const AUTENTIQUE_URL = 'https://api.autentique.com.br/v2/graphql';

function fmt(v: number): string {
  return Number(v).toFixed(2).replace('.', ',');
}

function buildContratoHtml(d: Record<string, unknown>): string {
  const nome     = String(d.nome || '');
  const email    = String(d.email || '');
  const cpf      = String(d.cpf || '');
  const rg       = String(d.rg || '');
  const telefone = String(d.whatsapp || d.telefone || '');
  const endereco = String(d.endereco || '');
  const cep      = String(d.cep || '');
  const cidEst   = String(d.cidade_estado || '');
  const pais     = String(d.pais || 'Brasil');
  const diaVenc  = String(d.dia_vencimento || '');
  const tipoPag  = String(d.tipo_pagamento || 'mensalidade');

  const valorParcelaCustom = d.valor_parcela ? parseFloat(String(d.valor_parcela)) : null;
  const numParcelasCustom  = d.num_parcelas  ? parseInt(String(d.num_parcelas))    : null;

  let dataNasc = '';
  const dns = String(d.data_nascimento || '');
  if (dns) { const [ano,mes,dia] = dns.split('-'); dataNasc = `${dia}/${mes}/${ano}`; }

  const isBolsa  = tipoPag === 'cortesia' || diaVenc === 'cortesia';
  const isVista  = tipoPag === 'bolsa'    || diaVenc === 'a_vista';
  const isCartao = tipoPag === 'cartao'   || diaVenc === 'cartao';

  let numParcelas: number, valorParcela: number, valorTotal: number;
  let formaResumo: string, planoSelecionado: string, diaVencTexto: string;

  if (isVista) {
    numParcelas   = 1;
    valorParcela  = valorParcelaCustom ?? 997.00;
    valorTotal    = valorParcela;
    formaResumo   = 'Pagamento à vista via PIX';
    planoSelecionado = `à vista: R$ ${fmt(valorTotal)} (alínea “a”)`;
    diaVencTexto  = 'N/A';
  } else if (isBolsa) {
    numParcelas   = 0; valorParcela = 0; valorTotal = 0;
    formaResumo   = 'Bolsa de Estudos — sem custo financeiro';
    planoSelecionado = 'Bolsa de Estudos integral concedida pela CONTRATADA';
    diaVencTexto  = 'N/A';
  } else if (isCartao) {
    numParcelas   = numParcelasCustom  ?? 12;
    valorParcela  = valorParcelaCustom ?? 109.40;
    valorTotal    = numParcelas * valorParcela;
    formaResumo   = `Cartão de crédito ${numParcelas}x de R$ ${fmt(valorParcela)}`;
    planoSelecionado = `cartão de crédito em ${numParcelas}x de R$ ${fmt(valorParcela)} (alínea “b”)`;
    diaVencTexto  = 'N/A';
  } else {
    numParcelas   = numParcelasCustom  ?? 15;
    valorParcela  = valorParcelaCustom ?? 109.90;
    valorTotal    = numParcelas * valorParcela;
    const diaNum  = diaVenc.replace(/\D/g,'') || diaVenc;
    formaResumo   = `Boleto: 1 entrada + ${numParcelas-1} parcelas mensais — vencimento dia ${diaNum}`;
    planoSelecionado = `plano por boleto, vencimento todo dia ${diaNum} (alínea “c”)`;
    diaVencTexto  = diaNum;
  }

  const hoje = new Date();
  const meses = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  const dataFmt     = hoje.toLocaleDateString('pt-BR');
  const horaFmt     = hoje.toLocaleTimeString('pt-BR');
  const dataExtenso = `${hoje.getDate()} de ${meses[hoje.getMonth()]} de ${hoje.getFullYear()}`;

  // Cláusula 4 dinâmica
  const clausula4Bolsa = isBolsa ? `
<p class="c"><strong>4.1.</strong> O CONTRATANTE foi contemplado com <strong>Bolsa de Estudos integral</strong> concedida pela CONTRATADA, eximindo-o do pagamento de qualquer valor pela prestação dos serviços educacionais descritos neste contrato.</p>
<p class="c"><strong>4.2.</strong> A Bolsa de Estudos é intransferível, pessoal e vinculada exclusivamente ao CONTRATANTE, não podendo ser cedida a terceiros.</p>
<p class="c"><strong>4.3.</strong> O não cumprimento das obrigações acadêmicas ou a desistência imotivada poderão implicar na revogação da bolsa a critério da CONTRATADA.</p>
` : `
<p class="c"><strong>4.1.</strong> O CONTRATANTE declara ter escolhido, no ato da matrícula, uma das seguintes condições comerciais:</p>
<p class="c" style="margin-left:16px;">a) pagamento à vista: R$ 997,00 (novecentos e noventa e sete reais);</p>
<p class="c" style="margin-left:16px;">b) cartão de crédito: em até 12 (doze) parcelas de R$ 109,40 (cento e nove reais e quarenta centavos), conforme disponibilidade e aprovação da operadora/meio de pagamento;</p>
<p class="c" style="margin-left:16px;">c) plano por boleto: 1 (uma) parcela inicial, seguida de 14 (quatorze) parcelas mensais de R$ 109,90 (cento e nove reais e noventa centavos), totalizando 15 (quinze) pagamentos.</p>
<p class="c"><strong>4.2.</strong> No plano por boleto, a quantidade de pagamentos constitui a condição comercial contratada e não deve ser confundida com a quantidade de meses da formação, que permanece com duração prevista de 14 meses.</p>
<p class="c"><strong>4.3.</strong> O plano efetivamente escolhido pelo CONTRATANTE é o <strong>${planoSelecionado}</strong>, conforme registrado no quadro-resumo acima.</p>
`;

  // Cláusula 6 — cancelamento dinâmica
  const clausula6Extra = isBolsa ? '' : (isVista || isCartao) ? `
<p class="c"><strong>6.4.</strong> Nas contratações pagas à vista ou por cartão de crédito, após o encerramento do prazo de 7 (sete) dias previsto na Cláusula 6.1, a desistência imotivada por iniciativa do CONTRATANTE não dará direito à devolução ou estorno dos valores pagos. Esta disposição não afasta eventual restituição que seja obrigatória por lei em razão de descumprimento contratual imputável à CONTRATADA ou de outra hipótese legal inderrogável.</p>
` : `
<p class="c"><strong>6.3.</strong> Após o prazo legal de arrependimento, em caso de desistência imotivada pelo CONTRATANTE no plano por boleto, serão devidos:</p>
<p class="c" style="margin-left:16px;">I – os valores vencidos e não pagos até a formalização do cancelamento; e</p>
<p class="c" style="margin-left:16px;">II – multa rescisória equivalente a 1 (uma) parcela do plano por boleto, atualmente no valor de R$ ${fmt(valorParcela)}.</p>
<p class="c">Após a efetivação do cancelamento, as parcelas vincendas do plano por boleto deixarão de ser cobradas, ressalvadas obrigações já constituídas.</p>
`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8">
<style>
* { box-sizing:border-box; margin:0; padding:0; }
body { font-family:Arial,sans-serif; font-size:10.5px; margin:28px 38px; line-height:1.45; color:#000; }
.topo { width:100%; border-collapse:collapse; margin-bottom:8px; }
.topo td { border:1px solid #000; vertical-align:middle; }
.topo-titulo { text-align:center; font-size:15px; font-weight:bold; padding:8px; letter-spacing:.04em; }
.topo-sub { padding:4px 8px; }
.sl { font-size:8.5px; color:#444; display:block; }
.sv { font-size:12px; display:block; }
.st { font-weight:bold; font-size:10.5px; padding:4px 0 2px 0; text-transform:uppercase; letter-spacing:.03em; }
.ficha { width:100%; border-collapse:collapse; margin-bottom:6px; }
.ficha td { border:1px solid #000; padding:2px 5px; vertical-align:top; font-size:9.5px; }
.fl { font-size:8px; color:#444; display:block; }
.fv { font-size:10px; display:block; }
.fvg { font-size:12px; display:block; font-weight:bold; }
.identificacao { border:1px solid #000; padding:7px 10px; margin-bottom:6px; font-size:9.5px; line-height:1.55; }
.id-titulo { font-weight:bold; font-size:10px; border-bottom:1px solid #ccc; padding-bottom:3px; margin-bottom:4px; text-transform:uppercase; letter-spacing:.03em; }
.ctitulo { text-align:center; font-size:13px; font-weight:bold; margin:10px 0 3px 0; text-transform:uppercase; letter-spacing:.04em; }
.csubtitulo { text-align:center; font-size:10px; margin:0 0 8px 0; color:#333; }
.preambulo { font-size:9.5px; margin:0 0 10px 0; line-height:1.55; text-align:justify; }
hr.div { border:none; border-top:1px solid #bbb; margin:6px 0 4px 0; }
.clausula-titulo { font-weight:bold; font-size:10px; margin:8px 0 3px 0; text-transform:uppercase; letter-spacing:.03em; }
p.c { font-size:9.5px; text-align:justify; margin:2px 0; line-height:1.55; }
.rodape { font-size:8px; color:#666; text-align:right; margin-top:8px; }
.ass { width:100%; border-collapse:collapse; margin-top:22px; }
.ass td { padding:4px 10px; vertical-align:bottom; width:50%; font-size:9.5px; }
.linha-ass { border-top:1px solid #000; width:88%; margin-bottom:3px; }
</style></head>
<body>

<!-- CABEÇALHO -->
<table class="topo">
  <tr>
    <td style="width:32%;padding:8px;" rowspan="2">&nbsp;</td>
    <td class="topo-titulo">CONTRATO DE PRESTAÇÃO DE SERVIÇOS EDUCACIONAIS</td>
  </tr>
  <tr><td class="topo-sub">
    <table style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="width:50%;border:none;"><span class="sl">Nº do Contrato</span><span class="sv">&nbsp;</span></td>
        <td style="width:50%;border:none;"><span class="sl">Data</span><span class="sv">${dataFmt}</span></td>
      </tr>
    </table>
  </td></tr>
</table>

<!-- QUADRO-RESUMO -->
<div class="st">Quadro-Resumo da Matrícula</div>
<table class="ficha">
  <tr>
    <td style="width:60%;"><span class="fl">Nome do Aluno</span><span class="fvg">${nome}</span></td>
    <td style="width:20%;"><span class="fl">CPF</span><span class="fv">${cpf}</span></td>
    <td style="width:20%;"><span class="fl">Data de Nascimento</span><span class="fv">${dataNasc}</span></td>
  </tr>
  <tr>
    <td><span class="fl">E-mail</span><span class="fv">${email}</span></td>
    <td><span class="fl">RG</span><span class="fv">${rg}</span></td>
    <td><span class="fl">Telefone/WhatsApp</span><span class="fv">${telefone}</span></td>
  </tr>
  <tr>
    <td colspan="2"><span class="fl">Endereço</span><span class="fv">${endereco}, ${cidEst} — CEP ${cep} — ${pais}</span></td>
    <td><span class="fl">Curso</span><span class="fv">FORMAÇÃO EM PSICANÁLISE</span></td>
  </tr>
  <tr>
    <td><span class="fl">Plano / Forma de Pagamento</span><span class="fv">${formaResumo}</span></td>
    <td><span class="fl">Valor Total</span><span class="fv">${isBolsa ? 'R$ 0,00 (Bolsa)' : 'R$ ' + fmt(valorTotal)}</span></td>
    <td><span class="fl">Extensão Universitária</span><span class="fv">Faculdade Anhanguera</span></td>
  </tr>
</table>

<!-- IDENTIFICAÇÃO -->
<div class="identificacao">
  <div class="id-titulo">Identificação das Partes</div>
  <p style="margin-bottom:4px;"><strong>CONTRATADA:</strong> INSTITUTO DESPERTAMENTE / GRUPO DESPERTAMENTE, inscrita no CNPJ nº 55.184.481/0001-24, com sede na Av. Paulista, 1636, Sala 1105, Subconj 126, Cerqueira César, São Paulo/SP, CEP 01.310-200, neste ato representada na forma de seus atos constitutivos, doravante denominada <strong>CONTRATADA</strong>.</p>
  <p><strong>CONTRATANTE/ALUNO(A):</strong> <strong>${nome}</strong>, CPF nº <strong>${cpf}</strong>, RG nº <strong>${rg}</strong>, data de nascimento <strong>${dataNasc}</strong>, endereço <strong>${endereco}, ${cidEst}, CEP ${cep}, ${pais}</strong>, e-mail <strong>${email}</strong> e telefone/WhatsApp <strong>${telefone}</strong>, doravante denominado(a) <strong>CONTRATANTE</strong>.</p>
</div>

<p class="preambulo">As partes acima identificadas celebram o presente Contrato de Prestação de Serviços Educacionais, mediante as cláusulas e condições seguintes.</p>

<!-- CLÁUSULAS -->

<div class="clausula-titulo">Cláusula 1 – Do Objeto</div><hr class="div">
<p class="c"><strong>1.1.</strong> O presente contrato tem por objeto a prestação de serviços educacionais referentes à <strong>Formação em Psicanálise</strong>, com duração prevista de 14 (quatorze) meses e carga horária total de 600 (seiscentas) horas, conforme programa pedagógico, calendário e orientações disponibilizados pela CONTRATADA.</p>
<p class="c"><strong>1.2.</strong> A formação poderá compreender aulas ao vivo e/ou gravadas, atividades acadêmicas, materiais didáticos e complementares, encontros de acompanhamento, avaliações e demais componentes previstos na proposta pedagógica.</p>
<p class="c"><strong>1.3.</strong> O cronograma, a ordem dos conteúdos, docentes, datas e meios de disponibilização poderão ser ajustados por razões pedagógicas ou operacionais, desde que preservada a essência da formação contratada.</p>

<div class="clausula-titulo">Cláusula 2 – Da Formação e da Extensão Universitária</div><hr class="div">
<p class="c"><strong>2.1.</strong> A CONTRATADA prestará a Formação em Psicanálise de acordo com sua proposta pedagógica, programa acadêmico e condições informadas ao CONTRATANTE no momento da matrícula.</p>
<p class="c"><strong>2.2.</strong> A CONTRATADA informa que mantém parceria com a Anhanguera para extensão universitária, observadas as condições acadêmicas, documentais e institucionais aplicáveis à respectiva extensão e à emissão de documentação correspondente. Este contrato não amplia nem modifica, por si só, as condições da parceria ou os requisitos acadêmicos comunicados ao aluno.</p>

<div class="clausula-titulo">Cláusula 3 – Da Vigência e do Calendário</div><hr class="div">
<p class="c"><strong>3.1.</strong> A vigência acadêmica prevista é de 14 (quatorze) meses, contados a partir da data de início da turma indicada no quadro-resumo.</p>
<p class="c"><strong>3.2.</strong> Poderão ocorrer alterações justificadas de calendário, inclusive reposições, mudanças de datas, horários ou docentes, quando necessárias à continuidade e qualidade da formação.</p>
<p class="c"><strong>3.3.</strong> Eventuais períodos de acesso a gravações, plataforma ou materiais após o encerramento acadêmico serão aqueles informados pela CONTRATADA e não alteram, por si só, a duração da formação.</p>

<div class="clausula-titulo">Cláusula 4 – Do Investimento e da Forma de Pagamento</div><hr class="div">
${clausula4Bolsa}

<div class="clausula-titulo">Cláusula 5 – Da Inadimplência</div><hr class="div">
<p class="c"><strong>5.1.</strong> O não pagamento de obrigação no vencimento sujeiterá o CONTRATANTE aos encargos previstos em lei e, quando aplicável, aos encargos expressamente informados no documento de cobrança.</p>
<p class="c"><strong>5.2.</strong> A CONTRATADA poderá realizar cobrança administrativa dos valores vencidos e solicitar a regularização da pendência, respeitados os direitos do consumidor e a legislação aplicável.</p>
<p class="c"><strong>5.3.</strong> Eventuais medidas relativas ao acesso a serviços em razão de inadimplência serão adotadas somente nos limites permitidos pela legislação aplicável.</p>

<div class="clausula-titulo">Cláusula 6 – Do Direito de Arrependimento, Desistência e Cancelamento</div><hr class="div">
<p class="c"><strong>6.1.</strong> Quando a contratação estiver sujeita ao direito de arrependimento previsto no art. 49 do Código de Defesa do Consumidor, o CONTRATANTE poderá exercê-lo no prazo legal de 7 (sete) dias, contado na forma da legislação aplicável.</p>
<p class="c"><strong>6.2.</strong> O pedido de cancelamento deverá ser formalizado pelo CONTRATANTE por canal oficial de atendimento da CONTRATADA, permitindo a identificação do aluno e o registro da solicitação.</p>
${clausula6Extra}
<p class="c"><strong>${(isVista||isCartao) && !isBolsa ? '6.5' : isBolsa ? '6.3' : '6.4'}.</strong> A formalização do cancelamento poderá acarretar o encerramento do acesso às aulas, gravações, materiais, plataforma, grupos, bônus e demais recursos vinculados à matrícula.</p>
<p class="c"><strong>${(isVista||isCartao) && !isBolsa ? '6.6' : isBolsa ? '6.4' : '6.5'}.</strong> Nenhuma disposição desta cláusula limita direitos inderrogáveis assegurados ao consumidor pela legislação aplicável.</p>

<div class="clausula-titulo">Cláusula 7 – Das Obrigações da Contratada</div><hr class="div">
<p class="c"><strong>7.1.</strong> São obrigações da CONTRATADA:</p>
<p class="c" style="margin-left:14px;">a) disponibilizar a formação conforme a proposta pedagógica e o calendário vigente;</p>
<p class="c" style="margin-left:14px;">b) disponibilizar os meios necessários para acesso aos conteúdos previstos;</p>
<p class="c" style="margin-left:14px;">c) comunicar alterações acadêmicas relevantes pelos canais oficiais;</p>
<p class="c" style="margin-left:14px;">d) manter organização acadêmica compatível com a formação ofertada;</p>
<p class="c" style="margin-left:14px;">e) emitir o certificado ao aluno que cumprir os requisitos de conclusão previstos neste contrato e nas regras acadêmicas aplicáveis.</p>

<div class="clausula-titulo">Cláusula 8 – Das Obrigações do Contratante</div><hr class="div">
<p class="c"><strong>8.1.</strong> São obrigações do CONTRATANTE:</p>
<p class="c" style="margin-left:14px;">a) fornecer dados verdadeiros e mantê-los atualizados;</p>
<p class="c" style="margin-left:14px;">b) acompanhar os canais oficiais de comunicação;</p>
<p class="c" style="margin-left:14px;">c) manter em sigilo suas credenciais de acesso e não compartilhá-las com terceiros;</p>
<p class="c" style="margin-left:14px;">d) respeitar professores, colaboradores e demais participantes;</p>
<p class="c" style="margin-left:14px;">e) realizar as atividades acadêmicas obrigatórias;</p>
<p class="c" style="margin-left:14px;">f) acompanhar as aulas da formação, ao vivo ou por meio das gravações disponibilizadas;</p>
<p class="c" style="margin-left:14px;">g) observar os prazos, regras acadêmicas e orientações da CONTRATADA;</p>
<p class="c" style="margin-left:14px;">h) cumprir as obrigações financeiras assumidas.</p>

<div class="clausula-titulo">Cláusula 9 – Da Conclusão e Certificação</div><hr class="div">
<p class="c"><strong>9.1.</strong> A emissão do certificado dependerá do cumprimento dos requisitos acadêmicos da formação.</p>
<p class="c"><strong>9.2.</strong> Para fins de conclusão, o CONTRATANTE deverá, no mínimo:</p>
<p class="c" style="margin-left:14px;">a) realizar as atividades obrigatórias previstas;</p>
<p class="c" style="margin-left:14px;">b) acompanhar as aulas, seja ao vivo ou por meio das gravações disponibilizadas;</p>
<p class="c" style="margin-left:14px;">c) cumprir os demais componentes acadêmicos obrigatórios comunicados pela CONTRATADA.</p>
<p class="c"><strong>9.3.</strong> O acompanhamento de conteúdo gravado será considerado para fins acadêmicos quando realizado de acordo com as regras, meios de registro e prazos definidos pela CONTRATADA.</p>
<p class="c"><strong>9.4.</strong> A matrícula, o pagamento parcial ou o pagamento integral, isoladamente, não conferem direito automático ao certificado sem o cumprimento dos requisitos acadêmicos.</p>

<div class="clausula-titulo">Cláusula 10 – Do Acesso, Senhas e Plataformas</div><hr class="div">
<p class="c"><strong>10.1.</strong> O acesso às plataformas, aulas e materiais é pessoal e intransferível.</p>
<p class="c"><strong>10.2.</strong> É vedado ceder, vender, emprestar ou compartilhar login, senha, links restritos ou quaisquer meios de acesso a terceiros.</p>
<p class="c"><strong>10.3.</strong> O CONTRATANTE é responsável por possuir equipamento, conexão à internet e recursos tecnológicos adequados para acesso às atividades on-line.</p>

<div class="clausula-titulo">Cláusula 11 – Da Propriedade Intelectual</div><hr class="div">
<p class="c"><strong>11.1.</strong> Aulas, vídeos, apostilas, apresentações, exercícios, métodos, marcas, materiais didáticos, gravações e demais conteúdos disponibilizados pela CONTRATADA são destinados ao uso pessoal e educacional do CONTRATANTE.</p>
<p class="c"><strong>11.2.</strong> É vedada, sem autorização expressa, a reprodução, gravação, publicação, comercialização, distribuição, cessão, disponibilização pública ou compartilhamento dos conteúdos, total ou parcialmente, ressalvados os usos permitidos por lei.</p>
<p class="c"><strong>11.3.</strong> A violação de direitos de propriedade intelectual poderá ensejar as medidas legais cabíveis.</p>

<div class="clausula-titulo">Cláusula 12 – De Imagem, Voz e Gravações</div><hr class="div">
<p class="c"><strong>12.1.</strong> O CONTRATANTE reconhece que aulas e encontros on-line poderão ser gravados para fins acadêmicos, de disponibilização aos alunos e de registro da formação, observadas as informações e regras comunicadas pela CONTRATADA.</p>
<p class="c"><strong>12.2.</strong> Eventual utilização da imagem, voz, depoimento ou identificação do CONTRATANTE para publicidade, divulgação comercial ou campanhas institucionais dependerá de base legal adequada e, quando necessário, de autorização específica, clara e destacada.</p>

<div class="clausula-titulo">Cláusula 13 – Da Proteção de Dados Pessoais</div><hr class="div">
<p class="c"><strong>13.1.</strong> Os dados pessoais do CONTRATANTE poderão ser tratados para execução deste contrato, gestão acadêmica, identificação, comunicação, cobrança, suporte, emissão de documentos e cumprimento de obrigações legais ou regulatórias, em conformidade com a legislação aplicável de proteção de dados.</p>
<p class="c"><strong>13.2.</strong> A CONTRATADA adotará medidas razoáveis de segurança e poderá compartilhar dados com fornecedores e operadores necessários à execução dos serviços, observados os limites e deveres legais aplicáveis.</p>

<div class="clausula-titulo">Cláusula 14 – Das Comunicações</div><hr class="div">
<p class="c"><strong>14.1.</strong> E-mail, WhatsApp, plataforma acadêmica e demais canais informados pela CONTRATADA poderão ser utilizados para comunicações administrativas e acadêmicas.</p>
<p class="c"><strong>14.2.</strong> O CONTRATANTE deverá manter seus dados de contato atualizados, responsabilizando-se por informar alterações.</p>

<div class="clausula-titulo">Cláusula 15 – Dos Bônus e Condições Promocionais</div><hr class="div">
<p class="c"><strong>15.1.</strong> Bônus, materiais adicionais, mentorias, workshops, acessos extras ou outras vantagens promocionais eventualmente concedidas observarão as condições, prazos e regras informados na oferta correspondente.</p>
<p class="c"><strong>15.2.</strong> Benefícios promocionais gratuitos ou acessórios não alteram o objeto principal deste contrato e poderão possuir cronograma e condições próprias, respeitada a oferta realizada ao consumidor.</p>

<div class="clausula-titulo">Cláusula 16 – Da Rescisão por Descumprimento</div><hr class="div">
<p class="c"><strong>16.1.</strong> O contrato poderá ser rescindido em caso de descumprimento grave de obrigação contratual, fraude, compartilhamento indevido de acesso, violação relevante de propriedade intelectual ou comportamento que comprometa a segurança e regularidade das atividades, assegurados os direitos previstos na legislação aplicável.</p>
<p class="c"><strong>16.2.</strong> A rescisão por descumprimento não afasta a apuração de valores vencidos nem eventual responsabilidade por danos comprovadamente causados.</p>

<div class="clausula-titulo">Cláusula 17 – Da Assinatura Eletrônica e Registros</div><hr class="div">
<p class="c"><strong>17.1.</strong> As partes reconhecem a validade da contratação e assinatura realizadas por meio eletrônico, inclusive mediante plataforma de assinatura, aceite digital ou outro mecanismo apto a demonstrar autoria e integridade, conforme a legislação aplicável.</p>
<p class="c"><strong>17.2.</strong> Registros eletrônicos da matrícula, aceite, pagamento e comunicações poderão integrar a documentação comprobatória da contratação.</p>

<div class="clausula-titulo">Cláusula 18 – Das Disposições Gerais</div><hr class="div">
<p class="c"><strong>18.1.</strong> A eventual tolerância de uma parte quanto ao descumprimento de obrigação não implicará renúncia de direito nem alteração permanente deste contrato.</p>
<p class="c"><strong>18.2.</strong> Caso qualquer disposição seja considerada inválida ou inaplicável, as demais permanecerão válidas na máxima extensão permitida.</p>
<p class="c"><strong>18.3.</strong> Este contrato deverá ser interpretado em conjunto com a oferta, o quadro-resumo, o programa pedagógico e as regras acadêmicas efetivamente disponibilizadas ao CONTRATANTE, sempre observada a legislação de proteção ao consumidor.</p>

<div class="clausula-titulo">Cláusula 19 – Do Foro</div><hr class="div">
<p class="c"><strong>19.1.</strong> Fica assegurado ao CONTRATANTE o exercício de seus direitos perante o foro competente definido pela legislação aplicável, especialmente as normas de proteção ao consumidor, não prevalecendo disposição que imponha limitação indevida ao acesso à Justiça.</p>

<p class="c" style="margin-top:12px;">E, por estarem de acordo, as partes formalizam o presente instrumento.</p>
<p class="c" style="margin-top:6px;"><strong>São Paulo, ${dataExtenso}</strong></p>

<!-- ASSINATURAS -->
<table class="ass">
  <tr>
    <td style="text-align:center;padding-top:36px;">
      <div class="linha-ass" style="margin:0 auto 3px auto;"></div>
      <strong>${nome}</strong><br>CONTRATANTE
    </td>
    <td style="text-align:center;padding-top:36px;">
      <div class="linha-ass" style="margin:0 auto 3px auto;"></div>
      <strong>INSTITUTO DESPERTAMENTE / GRUPO DESPERTAMENTE</strong><br>CONTRATADA
    </td>
  </tr>
  <tr>
    <td style="padding-top:28px;">
      <div class="linha-ass" style="margin-bottom:3px;"></div>
      Testemunha 1: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; RG:
    </td>
    <td style="padding-top:28px;">
      <div class="linha-ass" style="margin-bottom:3px;"></div>
      Testemunha 2: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; RG:
    </td>
  </tr>
</table>

<div class="rodape">${horaFmt} — ${dataFmt}</div>
</body></html>`;
}

async function criarDocumentoAutentique(
  token: string,
  nome_doc: string,
  html: string,
  signatario_nome: string,
  signatario_email: string,
): Promise<{ id: string; link: string }> {
  const primNome = signatario_nome.split(' ')[0];
  const fileName = `contrato_${signatario_nome.replace(/\s+/g, '_')}.html`;

  const query = `mutation CreateDocumentMutation($document: DocumentInput!, $signers: [SignerInput!]!, $file: Upload!) {
    createDocument(document: $document, signers: $signers, file: $file) {
      id name created_at
      signatures { public_id name email action { name } link { short_link } }
    }
  }`;

  const operations = JSON.stringify({
    query,
    variables: {
      document: {
        name: nome_doc,
        message: `Olá ${primNome}, seu contrato de matrícula está pronto para assinatura.`,
      },
      signers: [{ email: signatario_email, action: 'SIGN' }],
      file: null,
    },
  });

  const form = new FormData();
  form.append('operations', operations);
  form.append('map', '{"file": ["variables.file"]}');
  form.append('file', new Blob([html], { type: 'text/html; charset=utf-8' }), fileName);

  const res = await fetch(AUTENTIQUE_URL, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}` },
    body:    form,
  });

  const json = await res.json();
  if (json.errors) throw new Error('Autentique: ' + JSON.stringify(json.errors));

  const doc = json.data?.createDocument;
  if (!doc) throw new Error('Autentique sem documento: ' + JSON.stringify(json));

  const assinatura = doc.signatures?.[0];
  const publicId   = assinatura?.public_id ?? null;
  const link       = assinatura?.link?.short_link
    ?? (publicId ? `https://painel.autentique.com.br/assinar/${publicId}` : '');

  return { id: doc.id ?? '', link };
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl    = Deno.env.get('SUPABASE_URL')!;
    const serviceKey     = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const autentiqueToken = Deno.env.get('AUTENTIQUE_TOKEN') ?? '';

    const sb = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const { aluno_id, cpf, data_nascimento, endereco, cep, cidade_estado, enviar_wpp } = body as {
      aluno_id: string;
      cpf: string;
      data_nascimento: string;
      endereco: string;
      cep?: string;
      cidade_estado: string;
      enviar_wpp?: boolean;
    };

    if (!aluno_id || !cpf || !data_nascimento || !endereco || !cidade_estado) {
      return new Response(JSON.stringify({ error: 'Campos obrigatórios faltando' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Buscar aluno + turma ─────────────────────────────────────────────────
    const { data: aluno, error: alunoErr } = await sb
      .from('alunos')
      .select('*, turmas(nome, produto)')
      .eq('id', aluno_id)
      .single();

    if (alunoErr || !aluno) {
      return new Response(JSON.stringify({ error: 'Aluno não encontrado' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Atualizar aluno com dados legais + ativar no Financeiro ──────────────
    await sb.from('alunos').update({
      cpf,
      data_nascimento,
      endereco,
      cep: cep ?? null,
      cidade_estado,
      status:              'ativo',           // ← ativa no Financeiro
      forms_respondido:    true,
      forms_respondido_em: new Date().toISOString(),
      contrato_enviado:    true,
      contrato_enviado_em: new Date().toISOString(),
      contrato_link_enviado_em: new Date().toISOString(),
    }).eq('id', aluno_id);

    // ── Gerar e enviar contrato na Autentique ─────────────────────────────────
    let linkAssinatura = '';
    let docId = '';

    if (autentiqueToken && aluno.email) {
      try {
        const html = buildContratoHtml({
          nome:            aluno.nome ?? '',
          email:           aluno.email ?? '',
          cpf,
          rg:              aluno.rg ?? '',
          whatsapp:        aluno.whatsapp ?? '',
          data_nascimento,
          endereco,
          cep:             cep ?? '',
          cidade_estado,
          pais:            aluno.pais ?? 'Brasil',
          dia_vencimento:  aluno.dia_vencimento ?? '',
          tipo_pagamento:  aluno.tipo_pagamento ?? 'mensalidade',
          valor_parcela:   aluno.valor_mensalidade ?? null,
          num_parcelas:    aluno.total_mensalidades ?? null,
        });

        const result = await criarDocumentoAutentique(
          autentiqueToken,
          `Contrato Psicanálise — ${aluno.nome}`,
          html,
          aluno.nome ?? '',
          aluno.email,
        );

        docId         = result.id;
        linkAssinatura = result.link;

        // Salvar link + doc_id no aluno
        await sb.from('alunos').update({
          autentique_documento_id:  docId,
          autentique_link_assinatura: linkAssinatura,
        }).eq('id', aluno_id);

      } catch (e) {
        console.error('Autentique error:', e);
        // Não falha o request — o administrador pode enviar manualmente depois
      }
    }

    // ── Enviar WPP com link de assinatura ────────────────────────────────────
    if (enviar_wpp !== false && linkAssinatura && aluno.whatsapp) {
      try {
        await sb.functions.invoke('wpp-enviar', {
          body: {
            numero: aluno.whatsapp,
            mensagem: `Olá, ${(aluno.nome ?? '').split(' ')[0]}! 📝\n\nSeu contrato está pronto para assinatura:\n\n${linkAssinatura}\n\nAssine agora para confirmar sua matrícula!`,
          },
        });
      } catch (e) {
        console.error('WPP error:', e);
      }
    }

    return new Response(
      JSON.stringify({ success: true, link_assinatura: linkAssinatura }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (err: any) {
    console.error('autentique-criar error:', err);
    return new Response(JSON.stringify({ error: err.message ?? 'Erro interno' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
