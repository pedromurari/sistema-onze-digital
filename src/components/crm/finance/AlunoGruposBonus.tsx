import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from '@/components/ui/use-toast';
import { Settings } from 'lucide-react';
import { BonusConfigModal } from './BonusConfigModal';

interface BonusTipo {
  id: string;
  nome: string;
  ativo: boolean;
  ordem: number;
}

interface BonusEvento {
  bonus_id: string;
  acao: 'adicionado' | 'removido';
  created_at: string;
}

function fmtDataHora(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function AlunoGruposBonus({ aluno, onGrupoTurmaChange }: {
  aluno: { id: string; grupo_turma_confirmado_em: string | null };
  onGrupoTurmaChange: (confirmadoEm: string | null) => void;
}) {
  const { user } = useAuth();
  const [bonusTipos, setBonusTipos] = useState<BonusTipo[]>([]);
  const [eventos, setEventos] = useState<BonusEvento[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvandoGrupo, setSalvandoGrupo] = useState(false);
  const [togglingBonusId, setTogglingBonusId] = useState<string | null>(null);
  const [configOpen, setConfigOpen] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    const [{ data: tipos }, { data: evts }] = await Promise.all([
      supabase.from('bonus_tipos').select('id, nome, ativo, ordem').order('ordem', { ascending: true }),
      supabase.from('aluno_bonus_eventos').select('bonus_id, acao, created_at').eq('aluno_id', aluno.id).order('created_at', { ascending: true }),
    ]);
    setBonusTipos((tipos as BonusTipo[]) || []);
    setEventos((evts as BonusEvento[]) || []);
    setLoading(false);
  }, [aluno.id]);

  useEffect(() => { if (aluno.id) carregar(); }, [aluno.id, carregar]);

  // status atual de cada bônus = ação do evento mais recente daquele par (eventos vêm em ordem crescente)
  const statusPorBonus = new Map<string, { acao: 'adicionado' | 'removido'; created_at: string }>();
  for (const e of eventos) statusPorBonus.set(e.bonus_id, { acao: e.acao, created_at: e.created_at });

  const bonusVisiveis = bonusTipos.filter(b => b.ativo || statusPorBonus.has(b.id));

  const toggleGrupoTurma = async (checked: boolean) => {
    setSalvandoGrupo(true);
    const confirmadoEm = checked ? new Date().toISOString() : null;
    const { error } = await supabase
      .from('alunos')
      .update({
        grupo_turma_confirmado_em: confirmadoEm,
        grupo_turma_confirmado_por: checked ? user?.id ?? null : null,
      })
      .eq('id', aluno.id);
    setSalvandoGrupo(false);
    if (error) { toast({ variant: 'destructive', title: 'Erro', description: error.message }); return; }
    onGrupoTurmaChange(confirmadoEm);
  };

  const toggleBonus = async (bonusId: string, checked: boolean) => {
    setTogglingBonusId(bonusId);
    const { error } = await supabase.from('aluno_bonus_eventos').insert({
      aluno_id: aluno.id,
      bonus_id: bonusId,
      acao: checked ? 'adicionado' : 'removido',
      criado_por: user?.id ?? null,
    });
    setTogglingBonusId(null);
    if (error) { toast({ variant: 'destructive', title: 'Erro', description: error.message }); return; }
    carregar();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Grupo e Bônus</p>
        <Button size="sm" variant="ghost" className="gap-1 text-xs h-7" onClick={() => setConfigOpen(true)}>
          <Settings size={12} />Gerenciar bônus
        </Button>
      </div>

      <div className="flex items-center gap-2 mb-2">
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
            return (
              <div key={b.id} className="flex items-center gap-2">
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
              </div>
            );
          })}
        </div>
      )}

      <BonusConfigModal open={configOpen} onOpenChange={setConfigOpen} onChanged={carregar} />
    </div>
  );
}
