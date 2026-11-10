import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Liberação de acesso individual à Área de Membros, acionada aluno por
// aluno (pedido do Pedro, 09/11/2026): ele revisa o financeiro na mão e
// manda nome/email de quem está realmente ativo, um por vez -- nunca em
// lote. Mesma lógica de membros-provisionar-acesso, mas pra 1 alunoId só,
// sem o filtro "ainda não liberado" (permite reenviar se precisar).

const PRODUTO_PARA_SLUG: Record<string, string> = {
  psicanalise: 'formacao-psicanalise',
  numerologia: 'mentoria-nps',
};
const PRODUTO_NOME: Record<string, string> = {
  psicanalise: 'Formação em Psicanálise',
  numerologia: 'Mentoria NPS',
};

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-key',
};

function respond(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function emailAcessoHtml(nome: string, email: string, loginUrl: string, produtoNome: string): string {
  const primeiroNome = (nome || '').trim().split(/\s+/)[0] || 'tudo bem';
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<title>Seu acesso chegou</title>
</head>
<body style="margin:0;padding:0;background-color:#0D1638;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Use este link para entrar na área de membros, sem precisar de senha.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0D1638" style="background-color:#0D1638;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
        <tr>
          <td align="center" style="padding:8px 0 24px 0;">
            <img src="https://www.idmpsi.com.br/despertamente-simbolo-branco.png" width="64" alt="Instituto Despertamente" style="display:block;border:0;height:auto;width:64px;">
            <div style="font-family:Georgia,'Times New Roman',serif;font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#FFB800;margin-top:14px;">Instituto Despertamente</div>
          </td>
        </tr>
        <tr>
          <td bgcolor="#F6F0E6" style="background-color:#F6F0E6;border-radius:20px;padding:40px 36px;font-family:Arial,Helvetica,sans-serif;">
            <div style="font-size:12px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:#B8860B;margin:0 0 12px 0;">Acesso à área de membros</div>
            <h1 style="margin:0 0 20px 0;font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:34px;color:#0D1638;font-weight:bold;">Seu acesso à ${produtoNome} chegou</h1>
            <p style="margin:0 0 16px 0;font-size:16px;line-height:26px;color:#3d4457;">Oi, ${primeiroNome}! Clique no botão abaixo para entrar direto na área de membros do Instituto Despertamente. Não precisa digitar senha.</p>
            <p style="margin:0 0 16px 0;font-size:16px;line-height:26px;color:#3d4457;">Este link é pessoal e de uso único — não compartilhe com ninguém.</p>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 24px 0;">
              <tr>
                <td align="center" bgcolor="#FFB800" style="background-color:#FFB800;border-radius:12px;">
                  <a href="${loginUrl}" target="_blank" style="display:inline-block;padding:16px 34px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:#0D1638;text-decoration:none;border-radius:12px;">Entrar na área de membros</a>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 8px 0;font-size:13px;line-height:20px;color:#6b7280;">Se o botão não funcionar, copie e cole este link no navegador:</p>
            <p style="margin:0 0 24px 0;font-size:12px;line-height:18px;color:#6b7280;word-break:break-all;"><a href="${loginUrl}" style="color:#6b7280;">${loginUrl}</a></p>
            <div style="border-top:1px solid #e3d9c6;padding-top:18px;font-size:13px;line-height:20px;color:#6b7280;">Não pediu este acesso? Pode ignorar este e-mail. Ninguém entra na sua conta sem clicar no link.</div>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:28px 12px 8px 12px;font-family:Arial,Helvetica,sans-serif;">
            <p style="margin:0 0 6px 0;font-size:13px;line-height:20px;color:#aab1c8;">Precisa de ajuda? Responda este e-mail ou fale com a nossa equipe.</p>
            <p style="margin:0 0 6px 0;font-size:12px;line-height:18px;color:#7f88a8;">Este e-mail foi enviado para ${email}.</p>
            <p style="margin:0;font-size:12px;line-height:18px;color:#7f88a8;">&copy; 2026 Instituto Despertamente &middot; <a href="https://www.idmpsi.com.br" style="color:#FFB800;text-decoration:none;">idmpsi.com.br</a></p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

async function notificarAcessoMembros(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  params: { email: string; nome: string; whatsapp?: string | null; loginUrl: string; produtoNome: string; enviarEmail: boolean; enviarWhatsapp: boolean },
) {
  const { email, nome, whatsapp, loginUrl, produtoNome, enviarEmail, enviarWhatsapp } = params;
  const siteUrl = 'https://www.idmpsi.com.br';
  const primeiroNome = (nome || '').trim().split(/\s+/)[0] || '';
  const resultado = { email: { ok: false as boolean, erro: undefined as string | undefined, pulado: undefined as boolean | undefined }, whatsapp: { ok: false as boolean, erro: undefined as string | undefined, pulado: undefined as boolean | undefined } };

  if (!enviarEmail) {
    resultado.email = { ok: false, erro: undefined, pulado: true };
  } else {
    try {
      const { data, error } = await supabase.functions.invoke('email-enviar', {
        body: {
          to: email,
          to_name: nome || undefined,
          subject: `Seu acesso à ${produtoNome} chegou — Instituto Despertamente`,
          html: emailAcessoHtml(nome, email, loginUrl, produtoNome),
        },
      });
      const erro = error?.message ?? (data as { error?: string } | null)?.error;
      resultado.email = erro ? { ok: false, erro, pulado: undefined } : { ok: true, erro: undefined, pulado: undefined };
    } catch (e) {
      resultado.email = { ok: false, erro: e instanceof Error ? e.message : 'erro inesperado', pulado: undefined };
    }
  }

  if (!enviarWhatsapp) {
    resultado.whatsapp = { ok: false, erro: undefined, pulado: true };
    return resultado;
  }

  if (!whatsapp) {
    resultado.whatsapp = { ok: false, erro: 'sem whatsapp cadastrado', pulado: true };
    return resultado;
  }

  try {
    const mensagem = `Oi${primeiroNome ? ', ' + primeiroNome : ''}! 💛\n\nSeu acesso à *${produtoNome}* já está liberado. Te mandamos um e-mail em *${email}* com o link direto pra entrar na área de membros — é só clicar, não precisa de senha.\n\nNão achou o e-mail? Olha também a caixa de spam/promoções. Login direto: ${siteUrl}/login`;
    // Pedido do Pedro (09/11/2026): aviso de acesso liberado sai pelo
    // número do financeiro, igual cobrança/pagamento/contrato -- não pelo
    // pool genérico. Mesmo padrão de supabase/functions/enviar-cobranca.
    const financeiroKey = Deno.env.get('FINANCEIRO_INSTANCE_KEY') ?? 'financeiro-only-idm-2026';
    const { data, error } = await supabase.functions.invoke('wpp-enviar', {
      body: { numero: whatsapp, mensagem, instance_name: 'Financeiro IDM', typing_delay_ms: 1000 },
      headers: { 'x-financeiro-key': financeiroKey },
    });
    const erro = error?.message ?? (data as { ok?: boolean; error?: string } | null)?.error;
    resultado.whatsapp = (!data?.ok && erro) ? { ok: false, erro, pulado: undefined } : { ok: true, erro: undefined, pulado: undefined };
  } catch (e) {
    resultado.whatsapp = { ok: false, erro: e instanceof Error ? e.message : 'erro inesperado', pulado: undefined };
  }

  return resultado;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const chaveEsperada = Deno.env.get('MEMBROS_LIBERAR_KEY');
    const chaveRecebida = req.headers.get('x-cron-key');
    if (!chaveEsperada || chaveRecebida !== chaveEsperada) {
      return respond(401, { error: 'Unauthorized' });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { alunoId, enviarEmail = true, enviarWhatsapp = true } = await req.json();
    if (!alunoId || typeof alunoId !== 'string') {
      return respond(400, { error: 'alunoId é obrigatório' });
    }

    const areaMembrosUrl = Deno.env.get('AREA_MEMBROS_URL');
    const areaMembrosKey = Deno.env.get('AREA_MEMBROS_API_KEY');
    if (!areaMembrosUrl || !areaMembrosKey) {
      return respond(500, { error: 'Integração com a Área de Membros não configurada (faltam secrets AREA_MEMBROS_URL/AREA_MEMBROS_API_KEY)' });
    }

    // Nota (09/11/2026): o email/whatsapp/nome que valem pra área de membros
    // são os da própria linha de `alunos` (o que a tela de Financeiro edita
    // e mostra) -- `pessoas.email` pode estar vazio mesmo com o aluno tendo
    // email cadastrado há tempos; não ler de lá.
    const { data: aluno, error: alunoError } = await supabase
      .from('alunos')
      .select('id, pessoa_id, produto, turma_id, status, acesso_membros_liberado_em, nome, email, whatsapp, turmas:turma_id (nome)')
      .eq('id', alunoId)
      .maybeSingle();

    if (alunoError) return respond(500, { error: `Erro ao buscar aluno: ${alunoError.message}` });
    if (!aluno) return respond(404, { error: 'Aluno não encontrado' });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const turma = aluno.turmas as any;
    const produtoSlug = PRODUTO_PARA_SLUG[aluno.produto as string];
    const nome = aluno.nome as string;
    const email = aluno.email as string | null;
    const whatsapp = aluno.whatsapp as string | null;

    if (!produtoSlug) return respond(422, { error: `Produto '${aluno.produto}' não tem Área de Membros mapeada ainda` });
    if (!email) return respond(422, { error: 'Aluno sem email cadastrado — preencha o email antes de liberar o acesso' });

    const base = areaMembrosUrl.replace(/\/$/, '');
    const resp = await fetch(`${base}/api/liberar-acesso`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${areaMembrosKey}` },
      body: JSON.stringify({
        email,
        nome,
        whatsapp: whatsapp ?? undefined,
        produtoSlug,
        turmaCrmId: aluno.turma_id ?? undefined,
        turmaCrmNome: turma?.nome ?? undefined,
        crmPessoaId: aluno.pessoa_id,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    const data = await resp.json().catch(() => ({} as Record<string, unknown>));
    if (!resp.ok || !data?.loginUrl) {
      return respond(502, { error: (data as { error?: string })?.error || `Falha ao liberar acesso na Área de Membros (HTTP ${resp.status})` });
    }

    const loginUrl = data.loginUrl as string;
    const { error: updateError } = await supabase
      .from('alunos')
      .update({ acesso_membros_url: loginUrl, acesso_membros_liberado_em: new Date().toISOString() })
      .eq('id', aluno.id as string);
    if (updateError) return respond(500, { error: `Acesso liberado, mas falhou ao salvar: ${updateError.message}` });

    const notificacao = await notificarAcessoMembros(supabase, {
      email,
      nome,
      whatsapp,
      loginUrl,
      produtoNome: PRODUTO_NOME[aluno.produto as string] ?? 'Área de Membros',
      enviarEmail: enviarEmail !== false,
      enviarWhatsapp: enviarWhatsapp !== false,
    });

    return respond(200, {
      aluno: { id: aluno.id, nome, email, produto: aluno.produto },
      loginUrl,
      notificacao,
    });
  } catch (err) {
    return respond(500, { error: err instanceof Error ? err.message : 'Erro inesperado' });
  }
});
