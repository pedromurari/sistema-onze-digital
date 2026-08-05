import type { UserRole, AppUser } from '@/contexts/AuthContext';

const NOMEN_KEY = 'colab_nomenclaturas';

export function loadNomenclaturas(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(NOMEN_KEY) ?? '{}'); }
  catch { return {}; }
}

export function saveNomenclaturas(n: Record<string, string>) {
  localStorage.setItem(NOMEN_KEY, JSON.stringify(n));
}

export function getRoleLabel(tipo: UserRole | string, nomen: Record<string, string>): string {
  if (nomen[tipo]) return nomen[tipo];
  if (tipo === 'admin') return 'Administrador';
  if (tipo === 'professora') return 'Professora';
  if (tipo === 'parceiro') return 'Parceiro(a)';
  return 'Vendedor';
}

// Título exibido para um colaborador: cargo próprio > nomenclatura padrão do tipo > fallback fixo.
export function getDisplayRole(u: Pick<AppUser, 'tipo' | 'cargo'>, nomen: Record<string, string> = loadNomenclaturas()): string {
  if (u.cargo && u.cargo.trim()) return u.cargo.trim();
  return getRoleLabel(u.tipo, nomen);
}
