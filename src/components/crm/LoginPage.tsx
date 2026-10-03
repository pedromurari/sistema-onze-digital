import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Mail, Lock, Eye, EyeOff, Loader2, User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { LoginBackground } from './LoginBackground';

type AuthMode = 'login' | 'signup';

export function LoginPage() {
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [nome, setNome] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [lembrar, setLembrar] = useState(false);
  const [loading, setLoading] = useState(false);

  // Load remembered email on mount
  useEffect(() => {
    const rememberedEmail = localStorage.getItem('onze-remembered-email');
    if (rememberedEmail) {
      setEmail(rememberedEmail);
      setLembrar(true);
    }
  }, []);

  const { login, addUser } = useAuth();
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const result = await login(email, senha);

    if (result.success) {
      if (lembrar) {
        localStorage.setItem('onze-remembered-email', email);
      } else {
        localStorage.removeItem('onze-remembered-email');
      }
      toast({
        title: 'Bem-vindo!',
        description: 'Login realizado com sucesso.',
      });
    } else {
      toast({
        variant: 'destructive',
        title: 'Erro no login',
        description: result.error || 'Email ou senha incorretos.',
      });
    }

    setLoading(false);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // First user will be automatically set as admin by AuthContext
      const result = await addUser({
        nome,
        email: email.trim().toLowerCase(),
        senha,
        tipo: 'vendedor',
        cor: '#A93356',
      });

      if (!result.success) {
        toast({
          variant: 'destructive',
          title: 'Erro no cadastro',
          description: result.error || 'Erro ao criar usuário.',
        });
        setLoading(false);
        return;
      }

      toast({
        title: 'Cadastro realizado!',
        description: 'Fazendo login...',
      });

      // Auto-login after signup
      setTimeout(async () => {
        const loginResult = await login(email, senha);
        if (!loginResult.success) {
          toast({
            variant: 'destructive',
            title: 'Erro no login',
            description: loginResult.error || 'Faça login manualmente.',
          });
        }
        setLoading(false);
      }, 1000);
    } catch (error) {
      console.error('Signup error:', error);
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Erro ao cadastrar. Tente novamente.',
      });
      setLoading(false);
    }
  };

  return (
    // Tela de marca: sempre escura, independente do tema do CRM. A classe `dark`
    // aqui só vale pra esta árvore e já faz inputs, textos e botões usarem os tokens escuros.
    <div className="dark text-foreground relative min-h-screen flex items-center justify-center p-4">
      <LoginBackground />
      <div className="relative w-full max-w-md animate-scale-in">
        <div className="bg-card/90 backdrop-blur rounded-2xl shadow-2xl p-8 border border-border">
          {/* Logo: símbolo do IDM sem fundo, versão branca (esta tela é sempre escura). */}
          <div className="flex justify-center mb-8">
            <img
              alt="Instituto DespertaMENTE (IDM)"
              className="h-28 w-auto object-contain"
              src="/lovable-uploads/idm-simbolo-branco.png"
            />
          </div>

          {/* Title */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-foreground">CRM Educacional</h1>
            <p className="text-muted-foreground mt-2">
              {authMode === 'login' ? 'Faça login para continuar' : 'Criar sua conta'}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={authMode === 'login' ? handleLogin : handleSignup} className="space-y-5">
            {authMode === 'signup' && (
              <div className="space-y-2">
                <Label htmlFor="nome">Nome completo</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input
                    id="nome"
                    type="text"
                    placeholder="Seu nome completo"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    className="pl-10 h-12"
                    required
                    disabled={loading}
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 h-12"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="senha">Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  id="senha"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  className="pl-10 pr-10 h-12"
                  required
                  disabled={loading}
                  minLength={authMode === 'signup' ? 6 : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  disabled={loading}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {authMode === 'login' && (
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="lembrar"
                  checked={lembrar}
                  onCheckedChange={(checked) => setLembrar(checked as boolean)}
                  disabled={loading}
                />
                <Label htmlFor="lembrar" className="text-sm font-normal cursor-pointer">
                  Lembrar-me
                </Label>
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-12 text-base font-semibold gradient-primary hover:opacity-90 transition-opacity"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  {authMode === 'login' ? 'Entrando...' : 'Cadastrando...'}
                </>
              ) : authMode === 'login' ? (
                'Entrar'
              ) : (
                'Cadastrar-se'
              )}
            </Button>
          </form>

          {/* Toggle Auth Mode */}
          <div className="mt-6 text-center">
            {authMode === 'login' ? (
              <p className="text-sm text-muted-foreground">
                Não tem conta?{' '}
                <button
                  onClick={() => setAuthMode('signup')}
                  className="text-primary hover:underline font-medium transition-colors"
                  disabled={loading}
                >
                  Cadastrar-se
                </button>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Já tem conta?{' '}
                <button
                  onClick={() => setAuthMode('login')}
                  className="text-primary hover:underline font-medium transition-colors"
                  disabled={loading}
                >
                  Fazer login
                </button>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
