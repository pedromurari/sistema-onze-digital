import type { PartnerTheme } from "@/types";
import { Aurora } from "./Aurora";
import { Waves } from "./Waves";
import { Orbs } from "./Orbs";
import { Particles } from "./Particles";
import { Geometric } from "./Geometric";

export function AnimatedBackground({ theme }: { theme: PartnerTheme }) {
  switch (theme.background_preset) {
    case "aurora":
      return <Aurora theme={theme} />;
    case "waves":
      return <Waves theme={theme} />;
    case "orbs":
      return <Orbs theme={theme} />;
    case "particles":
      return <Particles theme={theme} />;
    case "geometric":
      return <Geometric theme={theme} />;
    default:
      return <Aurora theme={theme} />;
  }
}
