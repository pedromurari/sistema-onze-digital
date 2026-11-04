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

// Base: feriados nacionais + feriados da sede em São Paulo/SP.
// Carnaval é ponto facultativo, não feriado. Outros feriados locais entram
// em cobranca_feriados sem precisar de novo deploy.
function ehFeriadoNacional(dateStr: string): boolean {
  const [ano, mes, dia] = dateStr.split('-').map(Number);
  const fixos = new Set(['01-01', '01-25', '04-21', '05-01', '07-09', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25']);
  if (fixos.has(dateStr.slice(5))) return true;
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = ((32 + 2 * e + 2 * i - h - k) % 7 + 7) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const pascoaMes = Math.floor((h + l - 7 * m + 114) / 31);
  const pascoaDia = ((h + l - 7 * m + 114) % 31) + 1;
  const sextaSanta = new Date(Date.UTC(ano, pascoaMes - 1, pascoaDia - 2));
  const corpusChristi = new Date(Date.UTC(ano, pascoaMes - 1, pascoaDia + 60));
  return (mes === sextaSanta.getUTCMonth() + 1 && dia === sextaSanta.getUTCDate())
    || (mes === corpusChristi.getUTCMonth() + 1 && dia === corpusChristi.getUTCDate());
}

async function ehFeriadoCobranca(db: any, dateStr: string): Promise<boolean> {
  if (ehFeriadoNacional(dateStr)) return true;
  const { data, error } = await db.from('cobranca_feriados').select('data').eq('data', dateStr).maybeSingle();
  if (error) throw new Error(`Calendário de feriados indisponível: ${error.message}`);
  return Boolean(data);
}

async function getAllActiveInstances(db: any): Promise<EvoInstance[]> {
  const { data } = await db
    .from("evolution_config")
    .select("id, api_url, api_key, instance_name")
    .eq("ativo", true)
    .order("prioridade", { ascending: true });
  return data ?? [];
}

// Cobrança financeira só sai pela disp3. Nunca usar fallback de outra instância.
async function resolveInstances(db: any, _cfg: { evolution_config_ids?: string[] | null }): Promise<EvoInstance[]> {
  const all = await getAllActiveInstances(db);
  return all.filter((i: EvoInstance) => i.instance_name === "disp3");
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

// Historico de conversa (tabela whatsapp_mensagens) -- alimenta a aba Chat.
// Best-effort: a mensagem ja foi entregue quando isso roda, entao falha aqui
// so vira log, nunca muda o resultado do envio.
async function registrarMensagemEnviada(
  db: any,
  phone: string,
  conteudo: string,
  instanceName: string,
  evolutionMessageId: string | null,
): Promise<void> {
  try {
    const { error } = await db.from("whatsapp_mensagens").insert({
      telefone: toOptOutKey(phone),
      direcao: "enviada",
      conteudo,
      tipo: "text",
      origem: "cobranca",
      evolution_instance: instanceName,
      evolution_message_id: evolutionMessageId,
    });
    if (error) console.error("registrarMensagemEnviada:", error.message);
  } catch (e: any) {
    console.error("registrarMensagemEnviada falhou:", e?.message);
  }
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
    if (cfg.instance_name !== 'disp3') continue;
    try {
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const financeiroKey = Deno.env.get('FINANCEIRO_INSTANCE_KEY') ?? 'financeiro-only-idm-2026';
      const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/wpp-enviar`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, "x-financeiro-key": financeiroKey },
        body: JSON.stringify({ numero: formatPhone(phone), mensagem: message, instance_name: 'disp3', typing_delay_ms: 1000 }),
        signal: AbortSignal.timeout(30_000),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.ok === true && json?.instance === 'disp3') {
        await registrarMensagemEnviada(db, phone, message, 'disp3', null);
        return { ok: true };
      }
      lastError = `[disp3] ${res.status}: ${String(json?.error ?? 'Falha no envio').slice(0, 200)}`;
    } catch (e: any) {
      lastError = `[${cfg.instance_name}] ${e?.message ?? "Erro de conexão"}`;
      if (isAmbiguousError(e)) {
        console.warn(`enviar-cobranca: ${cfg.instance_name} deu timeout (envio incerto)`);
        return { ok: false, error: lastError, ambiguous: true };
      }
    }
  }
  return { ok: false, error: lastError || "Financeiro IDM (disp3) indisponível" };
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

  if (body.marcar_manual) {
    return await marcarCobradoManual(db, body, userId, corsHeaders);
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

// Registra que o operador cobrou o aluno pelo WhatsApp pessoal dele, fora do sistema -- sem
// mandar nada pela Evolution API. Grava em cobranca_logs igual a um envio de verdade (mesmo
// índice único de dedupe), pra: (1) o automático não mandar a mesma fase de novo, (2) o badge
// "Cobrado ..." do card da Fila aparecer. `cobertura` já vem calculada pelo frontend (mesmo
// formato pagamento_id+template_id que um envio manual usa).
async function marcarCobradoManual(db: any, body: any, userId: string | null, cors: any) {
  const { aluno_id, aluno_nome, telefone, cobertura } = body;
  if (!aluno_id || !Array.isArray(cobertura) || !cobertura.length) {
    return new Response(JSON.stringify({ error: "Parâmetros inválidos" }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const grupoEnvioId = cobertura.length > 1 ? crypto.randomUUID() : null;
  const agora = new Date().toISOString();
  const { error } = await db.from("cobranca_logs").insert(
    cobertura.map((c: { pagamento_id: string; template_id: string | null }) => ({
      aluno_id, pagamento_id: c.pagamento_id, aluno_nome: aluno_nome || "Aluno", telefone,
      mensagem: "Cobrança feita manualmente pelo WhatsApp pessoal do operador.",
      template_nome: "Manual (fora do sistema)", template_tipo: null, template_id: c.template_id,
      status: "enviado", manual: true, enviado_por: userId,
      enviado_em: agora, agendado_para: agora, grupo_envio_id: grupoEnvioId,
    })),
  );

  if (error) {
    const jaReservado = error.code === "23505";
    return new Response(JSON.stringify({
      error: jaReservado
        ? "Essa fase já foi cobrada por outro processo nesse meio tempo -- atualize a fila."
        : error.message,
    }), { status: jaReservado ? 409 : 500, headers: { ...cors, "Content-Type": "application/json" } });
  }

  return new Response(JSON.stringify({ success: true }), { headers: { ...cors, "Content-Type": "application/json" } });
}

// Acha, pra um item da fila, o template configurado pro offset dele -- mesma regra de
// sempre. pos_vencimento casa por FAIXA de dias (fase), não dia exato: 1-3, 4-7, 8-15,
// 16+ (aberta), pra ninguém ficar em limbo sem nunca bater um dia fixo configurado --
// isso também resolve sozinho o backlog de quem acumulou atraso enquanto a cobrança
// esteve parada. pre_vencimento/vencimento continuam por dia exato (evento de data
// futura conhecida, sem acúmulo possível).
function resolveTemplateParaItem(item: any, templates: any[], cfg: any, hoje: string): any | null {
  // Toggle "Automático" desligado (alunos.cobranca_ativa=false) -- get_alunos_para_cobranca
  // não filtra mais isso (o aluno precisa continuar visível na Fila, só "apagado"), então
  // quem garante que ele não recebe cobrança automática de verdade é aqui.
  if (item.cobranca_ativa === false) return null;

  // Promessa de pagamento (pagamentos.data_prevista_pagamento, coletada pela IA de
  // cobrança ou digitada manualmente na Fila) tem prioridade sobre a fase normal por
  // dias de atraso: pausa a cobrança automática até a data prometida chegar, e no dia
  // exato dispara um lembrete dedicado em vez da fase que bateria por dias_offset.
  // Passada a data sem pagamento, cai de volta na lógica normal abaixo -- dias_offset
  // continua contado a partir do vencimento original, sem relação com a promessa.
  // O automático não usa template global: produto novo (ex. NPS) fica parado
  // até receber sua própria mensagem aprovada.
  const achaPorProduto = (predicate: (t: any) => boolean): any | null => {
    return templates.find((t: any) => predicate(t) && !!item.produto && t.produto === item.produto) ?? null;
  };

  if (item.data_prevista_pagamento) {
    if (item.data_prevista_pagamento > hoje) return null;
    if (item.data_prevista_pagamento === hoje) {
      return achaPorProduto((t: any) => t.tipo === "promessa_vencida");
    }
  }

  const offset = item.dias_offset;
  if (offset < 0 && cfg.enviar_pre_vencimento) {
    return achaPorProduto((t: any) => t.tipo === "pre_vencimento" && t.dias_offset === offset);
  }
  if (offset === 0 && cfg.enviar_no_vencimento) {
    return achaPorProduto((t: any) => t.tipo === "vencimento" && t.dias_offset === 0);
  }
  if (offset > 0 && cfg.enviar_pos_vencimento) {
    return achaPorProduto((t: any) =>
      t.tipo === "pos_vencimento" &&
      offset >= t.dias_offset &&
      (t.dias_offset_fim === null || t.dias_offset_fim === undefined || offset <= t.dias_offset_fim),
    );
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
  validacao: { pagamento_id: string; asaas_payment_id: string; asaas_customer_id: string; link_pagamento: string; valor: number }[];
  cobertura: { pagamento_id: string; template_id: string; template_nome: string; template_tipo: string }[];
}

// Um aluno com 2+ parcelas em aberto recebia 1 mensagem por parcela -- spam, e os
// templates só falam de "sua parcela" no singular. Agrupa a fila por aluno e manda 1
// mensagem só cobrindo as parcelas na MESMA faixa de urgência da crítica (mais dias de
// atraso), usando o tom dela como base -- `qtd_parcelas`/`total_devido`/`lista_parcelas`
// nunca misturam parcela vencida com parcela que ainda nem venceu (ver comentário mais
// abaixo). `cobertura` marca como enviada a fase de CADA parcela elegível dessa rodada
// (não só a crítica) -- senão uma parcela que não era a "mais crítica" dessa vez nunca
// marcaria sua própria fase como enviada e voltaria a disparar de novo depois, mesmo já
// tendo sido citada na mensagem.
function proximoGrupoElegivel(fila: any[], templates: any[], cfg: any, jaEnviado: Map<string, boolean>, hoje: string): GrupoElegivel | null {
  const porAluno = new Map<string, any[]>();
  for (const item of fila) {
    if (!porAluno.has(item.aluno_id)) porAluno.set(item.aluno_id, []);
    porAluno.get(item.aluno_id)!.push(item);
  }

  for (const [, itens] of porAluno) {
    const resolvidos = itens
      .map(item => ({ item, template: resolveTemplateParaItem(item, templates, cfg, hoje) }))
      .filter(r => r.template);
    if (!resolvidos.length) continue;

    const elegiveis = resolvidos.filter(r => !jaEnviado.get(`${r.item.pagamento_id}:${r.template.id}`));
    if (!elegiveis.length) continue;

    elegiveis.sort((a, b) => b.item.dias_offset - a.item.dias_offset);
    const critica = elegiveis[0];

    // "Outras parcelas" só entra na mensagem se tiver a MESMA urgência da crítica (as duas
    // vencidas, ou as duas ainda por vencer) -- nunca mistura. Sem isso, uma mensagem
    // urgente de "50 dias em atraso, acesso pode ser suspenso" citava junto a parcela do
    // mês corrente que nem tinha vencido ainda, dando a entender que já era dívida vencida
    // (aconteceu de verdade: aluna recebeu "parcela 3, venc. 20/08" dentro de uma mensagem
    // de atraso quando essa parcela só venceria dali a duas semanas).
    const criticaVencida = critica.item.dias_offset > 0;
    const outras = itens.filter(i =>
      i.pagamento_id !== critica.item.pagamento_id && (i.dias_offset > 0) === criticaVencida,
    );
    const consideradas = [critica.item, ...outras];
    const qtdParcelas = consideradas.length;
    const totalDevido = consideradas.reduce((s, i) => s + Number(i.valor), 0);
    const listaParcelas = outras
      .map(i => {
        const data = new Date(i.data_vencimento).toLocaleDateString("pt-BR");
        const valorFmt = Number(i.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
        return `• Parcela ${i.parcela}: R$ ${valorFmt}, ${i.dias_offset > 0 ? `venceu em ${data}` : `vence em ${data}`}\n${i.link_pagamento}`;
      })
      .join("\n");

    const vencimento = new Date(critica.item.data_vencimento).toLocaleDateString("pt-BR");
    const valor = Number(critica.item.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
    const vars: Record<string, string | number | null> = {
      saudacao: (() => { const hora = saoPauloParts(new Date()).hour; return `Excelente ${hora < 12 ? "dia" : hora < 18 ? "tarde" : "noite"}`; })(),
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
      mensagem: renderTemplate(critica.template.mensagem, vars)
        + (outras.length && !critica.template.mensagem.includes('{{lista_parcelas}}')
          ? `\n\nOutras parcelas em aberto:\n${listaParcelas}` : ''),
      validacao: consideradas.map(i => ({
        pagamento_id: i.pagamento_id,
        asaas_payment_id: i.asaas_payment_id,
        asaas_customer_id: i.asaas_customer_id,
        link_pagamento: i.link_pagamento,
        valor: Number(i.valor),
      })),
      cobertura: elegiveis.filter(e => (e.item.dias_offset > 0) === criticaVencida).map(e => ({
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
async function calcularElegibilidade(db: any, fila: any[], templates: any[], cfg: any, hoje: string): Promise<Map<string, boolean>> {
  const resolvidos = fila
    .map(item => ({ item, template: resolveTemplateParaItem(item, templates, cfg, hoje) }))
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

// Mensagens pontuais agendadas manualmente (operador decide "manda isso pra fulana
// segunda às 14h" fora da automação) -- viram uma linha solta em cobranca_logs com
// manual=true, status='pendente' e agendado_para no futuro. Roda em toda passada do
// tique (já chamado a cada minuto pelo pg_cron 'enviar-cobranca-tick'), independente de
// cfg.ativo/daily_limit/delay -- isso é um envio pontual que o operador decidiu, não faz
// parte da automação em massa, então não deve ficar preso ao toggle nem disputar o limite
// diário/delay dela.
async function processarAgendadosManuais(db: any): Promise<void> {
  const sp = saoPauloParts(new Date());
  if (sp.weekday === 'Sun') return;
  try { if (await ehFeriadoCobranca(db, sp.dateStr)) return; } catch { return; }
  const { data: janela } = await db.from('cobranca_config')
    .select('horario_inicio_envio, horario_fim_envio').eq('id', 'default').maybeSingle();
  if (!janela) return;
  const minuto = sp.hour * 60 + sp.minute;
  const fim = Math.min(toMinutes(janela.horario_fim_envio || '20:00'), sp.weekday === 'Sat' ? 15 * 60 : 24 * 60);
  if (minuto < toMinutes(janela.horario_inicio_envio || '08:00') || minuto >= fim) return;

  const { data: pendentes } = await db
    .from("cobranca_logs")
    .select("id, telefone, mensagem")
    .eq("manual", true)
    .eq("status", "pendente")
    .is("enviado_em", null)
    .not("agendado_para", "is", null)
    .lte("agendado_para", new Date().toISOString())
    .order("agendado_para", { ascending: true })
    .limit(5);

  if (!pendentes?.length) return;

  const { data: cfg } = await db.from("cobranca_config").select("evolution_config_ids").eq("id", "default").maybeSingle();
  const allInstances = await resolveInstances(db, cfg ?? {});
  const connectedIds = await getConnectedInstanceIds(allInstances);
  const connected = allInstances.filter((i: EvoInstance) => connectedIds.has(i.id));
  if (!connected.length) return; // sem instância conectada agora -- tenta de novo no próximo tique

  for (const log of pendentes) {
    const result = await sendViaEvolution(db, connected, log.telefone, log.mensagem);
    await db.from("cobranca_logs").update({
      status: result.ok ? "enviado" : "erro",
      erro_msg: result.ok ? null : result.error,
      enviado_em: result.ok ? new Date().toISOString() : null,
    }).eq("id", log.id);
  }
}

// Falha fechada: sem confirmação da parcela no próprio Asaas, não há disparo.
// O link e o customer precisam corresponder exatamente à ficha/parcela.
async function validarGrupoNoAsaas(grupo: GrupoElegivel): Promise<boolean> {
  const key = Deno.env.get("ASAAS_API_KEY");
  if (!key) return false;
  for (const parcela of grupo.validacao) {
    if (!parcela.asaas_payment_id || !parcela.asaas_customer_id) return false;
    try {
      const res = await fetch(`https://api.asaas.com/v3/payments/${encodeURIComponent(parcela.asaas_payment_id)}`, {
        headers: { access_token: key }, signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return false;
      const remoto = await res.json();
      if (!['PENDING', 'OVERDUE'].includes(remoto.status) || remoto.paymentDate || remoto.deleted) return false;
      if (remoto.billingType !== 'BOLETO' || remoto.customer !== parcela.asaas_customer_id) return false;
      if (remoto.externalReference && remoto.externalReference !== parcela.pagamento_id) return false;
      if (Math.abs(Number(remoto.value) - parcela.valor) > 0.01) return false;
      if (![remoto.invoiceUrl, remoto.bankSlipUrl].some((url: string | undefined) =>
        url && url.replace(/\/$/, '') === parcela.link_pagamento.replace(/\/$/, ''))) return false;
    } catch (error) {
      console.warn('enviar-cobranca: falha na validação Asaas:', (error as Error).message);
      return false;
    }
  }
  return true;
}

// Resposta do aluno encerra a sequência automática até nova intervenção manual.
// Também respeita 48h desde qualquer cobrança, inclusive a enviada pelo operador.
async function contatoRecenteOuRespondido(db: any, grupo: GrupoElegivel, agora: Date): Promise<boolean> {
  const { data: ultimo, error } = await db.from('cobranca_logs')
    .select('enviado_em').eq('aluno_id', grupo.aluno_id).eq('status', 'enviado')
    .not('enviado_em', 'is', null).order('enviado_em', { ascending: false }).limit(1).maybeSingle();
  if (error) return true;
  if (!ultimo?.enviado_em) return false;
  if (agora.getTime() - new Date(ultimo.enviado_em).getTime() < 48 * 60 * 60 * 1000) return true;
  const { data: respostas, error: respostaErro } = await db.from('whatsapp_mensagens')
    .select('id').eq('telefone', toOptOutKey(grupo.telefone)).eq('direcao', 'recebida')
    .gt('created_at', ultimo.enviado_em).limit(1);
  return Boolean(respostaErro || respostas?.length);
}

// Modo tique: chamado a cada poucos minutos por um cron externo. Manda no máximo 1
// mensagem por chamada, só se estiver dentro do horário seguro, do limite diário, com
// instância conectada e sem estar em pausa por erro sequencial -- mesmo princípio do
// disparo-runner, adaptado pra fila recalculada a cada vez (quem paga no meio do dia some
// sozinho da fila, get_alunos_para_cobranca já é dinâmica).
async function processarTick(db: any, cors: any) {
  const json = (payload: any) => new Response(JSON.stringify(payload), { headers: { ...cors, "Content-Type": "application/json" } });

  await processarAgendadosManuais(db);

  const { data: cfg } = await db.from("cobranca_config").select("*").eq("id", "default").single();
  if (!cfg) return json({ ok: false, error: "cobranca_config não encontrada" });
  if (!cfg.ativo) return json({ ok: true, skipped: "inativo" });
  if (cfg.pausado_por_erro) return json({ ok: true, skipped: "pausado_por_erro" });

  const now = new Date();
  const sp = saoPauloParts(now);

  if (sp.weekday === 'Sun') return json({ ok: true, skipped: 'domingo' });
  try {
    if (await ehFeriadoCobranca(db, sp.dateStr)) return json({ ok: true, skipped: 'feriado' });
  } catch (error) {
    return json({ ok: false, skipped: 'calendario_indisponivel', error: (error as Error).message });
  }

  const nowMin    = sp.hour * 60 + sp.minute;
  const inicioMin = toMinutes(cfg.horario_inicio_envio || "09:00");
  const fimMin    = Math.min(toMinutes(cfg.horario_fim_envio || "18:00"), sp.weekday === 'Sat' ? 15 * 60 : 24 * 60);
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

  const { data: fila, error: filaErro } = await db.rpc("get_alunos_para_cobranca_automatica", { p_data: sp.dateStr });
  if (filaErro) return json({ ok: false, error: filaErro.message });
  if (!fila?.length) return json({ ok: true, enviados: 0 });

  const jaEnviado = await calcularElegibilidade(db, fila, templates, cfg, sp.dateStr);
  let candidatos = fila;
  let proximo: GrupoElegivel | null = null;
  for (let tentativa = 0; tentativa < Math.min(fila.length, 30); tentativa++) {
    const candidato = proximoGrupoElegivel(candidatos, templates, cfg, jaEnviado, sp.dateStr);
    if (!candidato) break;
    if (await contatoRecenteOuRespondido(db, candidato, now)) {
      candidatos = candidatos.filter((i: any) => i.aluno_id !== candidato.aluno_id);
      continue;
    }
    if (!(await validarGrupoNoAsaas(candidato))) {
      candidatos = candidatos.filter((i: any) => !candidato.validacao.some(p => p.pagamento_id === i.pagamento_id));
      continue;
    }
    proximo = candidato;
    break;
  }
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
    await db.from('pagamentos').update({ cobranca_contatado_em: now.toISOString(), canal_cobranca: 'whatsapp' })
      .in('id', proximo.cobertura.map(c => c.pagamento_id));
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

  if (sp.weekday === 'Sun') return json({ estado: 'fim_de_semana' });
  try {
    if (await ehFeriadoCobranca(db, sp.dateStr)) return json({ estado: 'feriado' });
  } catch (error) {
    return json({ estado: 'calendario_indisponivel', error: (error as Error).message });
  }

  const nowMin    = sp.hour * 60 + sp.minute;
  const inicioMin = toMinutes(cfg.horario_inicio_envio || "09:00");
  const fimMin    = Math.min(toMinutes(cfg.horario_fim_envio || "18:00"), sp.weekday === 'Sat' ? 15 * 60 : 24 * 60);
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

  const { data: fila } = await db.rpc("get_alunos_para_cobranca_automatica", { p_data: sp.dateStr });
  const alunosNaFila = fila?.length ? new Set(fila.map((f: any) => f.aluno_id)).size : 0;
  const jaEnviado = fila?.length ? await calcularElegibilidade(db, fila, templates, cfg, sp.dateStr) : new Map<string, boolean>();
  const proximo = fila?.length ? proximoGrupoElegivel(fila, templates, cfg, jaEnviado, sp.dateStr) : null;
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

