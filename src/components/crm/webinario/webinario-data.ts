import { supabase } from '@/integrations/supabase/client';
import { fetchAll } from '@/lib/db/fetchAll';
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { consolidarLeads, type LeadNoFunil, type TrackingJoined } from './webinario-funil';
export { STAGES, STAGE_LABEL, bucketKanban, consolidarLeads, funilAcumulado } from './webinario-funil';
export type { WatchStage, WebinarioLead, TrackingJoined, LeadNoFunil } from './webinario-funil';

// Isola aqui a tipagem dinâmica dos joins PostgREST; os componentes usam tipos explícitos.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as SupabaseClient<any>;

export interface Webinario {
  id: string;
  nome: string;
  slug: string;
  video_url: string | null;
  captura_video_url: string | null;
  video_duracao_segundos: number | null;
  oferta_offset_segundos: number | null;
  grupo_whatsapp_url: string | null;
  ativo: boolean;
}

export interface MensagemChat {
  id: string;
  webinario_id: string;
  segundo: number;
  autor_nome: string;
  texto: string;
}

export async function listarWebinarios(): Promise<Webinario[]> {
  const { data, error } = await db.from('webinarios').select('id,nome,slug,video_url,captura_video_url,video_duracao_segundos,oferta_offset_segundos,grupo_whatsapp_url,ativo').order('nome');
  if (error) throw error;
  return (data ?? []) as Webinario[];
}

export async function listarTracking(webinarioId: string, desde: string): Promise<LeadNoFunil[]> {
  const linhas = await fetchAll<TrackingJoined>((de, ate) => db.from('webinario_tracking')
    .select('id,lead_id,watch_stage,updated_at,leads!inner(id,nome,telefone,whatsapp,email,status,vendedor,criado_em,pessoa_id),webinario_sessoes!inner(webinario_id)')
    .eq('webinario_sessoes.webinario_id', webinarioId)
    .eq('leads.canal', 'webinario')
    .gte('leads.criado_em', desde)
    .order('id').range(de, ate) as PromiseLike<{ data: TrackingJoined[] | null; error: PostgrestError | null }>);
  return consolidarLeads(linhas);
}

export async function listarMensagens(webinarioId: string): Promise<MensagemChat[]> {
  const { data, error } = await db.from('webinario_mensagens_chat')
    .select('id,webinario_id,segundo,autor_nome,texto').eq('webinario_id', webinarioId).order('segundo').order('id');
  if (error) throw error;
  return (data ?? []) as MensagemChat[];
}

export async function salvarWebinario(id: string, valores: Omit<Webinario, 'id'>) {
  const { error } = await db.from('webinarios').update(valores).eq('id', id);
  if (error) throw error;
}

export async function salvarMensagem(webinarioId: string, valores: Pick<MensagemChat, 'segundo' | 'autor_nome' | 'texto'>, id?: string) {
  const query = id ? db.from('webinario_mensagens_chat').update(valores).eq('id', id)
    : db.from('webinario_mensagens_chat').insert({ ...valores, webinario_id: webinarioId });
  const { error } = await query;
  if (error) throw error;
}

export async function excluirMensagem(id: string) {
  const { error } = await db.from('webinario_mensagens_chat').delete().eq('id', id);
  if (error) throw error;
}

export function inicioPeriodo(periodo: 'hoje' | '7' | '30') {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const data = `${partes.find((p) => p.type === 'year')?.value}-${partes.find((p) => p.type === 'month')?.value}-${partes.find((p) => p.type === 'day')?.value}`;
  const inicio = new Date(`${data}T00:00:00-03:00`);
  inicio.setUTCDate(inicio.getUTCDate() - (periodo === 'hoje' ? 0 : Number(periodo) - 1));
  return inicio.toISOString();
}
