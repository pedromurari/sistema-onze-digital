import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Video, Upload, Loader2, RefreshCw, Download, AlertCircle, CheckCircle2, Clock, Sparkles } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';

// Pipeline de Reels IDM -- gera/edita video automaticamente, mas NUNCA publica
// sozinho: o job so chega ate ready_for_review, revisao e publicacao ficam
// sempre manuais. Modo A ("Gerar vídeo por IA") so cria o video_job depois
// que o roteiro e' aprovado em Equipe 11DS; Modo B ("Editar meu vídeo") cria
// o job na hora, direto do upload.

type StatusJob = 'queued' | 'generating_audio' | 'transcribing' | 'generating_scenes' | 'rendering' | 'ready_for_review' | 'failed';

interface VideoJob {
  id: string;
  mode: 'ai_generated' | 'own_footage';
  status: StatusJob;
  raw_video_url: string | null;
  final_video_url: string | null;
  error_message: string | null;
  created_at: string;
}

const STATUS_CFG: Record<StatusJob, { label: string; badge: string; icon: React.ElementType }> = {
  queued:             { label: 'Na fila',        badge: 'bg-gray-100 text-gray-600 border-gray-200',       icon: Clock },
  generating_audio:   { label: 'Gerando áudio',  badge: 'bg-blue-50 text-blue-700 border-blue-200',        icon: Loader2 },
  transcribing:       { label: 'Transcrevendo',  badge: 'bg-blue-50 text-blue-700 border-blue-200',        icon: Loader2 },
  generating_scenes:  { label: 'Gerando cenas',  badge: 'bg-blue-50 text-blue-700 border-blue-200',        icon: Loader2 },
  rendering:          { label: 'Renderizando',   badge: 'bg-amber-50 text-amber-700 border-amber-200',     icon: Loader2 },
  ready_for_review:   { label: 'Pronto p/ revisar', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  failed:             { label: 'Falhou',         badge: 'bg-red-50 text-red-700 border-red-200',           icon: AlertCircle },
};

function fmtDatetime(iso: string) {
  try { return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  catch { return iso; }
}

export function ReelsIDM() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<VideoJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const [tema, setTema] = useState('');
  const [gerandoRoteiro, setGerandoRoteiro] = useState(false);

  const carregar = useCallback(async () => {
    const { data, error } = await supabase
      .from('video_jobs')
      .select('id, mode, status, raw_video_url, final_video_url, error_message, created_at')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) { toast.error('Erro ao carregar vídeos'); setLoading(false); return; }
    setJobs((data ?? []) as VideoJob[]);
    setLoading(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    const ch = supabase.channel('video_jobs_reels_idm')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'video_jobs' }, () => carregar())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [carregar]);

  async function selecionarArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('video/')) { toast.error('Selecione um arquivo de vídeo'); return; }

    setUploading(true);
    try {
      const jobId = crypto.randomUUID();
      const ext = file.name.split('.').pop() || 'mp4';
      const path = `${jobId}/raw.${ext}`;

      const { error: upErr } = await supabase.storage.from('idm-reels').upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw new Error(upErr.message);
      const { data: pub } = supabase.storage.from('idm-reels').getPublicUrl(path);

      const { error: insertErr } = await supabase.from('video_jobs').insert({
        id: jobId,
        mode: 'own_footage',
        status: 'queued',
        raw_video_url: pub.publicUrl,
        criado_por: user?.id ?? null,
      });
      if (insertErr) throw new Error(insertErr.message);

      toast.success('Vídeo enviado! Vai aparecer na lista com o status atualizando sozinho.');
      carregar();
    } catch (e: unknown) {
      toast.error(`Erro ao enviar vídeo: ${(e as Error).message}`);
    } finally {
      setUploading(false);
    }
  }

  async function gerarVideoPorIA() {
    const temaLimpo = tema.trim();
    if (!temaLimpo) { toast.error('Digite um tema pro vídeo'); return; }

    setGerandoRoteiro(true);
    try {
      const { data: cliente, error: clienteErr } = await supabase.from('conteudo_clientes').select('id').eq('ativo', true).limit(1).maybeSingle();
      if (clienteErr) throw new Error(clienteErr.message);
      if (!cliente) throw new Error('Nenhum cliente ativo encontrado');

      const { data: gestorVideo, error: agenteErr } = await supabase.from('equipe_11ds_agentes').select('id').eq('slug', 'gestor-video').single();
      if (agenteErr || !gestorVideo) throw new Error(agenteErr?.message ?? 'Agente Gestor de Vídeo não encontrado');

      const { data: tarefaCriada, error: tarefaErr } = await supabase.from('equipe_11ds_tarefas').insert({
        tipo: 'video_roteiro',
        agente_id: gestorVideo.id,
        cliente_id: cliente.id,
        ordem_texto: temaLimpo,
        status: 'pendente',
        criado_por: user?.id ?? null,
      }).select('id').single();
      if (tarefaErr || !tarefaCriada) throw new Error(tarefaErr?.message ?? 'Falha ao criar a tarefa');

      const { error: execErr } = await supabase.functions.invoke('equipe-11ds-roteiro-executar', { body: { tarefa_id: tarefaCriada.id } });
      if (execErr) throw new Error(execErr.message);

      setTema('');
      toast.success('Time Roteiro & Vídeo está escrevendo -- acompanhe em Equipe 11DS e aprove quando estiver pronto.');
    } catch (e: unknown) {
      toast.error(`Erro ao gerar vídeo por IA: ${(e as Error).message}`);
    } finally {
      setGerandoRoteiro(false);
    }
  }

  return (
    <div className="h-full flex flex-col bg-gray-50/40 overflow-auto">
      <div className="bg-white border-b px-6 py-4 flex-none">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-none">
            <Video className="h-4.5 w-4.5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Reels IDM</h1>
            <p className="text-xs text-muted-foreground">Edição automática de vídeo -- legenda karaokê, zoom, corte de silêncio. Nunca publica sozinho.</p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Gerar vídeo por IA (Modo A) */}
        <div className="bg-white rounded-xl border p-5">
          <h2 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-primary" /> Gerar vídeo por IA</h2>
          <p className="text-xs text-muted-foreground mb-4">Digite um tema -- o time Roteiro & Vídeo (Estrategista de Viral, Roteirista, Gestor de Vídeo) escreve o roteiro pensando em TikTok/Reels. O roteiro fica esperando sua aprovação em Equipe 11DS antes de gastar com narração, imagem e render.</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <Textarea value={tema} onChange={e => setTema(e.target.value)} placeholder="Ex: mito sobre numerologia e destino" rows={1} className="text-sm resize-none" disabled={gerandoRoteiro} />
            <Button onClick={gerarVideoPorIA} disabled={gerandoRoteiro} className="gap-2 flex-none">
              {gerandoRoteiro ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {gerandoRoteiro ? 'Gerando...' : 'Gerar roteiro'}
            </Button>
          </div>
        </div>

        {/* Editar meu vídeo (Modo B) */}
        <div className="bg-white rounded-xl border p-5">
          <h2 className="text-sm font-semibold text-foreground mb-1">Editar meu vídeo</h2>
          <p className="text-xs text-muted-foreground mb-4">Suba um vídeo já gravado, com narração própria no áudio -- o sistema transcreve, aplica legenda estilo karaokê, zoom nos pontos de ênfase, remove silêncio e devolve pronto pra revisão.</p>
          <input ref={inputRef} type="file" accept="video/*" className="hidden" onChange={selecionarArquivo} />
          <Button onClick={() => inputRef.current?.click()} disabled={uploading} className="gap-2">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploading ? 'Enviando…' : 'Enviar vídeo'}
          </Button>
        </div>

        {/* Meus vídeos */}
        <div className="bg-white rounded-xl border">
          <div className="flex items-center justify-between px-5 py-3 border-b">
            <h2 className="text-sm font-semibold text-foreground">Meus vídeos</h2>
            <Button variant="outline" size="sm" onClick={carregar} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> Atualizar
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : jobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-center">
              <Video className="h-8 w-8 text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">Nenhum vídeo enviado ainda</p>
            </div>
          ) : (
            <div className="divide-y">
              {jobs.map(job => {
                const cfg = STATUS_CFG[job.status];
                const Icon = cfg.icon;
                const emAndamento = !['ready_for_review', 'failed'].includes(job.status);
                return (
                  <div key={job.id} className="p-4 flex items-start gap-4">
                    {job.status === 'ready_for_review' && job.final_video_url ? (
                      <video src={job.final_video_url} controls className="w-24 h-40 object-cover rounded-lg bg-black flex-none" />
                    ) : (
                      <div className="w-24 h-40 rounded-lg bg-gray-100 flex items-center justify-center flex-none">
                        <Video className="h-6 w-6 text-muted-foreground/40" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border', cfg.badge)}>
                          <Icon className={cn('h-3 w-3', emAndamento && 'animate-spin')} />
                          {cfg.label}
                        </span>
                        <span className="text-xs text-muted-foreground">{job.mode === 'own_footage' ? 'Vídeo próprio' : 'Gerado por IA'}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Enviado em {fmtDatetime(job.created_at)}</p>
                      {job.status === 'failed' && job.error_message && (
                        <p className="text-xs text-red-600 mt-1.5 max-w-md">{job.error_message}</p>
                      )}
                      {job.status === 'ready_for_review' && job.final_video_url && (
                        <a href={job.final_video_url} download target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline mt-2">
                          <Download className="h-3.5 w-3.5" /> Baixar vídeo final
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
