import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';
const STORAGE_KEY = 'crm-theme';

// Padrão é SEMPRE claro (não segue o sistema operacional): o mesmo bundle serve
// as páginas públicas (matrícula, contrato) e elas não têm dark mode. Só vira
// escuro se a pessoa logada clicar no botão -- e a classe só existe enquanto o
// cabeçalho do CRM está na tela (o cleanup abaixo tira ela ao sair).
function lerPreferencia(): Theme {
  try { return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light'; }
  catch { return 'light'; }
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(lerPreferencia);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* aba anônima/quota */ }
  }, [theme]);

  // Sair do CRM (logout, página pública) devolve o site ao tema claro.
  useEffect(() => () => { document.documentElement.classList.remove('dark'); }, []);

  const toggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  return { theme, toggle };
}
