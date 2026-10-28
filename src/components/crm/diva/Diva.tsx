import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DiretoriaDiva } from './DiretoriaDiva';
import { TerapeutasTab } from './TerapeutasTab';
import { FunilDiva } from './FunilDiva';
import { SessoesTab } from './SessoesTab';

export function Diva() {
  return (
    <div className="min-h-full bg-background p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <Tabs defaultValue="diretoria">
          <TabsList className="grid w-full max-w-lg grid-cols-4">
            <TabsTrigger value="diretoria">Diretoria</TabsTrigger>
            <TabsTrigger value="terapeutas">Terapeutas</TabsTrigger>
            <TabsTrigger value="funil">Funil</TabsTrigger>
            <TabsTrigger value="sessoes">Sessões</TabsTrigger>
          </TabsList>
          <TabsContent value="diretoria" className="mt-0 -mx-4 sm:-mx-6 lg:-mx-8"><DiretoriaDiva /></TabsContent>
          <TabsContent value="terapeutas" className="mt-4"><TerapeutasTab /></TabsContent>
          <TabsContent value="funil" className="mt-4"><FunilDiva /></TabsContent>
          <TabsContent value="sessoes" className="mt-4"><SessoesTab /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
