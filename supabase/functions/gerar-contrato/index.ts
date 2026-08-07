import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const AUTENTIQUE_TOKEN = Deno.env.get('AUTENTIQUE_TOKEN') ?? 'd37b36fd0350fe8563d3eb836f8b62ecbc3985497e2bfdb209a5cb578ca79380';
const AUTENTIQUE_URL = 'https://api.autentique.com.br/v2/graphql';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function fmt(v: number): string {
  return Number(v).toFixed(2).replace('.', ',');
}

function gerarContratoHtml(d: Record<string, unknown>): string {
  const nome        = String(d.nome || '');
  const email       = String(d.email || '');
  const cpf         = String(d.cpf || '');
  const rg          = String(d.rg || '');
  const telefone    = String(d.whatsapp || d.telefone || '');
  const endereco    = String(d.endereco || '');
  const cep         = String(d.cep || '');
  const cidEst      = String(d.cidade_estado || '');
  const pais        = String(d.pais || 'Brasil');
  const diaVenc     = String(d.dia_vencimento || '');
  const tipoPag     = String(d.tipo_pagamento || 'mensalidade');

  // valores customizados opcionais
  const valorParcelaCustom  = d.valor_parcela  ? parseFloat(String(d.valor_parcela))  : null;
  const numParcelasCustom   = d.num_parcelas   ? parseInt(String(d.num_parcelas))     : null;

  let dataNasc = '';
  const dns = String(d.data_nascimento || '');
  if (dns) { const [ano,mes,dia] = dns.split('-'); dataNasc = `${dia}/${mes}/${ano}`; }

  const isBolsa   = tipoPag === 'cortesia' || diaVenc === 'cortesia';
  const isVista   = tipoPag === 'bolsa'    || diaVenc === 'a_vista';
  const isCartao  = tipoPag === 'cartao'   || diaVenc === 'cartao';

  let numParcelas: number, valorParcela: number, valorTotal: number,
      parcelasTexto: string, formaTexto: string, diaVencTexto: string;

  if (isVista) {
    numParcelas  = numParcelasCustom  ?? 1;
    valorParcela = valorParcelaCustom ?? 997.00;
    valorTotal   = numParcelas * valorParcela;
    parcelasTexto = '01 (uma) parcela';
    formaTexto    = 'pagamento à vista via PIX';
    diaVencTexto  = 'N/A';
  } else if (isBolsa) {
    numParcelas = 0; valorParcela = 0; valorTotal = 0;
    parcelasTexto = 'Bolsa de Estudo — sem custo';
    formaTexto    = 'bolsa de estudo';
    diaVencTexto  = 'N/A';
  } else if (isCartao) {
    numParcelas  = numParcelasCustom  ?? 12;
    valorParcela = valorParcelaCustom ?? 109.90;
    valorTotal   = numParcelas * valorParcela;
    parcelasTexto = `${numParcelas} (${numParcelasCustom === 12 ? 'doze' : numParcelas}) parcelas no cartão de crédito`;
    formaTexto    = `cartão de crédito em ${numParcelas}x de R$ ${fmt(valorParcela)}`;
    diaVencTexto  = 'N/A';
  } else {
    numParcelas  = numParcelasCustom  ?? 15;
    valorParcela = valorParcelaCustom ?? 109.90;
    valorTotal   = numParcelas * valorParcela;
    parcelasTexto = `${numParcelas} parcelas (1 entrada PIX + ${numParcelas - 1} boletos)`;
    formaTexto    = `PIX na entrada + boleto com vencimento todo dia ${diaVenc}`;
    diaVencTexto  = diaVenc || 'N/A';
  }

  const hoje = new Date();
  const meses = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  const dataFmt     = hoje.toLocaleDateString('pt-BR');
  const horaFmt     = hoje.toLocaleTimeString('pt-BR');
  const dataExtenso = `${hoje.getDate()} de ${meses[hoje.getMonth()]} de ${hoje.getFullYear()}`;

  const clausulaBolsa = isBolsa ? `
<div class="cs">6. DA BOLSA DE ESTUDOS</div><hr class="sep">
<p class="c">6.1 O CONTRATANTE foi contemplado com uma <strong>Bolsa de Estudos integral</strong> concedida pelo Instituto Despertamente, eximindo-o do pagamento de qualquer valor pela prestação dos serviços educacionais descritos neste contrato.</p>
<p class="c">6.2 A Bolsa de Estudos é intransferível, pessoal e vinculada exclusivamente ao CONTRATANTE, não podendo ser cedida a terceiros.</p>
<p class="c">6.3 O não cumprimento das obrigações acadêmicas ou a desistência imotivada poderão implicar na revogação da bolsa a critério do CONTRATADO.</p>
` : '';

  const numCertificado = isBolsa ? 7 : 6;
  const numForo        = isBolsa ? 8 : 7;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8">
<style>
* { box-sizing:border-box; margin:0; padding:0; }
body { font-family:Arial,sans-serif; font-size:11px; margin:30px 40px; line-height:1.4; color:#000; }
.topo { width:100%; border-collapse:collapse; margin-bottom:10px; }
.topo td { border:1px solid #000; vertical-align:middle; }
.topo-titulo { text-align:center; font-size:17px; font-weight:bold; padding:10px 8px; }
.topo-sub { padding:4px 8px; }
.sl { font-size:9px; color:#333; display:block; }
.sv { font-size:13px; display:block; }
.st { font-weight:bold; font-size:11px; padding:4px 0 1px 0; }
.ficha { width:100%; border-collapse:collapse; margin-bottom:7px; }
.ficha td { border:1px solid #000; padding:2px 5px; vertical-align:top; font-size:10px; }
.fl { font-size:9px; color:#333; display:block; }
.fv { font-size:11px; display:block; }
.fvg { font-size:13px; display:block; }
.ctitulo { text-align:center; font-size:13px; font-weight:bold; margin:12px 0 8px 0; }
.csubtitulo { text-align:center; font-size:11px; margin:0 0 10px 0; }
p.c { font-size:10px; text-align:justify; margin:3px 0; line-height:1.5; }
.cs { font-weight:bold; font-size:10px; margin-top:7px; margin-bottom:1px; }
.sep { border:none; border-top:1px solid #888; margin:2px 0 4px 0; }
.rodape { font-size:9px; color:#555; text-align:right; margin-top:6px; }
.ass { width:100%; border-collapse:collapse; margin-top:20px; }
.ass td { padding:4px 12px; vertical-align:bottom; width:50%; font-size:10px; }
</style></head>
<body>
<table class="topo">
  <tr>
    <td style="width:35%;padding:10px 8px;" rowspan="2">&nbsp;</td>
    <td class="topo-titulo">CONTRATO DESPERTAMENTE</td>
  </tr>
  <tr><td class="topo-sub">
    <table style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="width:50%;border:none;"><span class="sl">Nº do Contrato</span><span class="sv">&nbsp;</span></td>
        <td style="width:50%;border:none;"><span class="sl">Data do Contrato</span><span class="sv">${dataFmt}</span></td>
      </tr>
    </table>
  </td></tr>
</table>

<div class="st">01 - DA IDENTIFICAÇÃO DO ALUNO</div>
<table class="ficha">
  <tr>
    <td style="width:68%;"><span class="fl">Nome do Aluno</span><span class="fvg">${nome}</span></td>
    <td style="width:32%;"><span class="fl">Data de Nascimento</span><span class="fvg">${dataNasc}</span></td>
  </tr>
  <tr>
    <td style="width:22%;"><span class="fl">CPF</span><span class="fv">${cpf}</span></td>
    <td style="width:14%;"><span class="fl">RG</span><span class="fv">${rg}</span></td>
    <td colspan="2"><span class="fl">Telefone</span><span class="fv">${telefone}</span></td>
  </tr>
  <tr>
    <td colspan="3"><span class="fl">Endereço</span><span class="fv">${endereco}</span></td>
    <td><span class="fl">CEP</span><span class="fv">${cep}</span></td>
  </tr>
  <tr>
    <td colspan="2"><span class="fl">Cidade/Estado</span><span class="fv">${cidEst}</span></td>
    <td colspan="2"><span class="fl">País</span><span class="fv">${pais}</span></td>
  </tr>
</table>

<div class="st">02 - PRESTADORA DE SERVIÇOS</div>
<table class="ficha">
  <tr>
    <td style="width:68%;"><span class="fl">Escola</span><span class="fvg">GRUPO DESPERTAMENTE</span></td>
    <td style="width:32%;"><span class="fl">CNPJ</span><span class="fvg">55.184.481/0001-24</span></td>
  </tr>
  <tr>
    <td colspan="2"><span class="fl">Endereço</span><span class="fv">Av. Paulista, 1636, Sala 1105, Subconj 126, Cerqueira César — São Paulo/SP — CEP 01.310-200</span></td>
  </tr>
</table>

<div class="st">03 - DO VALOR E CONDIÇÕES DE PAGAMENTO</div>
<table class="ficha">
  <tr>
    <td><span class="fl">Valor Total</span><span class="fvg">R$ ${fmt(valorTotal)}</span></td>
    <td><span class="fl">Nº de Parcelas</span><span class="fvg">${numParcelas}</span></td>
    <td><span class="fl">Valor da Parcela</span><span class="fvg">R$ ${fmt(valorParcela)}</span></td>
    <td><span class="fl">Taxa de Matrícula</span><span class="fvg">R$ 0,00</span></td>
  </tr>
  <tr>
    <td colspan="4"><span class="fl">Forma de Pagamento</span><span class="fv">${formaTexto}${diaVencTexto !== 'N/A' ? ' — boletos enviados por e-mail via plataforma Voomp' : ''}</span></td>
  </tr>
</table>

<div class="st">04 - DO CURSO</div>
<table class="ficha">
  <tr>
    <td style="width:50%;"><span class="fl">Curso</span><span class="fvg">FORMAÇÃO EM PSICANÁLISE</span></td>
    <td style="width:30%;"><span class="fl">Extensão Universitária</span><span class="fvg">Faculdade Anhanguera</span></td>
    <td style="width:20%;"><span class="fl">Plataforma Financeira</span><span class="fvg">Voomp</span></td>
  </tr>
</table>

<div class="ctitulo">CONTRATO DE PRESTAÇÃO DE SERVIÇOS EDUCACIONAIS</div>
<div class="csubtitulo">Formação em Psicanálise — Instituto Despertamente</div>

<p class="c">Pelo presente instrumento, de um lado <strong>GRUPO DESPERTAMENTE</strong>, CNPJ 55.184.481/0001-24, Av. Paulista, 1636, São Paulo/SP, doravante <strong>CONTRATADO</strong>, e de outro <strong>${nome}</strong>, CPF <strong>${cpf}</strong>, RG <strong>${rg}</strong>, residente em <strong>${endereco}</strong>, ${cidEst}, e-mail <strong>${email}</strong>, doravante <strong>CONTRATANTE</strong>, acordam o seguinte:</p>

<div class="cs">1. DO OBJETO</div><hr class="sep">
<p class="c">Prestação de serviços educacionais da <strong>Formação em Psicanálise</strong> do Instituto Despertamente, com certificação de Extensão Universitária pela <strong>Faculdade Anhanguera</strong>.</p>

<div class="cs">2. DO PAGAMENTO</div><hr class="sep">
<p class="c">2.1 Valor total: <strong>R$ ${fmt(valorTotal)}</strong> em <strong>${parcelasTexto}</strong> de <strong>R$ ${fmt(valorParcela)}</strong> via ${formaTexto}.</p>
${diaVencTexto !== 'N/A' ? `<p class="c">2.2 Vencimento todo dia <strong>${diaVencTexto}</strong> de cada mês. Os boletos serão enviados por e-mail via plataforma <strong>Voomp</strong>.</p>` : ''}
<p class="c">${diaVencTexto !== 'N/A' ? '2.3' : '2.2'} É facultado ao CONTRATANTE quitar antecipadamente sem multa.</p>

<div class="cs">3. DO ATRASO</div><hr class="sep">
<p class="c">Multa de <strong>2%</strong> no 1º dia de atraso + juros de <strong>1% ao dia</strong> a partir do 2º dia.</p>

<div class="cs">4. DA INADIMPLÊNIA</div><hr class="sep">
<p class="c">Em caso de inadimplência superior a 30 dias, o CONTRATADO poderá inscrever o débito no SPC/SERASA e rescindir o contrato.</p>

<div class="cs">5. DO CANCELAMENTO</div><hr class="sep">
<p class="c">5.1 Desistência antes do início: não há reembolso da 1ª parcela.</p>
<p class="c">5.2 Desistência após o início: multa de 01 (uma) parcela.</p>
<p class="c">5.3 Solicitações somente por <strong>e-mail</strong> — não aceitas por WhatsApp ou telefone.</p>

${clausulaBolsa}

<div class="cs">${numCertificado}. DO CERTIFICADO</div><hr class="sep">
<p class="c">Certificado de Extensão Universitária emitido ao final do curso, condicionado à frequência mínima exigida e à quitação integral do contrato.</p>

<div class="cs">${numForo}. DO FORO</div><hr class="sep">
<p class="c">Foro da Comarca de São Paulo/SP.</p>

<p class="c" style="margin-top:12px;"><strong>São Paulo, ${dataExtenso}</strong></p>

<table class="ass">
  <tr>
    <td style="text-align:center;padding-top:32px;">
      <div style="border-top:1px solid #000;width:85%;margin:0 auto 3px auto;"></div>
      <strong>${nome}</strong><br>Contratante
    </td>
    <td style="text-align:center;padding-top:32px;">
      <div style="border-top:1px solid #000;width:85%;margin:0 auto 3px auto;"></div>
      <strong>GRUPO DESPERTAMENTE</strong><br>Contratado
    </td>
  </tr>
  <tr>
    <td style="padding-top:24px;"><div style="border-top:1px solid #000;width:85%;margin-bottom:3px;"></div>Testemunha 1:<br>Nome:<br>RG:</td>
    <td style="padding-top:24px;"><div style="border-top:1px solid #000;width:85%;margin-bottom:3px;"></div>Testemunha 2:<br>Nome:<br>RG:</td>
  </tr>
</table>

<div class="rodape">${horaFmt} — ${dataFmt}</div>
</body></html>`;
}

async function criarLinkAssinatura(publicId: string): Promise<string | null> {
  const query = `mutation CreateSignatureLink($publicId: UUID!) {
    createLinkToSignature(public_id: $publicId) { short_link }
  }`;

  const res = await fetch(AUTENTIQUE_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${AUTENTIQUE_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables: { publicId } }),
  });

  const json = await res.json();
  if (json.errors) {
    console.error('createLinkToSignature error:', JSON.stringify(json.errors));
    return null;
  }
  return json.data?.createLinkToSignature?.short_link ?? null;
}

async function enviarParaAutentique(d: Record<string, unknown>, html: string) {
  const nome     = String(d.nome || '');
  const email    = String(d.email || '');
  const primNome = nome.split(' ')[0];
  const fileName = `contrato_${nome.replace(/\s+/g, '_')}.html`;

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
        name: `Contrato Psicanálise — ${nome}`,
        message: `Olá ${primNome}, seu contrato de matrícula está pronto para assinatura.`
      },
      signers: [{ email, action: 'SIGN' }],
      file: null
    }
  });

  const form = new FormData();
  form.append('operations', operations);
  form.append('map', '{"file": ["variables.file"]}');
  form.append('file', new Blob([html], { type: 'text/html; charset=utf-8' }), fileName);

  const res  = await fetch(AUTENTIQUE_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${AUTENTIQUE_TOKEN}` },
    body: form,
  });

  const json = await res.json();
  if (json.errors) throw new Error('Autentique: ' + JSON.stringify(json.errors));

  const doc = json.data?.createDocument;
  if (!doc) throw new Error('Autentique sem documento: ' + JSON.stringify(json));

  // A Autentique inclui automaticamente a conta dona do token como uma
  // assinatura extra (sem action) — a pegar sempre signatures[0] pegava essa
  // conta em vez do aluno, gerando um link de assinatura que não existe pra
  // ele. Aqui buscamos a assinatura de quem realmente precisa assinar.
  const assinatura = doc.signatures?.find(
    (s: any) => s?.email === email && s?.action?.name === 'SIGN'
  ) ?? doc.signatures?.find((s: any) => s?.action?.name === 'SIGN');

  if (!assinatura?.public_id) {
    throw new Error('Autentique: assinatura do signatário não encontrada no documento criado');
  }

  // signatures[].link.short_link normalmente vem nulo na criação do
  // documento — o link de assinatura precisa ser gerado nesta mutation à parte
  const link = assinatura.link?.short_link
    ?? await criarLinkAssinatura(assinatura.public_id);

  return { docId: doc.id, link, publicId: assinatura.public_id };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const dados = await req.json();
    if (!dados.nome || !dados.email) {
      return new Response(JSON.stringify({ error: 'nome e email obrigatórios' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    const html      = gerarContratoHtml(dados);
    const resultado = await enviarParaAutentique(dados, html);

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    await sb.from('alunos').update({
      autentique_documento_id:    resultado.docId,
      autentique_link_assinatura: resultado.link,
      contrato_enviado:           true,
      contrato_enviado_em:        new Date().toISOString(),
    }).eq('email', dados.email);

    return new Response(JSON.stringify({
      success: true,
      documento_id:    resultado.docId,
      link_assinatura: resultado.link,
    }), { headers: { ...cors, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('gerar-contrato:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }
});
