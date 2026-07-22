function texto(valor: unknown, limite = 4000) { return String(valor ?? '').trim().slice(0, limite); }

export function consolidarMarkdown(caminho: string, memorias: any[]) {
  const titulo = caminho.split('/').pop()?.replace(/\.md$/i, '').split('-')
    .map(parte => parte ? parte[0].toUpperCase() + parte.slice(1) : parte).join(' ') || 'Conhecimento 11DS';
  const ativas = memorias.filter(memoria => ['ativa', 'pendente_sincronizacao'].includes(memoria.status))
    .sort((a, b) => Number(b.prioridade ?? 0) - Number(a.prioridade ?? 0) || String(a.created_at).localeCompare(String(b.created_at)));
  const blocos = ativas.map(memoria => [
    `## ${texto(memoria.resumo, 220)}`,
    '', texto(memoria.regra, 6000), '',
    `- Origem: ${memoria.origem === 'usuario' ? 'orientação explícita do usuário' : 'inferência validada da equipe'}`,
    `- Prioridade: ${memoria.prioridade ?? 50}`,
    `- Consumidores: ${(memoria.agentes_consumidores ?? []).join(', ') || 'Equipe 11DS'}`,
    `- Memória: ${memoria.id}`,
  ].join('\n'));
  return [`# ${titulo}`, '', '> Arquivo consolidado automaticamente pela Equipe 11DS. Edite regras pelo sistema para preservar auditoria.', '', ...blocos, ''].join('\n');
}
