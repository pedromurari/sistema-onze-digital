import { User } from 'lucide-react';
import { useFichaPessoa } from './FichaPessoaProvider';

/**
 * O nome de alguém, clicável, abrindo a ficha completa daquela pessoa.
 *
 * A ideia é que adotar isso numa tela custe uma linha: trocar `{lead.nome}` por
 * `<NomePessoa nome={lead.nome} pessoaId={lead.pessoa_id} />`. Se a peça for cara de
 * adotar, ela não é adotada — foi o que aconteceu com a ficha, que existia e só abria
 * de um lugar.
 *
 * Sem `pessoaId` nem `telefone`, renderiza o nome puro. Registro antigo sem vínculo com a
 * pessoa canônica continua aparecendo normalmente, só não clica — degradar em silêncio é
 * melhor do que um botão que não faz nada.
 */
export function NomePessoa({
  nome,
  pessoaId,
  telefone,
  className = '',
  mostrarIcone = false,
}: {
  nome: string | null | undefined;
  pessoaId?: string | null;
  telefone?: string | null;
  className?: string;
  mostrarIcone?: boolean;
}) {
  const { abrirFichaPorId, abrirFichaPorTelefone } = useFichaPessoa();
  const rotulo = nome?.trim() || 'Sem nome';
  const temFicha = Boolean(pessoaId || telefone);

  if (!temFicha) {
    return <span className={className}>{rotulo}</span>;
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        // As linhas de tabela costumam ter o próprio onClick (abrir o lead, por exemplo).
        // Sem isto, clicar no nome dispararia os dois.
        e.stopPropagation();
        if (pessoaId) abrirFichaPorId(pessoaId);
        else abrirFichaPorTelefone(telefone);
      }}
      title={`Ver a jornada completa de ${rotulo}`}
      className={
        'inline-flex items-center gap-1 text-left rounded-sm ' +
        'underline decoration-dotted decoration-primary/40 underline-offset-2 ' +
        'hover:decoration-primary hover:text-primary transition-colors ' +
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ' +
        className
      }
    >
      {mostrarIcone && <User className="h-3 w-3 opacity-50 flex-shrink-0" />}
      <span className="truncate">{rotulo}</span>
    </button>
  );
}
