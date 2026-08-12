import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Follow-up automático do SDR de IA de leads (Equipe Despertamente, slug 'sdr-leads-idm').
// Cron de poucos em poucos minutos, duas responsabilidades independentes:
//
// 1) Cutucada de silêncio: lead parou de responder no meio da conversa (status='ativo',
//    sem handoff) -- manda até 3 mensagens escalonadas (4h, 24h, 72h), cada uma com uma
//    abordagem diferente, geradas pela IA a partir do histórico real da conversa (não é
//    texto fixo repetido). Depois da 3a sem resposta, desiste e marca engajamento='frio'.
// 2) Lembrete de handoff parado: conversa já virou aguardando_humano e nenhum vendedor
//    respondeu manualmente por 2h+ -- manda UM lembrete extra pro time (nunca repete).
//
// Reaproveita o mesmo "modo teste" do leads-ia-responder (lead_nome começando com
// "TESTE" nunca manda mensagem/notificação de verdade).

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-key",
};

function ok(data: unknown) {
  return new Response(JSON.stringify(data), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
}

// Janelas escalonadas: índice = quantos follow-ups já foram enviados ANTES desta
// tentativa (0 = ainda nenhum, prestes a mandar o 1º). O valor é daqui a quantas
// horas mandar o PRÓXIMO, contado a partir de agora (quando este follow-up sai).
const JANELAS_HORAS = [4, 24, 72] as const;
const MAX_FOLLOWUPS = JANELAS_HORAS.length;
const LEMBRETE_HANDOFF_PARADO_HORAS = 2;
const BATCH_SIZE = 5;

// Horário comercial (mesmo padrão default do enviar-cobranca): 09h-18h, seg-sáb, fuso
// São Paulo. Fora disso a function não manda nada -- só devolve "fora_do_horario", sem
// mexer em followup_proximo_em/lembrete_time_enviado_em, então no próximo tick dentro do
// horário tudo que já venceu é processado normalmente (nada se perde, só atrasa).
const HORARIO_INICIO_HORA = 9;
const HORARIO_FIM_HORA = 18;

function dentroDoHorarioComercial(d: Date): boolean {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short",
  }).formatToParts(d);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? "";
  const hour = Number(get("hour"));
  const weekday = get("weekday");
  if (weekday === "Sun") return false;
  return hour >= HORARIO_INICIO_HORA && hour < HORARIO_FIM_HORA;
}

type EvoInstance = { api_url: string; api_key: string; instance_name: string };

function baseUrl(raw: string): string {
  const clean = raw.replace(/\/$/, "");
  return /^https?:\/\//i.test(clean) ? clean : `https://${clean}`;
}

async function sendViaEvolution(inst: EvoInstance, phone: string, mensagem: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${baseUrl(inst.api_url)}/message/sendText/${inst.instance_name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: inst.api_key },
      body: JSON.stringify({ number: phone, text: mensagem, delay: 1200 }),
      signal: AbortSignal.timeout(20_000),
    });
    if (res.ok) return { ok: true };
    return { ok: false, error: `${res.status}: ${(await res.text()).slice(0, 200)}` };
  } catch (e: unknown) {
    return { ok: false, error: (e as Error).message };
  }
}

function extrairJson(raw: string): { mensagem?: string } {
  const limpo = raw.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  try { return JSON.parse(limpo); } catch { return {}; }
}

// Cada tentativa tem uma abordagem diferente -- nunca é a mesma cutucada repetida,
// isso é o que mais queima um follow-up (lead sente que é bot insistindo igual).
function instrucaoDaTentativa(numeroTentativa: number): string {
  if (numeroTentativa === 1) {
    return "Esta é a 1a tentativa de reengajamento (mandada ~4h depois do lead ter sumido no meio da conversa). Tom leve, sem pressão -- reconecte com curiosidade genuína sobre o que ele estava perguntando/sentindo, como quem retoma uma conversa que ficou no ar. NÃO repita preço/bônus aqui.";
  }
  if (numeroTentativa === 2) {
    return "Esta é a 2a tentativa (lead ainda não respondeu depois de ~1 dia). Traga um valor extra novo pra reacender o interesse -- por exemplo uma pergunta que conecta com a motivação que ele já revelou antes, ou um ponto forte da formação que ainda não foi mencionado nesta conversa. Ainda sem soar desesperada ou repetitiva.";
  }
  return "Esta é a 3a e ÚLTIMA tentativa automática (lead sumiu há uns 3 dias). Tom respeitoso de 'porta aberta': reconheça que talvez não seja o momento agora, deixe claro que você fica à disposição quando ele quiser retomar, sem cobrança nem tom de última chance forçada. Depois desta, o sistema para de insistir automaticamente.";
}

