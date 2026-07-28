import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-key",
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
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.length === 11) return "55" + digits;
  if (digits.length === 10) return "55" + digits.slice(0, 2) + "9" + digits.slice(2);
  return digits;
}

// Erro "ambíguo": não sabemos se a Evolution API chegou a entregar a mensagem antes do
// timeout/erro de rede. Nunca reenviamos automaticamente em outra instância nem contamos
// isso como erro "normal" pro circuito de pausa — reenviar às cegas é o que causa disparos
// duplicados (mesmo princípio já usado em funil-processar/disparo-runner).
function isAmbiguousError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  return e.name === "TimeoutError" || e.name === "AbortError" || /timeout|timed out|network/i.test(e.message);
}

type EvoInstance = { id: string; api_url: string; api_key: string; instance_name: string };

// Fuso America/Sao_Paulo sem depender de libs externas
function saoPauloParts(d: Date): { dateStr: string; hour: number; minute: number; weekday: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short",
  }).formatToParts(d);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? "";
  return {
    dateStr: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    weekday: get("weekday"),
  };
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function toHM(hhmm: string): [number, number] {
  const [h, m] = hhmm.split(":").map(Number);
  return [h || 0, m || 0];
}

// Constrói um instante absoluto correspondente a HH:MM no fuso de São Paulo (fixo -03:00,
// sem DST) num dia específico (dateStr = "YYYY-MM-DD" já em data local de São Paulo).
function saoPauloDateAt(dateStr: string, hh: number, mm: number): Date {
  return new Date(`${dateStr}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00-03:00`);
}

function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function getAllActiveInstances(db: any): Promise<EvoInstance[]> {
  const { data } = await db
    .from("evolution_config")
    .select("id, api_url, api_key, instance_name")
    .eq("ativo", true)
    .order("prioridade", { ascending: true });
  return data ?? [];
}

// Resolução do número que atende a cobrança: rodízio fixado na config -> escolha feita
// na tela (evolution_task_config, task 'cobranca') -> todas as instâncias ativas por
// prioridade global. Sempre cai pro fallback se a escolha específica vier vazia.
async function resolveInstances(db: any, cfg: { evolution_config_ids?: string[] | null }): Promise<EvoInstance[]> {
  const all = await getAllActiveInstances(db);
  const byId = new Map(all.map((i: EvoInstance) => [i.id, i]));
  const fromIds = (ids: string[]) => ids.map(id => byId.get(id)).filter(Boolean) as EvoInstance[];

  if (cfg.evolution_config_ids?.length) {
    const scoped = fromIds(cfg.evolution_config_ids);
    if (scoped.length) return scoped;
  }

  const { data: taskCfg } = await db
    .from("evolution_task_config")
    .select("instance_ids")
    .eq("task", "cobranca")
    .maybeSingle();
  if (taskCfg?.instance_ids?.length) {
    const scoped = fromIds(taskCfg.instance_ids as string[]);
    if (scoped.length) return scoped;
  }

  return all;
}

