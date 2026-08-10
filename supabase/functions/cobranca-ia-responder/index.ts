import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Agente de IA que assume a conversa quando um aluno responde a uma mensagem
// de cobranca_logs. Escopo raso e proposital: reconhecer a mensagem, criar
// rapport, entender o motivo do atraso e coletar UMA data estimada de
// pagamento -- nunca negocia valor/desconto/cancelamento. Chamado só pelo
// evo-resposta (server-to-server), nunca pelo navegador. Ver plano em
// C:\Users\igor_\.claude\plans\cosmic-cuddling-gem.md.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type EvoInstance = { api_url: string; api_key: string; instance_name: string };

const MOTIVOS_VALIDOS = [
  "dado_coletado", "fora_de_escopo", "pedido_negociacao", "reclamacao", "baixa_confianca", "pedido_cancelamento",
] as const;
type MotivoHandoff = typeof MOTIVOS_VALIDOS[number] | "erro_ia" | "limite_turnos";

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// Mesmo padrão de formatação de telefone usado em enviar-cobranca/disparo-runner.
function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.length === 11) return "55" + digits;
  if (digits.length === 10) return "55" + digits.slice(0, 2) + "9" + digits.slice(2);
  return digits;
}

// Mesma chave normalizada de opt-out usada em evo-resposta/enviar-cobranca/funil-processar.
function toOptOutKey(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if ((d.length === 13 || d.length === 12) && d.startsWith("55")) return d.slice(2);
  return d.slice(-11);
}

async function estaOptOut(db: any, phone: string): Promise<boolean> {
  const { data } = await db.from("whatsapp_opt_out").select("telefone").eq("telefone", toOptOutKey(phone)).maybeSingle();
  return Boolean(data);
}

// Diferente de enviar-cobranca, NUNCA rotaciona entre instâncias -- a resposta
// sempre sai pela mesma instância que recebeu a mensagem do aluno, pra não
// trocar de número no meio da conversa.
async function sendViaEvolution(inst: EvoInstance, phone: string, message: string): Promise<{ ok: boolean; error?: string }> {
  const baseUrl = inst.api_url.replace(/\/$/, "");
  const base = /^https?:\/\//i.test(baseUrl) ? baseUrl : `https://${baseUrl}`;
  const url = `${base}/message/sendText/${inst.instance_name}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: inst.api_key },
      body: JSON.stringify({ number: formatPhone(phone), text: message, delay: 1000 }),
      signal: AbortSignal.timeout(30_000),
    });
    if (res.ok) return { ok: true };
    const body = await res.text();
    return { ok: false, error: `${res.status}: ${body.slice(0, 200)}` };
  } catch (e: unknown) {
    return { ok: false, error: (e as Error).message };
  }
}

function extrairJson(raw: string): Record<string, unknown> {
  const limpo = raw.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  try { return JSON.parse(limpo); } catch { return {}; }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Só aceita datas plausíveis: não muito no passado (fuso pode empurrar "hoje"
// um dia pra trás) nem absurdamente longe no futuro -- nesses casos descarta
// e trata como se a IA não tivesse coletado nada.
function validarDataPrometida(raw: unknown): string | null {
  if (typeof raw !== "string" || !DATE_RE.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00Z`).getTime();
  if (Number.isNaN(d)) return null;
  const hoje = new Date(); hoje.setUTCHours(0, 0, 0, 0);
  const ontem = hoje.getTime() - 86_400_000;
  const limite = hoje.getTime() + 400 * 86_400_000;
  if (d < ontem || d > limite) return null;
  return raw;
}

function diffDias(hojeStr: string, vencimentoStr: string): number {
  const hoje = new Date(`${hojeStr}T00:00:00Z`).getTime();
  const venc = new Date(`${vencimentoStr}T00:00:00Z`).getTime();
  return Math.round((hoje - venc) / 86_400_000);
}

