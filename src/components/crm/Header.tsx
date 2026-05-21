import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { LogOut, User, ChevronDown, Zap } from 'lucide-react';
import { NotificationBell } from './NotificationBell';

interface HeaderProps {
  onAddLead: () => void;
  onAddFlashLead: () => void;
}

export function Header({ onAddLead, onAddFlashLead }: HeaderProps) {
  const { user, logout } = useAuth();
  const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <header className="h-14 bg-[#0A0A0C] border-b border-zinc-800/60 px-4 lg:px-6 flex items-center justify-between sticky top-0 z-40">
      <div className="flex items-center gap-4">
        <img alt="DS Digital Strategy" className="h-7 object-contain" src="/lovable-uploads/b20ba1b5-4d77-4f7a-ac40-a6adb16c63d8.png" />
      </div>

      <div className="flex items-center gap-2 lg:gap-3">
        <Button
          onClick={onAddFlashLead}
          variant="outline"
          className="border border-zinc-700 text-zinc-400 bg-transparent hover:bg-white/5 hover:text-zinc-200 transition-colors duration-200"
          title="Adicionar lead rápido"
        >
          <Zap className="h-4 w-4" />
          <span className="hidden sm:inline ml-1">Rápido</span>
        </Button>
        <Button
          onClick={onAddLead}
          className="bg-primary hover:bg-primary/90 text-white shadow-sm transition-all duration-200"
        >
          + Novo Lead
        </Button>

        <NotificationBell />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 p-2 rounded-md hover:bg-white/5 transition-colors duration-200">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white shadow-sm"
                style={{ backgroundColor: user?.cor || '#AC1131' }}
              >
                {getInitials(user?.nome || 'U')}
              </div>
              <div className="hidden md:block text-left">
                <p className="text-sm font-medium text-zinc-200">{user?.nome}</p>
                <p className="text-xs text-zinc-500 capitalize">{user?.tipo}</p>
              </div>
              <ChevronDown className="h-4 w-4 text-zinc-500 hidden md:block transition-colors duration-200" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 bg-zinc-900 border-zinc-800 shadow-xl">
            <div className="px-2 py-1.5 border-b border-zinc-800">
              <p className="text-sm font-medium text-zinc-200">{user?.nome}</p>
              <p className="text-xs text-zinc-500">{user?.email}</p>
            </div>
            <DropdownMenuItem className="cursor-pointer text-zinc-300 hover:bg-white/5 focus:bg-white/5 transition-colors duration-200">
              <User className="mr-2 h-4 w-4" />Meu Perfil
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-zinc-800" />
            <DropdownMenuItem
              onClick={logout}
              className="cursor-pointer text-destructive focus:text-destructive hover:bg-destructive/5 focus:bg-destructive/5 transition-colors duration-200"
            >
              <LogOut className="mr-2 h-4 w-4" />Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
