import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Info, Plus, Save, Settings2, Trash2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import type { ResponsavelRow, TurmaResponsavelRow } from '@/lib/financial-utils';

// Repasse por turma — "o que fica no IDM e o que vai pra quem investiu na
// turma". Gerencia a tabela `responsaveis` (pessoas/investidores reais, com
// criar/desativar) e `turma_responsaveis` (split de % por turma, sem limite
// de quantos responsáveis por turma). Compartilhado entre Balanço e
// FinanceiroCFO.

function InfoTip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex items-center ml-1 cursor-help">
      <Info className="h-3 w-3 text-muted-foreground/60" />
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-foreground text-background text-xs rounded-lg px-3 py-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg leading-relaxed">
        {text}
      </span>
    </span>
  );
}

interface LinhaRepasse { key: string; responsavelId: string; percentual: number; }

interface Props {
  turmas: { id: string; nome: string }[];
  onSaved?: () => void;
}

export function RepasseTurmasConfig({ turmas, onSaved }: Props) {
  const [responsaveis, setResponsaveis] = useState<ResponsavelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [novoNome, setNovoNome] = useState('');
  const [novoEmail, setNovoEmail] = useState('');
  const [addingResp, setAddingResp] = useState(false);
  const [porTurma, setPorTurma] = useState<Record<string, LinhaRepasse[]>>({});

  const turmaIdsKey = turmas.map(t => t.id).sort().join(',');

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: r }, { data: tr }] = await Promise.all([
      supabase.from('responsaveis').select('id, nome, email, ativo').order('nome'),
      supabase.from('turma_responsaveis').select('id, turma_id, user_id, nome_ref, percentual'),
    ]);
    const respList = (r || []) as ResponsavelRow[];
    const trList = (tr || []) as TurmaResponsavelRow[];
    setResponsaveis(respList);
    const grouped: Record<string, LinhaRepasse[]> = {};
    for (const turmaId of turmaIdsKey ? turmaIdsKey.split(',') : []) {
      grouped[turmaId] = trList
        .filter(x => x.turma_id === turmaId)
        .map(x => ({ key: x.id, responsavelId: x.user_id || '', percentual: x.percentual }));
    }
    setPorTurma(grouped);
    setLoading(false);
  }, [turmaIdsKey]);

  useEffect(() => { load(); }, [load]);

  async function handleAddResponsavel() {
    if (!novoNome.trim()) return;
    setAddingResp(true);
    const { data, error } = await supabase
      .from('responsaveis')
      .insert({ nome: novoNome.trim(), email: novoEmail.trim() || null })
      .select('id, nome, email, ativo')
      .single();
    setAddingResp(false);
    if (error || !data) { toast.error('Erro ao criar responsável.'); return; }
    setResponsaveis(prev => [...prev, data as ResponsavelRow].sort((a, b) => a.nome.localeCompare(b.nome)));
    setNovoNome(''); setNovoEmail('');
    toast.success('Responsável criado!');
  }

  async function handleToggleAtivo(id: string, ativoAtual: boolean) {
    const { error } = await supabase.from('responsaveis').update({ ativo: !ativoAtual }).eq('id', id);
    if (error) { toast.error('Erro ao atualizar responsável.'); return; }
    setResponsaveis(prev => prev.map(r => r.id === id ? { ...r, ativo: !ativoAtual } : r));
  }

  async function handleRemoveResponsavel(id: string) {
    const emUso = Object.values(porTurma).some(linhas => linhas.some(l => l.responsavelId === id));
    if (emUso) { toast.error('Remova esse responsável das turmas abaixo antes de excluir.'); return; }
    const { error } = await supabase.from('responsaveis').delete().eq('id', id);
    if (error) { toast.error('Erro ao remover responsável.'); return; }
    setResponsaveis(prev => prev.filter(r => r.id !== id));
  }

  function addLinha(turmaId: string) {
    setPorTurma(prev => ({ ...prev, [turmaId]: [...(prev[turmaId] || []), { key: crypto.randomUUID(), responsavelId: '', percentual: 0 }] }));
  }
  function updateLinha(turmaId: string, key: string, patch: Partial<LinhaRepasse>) {
    setPorTurma(prev => ({ ...prev, [turmaId]: (prev[turmaId] || []).map(l => l.key === key ? { ...l, ...patch } : l) }));
  }
  function removeLinha(turmaId: string, key: string) {
    setPorTurma(prev => ({ ...prev, [turmaId]: (prev[turmaId] || []).filter(l => l.key !== key) }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const turmaIds = turmas.map(t => t.id);
      if (turmaIds.length) {
        await supabase.from('turma_responsaveis').delete().in('turma_id', turmaIds);
      }
      const rows: { turma_id: string; user_id: string; nome_ref: string | null; percentual: number }[] = [];
      for (const [turmaId, linhas] of Object.entries(porTurma)) {
        for (const l of linhas) {
          if (!l.responsavelId || l.percentual <= 0) continue;
          const resp = responsaveis.find(r => r.id === l.responsavelId);
          rows.push({ turma_id: turmaId, user_id: l.responsavelId, nome_ref: resp?.nome ?? null, percentual: l.percentual });
        }
      }
      if (rows.length) {
        const { error } = await supabase.from('turma_responsaveis').insert(rows);
        if (error) throw error;
      }
      toast.success('Repasse salvo!');
      onSaved?.();
      await load();
    } catch {
      toast.error('Erro ao salvar repasse. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  const responsaveisAtivos = responsaveis.filter(r => r.ativo !== false);

  return (
    <div className="space-y-4">

      {/* Responsáveis / investidores */}
      <Card className="border border-border/60 bg-white">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <UserPlus size={14} className="text-muted-foreground" />
            Responsáveis / Investidores
            <InfoTip text="Pessoas ou sócios que investiram numa turma e têm direito a uma fatia do líquido gerado por ela. Cadastre aqui, depois atribua o % em cada turma abaixo." />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Input
              className="h-8 text-sm flex-1 min-w-[160px]"
              placeholder="Nome do responsável"
              value={novoNome}
              onChange={e => setNovoNome(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddResponsavel()}
            />
            <Input
              className="h-8 text-sm flex-1 min-w-[160px]"
              placeholder="E-mail (opcional)"
              value={novoEmail}
              onChange={e => setNovoEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddResponsavel()}
            />
            <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={handleAddResponsavel} disabled={addingResp || !novoNome.trim()}>
              <Plus className="h-3.5 w-3.5" /> Adicionar
            </Button>
          </div>
          <div className="space-y-1.5">
            {responsaveis.map(r => (
              <div key={r.id} className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg border border-border/40 bg-muted/10">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`text-sm font-medium truncate ${r.ativo === false ? 'text-muted-foreground line-through' : ''}`}>{r.nome}</span>
                  {r.email && <span className="text-xs text-muted-foreground truncate">{r.email}</span>}
                  {r.ativo === false && <Badge variant="outline" className="text-[10px]">Inativo</Badge>}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => handleToggleAtivo(r.id, r.ativo !== false)}>
                    {r.ativo === false ? 'Ativar' : 'Desativar'}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-400 hover:text-red-600" onClick={() => handleRemoveResponsavel(r.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
            {responsaveis.length === 0 && !loading && (
              <p className="text-xs text-muted-foreground text-center py-2">Nenhum responsável cadastrado ainda.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Repasse por turma */}
      <Card className="border border-border/60 bg-white">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Settings2 size={14} className="text-muted-foreground" />
              Repasse por Turma
              <InfoTip text="Define quanto do líquido de cada turma vai para cada responsável. O que sobrar até 100% fica retido no IDM automaticamente." />
            </CardTitle>
            <Button size="sm" className="gap-1.5 text-xs" onClick={handleSave} disabled={saving || loading}>
              <Save className="h-3 w-3" /> {saving ? 'Salvando…' : 'Salvar'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-6">Carregando…</p>
          ) : turmas.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhuma turma cadastrada.</p>
          ) : (
            turmas.map(turma => {
              const linhas = porTurma[turma.id] || [];
              const totalPct = linhas.reduce((s, l) => s + (l.responsavelId ? l.percentual : 0), 0);
              const idmPct = Math.max(0, 100 - totalPct);
              const excedeu = totalPct > 100;
              return (
                <div key={turma.id} className="rounded-lg border border-border/50 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold">{turma.nome}</span>
                    <div className="flex items-center gap-2 text-xs">
                      <span className={excedeu ? 'text-red-600 font-semibold' : 'text-muted-foreground'}>
                        {totalPct.toFixed(1)}% atribuído
                      </span>
                      <Badge className={excedeu ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}>
                        Fica no IDM: {idmPct.toFixed(1)}%
                      </Badge>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {linhas.map(linha => (
                      <div key={linha.key} className="flex items-center gap-2">
                        <Select
                          value={linha.responsavelId || '__none__'}
                          onValueChange={v => updateLinha(turma.id, linha.key, { responsavelId: v === '__none__' ? '' : v })}
                        >
                          <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="Selecione o responsável" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">— Selecione —</SelectItem>
                            {responsaveisAtivos.map(r => <SelectItem key={r.id} value={r.id}>{r.nome}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <div className="flex items-center gap-1 w-24 flex-shrink-0">
                          <Input
                            type="number" step="0.1" className="h-8 text-xs"
                            value={linha.percentual}
                            onChange={e => updateLinha(turma.id, linha.key, { percentual: parseFloat(e.target.value) || 0 })}
                          />
                          <span className="text-xs text-muted-foreground">%</span>
                        </div>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-400 hover:text-red-600 flex-shrink-0"
                          onClick={() => removeLinha(turma.id, linha.key)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Button variant="outline" size="sm" className="gap-1.5 mt-2 h-7 text-xs" onClick={() => addLinha(turma.id)}>
                    <Plus className="h-3.5 w-3.5" /> Adicionar responsável
                  </Button>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
