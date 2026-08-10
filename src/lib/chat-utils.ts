import {
  Flame, Snowflake, Thermometer,
  Image as ImageIcon, Music, Video, FileText, Sticker,
} from 'lucide-react';

// Helpers e constantes de formatacao compartilhados entre ChatConversas.tsx
// (aba completa) e ChatWidget.tsx (bolha flutuante) -- extraidos pra nao
// duplicar a mesma logica nos dois lugares.

/** Mesmo formato de normalizePhone() em evo-resposta: sem DDI 55, 11 digitos. */
export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return '';
  const d = raw.replace(/\D/g, '');
  if ((d.length === 13 || d.length === 12) && d.startsWith('55')) return d.slice(2);
  return d.slice(-11);
}

export function sufixo(tel: string): string {
  return tel.slice(-8);
}

// Numeros pessoais (nao sao canal de atendimento) que nao devem aparecer no
// Chat -- nem na barra de status, nem nas conversas. A instancia continua
// existindo normalmente em Settings/disparo/EvolutionTaskPanel, so o Chat
// (aba completa e widget) esconde ela.
export const INSTANCIAS_OCULTAS_NO_CHAT = new Set(['ig']);

export function instanciaOcultaNoChat(instanceName: string | null | undefined): boolean {
  return !!instanceName && INSTANCIAS_OCULTAS_NO_CHAT.has(instanceName.toLowerCase());
}

export function maskPhone(phone: string) {
  const d = phone.replace(/\D/g, '');
  if (d.length >= 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}–${d.slice(7)}`;
  return phone;
}

export function fmtHora(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function fmtDiaSeparador(iso: string) {
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date(hoje.getTime() - 86400000);
  const mesmoDia = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (mesmoDia(d, hoje)) return 'Hoje';
  if (mesmoDia(d, ontem)) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function fmtRelativo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const dias = Math.floor(h / 24);
  if (dias < 7) return `${dias}d`;
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export const TEMP_CFG: Record<'quente' | 'morno' | 'frio', { icon: React.ElementType; className: string }> = {
  quente: { icon: Flame,       className: 'text-red-500' },
  morno:  { icon: Thermometer, className: 'text-amber-500' },
  frio:   { icon: Snowflake,   className: 'text-sky-500' },
};

export const TIPO_ICON: Record<string, React.ElementType> = {
  image: ImageIcon, video: Video, audio: Music, document: FileText, sticker: Sticker,
};

export const TIPO_LABEL: Record<string, string> = {
  image: 'Imagem', video: 'Vídeo', audio: 'Áudio',
  document: 'Documento', sticker: 'Figurinha', unknown: 'Mensagem',
};