function buildFollowupPrompt(leadNome: string, historico: string, numeroTentativa: number): string {
  return [
    "Você é a mesma SDR/closer de elite do Instituto DespertaMente que já estava conversando com este lead sobre a Formação em Psicanálise Integrativa (IDM) no WhatsApp -- agora ele parou de responder no meio da conversa e você está mandando uma cutucada de reengajamento. Português do Brasil, tom humano e consultivo, nunca robótico.",
    instrucaoDaTentativa(numeroTentativa),
    "Estilo: mensagem curta (2-4 linhas), *asteriscos* pra negrito do WhatsApp quando fizer sentido, emoji com naturalidade, nunca um bloco de texto longo -- isso é uma cutucada, não uma nova apresentação do curso.",
    "Termine com uma pergunta simples que seja fácil de responder (não force outra vez a pergunta de fechamento de venda).",
    "NUNCA invente que o lead disse algo que não está no histórico. NUNCA mencione preço/bônus que não estejam no histórico da conversa.",
    `Nome do lead (se conhecido): ${leadNome || "não informado"}`,
    `Histórico da conversa (a última mensagem é do lead, que nunca respondeu depois disso):\n${historico}`,
    'Responda APENAS em JSON válido, sem markdown, no formato exato: {"mensagem": string}.',
  ].join("\n\n");
}