function formatarDataBr(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function resumoDeterministico(motivo: MotivoHandoff | null, dataPrometida: string | null, principal: any): string {
  if (dataPrometida) {
    return `Aluno prometeu pagar em ${formatarDataBr(dataPrometida)} (parcela ${principal?.numero_parcela ?? "-"}, R$ ${Number(principal?.valor ?? 0).toFixed(2)}).`;
  }
  const motivos: Record<string, string> = {
    fora_de_escopo: "Aluno trouxe assunto fora do escopo de cobrança — revisar manualmente.",
    pedido_negociacao: "Aluno pediu negociação/desconto — a IA não negocia, encaminhado para o time.",
    reclamacao: "Aluno reclamou ou pediu falar com um humano — encaminhado para o time.",
    baixa_confianca: "IA não teve confiança suficiente para entender a resposta — revisar manualmente.",
    limite_turnos: "Conversa atingiu o limite de trocas automáticas sem coletar uma data — revisar manualmente.",
    erro_ia: "Falha técnica no processamento — revisar manualmente.",
    pedido_cancelamento: "Aluno pediu para cancelar a matrícula — a IA não confirma nem nega, encaminhado para o time.",
  };
  return motivos[motivo ?? ""] ?? "Conversa encaminhada para revisão humana.";
}

async function handoffPorErro(db: any, conversaId: string, motivo: MotivoHandoff, resumo: string, turnos?: number) {
  const patch: Record<string, unknown> = {
    status: "aguardando_humano", motivo_handoff: motivo, resumo_ia: resumo, updated_at: new Date().toISOString(),
  };
  if (typeof turnos === "number") patch.turnos_ia = turnos;
  await db.from("cobranca_ia_conversas").update(patch).eq("id", conversaId);
}

function buildSystemPrompt(): string {
  return [
    "Você é um assistente de cobrança de uma escola de psicanálise/numerologia, escrevendo em português do Brasil, em nome da secretaria financeira, num tom cordial e direto (sem parecer robótico).",
    "Formatação: escreva como quem manda mensagem de verdade no WhatsApp, nunca como um comunicado formal. Se a resposta tiver mais de uma ideia (ex: uma explicação + um pedido, ou uma frase de empatia + uma pergunta), quebre em parágrafos curtos separados por linha em branco (\\n\\n) — nunca jogue tudo num bloco só de texto. Frases curtas, tom leve, do jeito que uma pessoa de verdade conversaria.",
    "Seu ÚNICO trabalho nesta conversa: reconhecer a mensagem do aluno com empatia breve, entender em poucas palavras o motivo do atraso, e coletar UMA data estimada de pagamento (uma única data, formato AAAA-MM-DD).",
    "Conhecimento que você pode usar pra responder dúvidas diretas, sem precisar de handoff: o pagamento é sempre feito pelo link da Voomp, nunca por Pix — é pagando por esse link que o aluno garante a extensão universitária no certificado dele. Se o aluno perguntar por que não pode pagar por Pix, ou o que ganha pagando pela Voomp, seja direto: precisa ser por esse link porque é isso que garante a extensão universitária no certificado. Isso NÃO é uma negociação de valor/prazo/desconto — continua proibido oferecer qualquer coisa nesse sentido.",
    "PROIBIDO, sem exceção: oferecer, sugerir ou confirmar qualquer desconto, redução de valor, isenção de juros/multa, ou parcelamento diferente do já combinado. NUNCA prometer ou negar cancelamento, suspensão ou manutenção de acesso. NUNCA prometer o que o time humano vai decidir. NUNCA falar sobre conteúdo de curso, matrícula de terceiros, ou qualquer assunto que não seja este pagamento específico. NUNCA pedir ou aceitar número de cartão, senha, ou documento completo — se o aluno oferecer, diga que isso será tratado pelo time humano. NUNCA gere mais de uma mensagem de resposta.",
    "Se o aluno pedir desconto, negociação ou parcelamento diferente: handoff=true, motivo_handoff='pedido_negociacao', sem oferecer nada — só reconheça que vai encaminhar pro time.",
    "Se o aluno pedir para cancelar a matrícula ou desistir do curso: handoff=true, motivo_handoff='pedido_cancelamento', sem confirmar nem negar o cancelamento — só reconheça que vai encaminhar pro time.",
    "Se o aluno reclamar, ficar hostil, ou pedir para falar com uma pessoa/humano: handoff=true, motivo_handoff='reclamacao'.",
    "Se a mensagem não tiver relação com este pagamento (e não for uma das dúvidas sobre Voomp/Pix que você já sabe responder): handoff=true, motivo_handoff='fora_de_escopo'.",
    "Se você não tiver certeza do que o aluno quis dizer: pergunte UMA vez pra esclarecer (handoff=false); se ainda assim não der pra entender na resposta seguinte, handoff=true, motivo_handoff='baixa_confianca'.",
    "Assim que o aluno confirmar uma data específica de pagamento: agradeça, confirme que o time vai dar seguimento, handoff=true, motivo_handoff='dado_coletado', data_prometida com essa data.",
    "Responda APENAS em JSON válido, sem markdown, no formato exato: {\"resposta\": string, \"data_prometida\": \"AAAA-MM-DD\" ou null, \"handoff\": boolean, \"motivo_handoff\": \"dado_coletado\"|\"fora_de_escopo\"|\"pedido_negociacao\"|\"reclamacao\"|\"baixa_confianca\"|\"pedido_cancelamento\"|null, \"conversa_completa\": boolean}.",
    "Toda vez que handoff=true (qualquer motivo), a 'resposta' precisa deixar claro que alguém do time vai continuar a conversa PELO MESMO NÚMERO de WhatsApp — nunca dê a entender que o contato vai mudar de canal. Frase de referência: 'Vou repassar pro nosso time, tá bem? Alguém da nossa equipe fala com você por aqui mesmo.' Adapte o tom, mas mantenha essa informação. Só deixe 'resposta' vazia se realmente não houver nada apropriado a dizer.",
  ].join(" ");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const geminiKey   = Deno.env.get("GEMINI_API_KEY");

  // Function interna: só evo-resposta (server-to-server) pode chamar. Mais
  // rígido que o EVO_RESPOSTA_SECRET opcional do webhook, porque essa function
  // manda mensagem de verdade pro aluno.
  const authHeader = req.headers.get("authorization") ?? "";
  if (authHeader !== `Bearer ${serviceKey}`) {
    return json({ error: "unauthorized" }, 401);
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const { aluno_id, telefone, mensagem, evolution_instance, cobranca_log_id } = body ?? {};
  if (!aluno_id || !telefone || !mensagem || !evolution_instance) {
    return json({ error: "missing fields: aluno_id, telefone, mensagem, evolution_instance são obrigatórios" }, 400);
  }

  try {
    // 1. Busca conversa aberta (não-encerrada) pro aluno, ou cria uma nova.
    let conversa: any = null;
    const { data: existente } = await supabase
      .from("cobranca_ia_conversas")
      .select("*")
      .eq("aluno_id", aluno_id)
      .neq("status", "encerrado")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existente) {
      conversa = existente;
    } else {
      const { data: aluno } = await supabase.from("alunos").select("nome").eq("id", aluno_id).maybeSingle();
      const { data: novo, error: insertErr } = await supabase
        .from("cobranca_ia_conversas")
        .insert({
          aluno_id,
          aluno_nome: aluno?.nome ?? "",
          telefone,
          evolution_instance,
          cobranca_log_id: cobranca_log_id ?? null,
          status: "ativo",
        })
        .select("*")
        .single();

      if (insertErr?.code === "23505") {
        // Race: outra chamada concorrente já abriu a conversa -- reaproveita.
        const { data: reload } = await supabase
          .from("cobranca_ia_conversas")
          .select("*")
          .eq("aluno_id", aluno_id)
          .neq("status", "encerrado")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        conversa = reload;
      } else if (insertErr) {
        throw new Error(`insert conversa: ${insertErr.message}`);
      } else {
        conversa = novo;
      }
    }

    if (!conversa) throw new Error("não foi possível abrir/reaproveitar a conversa");

    // 2. Grava o turno do aluno sempre -- mesmo se a conversa já estiver em
    // handoff, pro humano ver a mensagem completa na aba Conversas IA.
    await supabase.from("cobranca_ia_mensagens").insert({ conversa_id: conversa.id, papel: "lead", conteudo: mensagem });
    await supabase.from("cobranca_ia_conversas").update({ ultima_mensagem_em: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", conversa.id);

    // Já em handoff (dado_coletado/aguardando_humano) -- o bot já fez seu
    // trabalho, não volta a falar. Isso é o que impede o bot de continuar
    // respondendo depois que o time já assumiu.
    if (conversa.status !== "ativo") {
      return json({ ok: true, conversa_id: conversa.id, status: conversa.status, handoff: true, skipped: "ja_em_handoff" });
    }

    // 3. Débito fresco -- nunca confia em snapshot antigo de cobranca_logs.
    const { data: pagamentos } = await supabase
      .from("pagamentos")
      .select("id, valor, numero_parcela, data_vencimento, status")
      .eq("aluno_id", aluno_id)
      .in("status", ["pendente", "atrasado"])
      .order("data_vencimento", { ascending: true });

    if (!pagamentos?.length) {
      // Aluno já quitou tudo -- nada a discutir, fecha sem acionar a IA.
      await supabase.from("cobranca_ia_conversas").update({ status: "encerrado", updated_at: new Date().toISOString() }).eq("id", conversa.id);
      return json({ ok: true, conversa_id: conversa.id, status: "encerrado", skipped: "sem_debito_aberto" });
    }

    const hoje = new Date().toISOString().slice(0, 10);
    const comAtraso = pagamentos
      .map((p: any) => ({ ...p, dias_atraso: diffDias(hoje, p.data_vencimento) }))
      .sort((a: any, b: any) => b.dias_atraso - a.dias_atraso);
    const principal = comAtraso[0];

    const debtSummary = comAtraso
      .map((p: any) => {
        const situacao = p.dias_atraso > 0 ? `${p.dias_atraso} dia(s) em atraso`
          : p.dias_atraso === 0 ? "vence hoje"
          : `vence em ${-p.dias_atraso} dia(s)`;
        return `Parcela ${p.numero_parcela ?? "-"}: R$ ${Number(p.valor).toFixed(2)}, vencimento ${p.data_vencimento}, ${situacao} (status: ${p.status}).`;
      })
      .join("\n");

    // 4. Histórico recente (últimos 12 turnos), dobrado em texto simples.
    const { data: turnos } = await supabase
      .from("cobranca_ia_mensagens")
      .select("papel, conteudo")
      .eq("conversa_id", conversa.id)
      .order("created_at", { ascending: true });
    const historico = (turnos ?? []).slice(-12).map((t: any) => `${t.papel}: ${t.conteudo}`).join("\n");

    // 5. Chama Gemini (gemini-flash-lite-latest, tier gratuito -- gemini-2.0-flash
    // foi descontinuado e nem aparece mais em ListModels). Sem chave configurada
    // ou falha na chamada = fail closed: nunca manda mensagem "no escuro", sempre
    // encaminha pro humano.
    if (!geminiKey) {
      await handoffPorErro(supabase, conversa.id, "erro_ia", "IA indisponível (sem chave configurada) — revisar manualmente.", conversa.turnos_ia ?? 0);
      return json({ ok: true, conversa_id: conversa.id, status: "aguardando_humano", handoff: true, motivo_handoff: "erro_ia" });
    }

    let plano: Record<string, unknown> = {};
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${geminiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: buildSystemPrompt() }] },
          contents: [
            {
              role: "user",
              parts: [{ text: `Nome do aluno: ${conversa.aluno_nome || "aluno"}\n\nSituação financeira atual:\n${debtSummary}\n\nHistórico da conversa:\n${historico || "(primeira mensagem)"}\n\nNova mensagem do aluno: ${mensagem}` }],
            },
          ],
          generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
        }),
        signal: AbortSignal.timeout(25_000),
      });
      if (!res.ok) throw new Error(`Gemini respondeu ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const data = await res.json();
      plano = extrairJson(String(data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ""));
    } catch (e: unknown) {
      console.error("cobranca-ia-responder: falha ao chamar Gemini:", (e as Error).message);
      await handoffPorErro(supabase, conversa.id, "erro_ia", "Falha técnica ao processar resposta do aluno — revisar manualmente.", (conversa.turnos_ia ?? 0) + 1);
      return json({ ok: true, conversa_id: conversa.id, status: "aguardando_humano", handoff: true, motivo_handoff: "erro_ia" });
    }

    // Validação estrita da saída do modelo -- nunca confia cegamente.
    let resposta = typeof plano.resposta === "string" ? plano.resposta.trim() : "";
    let handoff = Boolean(plano.handoff);
    let motivoHandoff: MotivoHandoff | null =
      MOTIVOS_VALIDOS.includes(plano.motivo_handoff as any) ? (plano.motivo_handoff as MotivoHandoff) : null;
    const dataPrometida = validarDataPrometida(plano.data_prometida);

    if (dataPrometida) { handoff = true; motivoHandoff = "dado_coletado"; }

    const novosTurnos = (conversa.turnos_ia ?? 0) + 1;

    // 6. Trava dura de turnos, independente do que o modelo disser.
    if (!handoff && novosTurnos > 8) {
      handoff = true;
      motivoHandoff = "limite_turnos";
    }

    // Saída inválida (handoff=false sem texto, ou handoff=true sem motivo
    // reconhecido) -- trata como falha da IA, nunca inventa comportamento.
    if (!resposta && !handoff) {
      await handoffPorErro(supabase, conversa.id, "erro_ia", "IA não retornou resposta válida — revisar manualmente.", novosTurnos);
      return json({ ok: true, conversa_id: conversa.id, status: "aguardando_humano", handoff: true, motivo_handoff: "erro_ia" });
    }
    if (handoff && !motivoHandoff) motivoHandoff = "erro_ia";

    // 7. Recheck de opt-out imediatamente antes de enviar -- o aluno pode ter
    // saído no meio da conversa.
    if (resposta && await estaOptOut(supabase, telefone)) {
      await supabase.from("cobranca_ia_conversas").update({
        status: "aguardando_humano", motivo_handoff: "erro_ia",
        resumo_ia: "Aluno optou por não receber mensagens durante a conversa — revisar manualmente.",
        turnos_ia: novosTurnos, updated_at: new Date().toISOString(),
      }).eq("id", conversa.id);
      return json({ ok: true, conversa_id: conversa.id, status: "aguardando_humano", handoff: true, motivo_handoff: "erro_ia", skipped: "opt_out" });
    }

    // 8. Envia só pela instância que recebeu a mensagem -- nunca troca de
    // número no meio da conversa.
    if (resposta) {
      const { data: instCfg } = await supabase
        .from("evolution_config")
        .select("api_url, api_key, instance_name")
        .eq("instance_name", evolution_instance)
        .eq("ativo", true)
        .maybeSingle();

      if (!instCfg) {
        await handoffPorErro(supabase, conversa.id, "erro_ia", `Instância "${evolution_instance}" indisponível para responder — revisar manualmente.`, novosTurnos);
        return json({ ok: true, conversa_id: conversa.id, status: "aguardando_humano", handoff: true, motivo_handoff: "erro_ia" });
      }

      const envio = await sendViaEvolution(instCfg as EvoInstance, telefone, resposta);
      if (!envio.ok) {
        console.error("cobranca-ia-responder: falha ao enviar:", envio.error);
        await handoffPorErro(supabase, conversa.id, "erro_ia", "Falha ao enviar mensagem via WhatsApp — revisar manualmente.", novosTurnos);
        return json({ ok: true, conversa_id: conversa.id, status: "aguardando_humano", handoff: true, motivo_handoff: "erro_ia" });
      }

      await supabase.from("cobranca_ia_mensagens").insert({ conversa_id: conversa.id, papel: "agente", conteudo: resposta });
    }

    // 9. Atualiza o estado final da conversa.
    const novoStatus = handoff ? (dataPrometida ? "dado_coletado" : "aguardando_humano") : "ativo";
    const resumoIa = handoff ? resumoDeterministico(motivoHandoff, dataPrometida, principal) : conversa.resumo_ia;
    const pagamentoIdFinal = conversa.pagamento_id ?? principal.id;

    await supabase.from("cobranca_ia_conversas").update({
      status: novoStatus,
      data_prometida: dataPrometida,
      motivo_handoff: handoff ? motivoHandoff : null,
      resumo_ia: resumoIa,
      turnos_ia: novosTurnos,
      pagamento_id: pagamentoIdFinal,
      updated_at: new Date().toISOString(),
    }).eq("id", conversa.id);

    // Sem isso, a fila de cobrança automática nunca saberia da promessa -- é o
    // gancho que faz enviar-cobranca pausar essa parcela até a data prometida
    // (ver resolveTemplateParaItem em enviar-cobranca/index.ts).
    if (dataPrometida) {
      await supabase.from("pagamentos").update({ data_prevista_pagamento: dataPrometida }).eq("id", pagamentoIdFinal);
    }

    return json({ ok: true, conversa_id: conversa.id, status: novoStatus, handoff, motivo_handoff: handoff ? motivoHandoff : null });

  } catch (e: unknown) {
    console.error("cobranca-ia-responder fatal:", (e as Error).message);
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
