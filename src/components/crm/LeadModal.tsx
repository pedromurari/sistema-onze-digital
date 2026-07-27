import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLeads } from '@/contexts/LeadsContext';
import { Lead, PIPELINE_STAGES, FORMACOES, FORMAS_PAGAMENTO, PipelineStage } from '@/types/crm';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { User, BookOpen, DollarSign, FileText, History, Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface LeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingLead?: Lead | null;
}

const emptyForm = {
  nome: '',
  email: '',
  telefone: '',
  dataNascimento: '',
  cpf: '',
  cidade: '',
  estado: '',
  formacaoAcademica: '',
  areaAtuacao: '',
  jaFezPsicanalise: false,
  cursoInteresse: '',
  comoConheceu: '',
  valorInvestimento: '',
  formaPagamento: '',
  etapa: 'novo' as PipelineStage,
  responsavelId: '',
  proximaAcao: '',
  dataProximaAcao: '',
  observacoes: '',
};

export function LeadModal({ isOpen, onClose, editingLead }: LeadModalProps) {
  const { user, getActiveVendedores } = useAuth();
  const { cursos, fontes, addLead, updateLead, deleteLead } = useLeads();
  const { toast } = useToast();
  const [formData, setFormData] = useState(emptyForm);
  const vendedores = getActiveVendedores();

  useEffect(() => {
    if (editingLead) {
      setFormData({
        nome: editingLead.nome,
        email: editingLead.email || '',
        telefone: editingLead.telefone || '',
        dataNascimento: editingLead.dataNascimento || '',
        cpf: editingLead.cpf || '',
        cidade: editingLead.cidade || '',
        estado: editingLead.estado || '',
        formacaoAcademica: editingLead.formacaoAcademica || '',
        areaAtuacao: editingLead.areaAtuacao || '',
        jaFezPsicanalise: editingLead.jaFezPsicanalise || false,
        cursoInteresse: editingLead.cursoInteresse || '',
        comoConheceu: editingLead.comoConheceu || '',
        valorInvestimento: editingLead.valorInvestimento?.toString() || '',
        formaPagamento: editingLead.formaPagamento || '',
        etapa: editingLead.etapa || 'novo',
        responsavelId: editingLead.responsavelId || '',
        proximaAcao: editingLead.proximaAcao || '',
        dataProximaAcao: editingLead.dataProximaAcao || '',
        observacoes: editingLead.observacoes || '',
      });
    } else {
      setFormData({
        ...emptyForm,
        responsavelId: user?.id || '',
      });
    }
  }, [editingLead, isOpen, user]);

  const formatPhone = (value: string) => {
    const cleaned = value.replace(/\D/g, '');
    if (cleaned.length <= 10) {
      return cleaned.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
    }
    return cleaned.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  };

  const formatCPF = (value: string) => {
    const cleaned = value.replace(/\D/g, '');
    return cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  };

  const parseBRLMoney = (value: string): number | undefined => {
    const raw = (value || '').trim();
    if (!raw) return undefined;

    // Accept inputs like: "109,90", "109.90", "R$ 109,90"
    const normalized = raw
      .replace(/\s/g, '')
      .replace(/R\$/gi, '')
      .replace(/[^0-9.,-]/g, '');

    if (!normalized) return undefined;

    // If both separators exist, assume dot is thousands and comma is decimal.
    const hasComma = normalized.includes(',');
    const hasDot = normalized.includes('.');

    let numberLike = normalized;
    if (hasComma && hasDot) {
      numberLike = normalized.replace(/\./g, '').replace(',', '.');
    } else if (hasComma) {
      numberLike = normalized.replace(',', '.');
    }

    const n = Number(numberLike);
    return Number.isFinite(n) ? n : undefined;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.nome || !formData.telefone) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Preencha os campos obrigatórios: Nome e Telefone/WhatsApp.',
      });
      return;
    }

    if (!formData.cursoInteresse || !formData.comoConheceu) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Preencha o curso de interesse e como conheceu a escola.',
      });
      return;
    }

    if (!formData.responsavelId) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Selecione um responsável pelo lead.',
      });
      return;
    }

    const leadData = {
      nome: formData.nome,
      email: formData.email,
      telefone: formData.telefone,
      dataNascimento: formData.dataNascimento || undefined,
      cpf: formData.cpf || undefined,
      cidade: formData.cidade || undefined,
      estado: formData.estado || undefined,
      formacaoAcademica: formData.formacaoAcademica || undefined,
      areaAtuacao: formData.areaAtuacao || undefined,
      jaFezPsicanalise: formData.jaFezPsicanalise,
      cursoInteresse: formData.cursoInteresse,
      comoConheceu: formData.comoConheceu,
      valorInvestimento: parseBRLMoney(formData.valorInvestimento),
      formaPagamento: formData.formaPagamento || undefined,
      etapa: formData.etapa,
      responsavelId: formData.responsavelId,
      proximaAcao: formData.proximaAcao || undefined,
      dataProximaAcao: formData.dataProximaAcao || undefined,
      observacoes: formData.observacoes || undefined,
    };

    try {
      if (editingLead) {
        await updateLead(editingLead.id, leadData, 'Lead atualizado');
        toast({
          title: 'Lead atualizado',
          description: `${formData.nome} foi atualizado com sucesso.`,
        });
      } else {
        await addLead(leadData);
        toast({
          title: 'Lead criado',
          description: `${formData.nome} foi adicionado ao pipeline.`,
        });
      }

      onClose();
    } catch (error: any) {
      console.error('Erro ao salvar lead:', error);
      toast({
        variant: 'destructive',
        title: 'Não foi possível salvar',
        description: error?.message || 'Tente novamente.',
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingLead ? 'Editar Lead' : 'Novo Lead'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <Tabs defaultValue="pessoal" className="space-y-4">
            <TabsList className="grid grid-cols-4 bg-muted">
              <TabsTrigger value="pessoal" className="text-xs sm:text-sm">
                <User className="h-4 w-4 mr-1 hidden sm:inline" />
                Pessoal
              </TabsTrigger>
              <TabsTrigger value="academico" className="text-xs sm:text-sm">
                <BookOpen className="h-4 w-4 mr-1 hidden sm:inline" />
                Acadêmico
              </TabsTrigger>
              <TabsTrigger value="comercial" className="text-xs sm:text-sm">
                <DollarSign className="h-4 w-4 mr-1 hidden sm:inline" />
                Comercial
              </TabsTrigger>
              <TabsTrigger value="obs" className="text-xs sm:text-sm">
                <FileText className="h-4 w-4 mr-1 hidden sm:inline" />
                Obs
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pessoal" className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label>Nome completo *</Label>
                  <Input
                    value={formData.nome}
                    onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                    placeholder="Nome do lead"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="email@exemplo.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Telefone/WhatsApp *</Label>
                  <Input
                    value={formData.telefone}
                    onChange={(e) => setFormData({ ...formData, telefone: formatPhone(e.target.value) })}
                    placeholder="(00) 00000-0000"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Data de nascimento</Label>
                  <Input
                    type="date"
                    value={formData.dataNascimento}
                    onChange={(e) => setFormData({ ...formData, dataNascimento: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>CPF</Label>
                  <Input
                    value={formData.cpf}
                    onChange={(e) => setFormData({ ...formData, cpf: formatCPF(e.target.value) })}
                    placeholder="000.000.000-00"
                    maxLength={14}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Cidade</Label>
                  <Input
                    value={formData.cidade}
                    onChange={(e) => setFormData({ ...formData, cidade: e.target.value })}
                    placeholder="Cidade"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Estado</Label>
                  <Input
                    value={formData.estado}
                    onChange={(e) => setFormData({ ...formData, estado: e.target.value })}
                    placeholder="UF"
                    maxLength={2}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="academico" className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Formação acadêmica</Label>
                  <Select
                    value={formData.formacaoAcademica}
                    onValueChange={(value) => setFormData({ ...formData, formacaoAcademica: value })}
                  >
                    <SelectTrigger className="bg-card">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border z-50">
                      {FORMACOES.map((f) => (
                        <SelectItem key={f} value={f}>{f}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Área de atuação</Label>
                  <Input
                    value={formData.areaAtuacao}
                    onChange={(e) => setFormData({ ...formData, areaAtuacao: e.target.value })}
                    placeholder="Psicologia, Medicina, etc."
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Curso de interesse *</Label>
                  <Select
                    value={formData.cursoInteresse}
                    onValueChange={(value) => setFormData({ ...formData, cursoInteresse: value })}
                  >
                    <SelectTrigger className="bg-card">
                      <SelectValue placeholder="Selecione o curso" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border z-50">
                      {cursos.map((c) => (
                        <SelectItem key={c.id} value={c.nome}>{c.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Já fez cursos de psicanálise antes?</Label>
                  <Select
                    value={formData.jaFezPsicanalise ? 'sim' : 'nao'}
                    onValueChange={(value) => setFormData({ ...formData, jaFezPsicanalise: value === 'sim' })}
                  >
                    <SelectTrigger className="bg-card">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border z-50">
                      <SelectItem value="nao">Não</SelectItem>
                      <SelectItem value="sim">Sim</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="comercial" className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Como conheceu a escola? *</Label>
                  <Select
                    value={formData.comoConheceu}
                    onValueChange={(value) => setFormData({ ...formData, comoConheceu: value })}
                  >
                    <SelectTrigger className="bg-card">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border z-50">
                      {fontes.map((f) => (
                        <SelectItem key={f.id} value={f.nome}>{f.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Valor do investimento (R$)</Label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={formData.valorInvestimento}
                    onChange={(e) => setFormData({ ...formData, valorInvestimento: e.target.value })}
                    placeholder="Ex: 109,90"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Forma de pagamento</Label>
                  <Select
                    value={formData.formaPagamento}
                    onValueChange={(value) => setFormData({ ...formData, formaPagamento: value })}
                  >
                    <SelectTrigger className="bg-card">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border z-50">
                      {FORMAS_PAGAMENTO.map((f) => (
                        <SelectItem key={f} value={f}>{f}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Etapa do funil</Label>
                  <Select
                    value={formData.etapa}
                    onValueChange={(value: PipelineStage) => setFormData({ ...formData, etapa: value })}
                  >
                    <SelectTrigger className="bg-card">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border z-50">
                      {PIPELINE_STAGES.map((s) => (
                        <SelectItem key={s.key} value={s.key}>
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${s.color}`} />
                            {s.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Responsável pelo lead *</Label>
                  <Select
                    value={formData.responsavelId}
                    onValueChange={(value) => setFormData({ ...formData, responsavelId: value })}
                  >
                    <SelectTrigger className="bg-card">
                      <SelectValue placeholder="Selecione o responsável" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border z-50">
                      {vendedores.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          <div className="flex items-center gap-2">
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: v.cor }}
                            />
                            {v.nome} ({v.tipo})
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Próxima ação</Label>
                  <Input
                    value={formData.proximaAcao}
                    onChange={(e) => setFormData({ ...formData, proximaAcao: e.target.value })}
                    placeholder="Ex: Ligar, Enviar proposta"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Data da próxima ação</Label>
                  <Input
                    type="date"
                    value={formData.dataProximaAcao}
                    onChange={(e) => setFormData({ ...formData, dataProximaAcao: e.target.value })}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="obs" className="space-y-4">
              <div className="space-y-2">
                <Label>Observações</Label>
                <Textarea
                  value={formData.observacoes}
                  onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                  placeholder="Notas adicionais sobre o lead..."
                  rows={6}
                />
              </div>

              {editingLead && (editingLead.historico?.length ?? 0) > 0 && (
                <div className="space-y-2 pt-4 border-t border-border">
                  <Label className="flex items-center gap-2">
                    <History className="h-4 w-4" />
                    Histórico
                  </Label>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {(editingLead.historico || []).map((item) => (
                      <div key={item.id} className="text-sm p-2 bg-muted rounded">
                        <div className="flex justify-between text-muted-foreground text-xs mb-1">
                          <span>{item.usuarioNome}</span>
                          <span>{new Date(item.data).toLocaleString('pt-BR')}</span>
                        </div>
                        <p className="text-foreground">{item.acao}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>

          <div className="flex gap-3 mt-6">
            {editingLead && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button type="button" variant="destructive" size="icon">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="bg-card border-border">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir Lead</AlertDialogTitle>
                    <AlertDialogDescription>
                      Tem certeza que deseja excluir "{editingLead.nome}"? Esta ação não pode ser desfeita.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={async () => {
                        await deleteLead(editingLead.id);
                        toast({
                          title: 'Lead excluído',
                          description: `${editingLead.nome} foi removido do pipeline.`,
                        });
                        onClose();
                      }}
                    >
                      Excluir
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancelar
            </Button>
            <Button type="submit" className="flex-1 gradient-primary hover:opacity-90">
              {editingLead ? 'Salvar Alterações' : 'Criar Lead'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
