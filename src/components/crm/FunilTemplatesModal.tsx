import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Plus, Copy, Trash2, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FunilTemplateConteudo, FunilTemplateEnquete } from '@/lib/lancamento-templates';

/**
 * Gerenciar templates de mensagem de aquecimento (Lançamento/NPA) — aberto a
 * partir do wizard de criação de funil. `conteudo` é sempre SOBRESCRITA: campo
 * vazio nesse editor significa "usa o texto padrão embutido no gerador", não
 * "manda mensagem vazia" — por isso os placeholders mostram o comportamento
 * default em vez de ficarem só em branco.
 */

interface TemplateRow {
  id: string;
  tipo: 'lancamento' | 'npa';
  nome: string;
  ativo: boolean;
  conteudo: FunilTemplateConteudo;
}

const DIAS_LANCAMENTO = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const DIAS_AUDIO_LANCAMENTO = [1, 4, 7];
const DIAS_ENQUETE_LANCAMENTO = [2, 3, 5, 6, 8, 9];
const DIAS_NPA = Array.from({ length: 10 }, (_, i) => i + 1);
const DIAS_ENQUETE_NPA = [1, 3, 5, 7, 9];

function EnqueteFields({ valor, onChange }: {
  valor: FunilTemplateEnquete | undefined;
  onChange: (v: FunilTemplateEnquete | undefined) => void;
}) {
  const v = valor ?? { intro: '', nome: '', opcoes: ['', '', '', ''] };
  const setOpcao = (i: number, texto: string) => {
    const opcoes = [...v.opcoes]; opcoes[i] = texto;
    onChange({ ...v, opcoes });
  };
  return (
    <div className="space-y-2 pl-3 border-l-2 border-primary/15">
      <div className="space-y-1">
        <Label className="text-[10px] uppercase text-muted-foreground">Enquete — introdução</Label>
        <Textarea rows={2} value={v.intro} onChange={e => onChange({ ...v, intro: e.target.value })} className="text-xs" placeholder="Texto que vem antes da enquete (padrão é usado se vazio)" />
      </div>
      <div className="space-y-1">
        <Label className="text-[10px] uppercase text-muted-foreground">Pergunta da enquete</Label>
        <Input value={v.nome} onChange={e => onChange({ ...v, nome: e.target.value })} className="h-8 text-xs" placeholder="Pergunta (padrão é usado se vazio)" />
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {v.opcoes.map((op, i) => (
          <Input key={i} value={op} onChange={e => setOpcao(i, e.target.value)} className="h-8 text-xs" placeholder={`Opção ${i + 1}`} />
        ))}
      </div>
    </div>
  );
}

function DiaAccordion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  const [aberto, setAberto] = useState(false);
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <button type="button" onClick={() => setAberto(a => !a)} className="w-full flex items-center justify-between px-3 py-2 text-left text-xs font-semibold hover:bg-muted/40 transition-colors">
        {titulo}
        <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', aberto && 'rotate-180')} />
      </button>
      {aberto && <div className="p-3 pt-0 space-y-2.5">{children}</div>}
    </div>
  );
}

