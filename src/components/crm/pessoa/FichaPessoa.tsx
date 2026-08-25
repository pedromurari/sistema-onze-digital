import { useMemo } from 'react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  UserPlus, ArrowRightLeft, GraduationCap, DollarSign,
  MessageCircle, CalendarDays, Phone, Mail, Layers, Clock, IdCard,
} from 'lucide-react';
import {
  useVinculosDaPessoa, useTimelineDaPessoa,
  type Pessoa, type PapelPessoa, type TipoEventoPessoa,
} from '@/lib/db';
import { StatTile, SectionBar, AvatarPessoa } from '@/components/crm/ui/premium';

/**
 * Ficha da Pessoa.
 *
 * A peça que faltava: hoje, para entender um contato, é preciso abrir Pipeline, Time
 * Comercial, Financeiro e o Chat e cruzar de cabeça — quando se lembra de que a mesma
 * pessoa existe nos quatro. Na base, 98% dos cadastros pertencem a alguém que aparece em
 * duas ou mais tabelas.
 *
 * O escopo é da RLS, não daqui: uma investidora só alcança as pessoas das turmas dela, e
 * parceiro não alcança nenhuma. Este componente não filtra nada por conta própria.
 */

const ROTULO_PAPEL: Record<PapelPessoa, string> = {
  lead: 'Lead',
  aluno: 'Aluno',
  parceiro: 'Parceiro',
  convidado: 'Convidado de evento',
  investidor: 'Investidor',
  colaborador: 'Colaborador',
};

const ICONE_EVENTO: Record<TipoEventoPessoa, React.ElementType> = {
  lead_criado: UserPlus,
  fase_mudou: ArrowRightLeft,
  matricula: GraduationCap,
  pagamento: DollarSign,
  mensagem: MessageCircle,
  evento_npa: CalendarDays,
};

const ROTULO_ORIGEM: Record<string, string> = {
  leads: 'Time Comercial',
  lancamento_leads: 'Lançamento',
  alunos: 'Financeiro',
  npa_evento_leads: 'Evento NPA',
  disparo_leads: 'Disparos',
  seu_numerologo_leads: 'Seu Numerólogo',
  franquia_leads: 'Franquias',
};

function formatarTelefone(tel: string | null) {
  if (!tel) return '—';
  // Chega como 55 + DDD + número; mostra no formato que a pessoa reconhece.
  const semPais = tel.startsWith('55') ? tel.slice(2) : tel;
  const ddd = semPais.slice(0, 2);
  const resto = semPais.slice(2);
  const meio = resto.length === 9 ? resto.slice(0, 5) : resto.slice(0, 4);
  return `(${ddd}) ${meio}-${resto.slice(meio.length)}`;
}

function formatarCpf(cpf: string | null) {
  if (!cpf) return null;
  const digitos = cpf.replace(/\D/g, '');
  if (digitos.length !== 11) return cpf;
  return `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-${digitos.slice(9)}`;
}

function dataCurta(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
  });
}

