import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, Users, Sparkles } from 'lucide-react';
import { usePessoas, type Pessoa } from '@/lib/db';
import { SectionBar, AvatarPessoa } from '@/components/crm/ui/premium';
import { useFichaPessoa } from '@/components/crm/pessoa/FichaPessoaProvider';

/**
 * Busca de pessoas — a porta de entrada da identidade unificada.
 *
 * Antes, procurar alguém significava adivinhar em qual módulo a pessoa foi cadastrada.
 * Na base, 29.171 cadastros pertencem a 12.121 pessoas: 98% dos registros são de alguém
 * que aparece em dois ou mais módulos. Aqui a busca é pela pessoa, e a ficha mostra a
 * jornada inteira.
 */

function formatarTelefone(tel: string | null) {
  if (!tel) return '';
  const semPais = tel.startsWith('55') ? tel.slice(2) : tel;
  const ddd = semPais.slice(0, 2);
  const resto = semPais.slice(2);
  const meio = resto.length === 9 ? resto.slice(0, 5) : resto.slice(0, 4);
  return `(${ddd}) ${meio}-${resto.slice(meio.length)}`;
}

export function Pessoas() {
  const [busca, setBusca] = useState('');
  // A ficha vive no provider do CRM, para abrir de qualquer tela. Esta tela deixou de
  // guardar a pessoa selecionada — só pede a abertura, igual às outras.
  const { abrirFichaPorId } = useFichaPessoa();

  const { data: pessoas, isLoading, isFetched } = usePessoas(busca);
  const termoCurto = busca.trim().length > 0 && busca.trim().length < 3;

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-4xl mx-auto">
      <SectionBar
        title="Pessoas"
        subtitle="Procure por nome, e-mail ou telefone. A ficha junta tudo o que essa pessoa já fez, em qualquer módulo."
        icon={Users}
      />

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Nome, e-mail ou telefone…"
          className="pl-9"
          autoFocus
        />
      </div>

      {termoCurto && (
        <p className="text-xs text-muted-foreground">Digite pelo menos 3 caracteres.</p>
      )}

      {isLoading && (
        <div className="space-y-2">
          {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
        </div>
      )}

      {!isLoading && isFetched && pessoas?.length === 0 && (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted-foreground">Ninguém encontrado com esse termo.</p>
          <p className="text-xs text-muted-foreground mt-1">
            O telefone pode ser digitado de qualquer jeito — com DDD, com 55, com ou sem traço.
          </p>
        </Card>
      )}

      {!busca.trim() && (
        <Card className="p-8 text-center border-primary/15">
          <Sparkles className="h-5 w-5 text-primary mx-auto mb-2" />
          <p className="text-sm text-foreground font-medium">Uma pessoa, uma ficha</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
            A mesma pessoa costumava existir separada no Pipeline, no Financeiro, nos Disparos
            e nos Eventos. Agora é um cadastro só, com a jornada completa.
          </p>
        </Card>
      )}

      <div className="space-y-2">
        {(pessoas ?? []).map(p => {
          const nome = p.nome || 'Sem nome';
          return (
            <Card
              key={p.id}
              onClick={() => abrirFichaPorId(p.id)}
              className="p-3 flex items-center gap-3 cursor-pointer hover:border-primary/40 transition-colors"
            >
              <AvatarPessoa nome={nome} id={p.id} size="md" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">{nome}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {[formatarTelefone(p.telefone), p.email].filter(Boolean).join(' · ') || '—'}
                </p>
              </div>
              {p.cpf && <Badge variant="outline" className="text-[10px] flex-shrink-0">CPF</Badge>}
            </Card>
          );
        })}
      </div>

    </div>
  );
}
