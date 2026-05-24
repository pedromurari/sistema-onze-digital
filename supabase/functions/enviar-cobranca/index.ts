import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Renderiza um template substituindo variáveis {{chave}} e blocos {{#chave}}...{{/chave}}
function renderTemplate(template: string, vars: Record<string, string | number | null>): string {
  let result = template;

  // Blocos condicionais {{#key}}...{{/key}} — remove se valor falsy
  result = result.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, key, content) => {
    const val = vars[key];
    return val ? content : "";
  });

  // Variáveis simples {{key}}
  result = result.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = vars[key];
    return val !== null && val !== undefined ? String(val) : "";
  });

  return result.trim();
}

// Formata número de telefone para padrão Evolution API: apenas dígitos + código país
function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  // Se já começa com 55 e tem 12-13 dígitos, está ok
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  // Se tem 11 dígitos (BR sem código país), adiciona 55
  if (digits.length === 11) return "55" + digits;
  // Se tem 10 dígitos (sem 9 na frente), adiciona 55 e 9
  if (digits.length === 10) return "55" + digits.slice(0, 2) + "9" + digits.slice(2);
  return digits;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey     = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Autenticação do chamador
  const authHeader = req.headers.get("Authorization") ?? "";
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: authData, error: authErr } = await callerClient.auth.getUser();
  if (authErr || !authData?.user) {
    return new Response(JSON.stringify({ error: "Não autenticado" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userId = authData.user.id;

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Buscar instâncias Evolution ativas em ordem de prioridade
  const { data: evoInstances, error: evoErr } = await db
    .from("evolution_config")
    .select("api_url, api_key, instance_name")
    .eq("ativo", true)
    .order("prioridade", { ascending: true });

  if (evoErr || !evoInstances?.length) {
    return new Response(JSON.stringify({ error: "Nenhuma instância Evolution ativa configurada" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Body inválido" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Modo 1: envio manual de mensagem avulsa (log_id fornecido)
  // Modo 2: envio em lote pela fila automática (bulk: true)
  // Modo 3: envio de mensagem direta (aluno_id + mensagem direta)

  if (body.log_id) {
    return await enviarPorLogId(db, evoInstances, body.log_id, userId, corsHeaders);
  }

  if (body.bulk) {
    return await processarFilaAutomatica(db, evoInstances, userId, corsHeaders);
  }

  if (body.aluno_id && body.mensagem) {
    return await enviarManual(db, evoInstances, body, userId, corsHeaders);
  }

  return new Response(JSON.stringify({ error: "Parâmetros inválidos" }), {
    status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

async function sendViaEvolution(
  evoInstances: Array<{ api_url: string; api_key: string; instance_name: string }>,
  phone: string,
  message: string,
): Promise<{ ok: boolean; error?: string }> {
  let lastError = "";
  for (const cfg of evoInstances) {
    const baseUrl = cfg.api_url.replace(/\/$/, "");
    const url = `${baseUrl}/message/sendText/${cfg.instance_name}`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": cfg.api_key },
        body: JSON.stringify({ number: formatPhone(phone), text: message, delay: 1000 }),
      });
      if (res.ok) return { ok: true };
      const body = await res.text();
      lastError = `[${cfg.instance_name}] ${res.status}: ${body.slice(0, 200)}`;
      console.warn(`enviar-cobranca: instância ${cfg.instance_name} falhou (${res.status}), tentando próxima...`);
    } catch (e: any) {
      lastError = `[${cfg.instance_name}] ${e?.message ?? "Erro de conexão"}`;
      console.warn(`enviar-cobranca: instância ${cfg.instance_name} falhou, tentando próxima...`);
    }
  }
  return { ok: false, error: lastError || "Todas as instâncias Evolution falharam" };
}

async function enviarPorLogId(db: any, evoInstances: any[], logId: string, userId: string, cors: any) {
  const { data: log, error: logErr } = await db
    .from("cobranca_logs")
    .select("*")
    .eq("id", logId)
    .single();

  if (logErr || !log) {
    return new Response(JSON.stringify({ error: "Log não encontrado" }), {
      status: 404, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const result = await sendViaEvolution(evoInstances, log.telefone, log.mensagem);

  await db.from("cobranca_logs").update({
    status: result.ok ? "enviado" : "erro",
    erro_msg: result.ok ? null : result.error,
    enviado_em: result.ok ? new Date().toISOString() : null,
    enviado_por: userId,
  }).eq("id", logId);

  return new Response(JSON.stringify({ success: result.ok, error: result.error }), {
    status: result.ok ? 200 : 502,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

async function enviarManual(db: any, evoInstances: any[], body: any, userId: string, cors: any) {
  const { aluno_id, pagamento_id, mensagem, template_nome, template_tipo, aluno_nome, telefone } = body;

  // Busca dados do aluno se não fornecido
  let phone = telefone;
  let nome  = aluno_nome;
  if (!phone || !nome) {
    const { data: aluno } = await db
      .from("alunos")
      .select("nome, whatsapp, cobranca_telefone")
      .eq("id", aluno_id)
      .single();
    if (aluno) {
      phone = phone || aluno.cobranca_telefone || aluno.whatsapp;
      nome  = nome  || aluno.nome;
    }
  }

  if (!phone) {
    return new Response(JSON.stringify({ error: "Telefone não encontrado para este aluno" }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Cria log
  const { data: logRow } = await db.from("cobranca_logs").insert({
    aluno_id,
    pagamento_id: pagamento_id || null,
    aluno_nome: nome || "Aluno",
    telefone: phone,
    mensagem,
    template_nome: template_nome || "Manual",
    template_tipo: template_tipo || null,
    status: "pendente",
    enviado_por: userId,
    manual: true,
    agendado_para: new Date().toISOString(),
  }).select("id").single();

  const result = await sendViaEvolution(evoInstances, phone, mensagem);

  await db.from("cobranca_logs").update({
    status: result.ok ? "enviado" : "erro",
    erro_msg: result.ok ? null : result.error,
    enviado_em: result.ok ? new Date().toISOString() : null,
  }).eq("id", logRow?.id);

  return new Response(JSON.stringify({ success: result.ok, error: result.error }), {
    status: result.ok ? 200 : 502,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

async function processarFilaAutomatica(db: any, evoInstances: any[], userId: string, cors: any) {
  // Buscar config de cobrança
  const { data: cfg } = await db
    .from("cobranca_config")
    .select("*")
    .eq("id", "default")
    .single();

  if (!cfg?.ativo) {
    return new Response(JSON.stringify({ message: "Cobrança automática inativa", enviados: 0 }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Buscar templates ativos
  const { data: templates } = await db
    .from("cobranca_templates")
    .select("*")
    .eq("ativo", true)
    .order("ordem");

  if (!templates || templates.length === 0) {
    return new Response(JSON.stringify({ message: "Nenhum template ativo", enviados: 0 }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const hoje = new Date().toISOString().split("T")[0];

  // Buscar alunos elegíveis
  const { data: elegíveis } = await db.rpc("get_alunos_para_cobranca", { p_data: hoje });

  if (!elegíveis || elegíveis.length === 0) {
    return new Response(JSON.stringify({ message: "Nenhum aluno elegível hoje", enviados: 0 }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  let enviados = 0;
  let erros    = 0;

  for (const item of elegíveis) {
    const offset = item.dias_offset; // negativo = antes, 0 = no dia, positivo = depois

    // Verificar se há template para este offset
    let template = null;
    if (offset < 0 && cfg.enviar_pre_vencimento) {
      // Pré-vencimento: offset negativo, ex: -3, -1
      template = templates.find(
        (t: any) => t.tipo === "pre_vencimento" && t.dias_offset === offset
      );
    } else if (offset === 0 && cfg.enviar_no_vencimento) {
      template = templates.find((t: any) => t.tipo === "vencimento" && t.dias_offset === 0);
    } else if (offset > 0 && cfg.enviar_pos_vencimento) {
      template = templates.find(
        (t: any) => t.tipo === "pos_vencimento" && t.dias_offset === offset
      );
    }

    if (!template) continue;

    // Verificar se já foi enviado hoje para este pagamento + template
    const { count } = await db
      .from("cobranca_logs")
      .select("id", { count: "exact", head: true })
      .eq("pagamento_id", item.pagamento_id)
      .eq("template_nome", template.nome)
      .gte("created_at", hoje)
      .eq("status", "enviado");

    if (count && count > 0) continue; // já enviou hoje

    const vencimento = new Date(item.data_vencimento).toLocaleDateString("pt-BR");
    const valor = Number(item.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 });

    const vars: Record<string, string | number | null> = {
      nome: item.aluno_nome,
      valor,
      parcela: item.parcela,
      vencimento,
      dias_atraso: offset > 0 ? offset : null,
      link_pagamento: item.link_pagamento || null,
    };

    const mensagem = renderTemplate(template.mensagem, vars);

    // Inserir log
    const { data: logRow } = await db.from("cobranca_logs").insert({
      aluno_id:      item.aluno_id,
      pagamento_id:  item.pagamento_id,
      aluno_nome:    item.aluno_nome,
      telefone:      item.telefone,
      mensagem,
      template_nome: template.nome,
      template_tipo: template.tipo,
      status:        "pendente",
      enviado_por:   userId,
      manual:        false,
      agendado_para: new Date().toISOString(),
    }).select("id").single();

    const result = await sendViaEvolution(evoInstances, item.telefone, mensagem);

    await db.from("cobranca_logs").update({
      status:    result.ok ? "enviado" : "erro",
      erro_msg:  result.ok ? null : result.error,
      enviado_em: result.ok ? new Date().toISOString() : null,
    }).eq("id", logRow?.id);

    if (result.ok) enviados++; else erros++;

    // Pequena pausa para não sobrecarregar a API
    await new Promise(r => setTimeout(r, 800));
  }

  return new Response(JSON.stringify({ success: true, enviados, erros }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
