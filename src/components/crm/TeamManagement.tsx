import { useEffect, useState } from 'react';
import { useAuth, AppUser, UserRole } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { AccessPermissions, getDefaultPermissions } from '@/lib/access-control';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, UserCheck, UserX, Loader2, Tag, CheckCircle2, XCircle } from 'lucide-react';
import { loadNomenclaturas as loadNomenclaturasShared, saveNomenclaturas as saveNomenclaturasShared, getRoleLabel as getRoleLabelShared, getDisplayRole } from '@/lib/role-labels';

const COLORS = [
  '#A93356', '#D65876', '#4A90E2', '#28A745', '#F4A460',
  '#6C5CE7', '#00B894', '#E17055', '#636E72', '#2D3436',
];

const MODULE_PERMISSIONS: Array<{ key: keyof AccessPermissions; label: string; emoji: string }> = [
  { key: 'canViewDashboard',   label: 'Dashboard',      emoji: '📊' },
  { key: 'canViewPipeline',    label: 'Leads diretos',  emoji: '🎯' },
  { key: 'canViewLancamentos', label: 'Lançamentos',    emoji: '🚀' },
  { key: 'canViewNpa',         label: 'NPA',            emoji: '📅' },
  { key: 'canViewAulaSecreta', label: 'Aula secreta',   emoji: '🔒' },
  { key: 'canViewFinanceiro',    label: 'Financeiro',     emoji: '💰' },
  { key: 'canViewFinanceiroCfo', label: 'Análise CFO',   emoji: '📉' },
  { key: 'canViewBalanco',       label: 'Balanço',        emoji: '📈' },
  { key: 'canViewCobranca',    label: 'Cobrança',       emoji: '📲' },
  { key: 'canViewOperacoes',   label: 'Operações',      emoji: '🗓️' },
  { key: 'canViewMapaMental',  label: 'Mapa mental',    emoji: '🧠' },
  { key: 'canViewRodrygo',     label: 'Tarefas Rodrygo',emoji: '✅' },
  { key: 'canViewTimeComercial', label: 'Time Comercial', emoji: '📞' },
  { key: 'canViewFranquiaPsi', label: 'IDM PSI Franquias', emoji: '🏫' },
  { key: 'canViewTeam',        label: 'Equipe',         emoji: '👥' },
  { key: 'canViewSettings',    label: 'Configurações',  emoji: '⚙️' },
];

// ─── Custom nomenclature (localStorage, fallback padrão por tipo) ───────────
// Nomenclaturas por tipo ficam em localStorage/role-labels.ts; o cargo individual
// (por pessoa) é persistido no banco (profiles.cargo) e tem prioridade — ver getDisplayRole.

const loadNomenclaturas = loadNomenclaturasShared;
const saveNomenclaturas = saveNomenclaturasShared;
const getRoleLabel = getRoleLabelShared;

// ─── Types ────────────────────────────────────────────────────────────────────

interface LancamentoOption { id: string; nome: string; }
interface TurmaOption       { id: string; nome: string; }

// ─── Component ────────────────────────────────────────────────────────────────

