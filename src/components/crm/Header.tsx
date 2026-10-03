import { useAuth } from '@/contexts/AuthContext';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { LogOut, User, ChevronDown, Menu, Sun, Moon } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { NotificationBell } from './NotificationBell';

interface HeaderProps {
  onOpenMobileMenu: () => void;
}

export function Header({ onOpenMobileMenu }: HeaderProps) {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <header className="h-16 bg-card border-b border-border px-3 sm:px-4 lg:px-6 flex items-center justify-between sticky top-0 z-40 shadow-sm">
      <div className="flex items-center gap-2 sm:gap-4 min-w-0">
        <button
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 -ml-2 rounded-md hover:bg-muted transition-colors duration-300 flex-shrink-0"
          title="Abrir menu"
        >
          <Menu className="h-5 w-5 text-foreground/70" />
        </button>
        {/* Símbolo do IDM (azul-marinho + dourado), sem fundo. No tema escuro o azul
            some no cabeçalho, então ganha um brilho suave (não uma caixa atrás). */}
        <img alt="Instituto DespertaMENTE (IDM)" className="h-9 object-contain dark:[filter:drop-shadow(0_0_6px_rgba(255,255,255,0.55))]" src="/lovable-uploads/idm-simbolo.png" />
      </div>

      <div className="flex items-center gap-2 lg:gap-3 flex-shrink-0">
        <button
          type="button"
          onClick={toggle}
          className="p-2 rounded-md hover:bg-muted transition-colors duration-300"
          title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
          aria-label={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}
        >
          {theme === 'dark' ? <Sun className="h-5 w-5 text-foreground/70" /> : <Moon className="h-5 w-5 text-foreground/70" />}
        </button>
        <NotificationBell />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 p-2 rounded-md hover:bg-muted transition-colors duration-300">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white shadow-sm"
                style={{ backgroundColor: user?.cor || '#AC1131' }}
              >
                {getInitials(user?.nome || 'U')}
              </div>
              <div className="hidden md:block text-left">
                <p className="text-sm font-500 text-foreground">{user?.nome}</p>
                <p className="text-xs text-muted-foreground capitalize">{user?.tipo}</p>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground hidden md:block group-hover:text-primary transition-colors duration-300" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 bg-card border-border shadow-md">
            <div className="px-2 py-1.5 border-b border-border">
              <p className="text-sm font-500">{user?.nome}</p>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
            </div>
            <DropdownMenuItem className="cursor-pointer hover:bg-muted transition-colors duration-300"><User className="mr-2 h-4 w-4" />Meu Perfil</DropdownMenuItem>
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuItem
              onClick={logout}
              className="cursor-pointer text-destructive focus:text-destructive hover:bg-destructive/5 transition-colors duration-300"
            >
              <LogOut className="mr-2 h-4 w-4" />Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