// A Evolution API pode responder 200 mesmo com a sessão do WhatsApp fechada e só falhar
// silenciosamente na entrega — checa o estado real de conexão antes de usar a instância
// (mesmo mecanismo do disparo-runner).
async function getConnectedInstanceIds(instances: EvoInstance[]): Promise<Set<string>> {
  const connected = new Set<string>();
  await Promise.all(instances.map(async (inst) => {
    const rawBase = inst.api_url.replace(/\/$/, "");
    const base = /^https?:\/\//i.test(rawBase) ? rawBase : `https://${rawBase}`;
    try {
      const res = await fetch(`${base}/instance/connectionState/${encodeURIComponent(inst.instance_name)}`, {
        headers: { apikey: inst.api_key },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return;
      const data = await res.json() as { instance?: { state?: string } };
      if (data.instance?.state === "open") connected.add(inst.id);
    } catch (e: unknown) {
      console.warn(`enviar-cobranca: falha ao checar conexão de ${inst.instance_name}:`, (e as Error).message);
    }
  }));
  return connected;
}

async function sendViaEvolution(
  evoInstances: EvoInstance[],
  phone: string,
  message: string,
): Promise<{ ok: boolean; error?: string; ambiguous?: boolean }> {
  let lastError = "";
  for (const cfg of evoInstances) {
    const baseUrl = cfg.api_url.replace(/\/$/, "");
    const base = /^https?:\/\//i.test(baseUrl) ? baseUrl : `https://${baseUrl}`;
    const url = `${base}/message/sendText/${cfg.instance_name}`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": cfg.api_key },
        body: JSON.stringify({ number: formatPhone(phone), text: message, delay: 1000 }),
        signal: AbortSignal.timeout(30_000),
      });
      if (res.ok) return { ok: true };
      const body = await res.text();
      lastError = `[${cfg.instance_name}] ${res.status}: ${body.slice(0, 200)}`;
      console.warn(`enviar-cobranca: instância ${cfg.instance_name} falhou (${res.status}), tentando próxima...`);
    } catch (e: any) {
      lastError = `[${cfg.instance_name}] ${e?.message ?? "Erro de conexão"}`;
      if (isAmbiguousError(e)) {
        console.warn(`enviar-cobranca: ${cfg.instance_name} deu timeout (envio incerto), não tentando outra instância`);
        return { ok: false, error: lastError, ambiguous: true };
      }
      console.warn(`enviar-cobranca: instância ${cfg.instance_name} falhou, tentando próxima...`);
    }
  }
  return { ok: false, error: lastError || "Todas as instâncias Evolution falharam" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey     = Deno.env.get("SUPABASE_ANON_KEY")!;
  const cronSecret  = Deno.env.get("CRON_SECRET") ?? "enviar-cobranca-internal-2026";

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Body inválido" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const cronKeyHeader = req.headers.get("x-cron-key") ?? "";
  const isCron = cronKeyHeader === cronSecret;

  let userId: string | null = null;
  if (!isCron) {
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
    userId = authData.user.id;
  }

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (body.tick) {
    return await processarTick(db, corsHeaders);
  }

  if (body.status) {
    return await statusTick(db, corsHeaders);
  }

  if (body.bulk) {
    return await processarFilaAutomatica(db, userId, corsHeaders);
  }

  if (body.log_id) {
    const { data: cfg } = await db.from("cobranca_config").select("evolution_config_ids").eq("id", "default").single();
    const instances = await resolveInstances(db, cfg ?? {});
    return await enviarPorLogId(db, instances, body.log_id, userId, corsHeaders);
  }

  if (body.aluno_id && body.mensagem) {
    const { data: cfg } = await db.from("cobranca_config").select("evolution_config_ids").eq("id", "default").single();
    const instances = await resolveInstances(db, cfg ?? {});
    return await enviarManual(db, instances, body, userId, corsHeaders);
  }

  return new Response(JSON.stringify({ error: "Parâmetros inválidos" }), {
    status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

async function enviarPorLogId(db: any, evoInstances: EvoInstance[], logId: string, userId: string | null, cors: any) {
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

async function enviarManual(db: any, evoInstances: EvoInstance[], body: any, userId: string | null, cors: any) {
  const { aluno_id, pagamento_id, mensagem, template_nome, template_tipo, aluno_nome, telefone } = body;

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

// Determina, pra um item da fila, se existe template configurado pro offset dele e se
// aquela fase ainda não foi enviada -- mesma regra usada tanto no lote manual quanto no
// tique. pos_vencimento casa por FAIXA de dias (fase), não dia exato: 1-3, 4-7, 8-15,
// 16+ (aberta), pra ninguém ficar em limbo sem nunca bater um dia fixo configurado --
// isso também resolve sozinho o backlog de quem acumulou atraso enquanto a cobrança
// esteve parada. pre_vencimento/vencimento continuam por dia exato (evento de data
// futura conhecida, sem acúmulo possível).
async function proximoEnvioElegivel(
  db: any,
  fila: any[],
  templates: any[],
  cfg: any,
  hoje: string,
): Promise<{ item: any; template: any; mensagem: string } | null> {
  for (const item of fila) {
    const offset = item.dias_offset;
    let template = null;
    if (offset < 0 && cfg.enviar_pre_vencimento) {
      template = templates.find((t: any) => t.tipo === "pre_vencimento" && t.dias_offset === offset);
    } else if (offset === 0 && cfg.enviar_no_vencimento) {
      template = templates.find((t: any) => t.tipo === "vencimento" && t.dias_offset === 0);
    } else if (offset > 0 && cfg.enviar_pos_vencimento) {
      template = templates.find((t: any) =>
        t.tipo === "pos_vencimento" &&
        offset >= t.dias_offset &&
        (t.dias_offset_fim === null || t.dias_offset_fim === undefined || offset <= t.dias_offset_fim),
      );
    }
    if (!template) continue;

    // Dedupe por sempre (não só "hoje") -- uma fase de vários dias não pode repetir a
    // mesma mensagem em cada tique enquanto o pagamento permanecer nela.
    const { count } = await db
      .from("cobranca_logs")
      .select("id", { count: "exact", head: true })
      .eq("pagamento_id", item.pagamento_id)
      .eq("template_nome", template.nome)
      .eq("status", "enviado");
    if (count && count > 0) continue;

    const vencimento = new Date(item.data_vencimento).toLocaleDateString("pt-BR");
    const valor = Number(item.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
    const vars: Record<string, string | number | null> = {
      nome: item.aluno_nome, valor, parcela: item.parcela, vencimento,
      dias_atraso: offset > 0 ? offset : null,
      link_pagamento: item.link_pagamento || null,
    };
    return { item, template, mensagem: renderTemplate(template.mensagem, vars) };
  }
  return null;
}

// Modo tique: chamado a cada poucos minutos por um cron externo. Manda no máximo 1
// mensagem por chamada, só se estiver dentro do horário seguro, do limite diário, com
// instância conectada e sem estar em pausa por erro sequencial -- mesmo princípio do
// disparo-runner, adaptado pra fila recalculada a cada vez (quem paga no meio do dia some
// sozinho da fila, get_alunos_para_cobranca já é dinâmica).
async function processarTick(db: any, cors: any) {
  const json = (payload: any) => new Response(JSON.stringify(payload), { headers: { ...cors, "Content-Type": "application/json" } });

  const { data: cfg } = await db.from("cobranca_config").select("*").eq("id", "default").single();
  if (!cfg) return json({ ok: false, error: "cobranca_config não encontrada" });
  if (!cfg.ativo) return json({ ok: true, skipped: "inativo" });
  if (cfg.pausado_por_erro) return json({ ok: true, skipped: "pausado_por_erro" });

  const now = new Date();
  const sp = saoPauloParts(now);

  if (cfg.pausar_fins_semana && (sp.weekday === "Sat" || sp.weekday === "Sun")) {
    return json({ ok: true, skipped: "fim_de_semana" });
  }

  const nowMin    = sp.hour * 60 + sp.minute;
  const inicioMin = toMinutes(cfg.horario_inicio_envio || "09:00");
  const fimMin    = toMinutes(cfg.horario_fim_envio || "18:00");
  if (nowMin < inicioMin || nowMin >= fimMin) return json({ ok: true, skipped: "fora_do_horario" });

  let enviadosHoje = cfg.enviados_hoje;
  if (cfg.dia_contagem !== sp.dateStr) {
    enviadosHoje = 0;
    await db.from("cobranca_config").update({ enviados_hoje: 0, dia_contagem: sp.dateStr }).eq("id", "default");
  }
  if (enviadosHoje >= cfg.daily_limit) return json({ ok: true, skipped: "limite_diario" });

  if (cfg.ultimo_envio_em) {
    const elapsedS = (now.getTime() - new Date(cfg.ultimo_envio_em).getTime()) / 1000;
    const targetDelay = cfg.delay_min_s + Math.random() * (cfg.delay_max_s - cfg.delay_min_s);
    if (elapsedS < targetDelay) return json({ ok: true, skipped: "aguardando_delay" });
  }

  const { data: templates } = await db.from("cobranca_templates").select("*").eq("ativo", true).order("ordem");
  if (!templates?.length) return json({ ok: true, skipped: "sem_templates" });

  const { data: fila } = await db.rpc("get_alunos_para_cobranca", { p_data: sp.dateStr });
  if (!fila?.length) return json({ ok: true, enviados: 0 });

  const proximo = await proximoEnvioElegivel(db, fila, templates, cfg, sp.dateStr);
  if (!proximo) return json({ ok: true, enviados: 0 });

  const allInstances = await resolveInstances(db, cfg);
  const connectedIds = await getConnectedInstanceIds(allInstances);
  const connected = allInstances.filter(i => connectedIds.has(i.id));

  if (!connected.length) {
    const newErrors = (cfg.erros_seq ?? 0) + 1;
    await db.from("cobranca_config").update({
      erros_seq: newErrors,
      ...(newErrors >= cfg.max_errors_seq ? { pausado_por_erro: true, ativo: false } : {}),
    }).eq("id", "default");
    return json({ ok: false, error: "Nenhuma instância conectada disponível (sessão do WhatsApp fechada)" });
  }

  const { item, template, mensagem } = proximo;
  const { data: logRow } = await db.from("cobranca_logs").insert({
    aluno_id: item.aluno_id, pagamento_id: item.pagamento_id, aluno_nome: item.aluno_nome,
    telefone: item.telefone, mensagem, template_nome: template.nome, template_tipo: template.tipo,
    status: "pendente", manual: false, agendado_para: now.toISOString(),
  }).select("id").single();

  const result = await sendViaEvolution(connected, item.telefone, mensagem);

  await db.from("cobranca_logs").update({
    status: result.ok ? "enviado" : "erro",
    erro_msg: result.ok ? null : result.error,
    enviado_em: result.ok ? now.toISOString() : null,
  }).eq("id", logRow?.id);

  if (result.ok) {
    await db.from("cobranca_config").update({
      enviados_hoje: enviadosHoje + 1, erros_seq: 0, ultimo_envio_em: now.toISOString(),
    }).eq("id", "default");
    return json({ ok: true, enviados: 1 });
  }

  if (result.ambiguous) {
    // Envio incerto -- não conta pro circuito de pausa, mas marca o horário pra não
    // tentar de novo instantaneamente na próxima checagem.
    await db.from("cobranca_config").update({ ultimo_envio_em: now.toISOString() }).eq("id", "default");
    return json({ ok: false, ambiguous: true, error: result.error });
  }

  const newErrors = (cfg.erros_seq ?? 0) + 1;
  await db.from("cobranca_config").update({
    erros_seq: newErrors,
    ultimo_envio_em: now.toISOString(),
    ...(newErrors >= cfg.max_errors_seq ? { pausado_por_erro: true, ativo: false } : {}),
  }).eq("id", "default");

  return json({ ok: false, error: result.error });
}

// Modo status: mesmas checagens do tique (horário seguro, limite diário, fim de semana,
// delay desde o último envio, fila elegível), mas sem enviar nem gravar nada -- só pra
// tela mostrar quando o próximo disparo automático deve acontecer. Reaproveita
// proximoEnvioElegivel pra achar quem seria o próximo, garantindo que a tela nunca diga
// algo diferente do que o tique realmente faria.
async function statusTick(db: any, cors: any) {
  const json = (payload: any) => new Response(JSON.stringify(payload), { headers: { ...cors, "Content-Type": "application/json" } });

  const { data: cfg } = await db.from("cobranca_config").select("*").eq("id", "default").single();
  if (!cfg) return json({ estado: "sem_config" });

  const now = new Date();
  const sp = saoPauloParts(now);
  const [hInicio, mInicio] = toHM(cfg.horario_inicio_envio || "09:00");

  if (!cfg.ativo) return json({ estado: cfg.pausado_por_erro ? "pausado_erro" : "pausado_manual", erros_seq: cfg.erros_seq ?? 0 });

  if (cfg.pausar_fins_semana && (sp.weekday === "Sat" || sp.weekday === "Sun")) {
    const diasAteSegunda = sp.weekday === "Sat" ? 2 : 1;
    const proxima = saoPauloDateAt(addDaysStr(sp.dateStr, diasAteSegunda), hInicio, mInicio);
    return json({ estado: "fim_de_semana", proximo_em_s: Math.max(0, (proxima.getTime() - now.getTime()) / 1000) });
  }

  const nowMin    = sp.hour * 60 + sp.minute;
  const inicioMin = toMinutes(cfg.horario_inicio_envio || "09:00");
  const fimMin    = toMinutes(cfg.horario_fim_envio || "18:00");
  if (nowMin < inicioMin) {
    const proxima = saoPauloDateAt(sp.dateStr, hInicio, mInicio);
    return json({ estado: "fora_horario", proximo_em_s: Math.max(0, (proxima.getTime() - now.getTime()) / 1000) });
  }
  if (nowMin >= fimMin) {
    const proxima = saoPauloDateAt(addDaysStr(sp.dateStr, 1), hInicio, mInicio);
    return json({ estado: "fora_horario", proximo_em_s: Math.max(0, (proxima.getTime() - now.getTime()) / 1000) });
  }

  const enviadosHoje = cfg.dia_contagem === sp.dateStr ? (cfg.enviados_hoje ?? 0) : 0;
  if (enviadosHoje >= cfg.daily_limit) {
    const proxima = saoPauloDateAt(addDaysStr(sp.dateStr, 1), hInicio, mInicio);
    return json({ estado: "limite_diario", proximo_em_s: Math.max(0, (proxima.getTime() - now.getTime()) / 1000) });
  }

  const { data: templates } = await db.from("cobranca_templates").select("*").eq("ativo", true).order("ordem");
  if (!templates?.length) return json({ estado: "sem_templates" });

  const { data: fila } = await db.rpc("get_alunos_para_cobranca", { p_data: sp.dateStr });
  const proximo = fila?.length ? await proximoEnvioElegivel(db, fila, templates, cfg, sp.dateStr) : null;
  if (!proximo) return json({ estado: "sem_elegiveis", fila_total: fila?.length ?? 0 });

  if (cfg.ultimo_envio_em) {
    const elapsedS = (now.getTime() - new Date(cfg.ultimo_envio_em).getTime()) / 1000;
    if (elapsedS < cfg.delay_min_s) {
      return json({
        estado: "aguardando_delay",
        proximo_em_s: cfg.delay_min_s - elapsedS,
        proximo_em_s_max: cfg.delay_max_s - elapsedS,
        proximo_lead: proximo.item.aluno_nome,
        fila_total: fila.length,
      });
    }
  }

  return json({ estado: "pronto", proximo_lead: proximo.item.aluno_nome, fila_total: fila.length });
}

async function processarFilaAutomatica(db: any, userId: string | null, cors: any) {
  const { data: cfg } = await db.from("cobranca_config").select("*").eq("id", "default").single();

  if (!cfg?.ativo) {
    return new Response(JSON.stringify({ message: "Cobrança automática inativa", enviados: 0 }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const { data: templates } = await db.from("cobranca_templates").select("*").eq("ativo", true).order("ordem");
  if (!templates || templates.length === 0) {
    return new Response(JSON.stringify({ message: "Nenhum template ativo", enviados: 0 }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const hoje = new Date().toISOString().split("T")[0];
  const { data: elegiveis } = await db.rpc("get_alunos_para_cobranca", { p_data: hoje });
  if (!elegiveis || elegiveis.length === 0) {
    return new Response(JSON.stringify({ message: "Nenhum aluno elegível hoje", enviados: 0 }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const allInstances = await resolveInstances(db, cfg);
  const connectedIds = await getConnectedInstanceIds(allInstances);
  const connected = allInstances.filter((i: EvoInstance) => connectedIds.has(i.id));
  if (!connected.length) {
    return new Response(JSON.stringify({ error: "Nenhuma instância conectada disponível (sessão do WhatsApp fechada)" }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const now = new Date();
  const sp  = saoPauloParts(now);
  let enviadosHoje = cfg.dia_contagem === sp.dateStr ? (cfg.enviados_hoje ?? 0) : 0;

  let enviados = 0;
  let erros    = 0;
  let errosSeq = cfg.erros_seq ?? 0;
  const remaining = [...elegiveis];

  while (remaining.length && errosSeq < cfg.max_errors_seq && enviadosHoje < cfg.daily_limit) {
    const proximo = await proximoEnvioElegivel(db, remaining, templates, cfg, hoje);
    if (!proximo) break;

    // Remove o item processado da lista local pra não repeti-lo no próximo loop
    const idx = remaining.findIndex((r: any) => r.pagamento_id === proximo.item.pagamento_id);
    if (idx >= 0) remaining.splice(idx, 1);

    const { data: logRow } = await db.from("cobranca_logs").insert({
      aluno_id: proximo.item.aluno_id, pagamento_id: proximo.item.pagamento_id,
      aluno_nome: proximo.item.aluno_nome, telefone: proximo.item.telefone, mensagem: proximo.mensagem,
      template_nome: proximo.template.nome, template_tipo: proximo.template.tipo,
      status: "pendente", enviado_por: userId, manual: false, agendado_para: new Date().toISOString(),
    }).select("id").single();

    const result = await sendViaEvolution(connected, proximo.item.telefone, proximo.mensagem);

    await db.from("cobranca_logs").update({
      status: result.ok ? "enviado" : "erro",
      erro_msg: result.ok ? null : result.error,
      enviado_em: result.ok ? new Date().toISOString() : null,
    }).eq("id", logRow?.id);

    if (result.ok) { enviados++; enviadosHoje++; errosSeq = 0; } else if (!result.ambiguous) { erros++; errosSeq++; } else { erros++; }

    // O disparo manual roda dentro de uma única invocação da edge function, que tem um
    // teto de execução bem menor que os minutos de delay_min_s/delay_max_s configurados
    // pro anti-ban real (esse ritmo é responsabilidade do modo tick, chamado por um cron
    // externo). Aqui só um respiro curto pra não martelar a Evolution API -- delays longos
    // são ignorados nesse modo, senão a função morre no meio do sleep e trava o disparo
    // depois do primeiro envio.
    const delayS = Math.min(cfg.delay_min_s + Math.random() * (cfg.delay_max_s - cfg.delay_min_s), 5);
    await new Promise(r => setTimeout(r, delayS * 1000));
  }

  const pausou = errosSeq >= cfg.max_errors_seq;
  await db.from("cobranca_config").update({
    erros_seq: errosSeq,
    enviados_hoje: enviadosHoje,
    dia_contagem: sp.dateStr,
    // Só marca o horário do último envio se algo saiu de fato -- senão um "Disparar agora"
    // sem ninguém elegível bloquearia o próximo tique automático à toa pelo delay inteiro.
    ...(enviados > 0 ? { ultimo_envio_em: now.toISOString() } : {}),
    ...(pausou ? { pausado_por_erro: true, ativo: false } : {}),
  }).eq("id", "default");

  return new Response(JSON.stringify({ success: true, enviados, erros, pausou_por_erro: pausou }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
