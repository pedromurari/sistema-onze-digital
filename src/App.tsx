import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import TarefaPublica from "./pages/TarefaPublica";
import ContratoPublico from "./pages/ContratoPublico";
import FormularioAluno from "./pages/FormularioAluno";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,   // 5 min — dados não refetcham desnecessariamente
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster richColors position="top-right" />
      <BrowserRouter>
        <Routes>
          {/* Rotas públicas — sem autenticação */}
          <Route path="/forms/tarefa/:tarefaId" element={<TarefaPublica />} />
          <Route path="/formulario/:token" element={<FormularioAluno />} />
          <Route path="/assinar/:token" element={<ContratoPublico />} />
          <Route path="/" element={<Index />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
