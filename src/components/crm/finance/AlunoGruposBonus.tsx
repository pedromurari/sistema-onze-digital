import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/use-toast';
import { Settings } from 'lucide-react';
import { BonusConfigModal } from './BonusConfigModal';

interface BonusTipo {
  id: string;
  nome: string;
  ativo: boolean;
  ordem: number;
}

interface BonusTurma {
  id: string;
  bonus_id: string;
  nome: string;
  ativo: boolean;
  ordem: number;
}

interface BonusEvento {
  bonus_id: string;
  bonus_turma_id: string | null;
  acao: 'adicionado' | 'removido';
  created_at: string;
}

interface TurmaOption {
  id: string;
  nome: string;
}

function fmtDataHora(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function AlunoGruposBonus({ aluno, onGrupoTurmaChange }: {
  aluno: {
    id: string;
    produto: string;
    turma_id: string | null;
    grupo_turma_confirmado_em: string | null;
    grupo_turma_id: string | null;
  };
  onGrupoTurmaChange: (dados: { confirmadoEm: string | null; grupoTurmaId: string | null }) => void;
}) {
  const { user } = useAuth();
  const [bonusTipos, setBonusTipos] = useState<BonusTipo[]>([]);
  const [bonusTurmas, setBonusTurmas] = useState<BonusTurma[]>([]);
  const [turmas, setTurmas] = useState<TurmaOption[]>([]);
  const [eventos, setEventos] = useState<BonusEvento[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvandoGrupo, setSalvandoGrupo] = useState(false);
  const [togglingBonusId, setTogglingBonusId] = useState<string | null>(null);
  const [configOpen, setConfigOpen] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    const [{ data: tipos }, { data: edicoes }, { data: evts }, { data: turmasData }] = await Promise.all([
      supabase.from('bonus_tipos').select('id, nome, ativo, ordem').order('ordem', { ascending: true }),
      supabase.from('bonus_turmas').select('id, bonus_id, nome, ativo, ordem').order('ordem', { ascending: true }),
      supabase.from('aluno_bonus_eventos').select('bonus_id, bonus_turma_id, acao, created_at').eq('aluno_id', aluno.id).order('created_at', { ascending: true }),
      supabase.from('turmas').select('id, nome, produto, tipo').order('nome', { ascending: false }),
    ]);
    setBonusTipos((tipos as BonusTipo[]) || []);
    setBonusTurmas((edicoes as BonusTurma[]) || []);
    setEventos((evts as BonusEvento[]) || []);
    setTurmas(((turmasData as (TurmaOption & { produto: string | null; tipo: string })[]) || [])
      .filter(t => t.produto === aluno.produto || t.tipo === aluno.produto)
      .map(t => ({ id: t.id, nome: t.nome })));
    setLoading(false);
  }, [aluno.id, aluno.produto]);

  useEffect(() => { if (aluno.id) carregar(); }, [aluno.id, carregar]);

  // status atual de cada bônus = evento mais recente daquele par (eventos vêm em ordem crescente)
  const statusPorBonus = new Map<string, { acao: 'adicionado' | 'removido'; bonus_turma_id: string | null; created_at: string }>();
  for (const e of eventos) statusPorBonus.set(e.bonus_id, { acao: e.acao, bonus_turma_id: e.bonus_turma_id, created_at: e.created_at });

  const bonusVisiveis = bonusTipos.filter(b => b.ativo || statusPorBonus.has(b.id));

  // Turma do grupo da formação: enquanto ninguém escolheu outra, é a turma da
  // matrícula — aluno remanejado é a exceção, não a regra.
  const grupoTurmaSelecionada = aluno.grupo_turma_id ?? aluno.turma_id ?? '';

  const salvarGrupoTurma = async (confirmadoEm: string | null, grupoTurmaId: string | null) => {
    setSalvandoGrupo(true);
    const { error } = await supabase
      .from('alunos')
      .update({
        grupo_turma_confirmado_em: confirmadoEm,
        grupo_turma_confirmado_por: confirmadoEm ? user?.id ?? null : null,
        grupo_turma_id: grupoTurmaId,
      })
      .eq('id', aluno.id);
    setSalvandoGrupo(false);
    if (error) { toast({ variant: 'destructive', title: 'Erro', description: error.message }); return; }
    onGrupoTurmaChange({ confirmadoEm, grupoTurmaId });
  };

  const toggleGrupoTurma = (checked: boolean) => {
    if (!checked) return salvarGrupoTurma(null, null);
    return salvarGrupoTurma(new Date().toISOString(), grupoTurmaSelecionada || null);
  };

  const trocarGrupoTurma = (turmaId: string) =>
    salvarGrupoTurma(aluno.grupo_turma_confirmado_em ?? new Date().toISOString(), turmaId);

  // Único jeito de mexer no bônus: gravar evento novo. A tabela é append-only, então
  // trocar a turma também é um "adicionado" — o último evento é o que vale.
  const gravarEventoBonus = async (bonusId: string, acao: 'adicionado' | 'removido', bonusTurmaId: string | null) => {
    setTogglingBonusId(bonusId);
    const { error } = await supabase.from('aluno_bonus_eventos').insert({
      aluno_id: aluno.id,
      bonus_id: bonusId,
      bonus_turma_id: bonusTurmaId,
      acao,
      criado_por: user?.id ?? null,
    });
    setTogglingBonusId(null);
    if (error) { toast({ variant: 'destructive', title: 'Erro', description: error.message }); return; }
    carregar();
  };

  const toggleBonus = (bonusId: string, checked: boolean) => {
    const turmaAtual = statusPorBonus.get(bonusId)?.bonus_turma_id ?? null;
    return gravarEventoBonus(bonusId, checked ? 'adicionado' : 'removido', checked ? turmaAtual : null);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Grupo e Bônus</p>
        <Button size="sm" variant="ghost" className="gap-1 text-xs h-7" onClick={() => setConfigOpen(true)}>
          <Settings size={12} />Gerenciar bônus
        </Button>
      </div>

      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <Checkbox
          checked={!!aluno.grupo_turma_confirmado_em}
          disabled={salvandoGrupo}
          onCheckedChange={v => toggleGrupoTurma(v === true)}
        />
        <div className="text-sm">
          Confirmado no grupo da turma
          {aluno.grupo_turma_confirmado_em && (
            <span className="text-[11px] text-muted-foreground ml-1.5">
              (confirmado em {fmtDataHora(aluno.grupo_turma_confirmado_em)})
            </span>
          )}
        </div>
        {aluno.grupo_turma_confirmado_em && (
          <Select value={grupoTurmaSelecionada} disabled={salvandoGrupo} onValueChange={trocarGrupoTurma}>
            <SelectTrigger className="h-7 text-xs w-[190px]"><SelectValue placeholder="Turma do grupo" /></SelectTrigger>
            <SelectContent>
              {turmas.map(t => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Carregando bônus...</p>
      ) : bonusVisiveis.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum bônus cadastrado — use "Gerenciar bônus" para criar.</p>
      ) : (
        <div className="space-y-1.5">
          {bonusVisiveis.map(b => {
            const status = statusPorBonus.get(b.id);
            const checked = status?.acao === 'adicionado';
            const edicoes = bonusTurmas.filter(t => t.bonus_id === b.id && (t.ativo || t.id === status?.bonus_turma_id));
            return (
              <div key={b.id} className="flex items-center gap-2 flex-wrap">
                <Checkbox
                  checked={checked}
                  disabled={togglingBonusId === b.id || !b.ativo}
                  onCheckedChange={v => toggleBonus(b.id, v === true)}
                />
                <div className="text-sm">
                  {b.nome}
                  {!b.ativo && <span className="text-[11px] text-muted-foreground ml-1.5">(inativo)</span>}
                  {status && (
                    <span className="text-[11px] text-muted-foreground ml-1.5">
                      ({status.acao === 'adicionado' ? 'adicionado' : 'removido'} em {fmtDataHora(status.created_at)})
                    </span>
                  )}
                </div>
                {checked && (edicoes.length > 0 ? (
                  <Select
                    value={status?.bonus_turma_id ?? ''}
                    disabled={togglingBonusId === b.id}
                    onValueChange={v => gravarEventoBonus(b.id, 'adicionado', v)}
                  >
                    <SelectTrigger className="h-7 text-xs w-[170px]"><SelectValue placeholder="Turma do bônus" /></SelectTrigger>
                    <SelectContent>
                      {edicoes.map(t => <SelectItem key={t.id} value={t.id}>{t.nome}{!t.ativo ? ' (inativa)' : ''}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="text-[11px] text-muted-foreground">sem turmas — cadastre em "Gerenciar bônus"</span>
                ))}
              </div>
            );
          })}
        </div>
      )}

      <BonusConfigModal open={configOpen} onOpenChange={setConfigOpen} onChanged={carregar} />
    </div>
  );
}
