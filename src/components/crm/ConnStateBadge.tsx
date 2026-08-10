import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import type { ConnState } from '@/lib/evolution-status';

export function ConnStateBadge({ state }: { state: ConnState }) {
  if (state === 'loading') return <Badge variant="outline" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" />Verificando</Badge>;
  if (state === 'open') return <Badge className="gap-1 bg-green-100 text-green-800 border-green-200"><CheckCircle2 className="h-3 w-3" />Conectado</Badge>;
  if (state === 'connecting') return <Badge variant="outline" className="gap-1 text-yellow-700 border-yellow-300 bg-yellow-50"><Loader2 className="h-3 w-3 animate-spin" />Conectando</Badge>;
  if (state === 'close') return <Badge variant="outline" className="gap-1 text-red-700 border-red-300 bg-red-50"><XCircle className="h-3 w-3" />Desconectado</Badge>;
  return <Badge variant="outline" className="text-muted-foreground">Desconhecido</Badge>;
}