async function gerarMensagemFollowup(geminiKey: string, leadNome: string, historico: string, numeroTentativa: number): Promise<string | null> {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${geminiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: buildFollowupPrompt(leadNome, historico, numeroTentativa) }] }],
        generationConfig: { temperature: 0.6, responseMimeType: "application/json" },
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) throw new Error(`Gemini respondeu ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    const plano = extrairJson(String(data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ""));
    const mensagem = typeof plano.mensagem === "string" ? plano.mensagem.trim() : "";
    return mensagem || null;
  } catch (e: unknown) {
    console.error("leads-ia-followup: falha ao gerar mensagem:", (e as Error).message);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const geminiKey = Deno.env.get("GEMINI_API_KEY");

  const authHeader = req.headers.get("authorization") ?? "";
  const cronKeyHeader = req.headers.get("x-cron-key") ?? "";
  const { data: cronSecret } = await supabase.rpc("get_equipe_11ds_cron_secret");
  const isCron = !!cronSecret && cronKeyHeader === cronSecret;
  if (!isCron && !authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
  }

  const agora = new Date();

  if (!dentroDoHorarioComercial(agora)) {
    return ok({ ok: true, skipped: "fora_do_horario_comercial" });
  }

  const resultadosFollowup: Record<string, unknown>[] = [];
  const resultadosLembrete: Record<string, unknown>[] = [];

  try {
    // ── 1) Cutucadas de silêncio ────────────────────────────────────────────
    const { data: pendentes } = await supabase
      .from("leads_ia_conversas")
      .select("id, lead_id, lead_nome, telefone, evolution_instance, followups_enviados")
      .eq("status", "ativo")
      .not("followup_proximo_em", "is", null)
      .lte("followup_proximo_em", agora.toISOString())
      .lt("followups_enviados", MAX_FOLLOWUPS)
      .order("followup_proximo_em", { ascending: true })
      .limit(BATCH_SIZE);

    for (const conversa of pendentes ?? []) {
      // Claim atômico: só segue se ainda for quem "reservou" a tentativa (evita
      // corrida com outro tick concorrente processando a mesma conversa).
      const { data: claimed } = await supabase
        .from("leads_ia_conversas")
        .update({ followup_proximo_em: null })
        .eq("id", conversa.id)
        .eq("status", "ativo")
        .not("followup_proximo_em", "is", null)
        .select("id");
      if (!claimed?.length) continue;

      const numeroTentativa = (conversa.followups_enviados ?? 0) + 1;
      const isTeste = (conversa.lead_nome ?? "").startsWith("TESTE");

      const { data: turnos } = await supabase
        .from("leads_ia_mensagens")
        .select("papel, conteudo")
        .eq("conversa_id", conversa.id)
        .order("created_at", { ascending: true });
      const historico = (turnos ?? []).slice(-20).map((t: any) => `${t.papel}: ${t.conteudo}`).join("\n");

      let mensagem: string | null = null;
      if (geminiKey && historico) {
        mensagem = await gerarMensagemFollowup(geminiKey, conversa.lead_nome ?? "", historico, numeroTentativa);
      }
      if (!mensagem) {
        // Falha ao gerar -- devolve a tentativa pro mesmo horário, tenta de novo no próximo tick.
        await supabase.from("leads_ia_conversas").update({ followup_proximo_em: agora.toISOString() }).eq("id", conversa.id);
        resultadosFollowup.push({ conversa: conversa.id, resultado: "erro_geracao_vai_retentar" });
        continue;
      }

      let enviadoComSucesso = isTeste;
      if (!isTeste) {
        const { data: instCfg } = await supabase
          .from("evolution_config")
          .select("api_url, api_key, instance_name")
          .eq("instance_name", conversa.evolution_instance)
          .eq("ativo", true)
          .maybeSingle();
        if (!instCfg) {
          await supabase.from("leads_ia_conversas").update({ followup_proximo_em: agora.toISOString() }).eq("id", conversa.id);
          resultadosFollowup.push({ conversa: conversa.id, resultado: "erro_instancia_vai_retentar" });
          continue;
        }
        const envio = await sendViaEvolution(instCfg as EvoInstance, conversa.telefone, mensagem);
        if (!envio.ok) {
          await supabase.from("leads_ia_conversas").update({ followup_proximo_em: agora.toISOString() }).eq("id", conversa.id);
          resultadosFollowup.push({ conversa: conversa.id, resultado: "erro_envio_vai_retentar", motivo: envio.error });
          continue;
        }
        enviadoComSucesso = true;
      }

      if (enviadoComSucesso) {
        await supabase.from("leads_ia_mensagens").insert({
          conversa_id: conversa.id, papel: "agente",
          conteudo: isTeste ? `${mensagem} [followup ${numeroTentativa}/${MAX_FOLLOWUPS}, modo teste, não enviado de verdade]` : mensagem,
        });
        const esgotou = numeroTentativa >= MAX_FOLLOWUPS;
        const proximaJanelaHoras = JANELAS_HORAS[numeroTentativa]; // índice = qtd já enviados agora
        await supabase.from("leads_ia_conversas").update({
          followups_enviados: numeroTentativa,
          followup_proximo_em: esgotou ? null : new Date(agora.getTime() + proximaJanelaHoras * 3_600_000).toISOString(),
          ...(esgotou ? { engajamento: "frio" } : {}),
          updated_at: agora.toISOString(),
        }).eq("id", conversa.id);
        resultadosFollowup.push({ conversa: conversa.id, resultado: "enviado", tentativa: numeroTentativa, esgotou, teste: isTeste });
      }
    }

    // ── 2) Lembrete de handoff parado ───────────────────────────────────────
    const limiteLembrete = new Date(agora.getTime() - LEMBRETE_HANDOFF_PARADO_HORAS * 3_600_000).toISOString();
    const { data: parados } = await supabase
      .from("leads_ia_conversas")
      .select("id, lead_id, lead_nome, resumo_ia")
      .eq("status", "aguardando_humano")
      .is("humano_assumiu_em", null)
      .is("lembrete_time_enviado_em", null)
      .not("handoff_em", "is", null)
      .lte("handoff_em", limiteLembrete)
      .limit(BATCH_SIZE);

    for (const conversa of parados ?? []) {
      const isTeste = (conversa.lead_nome ?? "").startsWith("TESTE");
      const { data: claimed } = await supabase
        .from("leads_ia_conversas")
        .update({ lembrete_time_enviado_em: agora.toISOString() })
        .eq("id", conversa.id)
        .is("lembrete_time_enviado_em", null)
        .select("id");
      if (!claimed?.length) continue;

      if (!isTeste) {
        await supabase.rpc("notificar_vendedores_ativos", {
          p_tipo: "lead_quente_ia",
          p_titulo: `⏰ Lead esperando há ${LEMBRETE_HANDOFF_PARADO_HORAS}h+ sem resposta: ${conversa.lead_nome || "Lead"}`,
          p_descricao: conversa.resumo_ia || "Conversa em handoff sem resposta do time -- confira o quanto antes.",
          p_link: "/pipeline",
        });
      }
      resultadosLembrete.push({ conversa: conversa.id, resultado: "lembrete_enviado", teste: isTeste });
    }

    return ok({ ok: true, followups: resultadosFollowup, lembretes: resultadosLembrete });
  } catch (e: unknown) {
    console.error("leads-ia-followup fatal:", (e as Error).message);
    return ok({ ok: false, error: (e as Error).message });
  }
});
