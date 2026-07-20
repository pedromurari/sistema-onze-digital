import React, { Component, ErrorInfo, Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

// Code splitting: páginas públicas carregadas apenas quando acessadas
const TarefaPublica   = React.lazy(() => import("./pages/TarefaPublica"));
const ContratoPublico = React.lazy(() => import("./pages/ContratoPublico"));
const FormularioAluno = React.lazy(() => import("./pages/FormularioAluno"));
const AreaMembros     = React.lazy(() => import("./pages/AreaMembros"));
const Checkout        = React.lazy(() => import("./pages/Checkout"));
const LinkRedirect    = React.lazy(() => import("./pages/LinkRedirect"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Fallback leve para Suspense
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );
}

// Error Boundary — captura erros de renderização e evita tela branca
interface EBState { error: Error | null }
class ErrorBoundary extends Component<{ children: React.ReactNode }, EBState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): EBState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error.message, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-8 text-center">
          <h2 className="text-xl font-semibold text-destructive">Algo deu errado</h2>
          <p className="text-muted-foreground text-sm max-w-md">{this.state.error.message}</p>
          <button
            onClick={() => this.setState({ error: null })}
            className="text-sm underline text-primary hover:opacity-80"
          >
            Tentar novamente
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster richColors position="top-right" />
      <ErrorBoundary>
        <BrowserRouter>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Rotas públicas — sem autenticação */}
              <Route path="/forms/tarefa/:tarefaId" element={<TarefaPublica />} />
              <Route path="/formulario/:token"      element={<FormularioAluno />} />
              <Route path="/assinar/:token"         element={<ContratoPublico />} />
              <Route path="/membros/:token"         element={<AreaMembros />} />
              <Route path="/comprar/:produtoId"     element={<Checkout />} />
              <Route path="/ir/:slug"               element={<LinkRedirect />} />
              <Route path="/"                       element={<Index />} />
              <Route path="*"                       element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </ErrorBoundary>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
