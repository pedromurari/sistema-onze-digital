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

// Opt-out global (mesma chave normalizada usada em evo-resposta/disparo-runner/
// funil-processar: sem DDI 55, 11 digitos).
function toOptOutKey(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if ((d.length === 13 || d.length === 12) && d.startsWith("55")) return d.slice(2);
  return d.slice(-11);
}

async function estaOptOut(db: any, phone: string): Promise<boolean> {
  const { data } = await db
    .from("whatsapp_opt_out")
    .select("telefone")
    .eq("telefone", toOptOutKey(phone))
    .maybeSingle();
  return Boolean(data);
}

async function sendViaEvolution(
  db: any,
  evoInstances: EvoInstance[],
  phone: string,
  message: string,
): Promise<{ ok: boolean; error?: string; ambiguous?: boolean }> {
  if (await estaOptOut(db, phone)) {
    return { ok: false, error: "Opt-out: destinatário pediu pra parar de receber mensagem" };
  }
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

  const result = await sendViaEvolution(db, evoInstances, log.telefone, log.mensagem);

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

// Envio manual a partir do card do aluno: quando a mensagem cobre várias parcelas
// (aluno com 2+ parcelas em aberto), o frontend já resolveu qual template casa com a
// fase de cada pagamento (mesma lógica de resolveTemplateParaItem, espelhada em
// templateParaOffset no Cobranca.tsx) e manda em `cobertura`. Cada pagamento precisa do
// seu próprio template_id pra a linha de log dele valer como "essa fase foi enviada" no
// índice único -- não dá pra gravar todas as linhas com o template que o operador editou
// na tela, senão o dedupe por fase de cada parcela individual quebra.
async function enviarManual(db: any, evoInstances: EvoInstance[], body: any, userId: string | null, cors: any) {
  const { aluno_id, pagamento_id, cobertura, mensagem, template_nome, template_tipo, template_id, aluno_nome, telefone } = body;

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

  const cobrindoVarias: { pagamento_id: string; template_id: string | null }[] =
    Array.isArray(cobertura) && cobertura.length
      ? cobertura
      : [{ pagamento_id: pagamento_id || null, template_id: template_id || null }];

  const grupoEnvioId = cobrindoVarias.length > 1 ? crypto.randomUUID() : null;

  const { data: logRows, error: insertErr } = await db.from("cobranca_logs").insert(
    cobrindoVarias.map(c => ({
      aluno_id,
      pagamento_id: c.pagamento_id,
      aluno_nome: nome || "Aluno",
      telefone: phone,
      mensagem,
      template_nome: template_nome || "Manual",
      template_tipo: template_tipo || null,
      template_id: c.template_id,
      status: "pendente",
      enviado_por: userId,
      manual: true,
      agendado_para: new Date().toISOString(),
      grupo_envio_id: grupoEnvioId,
    })),
  ).select("id");

  // Índice único (pagamento_id, template_id) barrou pelo menos uma dessas fases -- outro
  // envio (automático ou manual) já reservou/mandou a mesma janela pra alguma parcela
  // dessa leva. Não manda nada pra não duplicar metade da dívida numa mensagem e a outra
  // metade depois.
  if (insertErr) {
    const jaReservado = insertErr.code === "23505";
    return new Response(JSON.stringify({
      error: jaReservado
        ? "Essa cobrança (ou parte dela) já foi enviada por outro processo nesse meio tempo -- atualize a fila."
        : insertErr.message,
    }), { status: jaReservado ? 409 : 500, headers: { ...cors, "Content-Type": "application/json" } });
  }

  const result = await sendViaEvolution(db, evoInstances, phone, mensagem);
  const logIds = (logRows as any[]).map(r => r.id);

  await db.from("cobranca_logs").update({
    status: result.ok ? "enviado" : "erro",
    erro_msg: result.ok ? null : result.error,
    enviado_em: result.ok ? new Date().toISOString() : null,
  }).in("id", logIds);

  return new Response(JSON.stringify({ success: result.ok, error: result.error }), {
    status: result.ok ? 200 : 502,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// Acha, pra um item da fila, o template configurado pro offset dele -- mesma regra de
// sempre. pos_vencimento casa por FAIXA de dias (fase), não dia exato: 1-3, 4-7, 8-15,
// 16+ (aberta), pra ninguém ficar em limbo sem nunca bater um dia fixo configurado --
// isso também resolve sozinho o backlog de quem acumulou atraso enquanto a cobrança
// esteve parada. pre_vencimento/vencimento continuam por dia exato (evento de data
// futura conhecida, sem acúmulo possível).
function resolveTemplateParaItem(item: any, templates: any[], cfg: any): any | null {
  const offset = item.dias_offset;
  if (offset < 0 && cfg.enviar_pre_vencimento) {
    return templates.find((t: any) => t.tipo === "pre_vencimento" && t.dias_offset === offset) ?? null;
  }
  if (offset === 0 && cfg.enviar_no_vencimento) {
    return templates.find((t: any) => t.tipo === "vencimento" && t.dias_offset === 0) ?? null;
  }
  if (offset > 0 && cfg.enviar_pos_vencimento) {
    return templates.find((t: any) =>
      t.tipo === "pos_vencimento" &&
      offset >= t.dias_offset &&
      (t.dias_offset_fim === null || t.dias_offset_fim === undefined || offset <= t.dias_offset_fim),
    ) ?? null;
  }
  return null;
}

async function jaEnviadoNestaFase(db: any, pagamentoId: string, templateId: string): Promise<boolean> {
  // Casa por template_id (estável), não template_nome (texto) -- renomear um template
  // não pode fazer o sistema "esquecer" que já mandou aquela fase e reenviar duplicado.
  const { count } = await db
    .from("cobranca_logs")
    .select("id", { count: "exact", head: true })
    .eq("pagamento_id", pagamentoId)
    .eq("template_id", templateId)
    .eq("status", "enviado");
  return Boolean(count && count > 0);
}

interface GrupoElegivel {
  aluno_id: string;
  aluno_nome: string;
  telefone: string;
  mensagem: string;
  cobertura: { pagamento_id: string; template_id: string; template_nome: string; template_tipo: string }[];
}

// Um aluno com 2+ parcelas em aberto recebia 1 mensagem por parcela -- spam, e os
// templates só falam de "sua parcela" no singular. Agrupa a fila por aluno e manda 1
// mensagem só cobrindo tudo que está em aberto, usando o tom da parcela mais crítica
// (mais dias de atraso) como base. `qtd_parcelas`/`total_devido`/`lista_parcelas` sempre
// refletem TODAS as parcelas em aberto do aluno (não só as elegíveis dessa rodada), pra
// mensagem nunca subestimar a dívida real. `cobertura` marca como enviada a fase de CADA
// parcela elegível dessa rodada (não só a crítica) -- senão uma parcela que não era a
// "mais crítica" dessa vez nunca marcaria sua própria fase como enviada e voltaria a
// disparar de novo depois, mesmo já tendo sido citada na mensagem.
function proximoGrupoElegivel(fila: any[], templates: any[], cfg: any, jaEnviado: Map<string, boolean>): GrupoElegivel | null {
  const porAluno = new Map<string, any[]>();
  for (const item of fila) {
    if (!porAluno.has(item.aluno_id)) porAluno.set(item.aluno_id, []);
    porAluno.get(item.aluno_id)!.push(item);
  }

  for (const [, itens] of porAluno) {
    const resolvidos = itens
      .map(item => ({ item, template: resolveTemplateParaItem(item, templates, cfg) }))
      .filter(r => r.template);
    if (!resolvidos.length) continue;

    const elegiveis = resolvidos.filter(r => !jaEnviado.get(`${r.item.pagamento_id}:${r.template.id}`));
    if (!elegiveis.length) continue;

    elegiveis.sort((a, b) => b.item.dias_offset - a.item.dias_offset);
    const critica = elegiveis[0];

    const outras = itens.filter(i => i.pagamento_id !== critica.item.pagamento_id);
    const qtdParcelas = itens.length;
    const totalDevido = itens.reduce((s, i) => s + Number(i.valor), 0);
    const listaParcelas = outras
      .map(i => `• Parcela ${i.parcela} — R$ ${Number(i.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} (venc. ${new Date(i.data_vencimento).toLocaleDateString("pt-BR")})`)
      .join("\n");

    const vencimento = new Date(critica.item.data_vencimento).toLocaleDateString("pt-BR");
    const valor = Number(critica.item.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
    const vars: Record<string, string | number | null> = {
      nome: critica.item.aluno_nome, valor, parcela: critica.item.parcela, vencimento,
      dias_atraso: critica.item.dias_offset > 0 ? critica.item.dias_offset : null,
      link_pagamento: critica.item.link_pagamento || null,
      qtd_parcelas: qtdParcelas,
      total_devido: totalDevido.toLocaleString("pt-BR", { minimumFractionDigits: 2 }),
      lista_parcelas: listaParcelas || null,
      multiplas: qtdParcelas > 1,
    };

    return {
      aluno_id: critica.item.aluno_id,
      aluno_nome: critica.item.aluno_nome,
      telefone: critica.item.telefone,
      mensagem: renderTemplate(critica.template.mensagem, vars),
      cobertura: elegiveis.map(e => ({
        pagamento_id: e.item.pagamento_id,
        template_id: e.template.id,
        template_nome: e.template.nome,
        template_tipo: e.template.tipo,
      })),
    };
  }
  return null;
}

// Pré-calcula, pra cada (pagamento_id, template_id) que aparece na fila, se aquela fase já
// foi enviada -- feito à parte (função async) porque proximoGrupoElegivel precisa ser
// síncrona pra poder ser chamada várias vezes em memória dentro do loop do disparo em
// lote sem depender de round-trip no banco a cada tentativa.
async function calcularElegibilidade(db: any, fila: any[], templates: any[], cfg: any): Promise<Map<string, boolean>> {
  const resolvidos = fila
    .map(item => ({ item, template: resolveTemplateParaItem(item, templates, cfg) }))
    .filter(r => r.template);
  const mapa = new Map<string, boolean>();
  await Promise.all(resolvidos.map(async r => {
    mapa.set(`${r.item.pagamento_id}:${r.template.id}`, await jaEnviadoNestaFase(db, r.item.pagamento_id, r.template.id));
  }));
  return mapa;
}

// Reserva atomicamente a fase de cada pagamento coberto pela mensagem (1 INSERT
// multi-linha só -- se qualquer linha colidir com o índice único
// ux_cobranca_logs_pagamento_template_ativo, o INSERT inteiro falha e nenhuma linha entra,
// então não manda a mensagem). Isso fecha a race que causava duplicidade: antes a
// checagem "já enviei essa fase" e o INSERT eram dois passos separados, e dois processos
// concorrentes (tique automático + "Disparar agora" manual, ou dois tiques sobrepostos)
// podiam os dois passar pela checagem antes de qualquer um gravar.
async function reservarGrupo(db: any, grupo: GrupoElegivel, now: Date, userId: string | null = null): Promise<{ ok: true; logIds: string[] } | { ok: false; colisao: boolean; error?: string }> {
  const grupoEnvioId = grupo.cobertura.length > 1 ? crypto.randomUUID() : null;
  const { data: logRows, error } = await db.from("cobranca_logs").insert(
    grupo.cobertura.map(c => ({
      aluno_id: grupo.aluno_id,
      pagamento_id: c.pagamento_id,
      aluno_nome: grupo.aluno_nome,
      telefone: grupo.telefone,
      mensagem: grupo.mensagem,
      template_nome: c.template_nome,
      template_tipo: c.template_tipo,
      template_id: c.template_id,
      status: "pendente",
      manual: false,
      enviado_por: userId,
      agendado_para: now.toISOString(),
      grupo_envio_id: grupoEnvioId,
    })),
  ).select("id");

  if (error) return { ok: false, colisao: error.code === "23505", error: error.message };
  return { ok: true, logIds: (logRows as any[]).map(r => r.id) };
}

// A automação se desliga sozinha (pausado_por_erro) quando bate o limite de erros
// sequenciais ou fica sem instância conectada -- antes disso só aparecia como banner na
// tela de Cobrança, então se ninguém estivesse olhando a fila simplesmente parava de
// andar sem avisar ninguém. Chamado só no momento em que a pausa acontece de fato (não a
// cada erro individual), pra não gerar 1 notificação por tentativa antes do limite.
async function notificarCobrancaPausada(db: any, motivo: string): Promise<void> {
  await db.rpc("notificar_admins", {
    p_tipo: "cobranca_pausada",
    p_titulo: "Cobrança automática pausada",
    p_descricao: motivo,
    p_link: "/cobranca",
  });
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

  const jaEnviado = await calcularElegibilidade(db, fila, templates, cfg);
  const proximo = proximoGrupoElegivel(fila, templates, cfg, jaEnviado);
  if (!proximo) return json({ ok: true, enviados: 0 });

  const allInstances = await resolveInstances(db, cfg);
  const connectedIds = await getConnectedInstanceIds(allInstances);
  const connected = allInstances.filter(i => connectedIds.has(i.id));

  if (!connected.length) {
    const newErrors = (cfg.erros_seq ?? 0) + 1;
    const pausou = newErrors >= cfg.max_errors_seq;
    await db.from("cobranca_config").update({
      erros_seq: newErrors,
      ...(pausou ? { pausado_por_erro: true, ativo: false } : {}),
    }).eq("id", "default");
    if (pausou) await notificarCobrancaPausada(db, "Nenhuma instância de WhatsApp conectada -- sessão pode ter caído.");
    return json({ ok: false, error: "Nenhuma instância conectada disponível (sessão do WhatsApp fechada)" });
  }

  const reserva = await reservarGrupo(db, proximo, now);
  if (!reserva.ok) {
    // Colisão com outro processo (outro tique ou um "Disparar agora" manual) reservando a
    // mesma fase quase ao mesmo tempo -- não é erro de envio, só desiste dessa rodada; a
    // fila é recalculada do zero no próximo tique.
    return json({ ok: reserva.colisao, enviados: 0, colisao: reserva.colisao, error: reserva.error });
  }

  const result = await sendViaEvolution(db, connected, proximo.telefone, proximo.mensagem);

  await db.from("cobranca_logs").update({
    status: result.ok ? "enviado" : "erro",
    erro_msg: result.ok ? null : result.error,
    enviado_em: result.ok ? now.toISOString() : null,
  }).in("id", reserva.logIds);

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
  const pausou = newErrors >= cfg.max_errors_seq;
  await db.from("cobranca_config").update({
    erros_seq: newErrors,
    ultimo_envio_em: now.toISOString(),
    ...(pausou ? { pausado_por_erro: true, ativo: false } : {}),
  }).eq("id", "default");
  if (pausou) await notificarCobrancaPausada(db, `${newErrors} erros seguidos ao enviar -- último: ${result.error ?? "desconhecido"}`);

  return json({ ok: false, error: result.error });
}

// Modo status: mesmas checagens do tique (horário seguro, limite diário, fim de semana,
// delay desde o último envio, fila elegível), mas sem enviar nem gravar nada -- só pra
// tela mostrar quando o próximo disparo automático deve acontecer. Reaproveita
// proximoGrupoElegivel pra achar quem seria o próximo, garantindo que a tela nunca diga
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
  const alunosNaFila = fila?.length ? new Set(fila.map((f: any) => f.aluno_id)).size : 0;
  const jaEnviado = fila?.length ? await calcularElegibilidade(db, fila, templates, cfg) : new Map<string, boolean>();
  const proximo = fila?.length ? proximoGrupoElegivel(fila, templates, cfg, jaEnviado) : null;
  if (!proximo) return json({ estado: "sem_elegiveis", fila_total: alunosNaFila });

  if (cfg.ultimo_envio_em) {
    const elapsedS = (now.getTime() - new Date(cfg.ultimo_envio_em).getTime()) / 1000;
    if (elapsedS < cfg.delay_min_s) {
      return json({
        estado: "aguardando_delay",
        proximo_em_s: cfg.delay_min_s - elapsedS,
        proximo_em_s_max: cfg.delay_max_s - elapsedS,
        proximo_lead: proximo.aluno_nome,
        fila_total: alunosNaFila,
      });
    }
  }

  return json({ estado: "pronto", proximo_lead: proximo.aluno_nome, fila_total: alunosNaFila });
}

