/**
 * autentique-criar
 * Recebe dados do formulário de contrato, atualiza o aluno no DB,
 * cria o documento na API Autentique (GraphQL) e envia WPP com link de assinatura.
 *
 * Body: { aluno_id, cpf, data_nascimento, endereco, cep, cidade_estado }
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Autentique GraphQL ────────────────────────────────────────────────────────

const AUTENTIQUE_URL = 'https://api.autentique.com.br/v2/graphql';

async function criarDocumentoAutentique(
  token: string,
  nome_doc: string,
  html: string,
  signatario_nome: string,
  signatario_email: string,
): Promise<{ id: string; link: string }> {
  const mutation = `
    mutation CreateDocument(
      $document: DocumentInput!,
      $signers:  [SignerInput!]!,
      $file:     Upload!
    ) {
      createDocument(document: $document, signers: $signers, file: $file) {
        id
        name
        signers {
          public_id
          name
          email
          action { name }
          link { short_link }
        }
      }
    }
  `;

  // Converte HTML para Blob (PDF gerado pela Autentique a partir do HTML)
  const htmlBlob = new Blob([html], { type: 'text/html' });

  const operations = JSON.stringify({
    query: mutation,
    variables: {
      document: { name: nome_doc },
      signers:  [{ email: signatario_email, action: 'SIGN' }],
      file:     null,
    },
  });

  const map = JSON.stringify({ '0': ['variables.file'] });

  const form = new FormData();
  form.append('operations', operations);
  form.append('map', map);
  form.append('0', htmlBlob, 'contrato.html');

  const res = await fetch(AUTENTIQUE_URL, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}` },
    body:    form,
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Autentique HTTP ${res.status}: ${txt}`);
  }

  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(json.errors[0].message);
  }

  const doc     = json.data?.createDocument;
  const signer  = doc?.signers?.[0];
  const link    = signer?.link?.short_link ?? '';

  return { id: doc?.id ?? '', link };
}

// ─── HTML template do contrato ────────────────────────────────────────────────

function buildContratoHtml(vars: Record<string, string>): string {
  const fill = (s: string) => s.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);

  return fill(`<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><title>Contrato de Matrícula</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 12pt; margin: 60px; color: #222; line-height: 1.6; }
  h1 { text-align: center; font-size: 16pt; margin-bottom: 8px; }
  h2 { font-size: 13pt; margin-top: 28px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
  .info { margin: 4px 0; }
  .assinatura { margin-top: 60px; text-align: center; }
</style>
</head>
<body>
<h1>CONTRATO DE MATRÍCULA</h1>
<p style="text-align:center;color:#666;font-size:10pt;">11 Digital Strategy</p>

<h2>1. PARTES</h2>
<p class="info"><strong>Contratante:</strong> {{nome}}</p>
<p class="info"><strong>CPF:</strong> {{cpf}}</p>
<p class="info"><strong>Data de nascimento:</strong> {{data_nascimento}}</p>
<p class="info"><strong>Endereço:</strong> {{endereco}}{{cep_str}}</p>
<p class="info"><strong>Cidade/Estado:</strong> {{cidade_estado}}</p>
<p class="info"><strong>WhatsApp:</strong> {{whatsapp}}</p>
<p class="info"><strong>E-mail:</strong> {{email}}</p>

<h2>2. OBJETO</h2>
<p>O presente contrato tem como objeto a prestação de serviços de ensino no produto
<strong>{{produto}}</strong>, turma <strong>{{turma}}</strong>.</p>

<h2>3. CONDIÇÕES FINANCEIRAS</h2>
<p>Valor da mensalidade: <strong>R$ {{valor_mensalidade}}</strong><br>
Dia de vencimento: <strong>{{dia_vencimento}}</strong><br>
Total de parcelas: <strong>{{total_mensalidades}}</strong></p>

<h2>4. VIGÊNCIA</h2>
<p>O contrato inicia na data de assinatura e vigora pelo período das {{total_mensalidades}} mensalidades.</p>

<h2>5. DISPOSIÇÕES GERAIS</h2>
<p>O contratante declara ter lido e concordado com todas as cláusulas deste instrumento,
firmado eletronicamente com validade jurídica conforme a Lei nº 14.063/2020 e MP nº 2.200-2/2001.</p>

<div class="assinatura">
  <p>__________________________________________</p>
  <p><strong>{{nome}}</strong><br>CPF: {{cpf}}</p>
</div>
</body>
</html>`);
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
    const { aluno_id, cpf, data_nascimento, endereco, cep, cidade_estado } = body as {
      aluno_id: string;
      cpf: string;
      data_nascimento: string;
      endereco: string;
      cep?: string;
      cidade_estado: string;
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
        const cepStr = cep ? ` — CEP ${cep}` : '';
        const html = buildContratoHtml({
          nome:               aluno.nome ?? '',
          cpf,
          data_nascimento:    data_nascimento.split('-').reverse().join('/'),
          endereco,
          cep_str:            cepStr,
          cidade_estado,
          whatsapp:           aluno.whatsapp ?? '',
          email:              aluno.email ?? '',
          produto:            aluno.produto ?? aluno.turmas?.produto ?? '',
          turma:              aluno.turmas?.nome ?? '',
          valor_mensalidade:  String(Number(aluno.valor_mensalidade ?? 0).toFixed(2)),
          dia_vencimento:     String(aluno.dia_vencimento ?? ''),
          total_mensalidades: String(aluno.total_mensalidades ?? ''),
        });

        const result = await criarDocumentoAutentique(
          autentiqueToken,
          `Contrato de Matrícula — ${aluno.nome}`,
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
    if (linkAssinatura && aluno.whatsapp) {
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