export function TeamManagement() {
  const { user, users, addUser, updateUser, updateUserPermissions, deleteUser } = useAuth();
  const [isOpen, setIsOpen]       = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [loading, setLoading]     = useState(false);
  const [availableLancamentos, setAvailableLancamentos] = useState<LancamentoOption[]>([]);
  const [availableFinanceiroTurmas, setAvailableFinanceiroTurmas] = useState<TurmaOption[]>([]);
  const [permissions, setPermissions] = useState<AccessPermissions>(getDefaultPermissions('vendedor'));
  const [formData, setFormData]   = useState({
    nome: '', email: '', senha: '', tipo: 'vendedor' as UserRole, cor: COLORS[0], cargo: '',
  });

  // Nomenclature editor
  const [nomenclaturas, setNomenclaturas]   = useState<Record<string, string>>(loadNomenclaturas);
  const [nomenOpen, setNomenOpen]           = useState(false);
  const [nomenDraft, setNomenDraft]         = useState<Record<string, string>>({});

  // Inativos ficam ocultos por padrão — exclusão real fica bloqueada quando o usuário
  // tem histórico vinculado (leads, tarefas etc.), então "excluir" na prática é isso.
  const [showInactive, setShowInactive] = useState(false);
  const inactiveCount = users.filter(u => !u.ativo).length;
  const visibleUsers = users.filter(u => showInactive || u.ativo);

  useEffect(() => {
    const load = async () => {
      const [{ data: l }, { data: ft }] = await Promise.all([
        supabase.from('lancamentos').select('id, nome').order('created_at', { ascending: false }),
        supabase.from('turmas').select('id, nome').order('created_at', { ascending: false }),
      ]);
      setAvailableLancamentos(l || []);
      setAvailableFinanceiroTurmas(ft || []);
    };
    load();
  }, []);

  const resetForm = () => {
    const nextRole: UserRole = 'vendedor';
    setFormData({ nome: '', email: '', senha: '', tipo: nextRole, cor: COLORS[Math.floor(Math.random() * COLORS.length)], cargo: '' });
    setPermissions(getDefaultPermissions(nextRole));
    setEditingUser(null);
  };

  const openEdit = (userToEdit: AppUser) => {
    setEditingUser(userToEdit);
    setFormData({ nome: userToEdit.nome, email: userToEdit.email, senha: '', tipo: userToEdit.tipo, cor: userToEdit.cor, cargo: userToEdit.cargo ?? '' });
    setPermissions({ ...userToEdit.permissions });
    setIsOpen(true);
  };

  const handleRoleChange = (value: UserRole) => {
    setFormData(prev => ({ ...prev, tipo: value }));
    if (!editingUser) setPermissions(getDefaultPermissions(value));
  };

  const togglePermission = (key: keyof AccessPermissions, checked: boolean) => {
    setPermissions(prev => {
      const next = { ...prev, [key]: checked };
      if (key === 'canViewLancamentos' && !checked) { next.canViewAllLancamentos = false; next.allowedLancamentoIds = []; }
      if (key === 'canViewFinanceiro' && !checked) { next.canViewFinanceiroCfo = false; next.canViewAllFinanceiroTurmas = false; next.allowedFinanceiroTurmaIds = []; }
      if (key === 'canViewAllLancamentos' && checked) next.allowedLancamentoIds = [];
      if (key === 'canViewAllFinanceiroTurmas' && checked) next.allowedFinanceiroTurmaIds = [];
      return next;
    });
  };

  const toggleLancamento    = (id: string, checked: boolean) => setPermissions(prev => ({ ...prev, allowedLancamentoIds: checked ? [...new Set([...prev.allowedLancamentoIds, id])] : prev.allowedLancamentoIds.filter(i => i !== id) }));
  const toggleFinanceiroTurma = (id: string, checked: boolean) => setPermissions(prev => ({ ...prev, allowedFinanceiroTurmaIds: checked ? [...new Set([...prev.allowedFinanceiroTurmaIds, id])] : prev.allowedFinanceiroTurmaIds.filter(i => i !== id) }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (!formData.nome || !formData.email) {
      toast.error('Preencha todos os campos obrigatórios.');
      setLoading(false);
      return;
    }

    if (editingUser) {
      const result = await updateUser(editingUser.id, { nome: formData.nome, tipo: formData.tipo, cor: formData.cor, cargo: formData.cargo.trim() || null });
      if (!result.success) { toast.error(result.error || 'Erro ao atualizar usuário.'); setLoading(false); return; }
      const permResult = await updateUserPermissions(editingUser.id, permissions);
      if (!permResult.success) { toast.error(permResult.error || 'Erro ao atualizar permissões.'); setLoading(false); return; }
      toast.success('Usuário e permissões atualizados!');
      setIsOpen(false);
      resetForm();
      setLoading(false);
      return;
    }

    if (!formData.senha) { toast.error('A senha é obrigatória para novos usuários.'); setLoading(false); return; }
    if (users.some(u => u.email.toLowerCase() === formData.email.toLowerCase())) {
      toast.error('Este email já está cadastrado.');
      setLoading(false);
      return;
    }

    const result = await addUser({ nome: formData.nome, email: formData.email, senha: formData.senha, tipo: formData.tipo, cor: formData.cor });
    if (!result.success || !result.user) { toast.error(result.error || 'Erro ao criar usuário.'); setLoading(false); return; }
    const permResult = await updateUserPermissions(result.user.id, permissions);
    if (!permResult.success) {
      toast.warning('Usuário criado, mas houve erro ao salvar permissões. Revise manualmente.');
      setLoading(false);
      return;
    }
    if (formData.cargo.trim()) {
      const cargoResult = await updateUser(result.user.id, { cargo: formData.cargo.trim() });
      if (!cargoResult.success) toast.warning('Usuário criado, mas houve erro ao salvar o cargo. Revise manualmente.');
    }
    toast.success(`Usuário criado! Email: ${result.user.email} | Senha: ${formData.senha}`);
    setIsOpen(false);
    resetForm();
    setLoading(false);
  };

  const handleToggleStatus = async (u: AppUser) => {
    if (u.id === user?.id) { toast.error('Não é possível desativar sua própria conta.'); return; }
    const result = await updateUser(u.id, { ativo: !u.ativo });
    if (result.success) toast.success(u.ativo ? 'Usuário desativado' : 'Usuário ativado');
    else toast.error(result.error || 'Erro ao alterar status.');
  };

  const handleDelete = async (u: AppUser) => {
    if (u.id === user?.id) { toast.error('Não é possível excluir sua própria conta.'); return; }
    const result = await deleteUser(u.id);
    if (result.success) toast.success(`${u.nome} foi desativado do sistema.`);
    else toast.error(result.error || 'Erro ao excluir usuário.');
  };

  const getInitials = (name: string) =>
    name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const selectedLancamentosCount       = permissions.canViewAllLancamentos ? availableLancamentos.length : permissions.allowedLancamentoIds.length;
  const selectedFinanceiroTurmasCount  = permissions.canViewAllFinanceiroTurmas ? availableFinanceiroTurmas.length : permissions.allowedFinanceiroTurmaIds.length;

  const openNomen = () => { setNomenDraft({ ...nomenclaturas }); setNomenOpen(true); };
  const saveNomen = () => {
    const clean: Record<string, string> = {};
    Object.entries(nomenDraft).forEach(([k, v]) => { if (v.trim()) clean[k] = v.trim(); });
    setNomenclaturas(clean);
    saveNomenclaturas(clean);
    setNomenOpen(false);
    toast.success('Nomenclaturas salvas!');
  };

  return (
    <div className="p-4 lg:p-6 space-y-6 animate-fade-in pb-20 lg:pb-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Gestão da Equipe</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{visibleUsers.length} colaboradores cadastrados</p>
        </div>
        <div className="flex items-center gap-2">
          {inactiveCount > 0 && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowInactive(v => !v)}>
              {showInactive ? <XCircle size={14}/> : <CheckCircle2 size={14}/>}
              {showInactive ? 'Ocultar inativos' : `Mostrar inativos (${inactiveCount})`}
            </Button>
          )}
          <Button variant="outline" size="sm" className="gap-1.5" onClick={openNomen}>
            <Tag size={14}/> Nomenclaturas
          </Button>
          <Dialog open={isOpen} onOpenChange={open => { setIsOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="gradient-primary hover:opacity-90 gap-1.5">
                <Plus className="h-4 w-4" /> Novo Usuário
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingUser ? 'Editar Usuário' : 'Novo Usuário'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid gap-6 lg:grid-cols-2">
                  {/* Left: basic info */}
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="nome">Nome completo *</Label>
                      <Input id="nome" value={formData.nome} onChange={e => setFormData({ ...formData, nome: e.target.value })} placeholder="Nome do usuário" required disabled={loading} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email *</Label>
                      <Input id="email" type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} placeholder="email@exemplo.com" required disabled={loading || !!editingUser} />
                      {editingUser && <p className="text-xs text-muted-foreground">O email não pode ser alterado.</p>}
                    </div>
                    {!editingUser && (
                      <div className="space-y-2">
                        <Label htmlFor="senha">Senha *</Label>
                        <Input id="senha" type="password" value={formData.senha} onChange={e => setFormData({ ...formData, senha: e.target.value })} placeholder="Mínimo 12 caracteres" required disabled={loading} minLength={12} />
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label>Tipo de acesso</Label>
                      <Select value={formData.tipo} onValueChange={(value: UserRole) => handleRoleChange(value)} disabled={loading}>
                        <SelectTrigger className="bg-card"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-card border-border z-50">
                          <SelectItem value="vendedor">{getRoleLabel('vendedor', nomenclaturas)}</SelectItem>
                          <SelectItem value="gestor">Gestor(a)</SelectItem>
                          <SelectItem value="investidor">Investidor(a)</SelectItem>
                          <SelectItem value="admin">Administrador</SelectItem>
                          <SelectItem value="parceiro">Parceiro(a)</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">Define o conjunto de permissões padrão e o comportamento de login. Gestor(a) opera o negócio inteiro mas não mexe em Configurações, Equipe, Produtos nem Parceiros. Investidor(a) vê o Financeiro apenas das turmas liberadas abaixo. Parceiro(a) não entra no CRM — cai direto no Portal da Parceira.</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cargo">Cargo / título exibido</Label>
                      <Input
                        id="cargo"
                        value={formData.cargo}
                        onChange={e => setFormData({ ...formData, cargo: e.target.value })}
                        placeholder={`Ex: Diretor IDM, Investidora... (padrão: ${getRoleLabel(formData.tipo, nomenclaturas)})`}
                        disabled={loading}
                      />
                      <p className="text-xs text-muted-foreground">Título mostrado para essa pessoa em toda a plataforma. Deixe vazio para usar o padrão do tipo de acesso.</p>
                    </div>
                    <div className="space-y-2">
                      <Label>Cor de identificação</Label>
                      <div className="flex gap-2 flex-wrap">
                        {COLORS.map(color => (
                          <button key={color} type="button" onClick={() => setFormData({ ...formData, cor: color })}
                            className={`w-8 h-8 rounded-full transition-transform ${formData.cor === color ? 'ring-2 ring-offset-2 ring-primary scale-110' : ''}`}
                            style={{ backgroundColor: color }} disabled={loading} />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Right: permissions */}
                  <div className="space-y-4">
                    {formData.tipo === 'parceiro' ? (
                      <div className="rounded-xl border border-border p-4 space-y-2 bg-muted/30">
                        <h3 className="font-semibold text-foreground">Sem permissões de módulo</h3>
                        <p className="text-xs text-muted-foreground">
                          Parceira(o) não acessa o CRM — o login cai direto no Portal da Parceira, mostrando só os produtos, o desempenho e as entregas dela. Essas permissões de módulo não se aplicam a esse tipo de acesso.
                        </p>
                      </div>
                    ) : (
                    <div className="rounded-xl border border-border p-4 space-y-3">
                      <div>
                        <h3 className="font-semibold text-foreground">Permissões de módulos</h3>
                        <p className="text-xs text-muted-foreground">Defina exatamente o que este colaborador pode ver.</p>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {MODULE_PERMISSIONS.map(item => (
                          <label key={item.key} className="flex items-center gap-2.5 text-sm cursor-pointer group">
                            <Checkbox
                              checked={Boolean(permissions[item.key])}
                              onCheckedChange={checked => togglePermission(item.key, checked === true)}
                              disabled={loading}
                            />
                            <span className="text-base leading-none">{item.emoji}</span>
                            <span className="text-foreground/80 group-hover:text-foreground transition-colors">{item.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    )}

                    {formData.tipo !== 'parceiro' && permissions.canViewLancamentos && (
                      <div className="rounded-xl border border-border p-4 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <h3 className="font-semibold text-foreground">Lançamentos liberados</h3>
                            <p className="text-xs text-muted-foreground">Escolha quais lançamentos este colaborador pode acessar.</p>
                          </div>
                          <Badge variant="outline">{selectedLancamentosCount} liberado(s)</Badge>
                        </div>
                        <label className="flex items-center gap-3 text-sm cursor-pointer">
                          <Checkbox checked={permissions.canViewAllLancamentos} onCheckedChange={checked => togglePermission('canViewAllLancamentos', checked === true)} disabled={loading} />
                          <span>Ver todos os lançamentos</span>
                        </label>
                        {!permissions.canViewAllLancamentos && (
                          <ScrollArea className="h-36 rounded-md border border-border p-3">
                            <div className="space-y-3">
                              {availableLancamentos.map(l => (
                                <label key={l.id} className="flex items-center gap-3 text-sm cursor-pointer">
                                  <Checkbox checked={permissions.allowedLancamentoIds.includes(l.id)} onCheckedChange={checked => toggleLancamento(l.id, checked === true)} disabled={loading} />
                                  <span>{l.nome}</span>
                                </label>
                              ))}
                              {availableLancamentos.length === 0 && <p className="text-xs text-muted-foreground">Nenhum lançamento encontrado.</p>}
                            </div>
                          </ScrollArea>
                        )}
                      </div>
                    )}

                    {formData.tipo !== 'parceiro' && permissions.canViewFinanceiro && (
                      <div className="rounded-xl border border-border p-4 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <h3 className="font-semibold text-foreground">Turmas financeiro</h3>
                            <p className="text-xs text-muted-foreground">Defina quais turmas do Financeiro este colaborador pode ver.</p>
                          </div>
                          <Badge variant="outline">{selectedFinanceiroTurmasCount} liberada(s)</Badge>
                        </div>
                        <label className="flex items-center gap-3 text-sm cursor-pointer">
                          <Checkbox checked={permissions.canViewAllFinanceiroTurmas} onCheckedChange={checked => togglePermission('canViewAllFinanceiroTurmas', checked === true)} disabled={loading} />
                          <span>Ver todas as turmas</span>
                        </label>
                        {!permissions.canViewAllFinanceiroTurmas && (
                          <ScrollArea className="h-36 rounded-md border border-border p-3">
                            <div className="space-y-3">
                              {availableFinanceiroTurmas.map(t => (
                                <label key={t.id} className="flex items-center gap-3 text-sm cursor-pointer">
                                  <Checkbox checked={permissions.allowedFinanceiroTurmaIds.includes(t.id)} onCheckedChange={checked => toggleFinanceiroTurma(t.id, checked === true)} disabled={loading} />
                                  <span>{t.nome}</span>
                                </label>
                              ))}
                              {availableFinanceiroTurmas.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma turma encontrada.</p>}
                            </div>
                          </ScrollArea>
                        )}
                      </div>
                    )}

                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <Button type="button" variant="outline" onClick={() => setIsOpen(false)} className="flex-1" disabled={loading}>
                    Cancelar
                  </Button>
                  <Button type="submit" className="flex-1 gradient-primary hover:opacity-90" disabled={loading}>
                    {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando...</> : editingUser ? 'Salvar' : 'Criar Usuário'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* User cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {visibleUsers.map(u => {
          const enabledModules = MODULE_PERMISSIONS.filter(item => u.permissions[item.key]);
          const disabledModules = MODULE_PERMISSIONS.filter(item => !u.permissions[item.key]);
          const roleLabel = getDisplayRole(u, nomenclaturas);

          return (
            <Card key={u.id} className={`p-4 bg-card border-border flex flex-col gap-4 ${!u.ativo ? 'opacity-60' : ''}`}>
              {/* Top: avatar + info */}
              <div className="flex items-start gap-3">
                <div
                  className="w-11 h-11 rounded-full flex items-center justify-center text-base font-bold text-primary-foreground flex-shrink-0"
                  style={{ backgroundColor: u.cor }}
                >
                  {getInitials(u.nome)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-foreground truncate">{u.nome}</h3>
                    {u.id === user?.id && <Badge variant="outline" className="text-xs">Você</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{u.email}</p>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <Badge
                      variant={u.tipo === 'admin' ? 'default' : 'secondary'}
                      className={u.tipo === 'admin' ? 'bg-primary text-xs' : 'text-xs'}
                    >
                      {roleLabel}
                    </Badge>
                    <Badge variant={u.ativo ? 'outline' : 'destructive'} className="text-xs">
                      {u.ativo ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Permissions grid */}
              {u.tipo === 'parceiro' ? (
                <div className="border rounded-lg p-3 bg-muted/30">
                  <p className="text-xs text-muted-foreground">Portal da Parceira — sem módulos de CRM.</p>
                </div>
              ) : u.tipo !== 'admin' && (
                <div className="border rounded-lg p-3 bg-muted/30 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Módulos ({enabledModules.length}/{MODULE_PERMISSIONS.length})
                  </p>
                  {/* Enabled */}
                  {enabledModules.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {enabledModules.map(item => (
                        <span
                          key={item.key}
                          className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium"
                          title={item.label}
                        >
                          {item.emoji} {item.label}
                        </span>
                      ))}
                    </div>
                  )}
                  {/* Disabled (collapsed) */}
                  {disabledModules.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {disabledModules.map(item => (
                        <span
                          key={item.key}
                          className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground/60 border border-border font-medium"
                          title={item.label}
                        >
                          {item.emoji} {item.label}
                        </span>
                      ))}
                    </div>
                  )}
                  {/* Lancamentos / Turmas summary */}
                  {u.permissions.canViewLancamentos && (
                    <p className="text-xs text-muted-foreground">
                      Lançamentos: {u.permissions.canViewAllLancamentos ? 'todos' : `${u.permissions.allowedLancamentoIds.length} específico(s)`}
                    </p>
                  )}
                </div>
              )}
              {u.tipo === 'admin' && (
                <div className="border rounded-lg p-3 bg-primary/5 border-primary/20">
                  <p className="text-xs text-primary font-medium">Acesso total — admin vê todos os módulos</p>
                </div>
              )}

              {/* Actions */}
              {u.id !== user?.id && (
                <div className="flex gap-2 pt-2 border-t border-border">
                  <Button size="sm" variant="outline" onClick={() => openEdit(u)} className="flex-1 gap-1">
                    <Edit className="h-3.5 w-3.5" /> Editar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleToggleStatus(u)}>
                    {u.ativo ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleDelete(u)} className="text-destructive hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* ─── Nomenclature editor ─────────────────────────────────────────── */}
      <Dialog open={nomenOpen} onOpenChange={setNomenOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag size={16}/> Nomenclaturas dos cargos
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Personalize como cada tipo de colaborador é exibido no sistema.
            </p>
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5 block">
                  Tipo "vendedor" exibir como
                </Label>
                <Input
                  value={nomenDraft['vendedor'] ?? ''}
                  onChange={e => setNomenDraft(p => ({ ...p, vendedor: e.target.value }))}
                  placeholder="Ex: Closer, SDR, Consultor..."
                />
                <p className="text-xs text-muted-foreground mt-1">Deixe vazio para usar "Vendedor" (padrão)</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5 block">
                  Tipo "professora" exibir como
                </Label>
                <Input
                  value={nomenDraft['professora'] ?? ''}
                  onChange={e => setNomenDraft(p => ({ ...p, professora: e.target.value }))}
                  placeholder="Ex: Mentora, Instrutora..."
                />
                <p className="text-xs text-muted-foreground mt-1">Deixe vazio para usar "Professora" (padrão)</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNomenOpen(false)}>Cancelar</Button>
            <Button onClick={saveNomen}>Salvar nomenclaturas</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
