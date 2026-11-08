import type { IconType } from "react-icons";
import {
  SiInstagram,
  SiWhatsapp,
  SiTiktok,
  SiYoutube,
  SiFacebook,
  SiX,
  SiTelegram,
  SiSpotify,
  SiThreads,
  SiPinterest,
  SiGmail,
} from "react-icons/si";
import { FaLinkedin } from "react-icons/fa6";
import {
  Globe,
  Link as LinkIcon,
  BookOpen,
  GraduationCap,
  Presentation,
  Handshake,
  Users,
  Calendar,
  ShoppingBag,
  Gift,
  PlayCircle,
  Mic,
} from "lucide-react";

const DOMAIN_ICON_MAP: [RegExp, IconType][] = [
  [/instagram\.com/i, SiInstagram],
  [/(wa\.me|whatsapp\.com)/i, SiWhatsapp],
  [/tiktok\.com/i, SiTiktok],
  [/(youtube\.com|youtu\.be)/i, SiYoutube],
  [/(facebook\.com|fb\.com)/i, SiFacebook],
  [/linkedin\.com/i, FaLinkedin],
  [/(twitter\.com|x\.com)/i, SiX],
  [/(t\.me|telegram\.me)/i, SiTelegram],
  [/open\.spotify\.com/i, SiSpotify],
  [/threads\.net/i, SiThreads],
  [/pinterest\.com/i, SiPinterest],
  [/^mailto:/i, SiGmail],
];

// Ícones que podem ser escolhidos manualmente no admin — para produtos/serviços
// (não dá pra detectar pela URL, já que o link costuma ser um checkout genérico)
// ou como substituto do ícone detectado automaticamente pela URL.
export const ICON_LIBRARY: Record<string, IconType> = {
  ebook: BookOpen,
  curso: GraduationCap,
  workshop: Presentation,
  mentoria: Handshake,
  comunidade: Users,
  agenda: Calendar,
  produto: ShoppingBag,
  bonus: Gift,
  aula: PlayCircle,
  podcast: Mic,
  instagram: SiInstagram,
  whatsapp: SiWhatsapp,
  tiktok: SiTiktok,
  youtube: SiYoutube,
  facebook: SiFacebook,
  linkedin: FaLinkedin,
  twitter: SiX,
  telegram: SiTelegram,
  spotify: SiSpotify,
  email: SiGmail,
  site: Globe,
};

export const ICON_OPTIONS = [
  {
    group: "Produtos e serviços",
    options: [
      { value: "ebook", label: "E-book" },
      { value: "curso", label: "Curso" },
      { value: "workshop", label: "Workshop" },
      { value: "mentoria", label: "Mentoria" },
      { value: "comunidade", label: "Comunidade" },
      { value: "agenda", label: "Agendamento" },
      { value: "produto", label: "Produto/loja" },
      { value: "bonus", label: "Bônus" },
      { value: "aula", label: "Aula/vídeo" },
      { value: "podcast", label: "Podcast" },
    ],
  },
  {
    group: "Redes e contato",
    options: [
      { value: "instagram", label: "Instagram" },
      { value: "whatsapp", label: "WhatsApp" },
      { value: "tiktok", label: "TikTok" },
      { value: "youtube", label: "YouTube" },
      { value: "facebook", label: "Facebook" },
      { value: "linkedin", label: "LinkedIn" },
      { value: "twitter", label: "X (Twitter)" },
      { value: "telegram", label: "Telegram" },
      { value: "spotify", label: "Spotify" },
      { value: "email", label: "E-mail" },
      { value: "site", label: "Site" },
    ],
  },
];

export function getLinkIcon(url: string, iconKey?: string | null): IconType {
  if (iconKey && ICON_LIBRARY[iconKey]) return ICON_LIBRARY[iconKey];

  for (const [pattern, Icon] of DOMAIN_ICON_MAP) {
    if (pattern.test(url)) return Icon;
  }

  try {
    const { hostname } = new URL(url);
    if (hostname) return Globe;
  } catch {
    // URL inválida (ou relativa) — cai no ícone genérico abaixo.
  }

  return LinkIcon;
}