function horaCurta(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function FichaPessoa({
  pessoa, aberta, onFechar,
}: {
  pessoa: Pessoa | null;
  aberta: boolean;
  onFechar: () => void;
}) {
  const { data: vinculos, isLoading: carregandoVinculos } = useVinculosDaPessoa(pessoa?.id);
  const { data: eventos, isLoading: carregandoEventos } = useTimelineDaPessoa(pessoa?.id);

  const papeis = useMemo(
    () => [...new Set((vinculos ?? []).map(v => v.papel))],
    [vinculos],
  );

  const origens = useMemo(
    () => [...new Set((vinculos ?? []).map(v => v.origem_tabela))],
    [vinculos],
  );

  // O evento mais antigo é o começo do relacionamento — normalmente muito antes da
  // matrícula, e é o dado que ninguém conseguia ver sem abrir quatro telas.
  const primeiroContato = useMemo(() => {
    if (!eventos?.length) return null;
    return eventos[eventos.length - 1].quando;   // a lista vem do mais recente ao mais antigo
  }, [eventos]);

  const diasDeRelacionamento = useMemo(() => {
    if (!primeiroContato) return null;
    const dias = Math.floor((Date.now() - new Date(primeiroContato).getTime()) / 86400000);
    return dias;
  }, [primeiroContato]);

  if (!pessoa) return null;

  const nome = pessoa.nome || 'Sem nome';

  return (
    <Sheet open={aberta} onOpenChange={aberto => { if (!aberto) onFechar(); }}>
      <SheetContent side="right" className="w-full sm:max-w-xl p-0 flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-4 border-b">
          <div className="flex items-start gap-3">
            <AvatarPessoa nome={nome} id={pessoa.id} size="lg" />
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-left text-base leading-tight truncate">{nome}</SheetTitle>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                {pessoa.telefone && (
                  <a
                    href={`https://wa.me/${pessoa.telefone}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
                  >
                    <Phone className="h-3 w-3" />
                    {formatarTelefone(pessoa.telefone)}
                  </a>
                )}
                {pessoa.email && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground truncate">
                    <Mail className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">{pessoa.email}</span>
                  </span>
                )}
                {pessoa.cpf && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <IdCard className="h-3 w-3 flex-shrink-0" />
                    {formatarCpf(pessoa.cpf)}
                  </span>
                )}
              </div>

              {papeis.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {papeis.map(p => (
                    <Badge key={p} variant="secondary" className="text-[10px]">
                      {ROTULO_PAPEL[p] ?? p}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="px-5 py-4 space-y-5">
            <div className="grid grid-cols-3 gap-2">
              <StatTile
                label="Cadastros"
                value={carregandoVinculos ? '—' : (vinculos?.length ?? 0)}
                hint={origens.length > 1 ? `em ${origens.length} módulos` : undefined}
                icon={Layers}
              />
              <StatTile
                label="Eventos"
                value={carregandoEventos ? '—' : (eventos?.length ?? 0)}
                icon={ArrowRightLeft}
              />
              <StatTile
                label="Relacionamento"
                value={diasDeRelacionamento === null ? '—' : `${diasDeRelacionamento}d`}
                hint={primeiroContato ? `desde ${dataCurta(primeiroContato)}` : undefined}
                icon={Clock}
              />
            </div>

            {origens.length > 1 && (
              <div>
                <SectionBar
                  title="Onde essa pessoa aparece"
                  subtitle="Os mesmos dados estavam espalhados por estes módulos."
                  icon={Layers}
                />
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  {origens.map(o => (
                    <Badge key={o} variant="outline" className="text-[10px]">
                      {ROTULO_ORIGEM[o] ?? o}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div>
              <SectionBar
                title="Linha do tempo"
                subtitle="Do mais recente para o mais antigo, juntando todos os módulos."
                icon={Clock}
              />

              <div className="mt-3 space-y-0">
                {carregandoEventos && (
                  <div className="space-y-2">
                    {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                  </div>
                )}

                {!carregandoEventos && !eventos?.length && (
                  <p className="text-xs text-muted-foreground py-6 text-center">
                    Nenhum evento registrado para esta pessoa.
                  </p>
                )}

                {(eventos ?? []).map((ev, idx) => {
                  const Icone = ICONE_EVENTO[ev.tipo] ?? ArrowRightLeft;
                  const ultimo = idx === (eventos?.length ?? 0) - 1;
                  return (
                    <div key={`${ev.origem_tabela}-${ev.origem_id}-${idx}`} className="flex gap-3">
                      {/* trilho vertical ligando os eventos */}
                      <div className="flex flex-col items-center flex-shrink-0">
                        <div className="w-6 h-6 rounded-md bg-primary/10 text-primary flex items-center justify-center">
                          <Icone className="h-3.5 w-3.5" />
                        </div>
                        {!ultimo && <div className="w-px flex-1 bg-border min-h-3" />}
                      </div>

                      <div className="pb-4 min-w-0 flex-1">
                        <p className="text-xs font-medium text-foreground leading-tight">{ev.titulo}</p>
                        {ev.detalhe && (
                          <p className="text-xs text-muted-foreground leading-tight mt-0.5 line-clamp-2">
                            {ev.detalhe}
                          </p>
                        )}
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {dataCurta(ev.quando)} às {horaCurta(ev.quando)}
                          {' · '}
                          {ROTULO_ORIGEM[ev.origem_tabela] ?? ev.origem_tabela}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </ScrollArea>

        <div className="border-t px-5 py-3 flex justify-end">
          <Button variant="outline" size="sm" onClick={onFechar}>Fechar</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