function TemplateEditor({ template, onSaved, onClose }: {
  template: TemplateRow;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [nome, setNome] = useState(template.nome);
  const [ativo, setAtivo] = useState(template.ativo);
  const [conteudo, setConteudo] = useState<FunilTemplateConteudo>(template.conteudo ?? {});
  const [salvando, setSalvando] = useState(false);

  const setManha = (dia: number, chave: 'manhas' | 'temas_manha', texto: string) =>
    setConteudo(c => ({ ...c, [chave]: { ...(c[chave] ?? {}), [dia]: texto } }));
  const setNoiteDia = (dia: number, texto: string) =>
    setConteudo(c => ({ ...c, temas_noite: { ...(c.temas_noite ?? {}), [dia]: texto } }));
  const setEnquete = (dia: number, v: FunilTemplateEnquete | undefined) =>
    setConteudo(c => ({ ...c, enquetes: { ...(c.enquetes ?? {}), [dia]: v } }));

  const salvar = async () => {
    if (!nome.trim()) { toast.error('Dá um nome pro template.'); return; }
    setSalvando(true);
    const { error } = await supabase.from('funil_templates' as any)
      .update({ nome: nome.trim(), ativo, conteudo, updated_at: new Date().toISOString() })
      .eq('id', template.id);
    setSalvando(false);
    if (error) { toast.error(`Erro ao salvar: ${error.message}`); return; }
    toast.success('Template salvo.');
    onSaved();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex-1 space-y-1">
          <Label className="text-xs">Nome do template</Label>
          <Input value={nome} onChange={e => setNome(e.target.value)} className="h-9 text-sm" />
        </div>
        <div className="flex items-center gap-1.5 pt-5">
          <Label className="text-xs">Ativo</Label>
          <Switch checked={ativo} onCheckedChange={setAtivo} />
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Campo vazio = usa o texto padrão já validado. Variáveis disponíveis:{' '}
        {template.tipo === 'lancamento'
          ? '{{slogan}}, {{class_hora}}, {{aula_link_1}}, {{aula_titulo_1}}, {{aula_data_1}}, {{dates_block}}, {{links_block}}, {{num_aulas}}, {{nome_lancamento}}, {{dias_restantes}}, {{com_professor_linha}}, {{professor_conduz_linha}}, {{professor_do_texto}}'
          : '{{slogan}}, {{nome_evento}}, {{npa_local}}, {{manha_hora_ini}}, {{manha_hora_fim}}, {{tarde_hora_ini}}, {{tarde_hora_fim}}, {{aula_data_1}}'}
      </p>

      {template.tipo === 'lancamento' ? (
        <>
          <div className="space-y-2">
            <p className="text-xs font-bold text-foreground uppercase tracking-wide">Dias de aquecimento (1-9)</p>
            {DIAS_LANCAMENTO.map(dia => (
              <DiaAccordion key={dia} titulo={`Dia ${dia}${DIAS_AUDIO_LANCAMENTO.includes(dia) ? ' — tarde é áudio' : ''}`}>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase text-muted-foreground">Mensagem da manhã</Label>
                  <Textarea rows={4} value={conteudo.manhas?.[dia] ?? ''} onChange={e => setManha(dia, 'manhas', e.target.value)} className="text-xs" placeholder="Texto padrão é usado se vazio" />
                </div>
                {DIAS_ENQUETE_LANCAMENTO.includes(dia) && (
                  <EnqueteFields valor={conteudo.enquetes?.[dia]} onChange={v => setEnquete(dia, v)} />
                )}
              </DiaAccordion>
            ))}
          </div>

          <div className="space-y-2 pt-2 border-t border-border">
            <p className="text-xs font-bold text-foreground uppercase tracking-wide">Mensagens compartilhadas</p>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase text-muted-foreground">Áudio (dias 1, 4 e 7 à tarde)</Label>
              <Textarea rows={3} value={conteudo.audio_texto ?? ''} onChange={e => setConteudo(c => ({ ...c, audio_texto: e.target.value }))} className="text-xs" placeholder="Texto padrão é usado se vazio" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase text-muted-foreground">Noite (dias 1 a 8)</Label>
              <Textarea rows={3} value={conteudo.noite_texto ?? ''} onChange={e => setConteudo(c => ({ ...c, noite_texto: e.target.value }))} className="text-xs" placeholder="Texto padrão é usado se vazio" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase text-muted-foreground">Noite da véspera (dia 9)</Label>
              <Textarea rows={3} value={conteudo.noite_vespera_texto ?? ''} onChange={e => setConteudo(c => ({ ...c, noite_vespera_texto: e.target.value }))} className="text-xs" placeholder="Texto padrão é usado se vazio" />
            </div>
          </div>
        </>
      ) : (
        <div className="space-y-2">
          <p className="text-xs font-bold text-foreground uppercase tracking-wide">Dias de expectativa (1-10)</p>
          {DIAS_NPA.map(dia => (
            <DiaAccordion key={dia} titulo={`Dia ${dia}${dia === 8 ? ' — tem confirmação de presença (fixa)' : ''}`}>
              <div className="space-y-1">
                <Label className="text-[10px] uppercase text-muted-foreground">Mensagem da manhã</Label>
                <Textarea rows={4} value={conteudo.temas_manha?.[dia] ?? ''} onChange={e => setManha(dia, 'temas_manha', e.target.value)} className="text-xs" placeholder="Texto padrão é usado se vazio" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] uppercase text-muted-foreground">Mensagem da noite</Label>
                <Textarea rows={3} value={conteudo.temas_noite?.[dia] ?? ''} onChange={e => setNoiteDia(dia, e.target.value)} className="text-xs" placeholder="Texto padrão é usado se vazio" />
              </div>
              {DIAS_ENQUETE_NPA.includes(dia) && (
                <EnqueteFields valor={conteudo.enquetes?.[dia]} onChange={v => setEnquete(dia, v)} />
              )}
            </DiaAccordion>
          ))}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-3 border-t border-border">
        <Button variant="outline" onClick={onClose}>Voltar</Button>
        <Button onClick={salvar} disabled={salvando}>Salvar template</Button>
      </div>
    </div>
  );
}

export function FunilTemplatesModal({ tipo, onClose, onTemplatesChanged }: {
  tipo: 'lancamento' | 'npa';
  onClose: () => void;
  onTemplatesChanged: () => void;
}) {
  const [templates, setTemplates] = useState<TemplateRow[] | null>(null);
  const [editando, setEditando] = useState<TemplateRow | null>(null);
  const [criando, setCriando] = useState(false);

  const carregar = useCallback(async () => {
    const { data } = await supabase.from('funil_templates' as any)
      .select('id, tipo, nome, ativo, conteudo')
      .eq('tipo', tipo)
      .order('nome', { ascending: true });
    setTemplates((data ?? []) as any as TemplateRow[]);
  }, [tipo]);

  useEffect(() => { carregar(); }, [carregar]);

  const handleDuplicar = async (base?: TemplateRow) => {
    const nome = prompt('Nome do novo template:', base ? `${base.nome} (cópia)` : 'Novo template');
    if (!nome?.trim()) return;
    setCriando(true);
    const { error } = await supabase.from('funil_templates' as any).insert({
      tipo, nome: nome.trim(), ativo: true, conteudo: base?.conteudo ?? {},
    });
    setCriando(false);
    if (error) { toast.error(`Erro ao criar: ${error.message}`); return; }
    toast.success('Template criado.');
    carregar();
    onTemplatesChanged();
  };

  const handleExcluir = async (t: TemplateRow) => {
    if (!confirm(`Excluir o template "${t.nome}"? Funis já criados com ele não são afetados.`)) return;
    const { error } = await supabase.from('funil_templates' as any).delete().eq('id', t.id);
    if (error) { toast.error(`Erro ao excluir: ${error.message}`); return; }
    toast.success('Template excluído.');
    carregar();
    onTemplatesChanged();
  };

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editando ? `Editar — ${editando.nome}` : `Templates de aquecimento — ${tipo === 'lancamento' ? 'Lançamento' : 'NPA'}`}
          </DialogTitle>
        </DialogHeader>

        {editando ? (
          <TemplateEditor
            template={editando}
            onClose={() => setEditando(null)}
            onSaved={() => { carregar(); onTemplatesChanged(); setEditando(null); }}
          />
        ) : (
          <div className="space-y-3">
            {templates === null ? (
              <p className="text-sm text-muted-foreground">Carregando...</p>
            ) : templates.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum template ainda.</p>
            ) : (
              <div className="space-y-2">
                {templates.map(t => (
                  <div key={t.id} className="flex items-center gap-2 p-2.5 rounded-lg border border-border">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{t.nome}</p>
                      <p className="text-[10px] text-muted-foreground">{t.ativo ? 'Ativo' : 'Inativo'}</p>
                    </div>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditando(t)}>Editar</Button>
                    <button onClick={() => handleDuplicar(t)} title="Duplicar" className="p-1.5 rounded hover:bg-muted text-muted-foreground">
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => handleExcluir(t)} title="Excluir" className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <Button variant="outline" className="w-full gap-1.5" onClick={() => handleDuplicar()} disabled={criando}>
              <Plus className="h-4 w-4" /> Novo template
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
