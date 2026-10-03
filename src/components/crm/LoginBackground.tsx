// Fundo da tela de login: preto, com a marca do IDM como "marca d'água" (silhueta
// branca bem apagada) e formas geométricas douradas em traço fino. Decoração
// pura -- por isso pointer-events-none e opacidade baixa, pra nunca competir
// com o formulário. As camadas deslizam muito devagar (animate-drift).
const SIMBOLO = '/lovable-uploads/idm-simbolo.png';

function Marca({ className }: { className: string }) {
  return (
    <img
      src={SIMBOLO}
      alt=""
      draggable={false}
      // Silhueta branca: o símbolo é azul-marinho e sumiria no preto.
      style={{ filter: 'brightness(0) invert(1)' }}
      className={`absolute select-none ${className}`}
    />
  );
}

export function LoginBackground() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none select-none" aria-hidden="true">
      <div className="absolute inset-0 bg-neutral-950" />

      <div className="absolute inset-0 animate-drift">
        <Marca className="top-[4%] -left-20 h-80 w-80 opacity-[0.05] -rotate-12" />
        <Marca className="-bottom-10 -right-16 h-[30rem] w-[30rem] opacity-[0.045] rotate-12" />
        <Marca className="top-[58%] left-[7%] h-40 w-40 opacity-[0.06]" />
        <Marca className="top-[10%] right-[14%] h-32 w-32 opacity-[0.05] rotate-[20deg]" />
      </div>

      {/* Formas geométricas (traço dourado fino) */}
      <svg
        className="absolute inset-0 h-full w-full animate-drift"
        style={{ animationDirection: 'alternate-reverse' }}
        viewBox="0 0 1000 700"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
        stroke="#f8b400"
        strokeWidth="1.2"
      >
        <g opacity="0.16">
          <circle cx="170" cy="560" r="120" />
          <circle cx="170" cy="560" r="80" />
          <circle cx="170" cy="560" r="40" />
          <polygon points="860,90 920,125 920,195 860,230 800,195 800,125" />
          <polygon points="860,120 900,143 900,187 860,210 820,187 820,143" />
          <rect x="690" y="470" width="110" height="110" transform="rotate(25 745 525)" />
          <rect x="720" y="500" width="50" height="50" transform="rotate(25 745 525)" />
          <polygon points="470,70 520,150 420,150" />
          <path d="M60 120 Q 160 40 260 120 T 460 120" />
          <line x1="560" y1="640" x2="760" y2="560" />
          <line x1="580" y1="670" x2="780" y2="590" />
        </g>
        <g fill="#f8b400" stroke="none" opacity="0.18">
          <circle cx="330" cy="230" r="3.5" />
          <circle cx="640" cy="170" r="2.5" />
          <circle cx="930" cy="420" r="3" />
          <circle cx="90" cy="300" r="2.5" />
          <circle cx="520" cy="600" r="3" />
        </g>
      </svg>

      {/* Vinheta: escurece as bordas e mantém o centro limpo pro formulário */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.6)_80%)]" />
    </div>
  );
}
