import type { PartnerLink, PartnerTheme } from "@/types";
import { getLinkIcon } from "@/lib/linkIcons";

export function PartnerLinkButton({ link, theme }: { link: PartnerLink; theme: PartnerTheme }) {
  const isFeatured = link.type === "destaque";
  const Icon = getLinkIcon(link.url, link.icon);

  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative flex w-full items-center gap-3 overflow-hidden rounded-2xl border px-5 py-4 font-medium text-white backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg"
      style={{
        borderColor: isFeatured ? theme.accent_color : "rgba(255,255,255,0.15)",
        background: isFeatured
          ? `linear-gradient(135deg, ${theme.primary_color}33, ${theme.accent_color}33)`
          : "rgba(255,255,255,0.06)",
        boxShadow: isFeatured ? `0 0 0 1px ${theme.accent_color}55` : undefined,
      }}
    >
      <Icon className="relative z-10 h-5 w-5 shrink-0" aria-hidden />
      <span className="relative z-10 flex-1 text-center">{link.label}</span>
      <span className="h-5 w-5 shrink-0" aria-hidden />
      <span
        className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-700 group-hover:translate-x-full"
        aria-hidden
      />
    </a>
  );
}
