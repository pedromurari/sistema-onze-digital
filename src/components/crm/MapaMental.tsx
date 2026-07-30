/**
 * MapaMental — Premium v2.0
 * • Mapa público (leitura para todos, edição para admins)
 * • Node detail popup com descrição, responsável, fase do funil, notas
 * • Fases de funil como swimlanes visuais
 * • Toolbar contextual flutuante
 * • Busca spotlight
 * • Design premium alinhado ao CRM
 */

import { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  addEdge,
  useNodesState,
  useEdgesState,
  NodeResizer,
  type ReactFlowInstance,
  type Node,
  type Edge,
  type Connection,
  type NodeTypes,
  type NodeChange,
  BackgroundVariant,
  Panel,
  EdgeLabelRenderer,
  BaseEdge,
  getBezierPath,
  getStraightPath,
  getSmoothStepPath,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/components/ui/use-toast';
import {
  Plus, Trash2, Download, ChevronRight, ChevronLeft,
  Palette, Maximize2, Link2, AlignCenter,
  Search, X, User, FileText,
  Eye, Edit3, Layers, MessageSquare, Calendar, CheckCircle2,
  Tag, ArrowRight, Sparkles,
  MoreVertical, Pencil, FolderPlus, Target, Filter,
  Undo2, Redo2, Wand2, Network, AlignLeft, AlignStartVertical,
  Columns, Rows, Grid3x3, Keyboard, Copy, FileJson,
  Image as ImageIcon,
} from 'lucide-react';

// ─── Tipos ────────────────────────────────────────────────────────────────────

type NodeTipo = 'empresa' | 'funil' | 'etapa_funil' | 'canal' | 'metrica' | 'observacao' | 'meta';
type NodeFormato = 'redondo' | 'quadrado' | 'retangulo' | 'diamante' | 'hexagono';
type NodeTamanho = 'pequeno' | 'medio' | 'grande' | 'personalizado';
type EdgeTipo = 'bezier' | 'reta' | 'step' | 'suave';
type EdgeEstilo = 'solida' | 'tracejada' | 'pontilhada';
type FaseFunil = 'topo' | 'meio' | 'fundo' | 'pos_venda' | 'nenhuma';

interface Responsavel {
  id: string;
  nome: string;
  avatar?: string;
  cor: string;
}

interface NodeData extends Record<string, unknown> {
  label: string;
  sublabel?: string;
  descricao?: string;
  tipo: NodeTipo;
  cor: string;
  corTexto?: string;
  corBorda?: string;
  espessuraBorda?: number;
  tamanho?: NodeTamanho;
  formato?: NodeFormato;
  largura?: number;
  altura?: number;
  fontSize?: number;
  fontWeight?: string;
  fontStyle?: string;
  emoji?: string;
  fase?: FaseFunil;
  responsavelId?: string;
  responsavelNome?: string;
  tags?: string[];
  notas?: string;
  dataCriacao?: string;
  readonly?: boolean;
  // Metas (tipo === 'meta') — null significa "limpo pelo usuário"
  metaAlvo?: number | null;
  metaAtual?: number | null;
  metaUnidade?: string;
  // Só para render: nós fora do filtro ativo ficam apagados
  dimmed?: boolean;
}

interface EdgeData extends Record<string, unknown> {
  label?: string;
  cor?: string;
  estilo?: EdgeEstilo;
  espessura?: number;
  tipo?: EdgeTipo;
  animado?: boolean;
}

type PaginaTipo = 'mapa' | 'funil' | 'metas' | 'livre';

interface MindMapPage {
  id: string;
  workspace: string;
  nome: string;
  emoji: string;
  cor: string;
  descricao?: string;
  tipo: PaginaTipo;
  ordem: number;
}

/**
 * Uma entrada do histórico de desfazer. Cada ação guarda como se desfaz e como
 * se refaz — ambas mexem no banco e no estado local, então undo/redo funciona
 * mesmo depois do realtime recarregar a página.
 */
interface HistoryEntry {
  label: string;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

/** Snapshot de um nó no formato do banco, usado para recriar em undo. */
type NodeRow = Record<string, unknown>;

// ─── Constantes ───────────────────────────────────────────────────────────────

const NODE_COLORS: Record<NodeTipo, string> = {
  empresa: '#AC1131',
  funil: '#3B82F6',
  etapa_funil: '#8B5CF6',
  canal: '#10B981',
  metrica: '#F59E0B',
  observacao: '#6B7280',
  meta: '#0EA5E9',
};

const TIPO_LABELS: Record<NodeTipo, string> = {
  empresa: '🏢 Empresa/Produto',
  funil: '📊 Funil',
  etapa_funil: '🔄 Etapa do Funil',
  canal: '📡 Canal de Tráfego',
  metrica: '📈 Resultado/Métrica',
  observacao: '📝 Observação',
  meta: '🎯 Meta',
};

const FASE_LABELS: Record<FaseFunil, string> = {
  topo: '🔝 Topo do Funil (Atração)',
  meio: '🎯 Meio do Funil (Consideração)',
  fundo: '💰 Fundo do Funil (Conversão)',
  pos_venda: '⭐ Pós-Venda (Retenção)',
  nenhuma: '— Sem fase',
};

const FASE_COLORS: Record<FaseFunil, string> = {
  topo: '#3B82F6',
  meio: '#8B5CF6',
  fundo: '#AC1131',
  pos_venda: '#10B981',
  nenhuma: '#6B7280',
};

const PRESET_COLORS = [
  '#AC1131', '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444',
  '#06B6D4', '#84CC16', '#F97316', '#EC4899', '#6366F1', '#14B8A6',
  '#1F2937', '#374151', '#6B7280', '#D97706', '#7C3AED', '#0EA5E9',
];

const FORMATO_OPTIONS: { value: NodeFormato; label: string; preview: string }[] = [
  { value: 'redondo', label: 'Oval', preview: '⬭' },
  { value: 'quadrado', label: 'Quadrado', preview: '⬜' },
  { value: 'retangulo', label: 'Retângulo', preview: '▬' },
  { value: 'diamante', label: 'Diamante', preview: '◆' },
  { value: 'hexagono', label: 'Hexágono', preview: '⬡' },
];

const PAGINA_TIPO_OPTIONS: { value: PaginaTipo; label: string; emoji: string }[] = [
  { value: 'mapa', label: 'Mapa Mental', emoji: '🧠' },
  { value: 'funil', label: 'Funil', emoji: '📊' },
  { value: 'metas', label: 'Metas', emoji: '🎯' },
  { value: 'livre', label: 'Página livre', emoji: '📄' },
];

const LAST_WORKSPACE_KEY = 'mapa_mental_last_workspace';
const SNAP_KEY = 'mapa_mental_snap_grid';
const MAX_HISTORY = 60;

/**
 * Tamanhos dos presets. A dimensão real do nó vive em node.width/node.height
 * (nativo do React Flow, é o que o NodeResizer manipula) — o div interno só
 * preenche 100%, senão o handle de resize descola da caixa.
 */
const TAMANHO_PRESETS = {
  pequeno: { w: 110, h: 54 },
  medio: { w: 155, h: 74 },
  grande: { w: 210, h: 100 },
} as const;

function nodeSize(data: Partial<NodeData>): { w: number; h: number } {
  if (data.tamanho === 'personalizado') {
    return { w: data.largura || TAMANHO_PRESETS.medio.w, h: data.altura || TAMANHO_PRESETS.medio.h };
  }
  return TAMANHO_PRESETS[(data.tamanho as keyof typeof TAMANHO_PRESETS) ?? 'medio'] ?? TAMANHO_PRESETS.medio;
}

/** Progresso 0–100 de um nó de meta. */
function metaProgresso(data: NodeData): number {
  const alvo = Number(data.metaAlvo) || 0;
  if (alvo <= 0) return 0;
  const atual = Number(data.metaAtual) || 0;
  return Math.max(0, Math.min(100, (atual / alvo) * 100));
}

/** Formata 1234567 → "1,23 mi" para caber dentro do nó. */
function formatMetaValor(v: number | null | undefined, unidade?: string): string {
  const n = Number(v) || 0;
  const u = unidade ? `${unidade} ` : '';
  if (Math.abs(n) >= 1_000_000) return `${u}${(n / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi`;
  if (Math.abs(n) >= 1_000) return `${u}${(n / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return `${u}${n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}`;
}

/** Traduz o patch de NodeData para as colunas do banco. */
function nodeDataToDb(u: Partial<NodeData>): Record<string, unknown> {
  const db: Record<string, unknown> = {};
  if (u.label !== undefined) db.titulo = u.label;
  if (u.sublabel !== undefined) db.sublabel = u.sublabel;
  if (u.descricao !== undefined) db.descricao = u.descricao;
  if (u.notas !== undefined) db.notas = u.notas;
  if (u.emoji !== undefined) db.emoji = u.emoji;
  if (u.tipo !== undefined) db.tipo = u.tipo;
  if (u.cor !== undefined) db.cor = u.cor;
  if (u.corTexto !== undefined) db.cor_texto = u.corTexto;
  if (u.corBorda !== undefined) db.cor_borda = u.corBorda;
  if (u.espessuraBorda !== undefined) db.espessura_borda = u.espessuraBorda;
  if (u.tamanho !== undefined) db.tamanho = u.tamanho;
  if (u.formato !== undefined) db.formato = u.formato;
  if (u.largura !== undefined) db.largura = u.largura;
  if (u.altura !== undefined) db.altura = u.altura;
  if (u.fontSize !== undefined) db.font_size = u.fontSize;
  if (u.fontWeight !== undefined) db.font_weight = u.fontWeight;
  if (u.fontStyle !== undefined) db.font_style = u.fontStyle;
  if (u.fase !== undefined) db.fase = u.fase;
  if (u.responsavelId !== undefined) db.responsavel_id = u.responsavelId || null;
  if (u.responsavelNome !== undefined) db.responsavel_nome = u.responsavelNome;
  if (u.tags !== undefined) db.tags = u.tags;
  if (u.metaAlvo !== undefined) db.meta_alvo = u.metaAlvo;
  if (u.metaAtual !== undefined) db.meta_atual = u.metaAtual;
  if (u.metaUnidade !== undefined) db.meta_unidade = u.metaUnidade;
  return db;
}

/** Campos de NodeData que persistimos — base para copiar/colar e duplicar. */
const NODE_DATA_KEYS: (keyof NodeData)[] = [
  'label', 'sublabel', 'descricao', 'notas', 'emoji', 'tipo', 'cor', 'corTexto',
  'corBorda', 'espessuraBorda', 'tamanho', 'formato', 'largura', 'altura',
  'fontSize', 'fontWeight', 'fontStyle', 'fase', 'responsavelId',
  'responsavelNome', 'tags', 'metaAlvo', 'metaAtual', 'metaUnidade',
];

/** Estruturas iniciais opcionais ao criar uma página. */
const ETAPAS_FUNIL: { titulo: string; emoji: string; fase: FaseFunil }[] = [
  { titulo: 'Topo — Atração', emoji: '🔝', fase: 'topo' },
  { titulo: 'Meio — Consideração', emoji: '🎯', fase: 'meio' },
  { titulo: 'Fundo — Conversão', emoji: '💰', fase: 'fundo' },
  { titulo: 'Pós-Venda — Retenção', emoji: '⭐', fase: 'pos_venda' },
];

// ─── Nó Customizado ───────────────────────────────────────────────────────────

function MindMapNode({
  data, selected, id,
}: {
  data: NodeData; selected: boolean; id: string;
}) {
  const formato = data.formato || 'redondo';
  const tamanho = data.tamanho || 'medio';
  const isMeta = data.tipo === 'meta';
  const progresso = isMeta ? metaProgresso(data) : 0;

  let borderRadius = '50px';
  let clipPath: string | undefined;

  switch (formato) {
    case 'redondo': borderRadius = '50px'; break;
    case 'quadrado': borderRadius = '10px'; break;
    case 'retangulo': borderRadius = '14px'; break;
    case 'diamante':
      clipPath = 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)';
      borderRadius = '0';
      break;
    case 'hexagono':
      clipPath = 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)';
      borderRadius = '0';
      break;
  }

  const fase = data.fase && data.fase !== 'nenhuma' ? data.fase : null;

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      height: '100%',
      opacity: data.dimmed ? 0.14 : 1,
      transition: 'opacity 0.18s ease',
    }}>
      {/* Fase badge */}
      {fase && (
        <div style={{
          position: 'absolute',
          top: -18,
          left: '50%',
          transform: 'translateX(-50%)',
          background: FASE_COLORS[fase],
          color: '#fff',
          fontSize: 8,
          fontWeight: 700,
          padding: '2px 8px',
          borderRadius: 20,
          whiteSpace: 'nowrap',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          zIndex: 10,
        }}>
          {fase === 'topo' ? 'TOPO' : fase === 'meio' ? 'MEIO' : fase === 'fundo' ? 'FUNDO' : 'PÓS-VENDA'}
        </div>
      )}

      <NodeResizer
        color="#2563eb"
        isVisible={selected}
        minWidth={80}
        minHeight={40}
        handleStyle={{ width: 8, height: 8, borderRadius: 4 }}
      />

      <div
        style={{
          background: `linear-gradient(145deg, ${data.cor}, ${data.cor}dd)`,
          border: selected
            ? `2.5px solid #2563eb`
            : `${data.espessuraBorda || 2}px solid ${data.corBorda || 'rgba(255,255,255,0.2)'}`,
          borderRadius,
          clipPath,
          width: '100%',
          height: '100%',
          boxSizing: 'border-box',
          boxShadow: selected
            ? '0 0 0 4px rgba(37,99,235,0.25), 0 12px 40px rgba(0,0,0,0.3)'
            : '0 6px 24px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.15)',
          cursor: 'grab',
          transition: 'box-shadow 0.2s ease, border 0.15s ease',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: '8px 14px',
          userSelect: 'none',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Gloss overlay */}
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0,
          height: '45%',
          background: 'linear-gradient(180deg, rgba(255,255,255,0.12) 0%, transparent 100%)',
          borderRadius: `${borderRadius} ${borderRadius} 0 0`,
          pointerEvents: 'none',
        }} />

        <Handle type="target" position={Position.Top} style={{ opacity: 0, width: 10, height: 10 }} />
        <Handle type="target" position={Position.Left} style={{ opacity: 0, width: 10, height: 10 }} />

        {data.emoji && (
          <div style={{ fontSize: tamanho === 'pequeno' ? 14 : tamanho === 'grande' ? 22 : 18, marginBottom: 3, lineHeight: 1 }}>
            {data.emoji}
          </div>
        )}

        <div style={{
          fontSize: data.fontSize || (tamanho === 'pequeno' ? 10 : tamanho === 'grande' ? 14 : 12),
          fontWeight: data.fontWeight || '700',
          fontStyle: data.fontStyle || 'normal',
          color: data.corTexto || '#ffffff',
          textShadow: '0 1px 3px rgba(0,0,0,0.4)',
          wordBreak: 'break-word',
          lineHeight: 1.3,
          maxWidth: '92%',
          letterSpacing: '-0.01em',
        }}>
          {data.label}
        </div>

        {data.sublabel && (
          <div style={{
            fontSize: 8,
            color: 'rgba(255,255,255,0.7)',
            marginTop: 3,
            maxWidth: '90%',
            wordBreak: 'break-word',
          }}>
            {data.sublabel}
          </div>
        )}

        {/* Barra de progresso da meta */}
        {isMeta && (
          <div style={{ width: '86%', marginTop: 5 }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 7.5,
              fontWeight: 700,
              color: 'rgba(255,255,255,0.92)',
              marginBottom: 2,
              letterSpacing: '0.02em',
            }}>
              <span>{formatMetaValor(data.metaAtual, data.metaUnidade)}</span>
              <span style={{ opacity: 0.65 }}>{formatMetaValor(data.metaAlvo, data.metaUnidade)}</span>
            </div>
            <div style={{
              height: 5,
              background: 'rgba(0,0,0,0.28)',
              borderRadius: 20,
              overflow: 'hidden',
              boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.25)',
            }}>
              <div style={{
                width: `${progresso}%`,
                height: '100%',
                borderRadius: 20,
                background: progresso >= 100
                  ? 'linear-gradient(90deg, #34D399, #10B981)'
                  : 'linear-gradient(90deg, rgba(255,255,255,0.95), rgba(255,255,255,0.72))',
                transition: 'width 0.35s ease',
              }} />
            </div>
            <div style={{
              fontSize: 8,
              fontWeight: 800,
              color: progresso >= 100 ? '#A7F3D0' : 'rgba(255,255,255,0.95)',
              marginTop: 2,
            }}>
              {progresso >= 100 ? '✓ ' : ''}{progresso.toFixed(0)}%
            </div>
          </div>
        )}

        {/* Responsável avatar */}
        {data.responsavelNome && (
          <div style={{
            position: 'absolute',
            bottom: 4,
            right: 6,
            background: 'rgba(0,0,0,0.35)',
            borderRadius: 20,
            padding: '1px 5px',
            fontSize: 7,
            color: 'rgba(255,255,255,0.9)',
            display: 'flex',
            alignItems: 'center',
            gap: 2,
          }}>
            <span>👤</span>
            <span style={{ maxWidth: 40, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {data.responsavelNome.split(' ')[0]}
            </span>
          </div>
        )}

        {/* Description indicator */}
        {data.descricao && (
          <div style={{
            position: 'absolute',
            top: 4,
            right: 6,
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.8)',
            boxShadow: '0 0 0 2px rgba(255,255,255,0.3)',
          }} />
        )}

        <Handle type="source" position={Position.Bottom} style={{ opacity: 0, width: 10, height: 10 }} />
        <Handle type="source" position={Position.Right} style={{ opacity: 0, width: 10, height: 10 }} />
      </div>
    </div>
  );
}

// ─── Edge Customizada ────────────────────────────────────────────────────────

function CustomEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected, markerEnd }: any) {
  const d = (data || {}) as EdgeData;
  const cor = d.cor || '#94a3b8';
  const espessura = d.espessura || 2;
  const estilo = d.estilo || 'solida';

  let pathFn: any = getBezierPath;
  if (d.tipo === 'reta') pathFn = getStraightPath;
  if (d.tipo === 'step' || d.tipo === 'suave') pathFn = getSmoothStepPath;

  const [edgePath, labelX, labelY] = pathFn({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });

  let strokeDasharray: string | undefined;
  if (estilo === 'tracejada') strokeDasharray = '10 5';
  if (estilo === 'pontilhada') strokeDasharray = '3 5';

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: cor,
          strokeWidth: selected ? espessura + 1.5 : espessura,
          strokeDasharray,
          filter: selected ? `drop-shadow(0 0 6px ${cor}88)` : undefined,
          transition: 'stroke-width 0.15s',
        }}
      />
      {d.label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              background: 'white',
              border: `1.5px solid ${cor}`,
              borderRadius: 8,
              padding: '2px 10px',
              fontSize: 10,
              fontWeight: 700,
              color: cor,
              pointerEvents: 'all',
              whiteSpace: 'nowrap',
              boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
              letterSpacing: '0.02em',
            }}
            className="nodrag nopan"
          >
            {d.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

// ─── Node Detail Modal ────────────────────────────────────────────────────────

function NodeDetailModal({
  node,
  open,
  onClose,
  onUpdate,
  onDelete,
  canEdit,
  usuarios,
}: {
  node: Node<NodeData> | null;
  open: boolean;
  onClose: () => void;
  onUpdate: (id: string, data: Partial<NodeData>) => void;
  onDelete: (id: string) => void;
  canEdit: boolean;
  usuarios: Responsavel[];
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<NodeData>>({});
  const [tagInput, setTagInput] = useState('');

  useEffect(() => {
    if (node) {
      setForm({
        label: node.data.label,
        sublabel: node.data.sublabel || '',
        descricao: node.data.descricao || '',
        notas: node.data.notas || '',
        fase: node.data.fase || 'nenhuma',
        tipo: node.data.tipo,
        responsavelId: node.data.responsavelId || '',
        responsavelNome: node.data.responsavelNome || '',
        tags: node.data.tags || [],
        emoji: node.data.emoji || '',
        cor: node.data.cor,
        corTexto: node.data.corTexto || '#ffffff',
        formato: node.data.formato || 'redondo',
        tamanho: node.data.tamanho || 'medio',
        fontSize: node.data.fontSize || 13,
        fontWeight: node.data.fontWeight || '700',
        espessuraBorda: node.data.espessuraBorda || 2,
        corBorda: node.data.corBorda || 'rgba(255,255,255,0.2)',
        metaAlvo: node.data.metaAlvo,
        metaAtual: node.data.metaAtual,
        metaUnidade: node.data.metaUnidade || '',
      });
      setTagInput('');
      setEditing(false);
    }
  }, [node]);

  const handleSave = () => {
    if (!node) return;
    onUpdate(node.id, form);
    setEditing(false);
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (!t) return;
    const atuais = form.tags || [];
    if (atuais.some(x => x.toLowerCase() === t.toLowerCase())) { setTagInput(''); return; }
    setForm(f => ({ ...f, tags: [...atuais, t] }));
    setTagInput('');
  };

  const removeTag = (t: string) => {
    setForm(f => ({ ...f, tags: (f.tags || []).filter(x => x !== t) }));
  };

  const responsavel = usuarios.find(u => u.id === form.responsavelId);
  const fase = (form.fase || 'nenhuma') as FaseFunil;

  if (!node) return null;

  const isMeta = (form.tipo || node.data.tipo) === 'meta';
  const progressoForm = metaProgresso(form as NodeData);

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden rounded-2xl">
        {/* Header bar com cor do nó */}
        <div style={{ background: `linear-gradient(135deg, ${node.data.cor}, ${node.data.cor}cc)`, padding: '20px 24px 16px' }}>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              {editing ? (
                <Input
                  value={form.emoji || ''}
                  onChange={e => setForm(f => ({ ...f, emoji: e.target.value }))}
                  className="w-14 text-2xl bg-white/20 border-white/30 text-white text-center"
                  placeholder="🔵"
                />
              ) : (
                <span className="text-3xl">{node.data.emoji || '🔵'}</span>
              )}
              <div>
                {editing ? (
                  <Input
                    value={form.label || ''}
                    onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                    className="text-xl font-bold bg-white/20 border-white/30 text-white placeholder-white/60 mb-1"
                  />
                ) : (
                  <h2 className="text-xl font-bold text-white leading-tight">{node.data.label}</h2>
                )}
                {editing ? (
                  <Input
                    value={form.sublabel || ''}
                    onChange={e => setForm(f => ({ ...f, sublabel: e.target.value }))}
                    className="text-sm bg-white/15 border-white/20 text-white/80 placeholder-white/40"
                    placeholder="Subtítulo..."
                  />
                ) : (
                  node.data.sublabel && <p className="text-sm text-white/75 mt-0.5">{node.data.sublabel}</p>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              {canEdit && !editing && (
                <button
                  onClick={() => setEditing(true)}
                  className="p-2 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors"
                  title="Editar"
                >
                  <Edit3 className="h-4 w-4" />
                </button>
              )}
              <button onClick={onClose} className="p-2 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Fase badge */}
          {editing ? (
            <select
              value={form.fase || 'nenhuma'}
              onChange={e => setForm(f => ({ ...f, fase: e.target.value as FaseFunil }))}
              className="mt-3 text-xs rounded-full px-3 py-1 border border-white/30 bg-white/20 text-white font-semibold"
            >
              {Object.entries(FASE_LABELS).map(([v, l]) => (
                <option key={v} value={v} style={{ background: '#1f2937', color: '#fff' }}>{l}</option>
              ))}
            </select>
          ) : (
            <div className="mt-3 inline-flex items-center gap-1.5 bg-white/20 rounded-full px-3 py-1">
              <div className="w-2 h-2 rounded-full bg-white/80" />
              <span className="text-xs font-semibold text-white">{FASE_LABELS[fase]}</span>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 max-h-[65vh] overflow-y-auto">
          {/* Responsável */}
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              <User className="h-3.5 w-3.5" /> Responsável
            </div>
            {editing ? (
              <select
                value={form.responsavelId || ''}
                onChange={e => {
                  const u = usuarios.find(u => u.id === e.target.value);
                  setForm(f => ({ ...f, responsavelId: e.target.value, responsavelNome: u?.nome || '' }));
                }}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-gray-50"
              >
                <option value="">— Sem responsável</option>
                {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
            ) : (
              <div className="flex items-center gap-2">
                {responsavel ? (
                  <>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: responsavel.cor }}>
                      {responsavel.nome.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm font-medium text-gray-700">{responsavel.nome}</span>
                  </>
                ) : (
                  <span className="text-sm text-gray-400 italic">Nenhum responsável definido</span>
                )}
              </div>
            )}
          </div>

          {/* Descrição */}
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              <FileText className="h-3.5 w-3.5" /> Descrição
            </div>
            {editing ? (
              <Textarea
                value={form.descricao || ''}
                onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                placeholder="Descreva o propósito deste nó..."
                rows={3}
                className="rounded-xl resize-none text-sm"
              />
            ) : (
              <div className="p-3 bg-gray-50 rounded-xl text-sm text-gray-700 leading-relaxed min-h-[50px]">
                {node.data.descricao || <span className="text-gray-400 italic">Sem descrição — clique em editar para adicionar.</span>}
              </div>
            )}
          </div>

          {/* Notas internas */}
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              <MessageSquare className="h-3.5 w-3.5" /> Notas internas
            </div>
            {editing ? (
              <Textarea
                value={form.notas || ''}
                onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                placeholder="Notas, observações, próximos passos..."
                rows={3}
                className="rounded-xl resize-none text-sm"
              />
            ) : (
              <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl text-sm text-amber-800 leading-relaxed min-h-[44px]">
                {node.data.notas || <span className="text-amber-400 italic">Sem notas.</span>}
              </div>
            )}
          </div>

          {/* Meta / progresso */}
          {isMeta && (
            <div className="rounded-xl border border-sky-100 bg-sky-50/60 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-sky-500 uppercase tracking-wider mb-3">
                <Target className="h-3.5 w-3.5" /> Progresso da meta
              </div>

              {editing ? (
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Unidade</label>
                    <Input
                      value={form.metaUnidade || ''}
                      onChange={e => setForm(f => ({ ...f, metaUnidade: e.target.value }))}
                      placeholder="R$"
                      className="rounded-xl text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Atual</label>
                    <Input
                      type="number"
                      value={form.metaAtual ?? ''}
                      onChange={e => setForm(f => ({ ...f, metaAtual: e.target.value === '' ? null : Number(e.target.value) }))}
                      placeholder="0"
                      className="rounded-xl text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Alvo</label>
                    <Input
                      type="number"
                      value={form.metaAlvo ?? ''}
                      onChange={e => setForm(f => ({ ...f, metaAlvo: e.target.value === '' ? null : Number(e.target.value) }))}
                      placeholder="100"
                      className="rounded-xl text-sm"
                    />
                  </div>
                </div>
              ) : (
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-2xl font-bold text-gray-800">
                    {formatMetaValor(node.data.metaAtual, node.data.metaUnidade)}
                  </span>
                  <span className="text-sm text-gray-400">
                    de {formatMetaValor(node.data.metaAlvo, node.data.metaUnidade)}
                  </span>
                </div>
              )}

              <div className="mt-3">
                <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${progressoForm}%`,
                      background: progressoForm >= 100
                        ? 'linear-gradient(90deg,#34D399,#059669)'
                        : 'linear-gradient(90deg,#38BDF8,#0284C7)',
                    }}
                  />
                </div>
                <p className={`text-xs font-bold mt-1.5 ${progressoForm >= 100 ? 'text-emerald-600' : 'text-sky-600'}`}>
                  {progressoForm >= 100 ? '🎉 Meta batida!' : `${progressoForm.toFixed(1)}% concluído`}
                </p>
              </div>
            </div>
          )}

          {/* Tags */}
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              <Tag className="h-3.5 w-3.5" /> Tags
            </div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {(form.tags || []).length === 0 && !editing && (
                <span className="text-sm text-gray-400 italic">Sem tags.</span>
              )}
              {(form.tags || []).map(t => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200"
                >
                  #{t}
                  {editing && (
                    <button onClick={() => removeTag(t)} className="text-gray-400 hover:text-red-500">
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </span>
              ))}
            </div>
            {editing && (
              <div className="flex gap-2">
                <Input
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); }
                  }}
                  placeholder="Digite e pressione Enter..."
                  className="rounded-xl text-sm h-9"
                />
                <Button type="button" variant="outline" onClick={addTag} className="rounded-xl h-9 px-3">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          {/* Aparência (só em edição) */}
          {editing && (
            <div className="rounded-xl border border-gray-100 p-4 bg-gray-50 space-y-4">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                <Palette className="h-3.5 w-3.5" /> Aparência
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1 block">Tipo do nó</label>
                <select
                  value={form.tipo || 'etapa_funil'}
                  onChange={e => {
                    const t = e.target.value as NodeTipo;
                    // Ao virar meta, já dá um alvo padrão para a barra aparecer.
                    setForm(f => ({
                      ...f,
                      tipo: t,
                      metaAlvo: t === 'meta' && f.metaAlvo == null ? 100 : f.metaAlvo,
                      metaAtual: t === 'meta' && f.metaAtual == null ? 0 : f.metaAtual,
                    }));
                  }}
                  className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs bg-white"
                >
                  {(Object.entries(TIPO_LABELS) as [NodeTipo, string][]).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1.5 block">Cor de fundo</label>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setForm(f => ({ ...f, cor: c }))}
                      className={`w-6 h-6 rounded-md transition-all ${form.cor === c ? 'ring-2 ring-offset-1 ring-blue-500 scale-110' : ''}`}
                      style={{ background: c, boxShadow: c === '#FFFFFF' ? '0 0 0 1px #e5e7eb' : undefined }}
                    />
                  ))}
                  <input type="color" value={form.cor || '#AC1131'} onChange={e => setForm(f => ({ ...f, cor: e.target.value }))}
                    className="w-6 h-6 rounded-md cursor-pointer border border-gray-200 p-0" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Formato</label>
                  <select value={form.formato || 'redondo'} onChange={e => setForm(f => ({ ...f, formato: e.target.value as NodeFormato }))}
                    className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs bg-white">
                    {FORMATO_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.preview} {f.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Tamanho</label>
                  <select value={form.tamanho || 'medio'} onChange={e => setForm(f => ({ ...f, tamanho: e.target.value as NodeTamanho }))}
                    className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs bg-white">
                    <option value="pequeno">Pequeno</option>
                    <option value="medio">Médio</option>
                    <option value="grande">Grande</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1 block">Tamanho da fonte</label>
                <div className="flex items-center gap-3">
                  <input type="range" min={8} max={24} value={form.fontSize || 13}
                    onChange={e => setForm(f => ({ ...f, fontSize: Number(e.target.value) }))}
                    className="flex-1" />
                  <span className="text-xs text-gray-600 w-6">{form.fontSize || 13}</span>
                </div>
              </div>
            </div>
          )}

          {/* Meta */}
          {!editing && (
            <div className="flex items-center gap-4 text-xs text-gray-400">
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {node.data.dataCriacao ? new Date(node.data.dataCriacao as string).toLocaleDateString('pt-BR') : 'Data desconhecida'}
              </span>
              <span className="flex items-center gap-1">
                <Tag className="h-3 w-3" />
                {TIPO_LABELS[node.data.tipo]}
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-between items-center bg-gray-50">
          {canEdit && (
            <button
              onClick={() => { onDelete(node.id); onClose(); }}
              className="flex items-center gap-1.5 text-red-500 hover:text-red-700 text-sm font-medium transition-colors"
            >
              <Trash2 className="h-4 w-4" /> Excluir nó
            </button>
          )}
          <div className="flex gap-2 ml-auto">
            {editing ? (
              <>
                <Button variant="outline" onClick={() => setEditing(false)} className="rounded-xl">Cancelar</Button>
                <Button onClick={handleSave} className="rounded-xl bg-[#AC1131] hover:bg-[#8f0e29] text-white">
                  <CheckCircle2 className="h-4 w-4 mr-1.5" /> Salvar
                </Button>
              </>
            ) : (
              <Button variant="outline" onClick={onClose} className="rounded-xl">Fechar</Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Spotlight Search ────────────────────────────────────────────────────────

function SpotlightSearch({
  open,
  onClose,
  nodes,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  nodes: Node<NodeData>[];
  onSelect: (id: string) => void;
}) {
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) { setQ(''); setTimeout(() => inputRef.current?.focus(), 50); }
  }, [open]);

  const results = useMemo(() => {
    if (!q.trim()) return nodes.slice(0, 8);
    const lower = q.toLowerCase();
    return nodes.filter(n =>
      n.data.label.toLowerCase().includes(lower) ||
      (n.data.sublabel || '').toLowerCase().includes(lower) ||
      (n.data.descricao || '').toLowerCase().includes(lower)
    ).slice(0, 8);
  }, [q, nodes]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-lg overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
          <Search className="h-4 w-4 text-gray-400" />
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Buscar nós no mapa..."
            className="flex-1 text-sm outline-none bg-transparent text-gray-800 placeholder-gray-400"
          />
          <kbd className="text-xs bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded">ESC</kbd>
        </div>
        <div className="py-2 max-h-72 overflow-y-auto">
          {results.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-6">Nenhum resultado</p>
          ) : results.map(n => (
            <button
              key={n.id}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors text-left"
              onClick={() => { onSelect(n.id); onClose(); }}
            >
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0"
                style={{ background: n.data.cor }}>
                {n.data.emoji || <span className="text-white text-xs font-bold">{n.data.label.charAt(0)}</span>}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">{n.data.label}</p>
                {n.data.sublabel && <p className="text-xs text-gray-400 truncate">{n.data.sublabel}</p>}
              </div>
              {n.data.fase && n.data.fase !== 'nenhuma' && (
                <span className="text-xs px-2 py-0.5 rounded-full text-white flex-shrink-0"
                  style={{ background: FASE_COLORS[n.data.fase as FaseFunil] }}>
                  {n.data.fase}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400">
          {nodes.length} nós no mapa
        </div>
      </div>
    </div>
  );
}

// ─── Export SVG ──────────────────────────────────────────────────────────────

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, c => (
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c] as string
  ));
}

/** Quebra o texto em linhas que caibam na largura da caixa. */
function quebrarTexto(texto: string, largura: number, fontSize: number): string[] {
  const porLinha = Math.max(6, Math.floor((largura - 16) / (fontSize * 0.58)));
  const palavras = texto.split(/\s+/).filter(Boolean);
  const linhas: string[] = [];
  let atual = '';
  palavras.forEach(p => {
    const teste = atual ? `${atual} ${p}` : p;
    if (teste.length <= porLinha) { atual = teste; return; }
    if (atual) linhas.push(atual);
    atual = p.length > porLinha ? `${p.slice(0, porLinha - 1)}…` : p;
  });
  if (atual) linhas.push(atual);
  return linhas.slice(0, 3);
}

/** Ponto onde a aresta encontra a borda da caixa, na direção do outro nó. */
function ancora(
  cx: number, cy: number, w: number, h: number, alvoX: number, alvoY: number,
): { x: number; y: number } {
  const dx = alvoX - cx;
  const dy = alvoY - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const escalaX = dx === 0 ? Infinity : (w / 2) / Math.abs(dx);
  const escalaY = dy === 0 ? Infinity : (h / 2) / Math.abs(dy);
  const t = Math.min(escalaX, escalaY);
  return { x: cx + dx * t, y: cy + dy * t };
}

/** Monta o SVG completo do mapa a partir dos dados (nós inclusos). */
function buildSvg(nodes: Node<NodeData>[], edges: Edge[], titulo: string): string {
  const margem = 60;
  const caixas = nodes.map(n => {
    const { w, h } = nodeSize(n.data);
    return {
      id: n.id,
      x: n.position.x,
      y: n.position.y,
      w: n.width ?? w,
      h: n.height ?? h,
      data: n.data,
    };
  });

  const minX = Math.min(...caixas.map(c => c.x)) - margem;
  const minY = Math.min(...caixas.map(c => c.y)) - margem - 30;
  const maxX = Math.max(...caixas.map(c => c.x + c.w)) + margem;
  const maxY = Math.max(...caixas.map(c => c.y + c.h)) + margem;
  const width = Math.max(320, Math.round(maxX - minX));
  const height = Math.max(240, Math.round(maxY - minY));

  const porId = new Map(caixas.map(c => [c.id, c]));
  const partes: string[] = [];

  partes.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="${Math.round(minX)} ${Math.round(minY)} ${width} ${height}" ` +
    `font-family="Inter, Segoe UI, system-ui, sans-serif">`,
  );
  partes.push(`<rect x="${Math.round(minX)}" y="${Math.round(minY)}" width="${width}" height="${height}" fill="#ffffff"/>`);
  partes.push(
    `<text x="${Math.round(minX) + 24}" y="${Math.round(minY) + 34}" font-size="17" font-weight="700" fill="#0f172a">` +
    `${escapeXml(titulo)}</text>`,
  );

  // Arestas (antes dos nós, para ficarem atrás)
  const marcadores = new Set<string>();
  const svgEdges: string[] = [];
  edges.forEach(e => {
    const de = porId.get(e.source);
    const para = porId.get(e.target);
    if (!de || !para) return;
    const d = (e.data || {}) as EdgeData;
    const cor = d.cor || '#94a3b8';
    const esp = d.espessura || 2;
    marcadores.add(cor);

    const c1 = { x: de.x + de.w / 2, y: de.y + de.h / 2 };
    const c2 = { x: para.x + para.w / 2, y: para.y + para.h / 2 };
    const p1 = ancora(c1.x, c1.y, de.w, de.h, c2.x, c2.y);
    const p2 = ancora(c2.x, c2.y, para.w, para.h, c1.x, c1.y);

    let dash = '';
    if (d.estilo === 'tracejada') dash = ' stroke-dasharray="10 5"';
    if (d.estilo === 'pontilhada') dash = ' stroke-dasharray="3 5"';

    // Curva suave, exceto quando o estilo pedir linha reta.
    const dxCtrl = (p2.x - p1.x) * 0.4;
    const path = d.tipo === 'reta'
      ? `M ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} L ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`
      : `M ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} C ${(p1.x + dxCtrl).toFixed(1)} ${p1.y.toFixed(1)}, ` +
        `${(p2.x - dxCtrl).toFixed(1)} ${p2.y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;

    svgEdges.push(
      `<path d="${path}" fill="none" stroke="${cor}" stroke-width="${esp}"${dash} ` +
      `marker-end="url(#seta-${cor.replace('#', '')})"/>`,
    );

    if (d.label) {
      const mx = (p1.x + p2.x) / 2;
      const my = (p1.y + p2.y) / 2;
      const larguraRot = d.label.length * 6.2 + 14;
      svgEdges.push(
        `<rect x="${(mx - larguraRot / 2).toFixed(1)}" y="${(my - 10).toFixed(1)}" width="${larguraRot.toFixed(1)}" ` +
        `height="19" rx="8" fill="#ffffff" stroke="${cor}" stroke-width="1.4"/>`,
        `<text x="${mx.toFixed(1)}" y="${(my + 3.5).toFixed(1)}" font-size="10" font-weight="700" fill="${cor}" ` +
        `text-anchor="middle">${escapeXml(d.label)}</text>`,
      );
    }
  });

  partes.push('<defs>');
  marcadores.forEach(cor => {
    partes.push(
      `<marker id="seta-${cor.replace('#', '')}" viewBox="0 0 10 10" refX="9" refY="5" ` +
      `markerWidth="6" markerHeight="6" orient="auto-start-reverse">` +
      `<path d="M 0 0 L 10 5 L 0 10 z" fill="${cor}"/></marker>`,
    );
  });
  partes.push('</defs>');
  partes.push(...svgEdges);

  // Nós
  caixas.forEach(c => {
    const d = c.data;
    const cor = d.cor || '#8B5CF6';
    const corTexto = d.corTexto || '#ffffff';
    const formato = d.formato || 'redondo';
    const isMeta = d.tipo === 'meta';

    let forma: string;
    if (formato === 'diamante') {
      const pts = `${c.x + c.w / 2},${c.y} ${c.x + c.w},${c.y + c.h / 2} ${c.x + c.w / 2},${c.y + c.h} ${c.x},${c.y + c.h / 2}`;
      forma = `<polygon points="${pts}" fill="${cor}" stroke="rgba(0,0,0,0.18)" stroke-width="1.5"/>`;
    } else if (formato === 'hexagono') {
      const pts = `${c.x + c.w * 0.25},${c.y} ${c.x + c.w * 0.75},${c.y} ${c.x + c.w},${c.y + c.h / 2} ` +
        `${c.x + c.w * 0.75},${c.y + c.h} ${c.x + c.w * 0.25},${c.y + c.h} ${c.x},${c.y + c.h / 2}`;
      forma = `<polygon points="${pts}" fill="${cor}" stroke="rgba(0,0,0,0.18)" stroke-width="1.5"/>`;
    } else {
      const rx = formato === 'redondo' ? Math.min(c.h / 2, 50) : formato === 'quadrado' ? 10 : 14;
      forma = `<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" rx="${rx}" fill="${cor}" ` +
        `stroke="rgba(0,0,0,0.18)" stroke-width="1.5"/>`;
    }
    partes.push(forma);

    // Badge da fase
    if (d.fase && d.fase !== 'nenhuma') {
      const rotulo = d.fase === 'pos_venda' ? 'PÓS-VENDA' : d.fase.toUpperCase();
      const bw = rotulo.length * 5.4 + 14;
      partes.push(
        `<rect x="${(c.x + c.w / 2 - bw / 2).toFixed(1)}" y="${c.y - 19}" width="${bw.toFixed(1)}" height="15" ` +
        `rx="7.5" fill="${FASE_COLORS[d.fase as FaseFunil]}"/>`,
        `<text x="${(c.x + c.w / 2).toFixed(1)}" y="${c.y - 8}" font-size="7.5" font-weight="700" fill="#ffffff" ` +
        `text-anchor="middle" letter-spacing="0.5">${escapeXml(rotulo)}</text>`,
      );
    }

    const fontSize = d.fontSize || 12;
    const linhas = quebrarTexto(d.label || '', c.w, fontSize);
    const temEmoji = !!d.emoji;
    const blocoAltura = (temEmoji ? 20 : 0) + linhas.length * (fontSize + 3) + (isMeta ? 22 : 0);
    let cursorY = c.y + c.h / 2 - blocoAltura / 2 + fontSize;

    if (temEmoji) {
      partes.push(
        `<text x="${(c.x + c.w / 2).toFixed(1)}" y="${cursorY.toFixed(1)}" font-size="16" ` +
        `text-anchor="middle">${escapeXml(d.emoji as string)}</text>`,
      );
      cursorY += 20;
    }

    linhas.forEach(l => {
      partes.push(
        `<text x="${(c.x + c.w / 2).toFixed(1)}" y="${cursorY.toFixed(1)}" font-size="${fontSize}" ` +
        `font-weight="${d.fontWeight || '700'}" fill="${corTexto}" text-anchor="middle">${escapeXml(l)}</text>`,
      );
      cursorY += fontSize + 3;
    });

    // Barra de progresso da meta
    if (isMeta) {
      const bw = c.w * 0.78;
      const bx = c.x + (c.w - bw) / 2;
      const by = cursorY - 2;
      const p = metaProgresso(d);
      partes.push(
        `<text x="${bx.toFixed(1)}" y="${(by - 3).toFixed(1)}" font-size="7.5" font-weight="700" fill="${corTexto}">` +
        `${escapeXml(formatMetaValor(d.metaAtual, d.metaUnidade))}</text>`,
        `<text x="${(bx + bw).toFixed(1)}" y="${(by - 3).toFixed(1)}" font-size="7.5" font-weight="700" ` +
        `fill="${corTexto}" opacity="0.7" text-anchor="end">${escapeXml(formatMetaValor(d.metaAlvo, d.metaUnidade))}</text>`,
        `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${bw.toFixed(1)}" height="5" rx="2.5" fill="rgba(0,0,0,0.28)"/>`,
        `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${(bw * p / 100).toFixed(1)}" height="5" rx="2.5" ` +
        `fill="${p >= 100 ? '#34D399' : 'rgba(255,255,255,0.9)'}"/>`,
        `<text x="${bx.toFixed(1)}" y="${(by + 15).toFixed(1)}" font-size="8" font-weight="800" fill="${corTexto}">` +
        `${p.toFixed(0)}%</text>`,
      );
    }

    if (d.responsavelNome) {
      partes.push(
        `<text x="${(c.x + c.w - 7).toFixed(1)}" y="${(c.y + c.h - 6).toFixed(1)}" font-size="7" ` +
        `fill="rgba(255,255,255,0.85)" text-anchor="end">👤 ${escapeXml(d.responsavelNome.split(' ')[0])}</text>`,
      );
    }
  });

  partes.push('</svg>');
  return partes.join('\n');
}

/** Lê width/height do SVG gerado, para dimensionar o canvas do PNG. */
function svgSize(svg: string): { width: number; height: number } {
  const w = /width="(\d+)"/.exec(svg);
  const h = /height="(\d+)"/.exec(svg);
  return { width: Number(w?.[1] ?? 1200), height: Number(h?.[1] ?? 800) };
}

// ─── Componente Principal ────────────────────────────────────────────────────

function MapaMentalInner() {
  const { user } = useAuth();
  const [rfi, setRfi] = useState<ReactFlowInstance | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<NodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Permissões — admin pode editar, outros só visualizar
  const [userRole, setUserRole] = useState<'admin' | 'viewer'>('viewer');
  const canEdit = userRole === 'admin';

  // Estado de seleção
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  // Modais
  const [detailNode, setDetailNode] = useState<Node<NodeData> | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  // Form criar nó
  const [newTipo, setNewTipo] = useState<NodeTipo>('etapa_funil');
  const [newTitle, setNewTitle] = useState('');
  const [newFase, setNewFase] = useState<FaseFunil>('nenhuma');
  const [newEmoji, setNewEmoji] = useState('');
  const [clickPos, setClickPos] = useState({ x: 200, y: 200 });

  // Painel lateral (edição de aresta)
  const [panelOpen, setPanelOpen] = useState(false);
  const [editEdgeLabel, setEditEdgeLabel] = useState('');
  const [editEdgeCor, setEditEdgeCor] = useState('#94a3b8');
  const [editEdgeEspessura, setEditEdgeEspessura] = useState(2);
  const [editEdgeTipo, setEditEdgeTipo] = useState<EdgeTipo>('bezier');
  const [editEdgeEstilo, setEditEdgeEstilo] = useState<EdgeEstilo>('solida');
  const [editEdgeAnimado, setEditEdgeAnimado] = useState(false);

  // Usuários para responsável
  const [usuarios, setUsuarios] = useState<Responsavel[]>([]);

  // Páginas do mapa mental (múltiplos quadros)
  const [pages, setPages] = useState<MindMapPage[]>([]);
  const [currentWorkspace, setCurrentWorkspace] = useState<string>(() => {
    if (typeof window === 'undefined') return 'empresa';
    return localStorage.getItem(LAST_WORKSPACE_KEY) || 'empresa';
  });
  const [pagesLoaded, setPagesLoaded] = useState(false);
  const [showPageDialog, setShowPageDialog] = useState(false);
  const [editingPage, setEditingPage] = useState<MindMapPage | null>(null);
  const [pageForm, setPageForm] = useState<{ nome: string; emoji: string; cor: string; tipo: PaginaTipo }>({
    nome: '', emoji: '🧠', cor: '#AC1131', tipo: 'mapa',
  });
  const [deletingPage, setDeletingPage] = useState<MindMapPage | null>(null);
  const [scaffoldFunil, setScaffoldFunil] = useState(true);
  // Página recém-criada que ainda precisa receber a estrutura inicial.
  const pendingScaffoldRef = useRef<string | null>(null);

  const currentPage = useMemo(
    () => pages.find(p => p.workspace === currentWorkspace) || null,
    [pages, currentWorkspace]
  );

  // Histórico desfazer/refazer
  const [undoStack, setUndoStack] = useState<HistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryEntry[]>([]);
  const [busyHistory, setBusyHistory] = useState(false);

  // Filtros do canvas
  const [filtroFase, setFiltroFase] = useState<FaseFunil | 'todas'>('todas');
  const [filtroResponsavel, setFiltroResponsavel] = useState<string>('todos');
  const [filtroTag, setFiltroTag] = useState<string>('todas');
  const filtroAtivo = filtroFase !== 'todas' || filtroResponsavel !== 'todos' || filtroTag !== 'todas';

  // Área de transferência (copiar/colar/duplicar)
  const clipboardRef = useRef<NodeData[]>([]);

  // Grade magnética
  const [snapToGrid, setSnapToGrid] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(SNAP_KEY) === '1';
  });

  const [showShortcuts, setShowShortcuts] = useState(false);
  const [duplicatingPage, setDuplicatingPage] = useState(false);

  const nodeTypes: NodeTypes = useMemo(() => ({ mindmap: MindMapNode }), []);
  const edgeTypes = useMemo(() => ({ custom: CustomEdge }), []);

  /** Registra uma ação no histórico e zera o redo (novo caminho). */
  const pushHistory = useCallback((entry: HistoryEntry) => {
    setUndoStack(s => [...s.slice(-(MAX_HISTORY - 1)), entry]);
    setRedoStack([]);
  }, []);

  // Espelhos do estado para os callbacks não capturarem valor velho.
  const nodesRef = useRef<Node<NodeData>[]>([]);
  const edgesRef = useRef<Edge[]>([]);
  const selecionadosRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    nodesRef.current = nodes;
    selecionadosRef.current = new Set(nodes.filter(n => n.selected).map(n => n.id));
  }, [nodes]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);

  // ── Verificar role ──────────────────────────────────────────────────────────

  useEffect(() => {
    const checkRole = async () => {
      if (!user) return;
      const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (data?.role === 'admin' || data?.role === 'editor') setUserRole('admin');
      else setUserRole('viewer');
    };
    checkRole();
  }, [user]);

  // ── Carregar usuários ───────────────────────────────────────────────────────

  useEffect(() => {
    const fetchUsuarios = async () => {
      const { data } = await supabase.from('profiles').select('id, nome, avatar_url');
      if (data) {
        const cores = ['#AC1131','#3B82F6','#8B5CF6','#10B981','#F59E0B','#EF4444','#06B6D4'];
        setUsuarios(data.map((u: any, i: number) => ({
          id: u.id,
          nome: u.nome || 'Sem nome',
          avatar: u.avatar_url,
          cor: cores[i % cores.length],
        })));
      }
    };
    fetchUsuarios();
  }, []);

  // ── Carregar páginas (quadros) ──────────────────────────────────────────────

  const fetchPages = useCallback(async () => {
    const { data, error } = await supabase
      .from('mind_map_pages')
      .select('id, workspace, nome, emoji, cor, descricao, tipo, ordem')
      .order('ordem', { ascending: true })
      .order('created_at', { ascending: true });

    if (error || !data || data.length === 0) {
      setPagesLoaded(true);
      return;
    }

    const loaded: MindMapPage[] = data.map((p: any) => ({
      id: p.id,
      workspace: p.workspace,
      nome: p.nome,
      emoji: p.emoji || '🧠',
      cor: p.cor || '#AC1131',
      descricao: p.descricao || '',
      tipo: (p.tipo || 'mapa') as PaginaTipo,
      ordem: p.ordem ?? 0,
    }));
    setPages(loaded);

    setCurrentWorkspace(prev => {
      if (loaded.some(p => p.workspace === prev)) return prev;
      return loaded[0].workspace;
    });
    setPagesLoaded(true);
  }, []);

  useEffect(() => {
    fetchPages();
    const ch = supabase.channel('mind-map-pages')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mind_map_pages' }, fetchPages)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchPages]);

  const switchPage = useCallback((workspace: string) => {
    setCurrentWorkspace(workspace);
    localStorage.setItem(LAST_WORKSPACE_KEY, workspace);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setPanelOpen(false);
    setShowDetail(false);
    setDetailNode(null);
  }, []);

  const openNewPageDialog = () => {
    setEditingPage(null);
    setPageForm({ nome: '', emoji: '🧠', cor: '#AC1131', tipo: 'mapa' });
    setShowPageDialog(true);
  };

  const openEditPageDialog = (page: MindMapPage) => {
    setEditingPage(page);
    setPageForm({ nome: page.nome, emoji: page.emoji, cor: page.cor, tipo: page.tipo });
    setShowPageDialog(true);
  };

  const savePage = async () => {
    if (!pageForm.nome.trim()) return;

    if (editingPage) {
      const { error } = await supabase.from('mind_map_pages').update({
        nome: pageForm.nome.trim(),
        emoji: pageForm.emoji || '🧠',
        cor: pageForm.cor,
        tipo: pageForm.tipo,
        updated_at: new Date().toISOString(),
      }).eq('id', editingPage.id);
      if (error) { toast({ variant: 'destructive', title: 'Erro ao salvar página' }); return; }
      toast({ title: 'Página atualizada!' });
    } else {
      const { data, error } = await supabase.from('mind_map_pages').insert({
        nome: pageForm.nome.trim(),
        emoji: pageForm.emoji || '🧠',
        cor: pageForm.cor,
        tipo: pageForm.tipo,
        ordem: pages.length,
        criado_por: user?.id,
      }).select().single();
      if (error || !data) { toast({ variant: 'destructive', title: 'Erro ao criar página' }); return; }
      toast({ title: '✨ Página criada!', description: pageForm.nome.trim() });
      // O funil só pode ser montado depois que o workspace novo virar o atual.
      if (pageForm.tipo === 'funil' && scaffoldFunil) {
        pendingScaffoldRef.current = data.workspace;
      }
      switchPage(data.workspace);
    }
    setShowPageDialog(false);
    setEditingPage(null);
  };

  const confirmDeletePage = async () => {
    if (!deletingPage) return;
    if (pages.length <= 1) {
      toast({ variant: 'destructive', title: 'Não é possível excluir a última página.' });
      setDeletingPage(null);
      return;
    }
    await supabase.from('mind_map_connections').delete().eq('workspace', deletingPage.workspace);
    await supabase.from('mind_map_nodes').delete().eq('workspace', deletingPage.workspace);
    await supabase.from('mind_map_pages').delete().eq('id', deletingPage.id);

    if (currentWorkspace === deletingPage.workspace) {
      const remaining = pages.filter(p => p.id !== deletingPage.id);
      if (remaining[0]) switchPage(remaining[0].workspace);
    }
    toast({ title: 'Página excluída.' });
    setDeletingPage(null);
  };

  // ── Carregar mapa ───────────────────────────────────────────────────────────

  const fetchData = useCallback(async (workspace: string) => {
    // Mapa por página: filtra por workspace (id da página)
    const [nodesRes, connRes] = await Promise.all([
      supabase.from('mind_map_nodes').select('id, titulo, tipo, cor, cor_texto, cor_borda, espessura_borda, tamanho, formato, font_size, font_weight, font_style, largura, altura, posicao_x, posicao_y, x, y, width, height, pai_id, user_id, workspace, sublabel, emoji, descricao, notas, fase, responsavel_id, responsavel_nome, tags, created_at').eq('workspace', workspace).limit(500),
      supabase.from('mind_map_connections').select('id, no_origem_id, no_destino_id, origem_id, destino_id, cor, label, tipo, animado, tipo_linha, espessura, marcador_inicio, marcador_fim, user_id, estilo, workspace').eq('workspace', workspace).limit(1000),
    ]);

    if (nodesRes.data) {
      const rfNodes: Node<NodeData>[] = nodesRes.data.map((n: any) => {
        const data: NodeData = {
          label: n.titulo || '',
          sublabel: n.sublabel || '',
          descricao: n.descricao || '',
          notas: n.notas || '',
          tipo: (n.tipo || 'etapa_funil') as NodeTipo,
          cor: n.cor || NODE_COLORS[n.tipo as NodeTipo] || '#8B5CF6',
          corTexto: n.cor_texto || '#ffffff',
          corBorda: n.cor_borda || 'rgba(255,255,255,0.2)',
          espessuraBorda: n.espessura_borda || 2,
          tamanho: (n.tamanho || 'medio') as NodeTamanho,
          formato: (n.formato || 'redondo') as NodeFormato,
          largura: n.largura || TAMANHO_PRESETS.medio.w,
          altura: n.altura || TAMANHO_PRESETS.medio.h,
          fontSize: n.font_size || 13,
          fontWeight: n.font_weight || '700',
          fontStyle: n.font_style || 'normal',
          emoji: n.emoji || '',
          fase: (n.fase || 'nenhuma') as FaseFunil,
          responsavelId: n.responsavel_id || '',
          responsavelNome: n.responsavel_nome || '',
          tags: n.tags || [],
          dataCriacao: n.created_at || '',
          metaAlvo: n.meta_alvo ?? undefined,
          metaAtual: n.meta_atual ?? undefined,
          metaUnidade: n.meta_unidade || '',
        };
        const { w, h } = nodeSize(data);
        return {
          id: n.id.toString(),
          type: 'mindmap',
          position: { x: n.posicao_x ?? 200, y: n.posicao_y ?? 200 },
          width: w,
          height: h,
          // O realtime recarrega a cada edição; sem isso a seleção se perdia.
          selected: selecionadosRef.current.has(n.id.toString()),
          data,
        };
      });
      setNodes(rfNodes);
    }

    if (connRes.data) {
      const rfEdges: Edge[] = connRes.data.map((c: any) => ({
        id: c.id.toString(),
        source: c.no_origem_id || '',
        target: c.no_destino_id || '',
        type: 'custom',
        animated: c.animado || false,
        markerEnd: { type: MarkerType.ArrowClosed, color: c.cor || '#94a3b8', width: 16, height: 16 },
        data: {
          label: c.label || '',
          cor: c.cor || '#94a3b8',
          espessura: c.espessura || 2,
          tipo: (c.tipo_linha || 'bezier') as EdgeTipo,
          estilo: (c.estilo || 'solida') as EdgeEstilo,
          animado: c.animado || false,
        },
      }));
      setEdges(rfEdges);
    }
  }, [setNodes, setEdges]);

  useEffect(() => {
    if (!pagesLoaded || !currentWorkspace) return;
    fetchData(currentWorkspace);
    let debounceMapTimer: ReturnType<typeof setTimeout> | null = null;
    const triggerReload = () => {
      if (debounceMapTimer) clearTimeout(debounceMapTimer);
      debounceMapTimer = setTimeout(() => fetchData(currentWorkspace), 1200);
    };
    const ch = supabase.channel(`mind-map-${currentWorkspace}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mind_map_nodes', filter: `workspace=eq.${currentWorkspace}` }, triggerReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mind_map_connections', filter: `workspace=eq.${currentWorkspace}` }, triggerReload)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchData, currentWorkspace, pagesLoaded]);

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────

  // Persiste a preferência de grade magnética.
  useEffect(() => {
    localStorage.setItem(SNAP_KEY, snapToGrid ? '1' : '0');
  }, [snapToGrid]);

  // Troca de página zera o histórico (as ações não valem no outro quadro).
  useEffect(() => {
    setUndoStack([]);
    setRedoStack([]);
  }, [currentWorkspace]);

  // ── Selecionar nó ───────────────────────────────────────────────────────────

  const onNodeClick = useCallback((e: React.MouseEvent, node: Node<NodeData>) => {
    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
    setPanelOpen(false);
    // Durante multisseleção (Shift/Ctrl) o modal não deve abrir.
    if (e.shiftKey || e.ctrlKey || e.metaKey) return;
    setDetailNode(node);
    setShowDetail(true);
  }, []);

  // ── Selecionar aresta ───────────────────────────────────────────────────────

  const onEdgeClick = useCallback((_: any, edge: Edge) => {
    if (!canEdit) return;
    setSelectedEdgeId(edge.id);
    setSelectedNodeId(null);
    setShowDetail(false);
    const d = (edge.data || {}) as EdgeData;
    setEditEdgeLabel(d.label || '');
    setEditEdgeCor(d.cor || '#94a3b8');
    setEditEdgeEspessura(d.espessura || 2);
    setEditEdgeTipo(d.tipo || 'bezier');
    setEditEdgeEstilo(d.estilo || 'solida');
    setEditEdgeAnimado(d.animado || false);
    setPanelOpen(true);
  }, [canEdit]);

  // ── Update nó ───────────────────────────────────────────────────────────────

  /** Aplica um patch no nó (estado + banco) sem tocar no histórico. */
  const applyNodeUpdate = useCallback(async (nodeId: string, updates: Partial<NodeData>) => {
    setNodes(nds => nds.map(n => {
      if (n.id !== nodeId) return n;
      const data = { ...n.data, ...updates };
      // Se mudou o tamanho, a dimensão nativa do React Flow tem que acompanhar.
      const mexeuNoTamanho = updates.tamanho !== undefined
        || updates.largura !== undefined
        || updates.altura !== undefined;
      if (!mexeuNoTamanho) return { ...n, data };
      const { w, h } = nodeSize(data);
      return { ...n, data, width: w, height: h };
    }));
    setDetailNode(prev => prev && prev.id === nodeId ? { ...prev, data: { ...prev.data, ...updates } } : prev);

    const db = nodeDataToDb(updates);
    if (Object.keys(db).length > 0) {
      await supabase.from('mind_map_nodes').update(db).eq('id', nodeId);
    }
  }, [setNodes]);

  /** Update com registro no histórico (usado pela UI). */
  const updateNode = useCallback(async (nodeId: string, updates: Partial<NodeData>) => {
    const anterior = nodesRef.current.find(n => n.id === nodeId)?.data;
    if (anterior) {
      const inverso: Partial<NodeData> = {};
      (Object.keys(updates) as (keyof NodeData)[]).forEach(k => {
        (inverso as Record<string, unknown>)[k as string] = anterior[k];
      });
      pushHistory({
        label: 'Editar nó',
        undo: () => applyNodeUpdate(nodeId, inverso),
        redo: () => applyNodeUpdate(nodeId, updates),
      });
    }
    await applyNodeUpdate(nodeId, updates);
  }, [applyNodeUpdate, pushHistory]);

  // ── Update aresta ───────────────────────────────────────────────────────────

  const updateEdge = useCallback(async (edgeId: string, updates: Partial<EdgeData>) => {
    setEdges(eds => eds.map(e => {
      if (e.id !== edgeId) return e;
      const newData = { ...((e.data || {}) as EdgeData), ...updates };
      return {
        ...e,
        animated: updates.animado ?? e.animated,
        markerEnd: { type: MarkerType.ArrowClosed, color: updates.cor || (e.data as EdgeData)?.cor || '#94a3b8', width: 16, height: 16 },
        data: newData,
      };
    }));
    const db: any = {};
    if (updates.label !== undefined) db.label = updates.label;
    if (updates.cor !== undefined) db.cor = updates.cor;
    if (updates.espessura !== undefined) db.espessura = updates.espessura;
    if (updates.tipo !== undefined) db.tipo_linha = updates.tipo;
    if (updates.estilo !== undefined) db.estilo = updates.estilo;
    if (updates.animado !== undefined) db.animado = updates.animado;
    if (Object.keys(db).length > 0) {
      await supabase.from('mind_map_connections').update(db).eq('id', edgeId);
    }
  }, [setEdges]);

  // ── Mover nós ───────────────────────────────────────────────────────────────

  /** Grava posições em lote e devolve as anteriores (para o histórico). */
  const persistPositions = useCallback(async (
    alvos: { id: string; x: number; y: number }[],
  ) => {
    await Promise.all(alvos.map(p =>
      supabase.from('mind_map_nodes')
        .update({ posicao_x: Math.round(p.x), posicao_y: Math.round(p.y) })
        .eq('id', p.id)
    ));
    setNodes(nds => nds.map(n => {
      const alvo = alvos.find(a => a.id === n.id);
      return alvo ? { ...n, position: { x: alvo.x, y: alvo.y } } : n;
    }));
  }, [setNodes]);

  // Posições no início do arraste, para saber o que desfazer.
  const dragStartRef = useRef<{ id: string; x: number; y: number }[]>([]);

  const onNodeDragStart = useCallback((_e: React.MouseEvent, _n: Node, arrastados: Node[]) => {
    dragStartRef.current = (arrastados?.length ? arrastados : []).map(n => ({
      id: n.id, x: n.position.x, y: n.position.y,
    }));
  }, []);

  /**
   * O React Flow entrega no 3º argumento TODOS os nós arrastados — com
   * multisseleção o código antigo salvava só um e os outros voltavam ao
   * recarregar a página.
   */
  const onNodeDragStop = useCallback(async (_e: React.MouseEvent, node: Node, arrastados: Node[]) => {
    if (!canEdit) return;
    const movidos = (arrastados?.length ? arrastados : [node]).map(n => ({
      id: n.id, x: n.position.x, y: n.position.y,
    }));
    const antes = dragStartRef.current.filter(a => movidos.some(m => m.id === a.id));
    dragStartRef.current = [];

    const mudou = movidos.some(m => {
      const a = antes.find(x => x.id === m.id);
      return !a || Math.round(a.x) !== Math.round(m.x) || Math.round(a.y) !== Math.round(m.y);
    });

    await Promise.all(movidos.map(m =>
      supabase.from('mind_map_nodes')
        .update({ posicao_x: Math.round(m.x), posicao_y: Math.round(m.y) })
        .eq('id', m.id)
    ));

    if (mudou && antes.length > 0) {
      pushHistory({
        label: movidos.length > 1 ? `Mover ${movidos.length} nós` : 'Mover nó',
        undo: () => persistPositions(antes),
        redo: () => persistPositions(movidos),
      });
    }
  }, [canEdit, pushHistory, persistPositions]);

  /**
   * Intercepta as mudanças do canvas para persistir o redimensionamento.
   * Antes o NodeResizer aparecia mas o tamanho ficava travado no preset e nada
   * era salvo — agora o fim do resize grava largura/altura e marca o nó como
   * "personalizado".
   */
  const handleNodesChange = useCallback((changes: NodeChange<Node<NodeData>>[]) => {
    onNodesChange(changes);
    if (!canEdit) return;

    changes.forEach(ch => {
      if (ch.type !== 'dimensions' || ch.resizing !== false) return;
      const atual = nodesRef.current.find(n => n.id === ch.id);
      if (!atual) return;

      const w = Math.round(ch.dimensions?.width ?? atual.width ?? TAMANHO_PRESETS.medio.w);
      const h = Math.round(ch.dimensions?.height ?? atual.height ?? TAMANHO_PRESETS.medio.h);
      const anterior = { tamanho: atual.data.tamanho, largura: atual.data.largura, altura: atual.data.altura };
      if (Math.round(anterior.largura ?? 0) === w && Math.round(anterior.altura ?? 0) === h
        && anterior.tamanho === 'personalizado') return;

      const patch: Partial<NodeData> = { tamanho: 'personalizado', largura: w, altura: h };
      pushHistory({
        label: 'Redimensionar nó',
        undo: () => applyNodeUpdate(ch.id, anterior),
        redo: () => applyNodeUpdate(ch.id, patch),
      });
      applyNodeUpdate(ch.id, patch);
    });
  }, [onNodesChange, canEdit, applyNodeUpdate, pushHistory]);

  // ── Serialização (histórico, copiar/colar, export) ──────────────────────────

  const nodeToRow = useCallback((n: Node<NodeData>): NodeRow => ({
    id: n.id,
    ...nodeDataToDb(n.data),
    posicao_x: Math.round(n.position.x),
    posicao_y: Math.round(n.position.y),
    workspace: currentWorkspace,
    user_id: user?.id ?? null,
  }), [currentWorkspace, user]);

  const edgeToRow = useCallback((e: Edge): NodeRow => {
    const d = (e.data || {}) as EdgeData;
    return {
      id: e.id,
      no_origem_id: e.source,
      no_destino_id: e.target,
      label: d.label ?? '',
      cor: d.cor ?? '#94a3b8',
      espessura: d.espessura ?? 2,
      tipo_linha: d.tipo ?? 'bezier',
      estilo: d.estilo ?? 'solida',
      animado: d.animado ?? false,
      workspace: currentWorkspace,
      user_id: user?.id ?? null,
    };
  }, [currentWorkspace, user]);

  /** Recria nós/arestas com os mesmos ids (usado no desfazer de exclusões). */
  const restoreRows = useCallback(async (nodeRows: NodeRow[], edgeRows: NodeRow[]) => {
    if (nodeRows.length) await supabase.from('mind_map_nodes').insert(nodeRows as never);
    if (edgeRows.length) await supabase.from('mind_map_connections').insert(edgeRows as never);
    await fetchData(currentWorkspace);
  }, [fetchData, currentWorkspace]);

  /** Apaga nós e tudo que os conecta. */
  const purgeNodes = useCallback(async (ids: string[]) => {
    if (!ids.length) return;
    await supabase.from('mind_map_connections').delete().in('no_origem_id', ids);
    await supabase.from('mind_map_connections').delete().in('no_destino_id', ids);
    await supabase.from('mind_map_nodes').delete().in('id', ids);
    setNodes(nds => nds.filter(n => !ids.includes(n.id)));
    setEdges(eds => eds.filter(e => !ids.includes(e.source) && !ids.includes(e.target)));
  }, [setNodes, setEdges]);

  // ── Conectar ────────────────────────────────────────────────────────────────

  const onConnect = useCallback(async (params: Connection) => {
    if (!user || !params.source || !params.target || !canEdit) return;
    const exists = edgesRef.current.some(e =>
      (e.source === params.source && e.target === params.target) ||
      (e.source === params.target && e.target === params.source)
    );
    if (exists) { toast({ title: 'Conexão já existe.' }); return; }

    const row = {
      user_id: user.id,
      no_origem_id: params.source,
      no_destino_id: params.target,
      label: '',
      cor: '#94a3b8',
      espessura: 2,
      tipo_linha: 'bezier',
      estilo: 'solida',
      animado: false,
      workspace: currentWorkspace,
    };
    const { data, error } = await supabase.from('mind_map_connections').insert(row).select().single();

    if (error) { toast({ variant: 'destructive', title: 'Erro ao conectar' }); return; }
    const edgeId = data.id.toString();
    setEdges(eds => addEdge({
      ...params,
      id: edgeId,
      type: 'custom',
      markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8', width: 16, height: 16 },
      data: { label: '', cor: '#94a3b8', espessura: 2, tipo: 'bezier', estilo: 'solida', animado: false },
    }, eds));

    pushHistory({
      label: 'Conectar',
      undo: async () => {
        await supabase.from('mind_map_connections').delete().eq('id', edgeId);
        setEdges(eds => eds.filter(e => e.id !== edgeId));
      },
      redo: () => restoreRows([], [{ ...row, id: edgeId }]),
    });
  }, [user, setEdges, canEdit, currentWorkspace, pushHistory, restoreRows]);

  // ── Criar nó ────────────────────────────────────────────────────────────────

  /** Insere um lote de nós já montados e devolve os ids criados. */
  const insertNodes = useCallback(async (
    itens: { data: NodeData; position: { x: number; y: number } }[],
  ): Promise<string[]> => {
    if (!itens.length || !user) return [];
    const rows = itens.map(it => ({
      ...nodeDataToDb(it.data),
      posicao_x: Math.round(it.position.x),
      posicao_y: Math.round(it.position.y),
      workspace: currentWorkspace,
      user_id: user.id,
    }));
    const { data, error } = await supabase.from('mind_map_nodes').insert(rows as never).select();
    if (error || !data) {
      toast({ variant: 'destructive', title: 'Erro ao criar nó(s)' });
      return [];
    }
    const inseridos = data as { id: string }[];
    const criados = inseridos.map(d => String(d.id));
    setNodes(nds => [
      ...nds,
      ...criados.map((id, i) => {
        const { w, h } = nodeSize(itens[i].data);
        return {
          id,
          type: 'mindmap',
          position: itens[i].position,
          width: w,
          height: h,
          data: itens[i].data,
        } as Node<NodeData>;
      }),
    ]);

    const snapshots = criados.map((id, i) => ({ ...rows[i], id }));
    pushHistory({
      label: itens.length > 1 ? `Criar ${itens.length} nós` : 'Criar nó',
      undo: () => purgeNodes(criados),
      redo: () => restoreRows(snapshots, []),
    });
    return criados;
  }, [user, currentWorkspace, setNodes, pushHistory, purgeNodes, restoreRows]);

  const createNode = async () => {
    if (!newTitle.trim() || !user || !canEdit) return;
    const data: NodeData = {
      label: newTitle.trim(),
      tipo: newTipo,
      cor: NODE_COLORS[newTipo],
      corTexto: '#ffffff',
      corBorda: 'rgba(255,255,255,0.2)',
      espessuraBorda: 2,
      tamanho: 'medio',
      formato: 'redondo',
      fontSize: 13,
      fontWeight: '700',
      fontStyle: 'normal',
      emoji: newEmoji,
      fase: newFase,
      ...(newTipo === 'meta' ? { metaAlvo: 100, metaAtual: 0, metaUnidade: '' } : {}),
    };
    const criados = await insertNodes([{ data, position: clickPos }]);
    if (!criados.length) return;

    toast({ title: '✨ Nó criado!', description: newTitle.trim() });
    setShowCreateDialog(false);
    setNewTitle('');
    setNewEmoji('');
    setNewFase('nenhuma');
  };

  // ── Deletar ─────────────────────────────────────────────────────────────────

  /** Apaga nós registrando o histórico para dar Ctrl+Z. */
  const deleteNodesWithHistory = useCallback(async (ids: string[]) => {
    if (!canEdit || !ids.length) return;
    const nodeRows = nodesRef.current.filter(n => ids.includes(n.id)).map(nodeToRow);
    const edgeRows = edgesRef.current
      .filter(e => ids.includes(e.source) || ids.includes(e.target))
      .map(edgeToRow);

    await purgeNodes(ids);
    pushHistory({
      label: ids.length > 1 ? `Excluir ${ids.length} nós` : 'Excluir nó',
      undo: () => restoreRows(nodeRows, edgeRows),
      redo: () => purgeNodes(ids),
    });
    toast({
      title: ids.length > 1 ? `${ids.length} nós excluídos.` : 'Nó excluído.',
      description: 'Ctrl+Z desfaz.',
    });
  }, [canEdit, nodeToRow, edgeToRow, purgeNodes, pushHistory, restoreRows]);

  const deleteEdgeWithHistory = useCallback(async (edgeId: string) => {
    if (!canEdit) return;
    const edge = edgesRef.current.find(e => e.id === edgeId);
    if (!edge) return;
    const row = edgeToRow(edge);
    await supabase.from('mind_map_connections').delete().eq('id', edgeId);
    setEdges(eds => eds.filter(e => e.id !== edgeId));
    pushHistory({
      label: 'Excluir conexão',
      undo: () => restoreRows([], [row]),
      redo: async () => {
        await supabase.from('mind_map_connections').delete().eq('id', edgeId);
        setEdges(eds => eds.filter(e => e.id !== edgeId));
      },
    });
    toast({ title: 'Conexão excluída.', description: 'Ctrl+Z desfaz.' });
  }, [canEdit, edgeToRow, setEdges, pushHistory, restoreRows]);

  const deleteSelected = useCallback(async () => {
    if (!canEdit) return;
    const selecionados = nodesRef.current.filter(n => n.selected).map(n => n.id);
    const ids = selecionados.length ? selecionados : (selectedNodeId ? [selectedNodeId] : []);
    if (ids.length) {
      await deleteNodesWithHistory(ids);
      setSelectedNodeId(null);
      setShowDetail(false);
      setDetailNode(null);
    } else if (selectedEdgeId) {
      await deleteEdgeWithHistory(selectedEdgeId);
      setSelectedEdgeId(null);
      setPanelOpen(false);
    }
  }, [canEdit, selectedNodeId, selectedEdgeId, deleteNodesWithHistory, deleteEdgeWithHistory]);

  const deleteNode = useCallback(async (nodeId: string) => {
    await deleteNodesWithHistory([nodeId]);
  }, [deleteNodesWithHistory]);

  // ── Desfazer / Refazer ──────────────────────────────────────────────────────

  const doUndo = useCallback(async () => {
    if (busyHistory) return;
    const entry = undoStack[undoStack.length - 1];
    if (!entry) return;
    setBusyHistory(true);
    try {
      await entry.undo();
      setUndoStack(s => s.slice(0, -1));
      setRedoStack(s => [...s, entry]);
      toast({ title: `↩️ Desfeito: ${entry.label.toLowerCase()}` });
    } catch {
      toast({ variant: 'destructive', title: 'Não foi possível desfazer' });
    } finally {
      setBusyHistory(false);
    }
  }, [undoStack, busyHistory]);

  const doRedo = useCallback(async () => {
    if (busyHistory) return;
    const entry = redoStack[redoStack.length - 1];
    if (!entry) return;
    setBusyHistory(true);
    try {
      await entry.redo();
      setRedoStack(s => s.slice(0, -1));
      setUndoStack(s => [...s, entry]);
      toast({ title: `↪️ Refeito: ${entry.label.toLowerCase()}` });
    } catch {
      toast({ variant: 'destructive', title: 'Não foi possível refazer' });
    } finally {
      setBusyHistory(false);
    }
  }, [redoStack, busyHistory]);

  // ── Copiar / colar / duplicar ───────────────────────────────────────────────

  const selectedNodes = useCallback(
    () => nodesRef.current.filter(n => n.selected || n.id === selectedNodeId),
    [selectedNodeId],
  );

  const copySelection = useCallback(() => {
    const sel = selectedNodes();
    if (!sel.length) return;
    clipboardRef.current = sel.map(n => ({ ...n.data }));
    toast({ title: `${sel.length} nó(s) copiado(s)` });
  }, [selectedNodes]);

  const pasteClipboard = useCallback(async () => {
    if (!canEdit || !clipboardRef.current.length) return;
    const base = rfi
      ? rfi.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
      : { x: 240, y: 240 };
    await insertNodes(clipboardRef.current.map((d, i) => ({
      data: { ...d, label: d.label },
      position: { x: base.x + i * 28, y: base.y + i * 28 },
    })));
  }, [canEdit, rfi, insertNodes]);

  const duplicateSelection = useCallback(async () => {
    if (!canEdit) return;
    const sel = selectedNodes();
    if (!sel.length) return;
    await insertNodes(sel.map(n => ({
      data: { ...n.data },
      position: { x: n.position.x + 40, y: n.position.y + 40 },
    })));
    toast({ title: `${sel.length} nó(s) duplicado(s)` });
  }, [canEdit, selectedNodes, insertNodes]);

  // ── Organizar automaticamente ───────────────────────────────────────────────

  /** Distribui os nós em colunas por fase do funil. */
  const layoutPorFase = useCallback(async () => {
    if (!canEdit) return;
    const ordem: FaseFunil[] = ['topo', 'meio', 'fundo', 'pos_venda', 'nenhuma'];
    const antes = nodesRef.current.map(n => ({ id: n.id, x: n.position.x, y: n.position.y }));
    const alvos: { id: string; x: number; y: number }[] = [];

    ordem.forEach((fase, col) => {
      const doFase = nodesRef.current.filter(n => (n.data.fase || 'nenhuma') === fase);
      doFase.forEach((n, i) => {
        alvos.push({ id: n.id, x: 80 + col * 300, y: 80 + i * 130 });
      });
    });
    if (!alvos.length) return;

    await persistPositions(alvos);
    pushHistory({
      label: 'Organizar por fase',
      undo: () => persistPositions(antes),
      redo: () => persistPositions(alvos),
    });
    setTimeout(() => rfi?.fitView({ padding: 0.15, duration: 500 }), 60);
    toast({ title: '✨ Organizado por fase do funil' });
  }, [canEdit, persistPositions, pushHistory, rfi]);

  /** Layout hierárquico: profundidade a partir dos nós sem entrada. */
  const layoutArvore = useCallback(async () => {
    if (!canEdit) return;
    const ns = nodesRef.current;
    const es = edgesRef.current;
    if (!ns.length) return;

    const temEntrada = new Set(es.map(e => e.target));
    const filhos = new Map<string, string[]>();
    es.forEach(e => {
      filhos.set(e.source, [...(filhos.get(e.source) || []), e.target]);
    });

    const nivel = new Map<string, number>();
    const fila: string[] = ns.filter(n => !temEntrada.has(n.id)).map(n => n.id);
    // Grafo sem raiz (ciclo): usa o primeiro nó como âncora.
    if (!fila.length && ns[0]) fila.push(ns[0].id);
    fila.forEach(id => nivel.set(id, 0));

    for (let i = 0; i < fila.length; i++) {
      const id = fila[i];
      const d = nivel.get(id) ?? 0;
      (filhos.get(id) || []).forEach(f => {
        if (nivel.has(f)) return;
        nivel.set(f, d + 1);
        fila.push(f);
      });
    }
    // Nós isolados que o BFS não alcançou.
    ns.forEach(n => { if (!nivel.has(n.id)) nivel.set(n.id, 0); });

    const porNivel = new Map<number, string[]>();
    ns.forEach(n => {
      const d = nivel.get(n.id) ?? 0;
      porNivel.set(d, [...(porNivel.get(d) || []), n.id]);
    });

    const antes = ns.map(n => ({ id: n.id, x: n.position.x, y: n.position.y }));
    const alvos: { id: string; x: number; y: number }[] = [];
    [...porNivel.keys()].sort((a, b) => a - b).forEach(d => {
      (porNivel.get(d) || []).forEach((id, i) => {
        alvos.push({ id, x: 80 + d * 300, y: 80 + i * 130 });
      });
    });

    await persistPositions(alvos);
    pushHistory({
      label: 'Organizar em árvore',
      undo: () => persistPositions(antes),
      redo: () => persistPositions(alvos),
    });
    setTimeout(() => rfi?.fitView({ padding: 0.15, duration: 500 }), 60);
    toast({ title: '✨ Organizado em árvore' });
  }, [canEdit, persistPositions, pushHistory, rfi]);

  /** Alinha/distribui os nós selecionados. */
  const alinhar = useCallback(async (
    modo: 'esquerda' | 'direita' | 'topo' | 'base' | 'centro-h' | 'centro-v' | 'dist-h' | 'dist-v',
  ) => {
    if (!canEdit) return;
    const sel = nodesRef.current.filter(n => n.selected);
    if (sel.length < 2) {
      toast({ title: 'Selecione 2 ou mais nós', description: 'Shift + clique para selecionar vários.' });
      return;
    }
    const antes = sel.map(n => ({ id: n.id, x: n.position.x, y: n.position.y }));
    const larguras = new Map(sel.map(n => [n.id, n.width ?? nodeSize(n.data).w]));
    const alturas = new Map(sel.map(n => [n.id, n.height ?? nodeSize(n.data).h]));

    const xs = sel.map(n => n.position.x);
    const ys = sel.map(n => n.position.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const mediaCentroX = sel.reduce((s, n) => s + n.position.x + (larguras.get(n.id) ?? 0) / 2, 0) / sel.length;
    const mediaCentroY = sel.reduce((s, n) => s + n.position.y + (alturas.get(n.id) ?? 0) / 2, 0) / sel.length;

    let alvos: { id: string; x: number; y: number }[];
    if (modo === 'dist-h' || modo === 'dist-v') {
      const eixo = modo === 'dist-h' ? 'x' : 'y';
      const ordenados = [...sel].sort((a, b) => a.position[eixo] - b.position[eixo]);
      const ini = ordenados[0].position[eixo];
      const fim = ordenados[ordenados.length - 1].position[eixo];
      const passo = (fim - ini) / (ordenados.length - 1);
      alvos = ordenados.map((n, i) => ({
        id: n.id,
        x: eixo === 'x' ? ini + passo * i : n.position.x,
        y: eixo === 'y' ? ini + passo * i : n.position.y,
      }));
    } else {
      alvos = sel.map(n => {
        const w = larguras.get(n.id) ?? 0;
        const h = alturas.get(n.id) ?? 0;
        switch (modo) {
          case 'esquerda': return { id: n.id, x: minX, y: n.position.y };
          case 'direita': return { id: n.id, x: maxX, y: n.position.y };
          case 'topo': return { id: n.id, x: n.position.x, y: minY };
          case 'base': return { id: n.id, x: n.position.x, y: maxY };
          case 'centro-h': return { id: n.id, x: mediaCentroX - w / 2, y: n.position.y };
          case 'centro-v': return { id: n.id, x: n.position.x, y: mediaCentroY - h / 2 };
        }
      });
    }

    await persistPositions(alvos);
    pushHistory({
      label: 'Alinhar nós',
      undo: () => persistPositions(antes),
      redo: () => persistPositions(alvos),
    });
  }, [canEdit, persistPositions, pushHistory]);

  // ── Montar funil ────────────────────────────────────────────────────────────

  const montarFunil = useCallback(async () => {
    if (!canEdit || !user) return;
    const base = rfi
      ? rfi.screenToFlowPosition({ x: 180, y: 220 })
      : { x: 100, y: 200 };

    const itens = ETAPAS_FUNIL.map((et, i) => ({
      data: {
        label: et.titulo,
        emoji: et.emoji,
        tipo: 'etapa_funil' as NodeTipo,
        cor: FASE_COLORS[et.fase],
        corTexto: '#ffffff',
        corBorda: 'rgba(255,255,255,0.2)',
        espessuraBorda: 2,
        tamanho: 'grande' as NodeTamanho,
        formato: 'retangulo' as NodeFormato,
        fontSize: 13,
        fontWeight: '700',
        fontStyle: 'normal',
        fase: et.fase,
      } as NodeData,
      position: { x: base.x + i * 280, y: base.y },
    }));

    const ids = await insertNodes(itens);
    if (ids.length < 2) return;

    // Liga as etapas em sequência.
    const conexoes = ids.slice(0, -1).map((id, i) => ({
      user_id: user.id,
      no_origem_id: id,
      no_destino_id: ids[i + 1],
      label: '',
      cor: '#94a3b8',
      espessura: 3,
      tipo_linha: 'suave',
      estilo: 'solida',
      animado: true,
      workspace: currentWorkspace,
    }));
    await supabase.from('mind_map_connections').insert(conexoes as never);
    await fetchData(currentWorkspace);
    setTimeout(() => rfi?.fitView({ padding: 0.2, duration: 500 }), 80);
    toast({ title: '🎉 Funil montado!', description: 'Topo → Meio → Fundo → Pós-venda' });
  }, [canEdit, user, rfi, insertNodes, currentWorkspace, fetchData]);

  // Monta o funil da página nova assim que ela passa a ser a página atual.
  useEffect(() => {
    if (!pendingScaffoldRef.current || !pagesLoaded) return;
    if (pendingScaffoldRef.current !== currentWorkspace) return;
    pendingScaffoldRef.current = null;
    montarFunil();
  }, [currentWorkspace, pagesLoaded, montarFunil]);

  const onPaneDoubleClick = useCallback((e: React.MouseEvent) => {
    if (!rfi || !canEdit) return;
    const pos = rfi.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    setClickPos(pos);
    setNewTitle('');
    setNewEmoji('');
    setNewFase('nenhuma');
    setShowCreateDialog(true);
  }, [rfi, canEdit]);

  const openDialogCenter = () => {
    if (!rfi || !canEdit) return;
    const pos = rfi.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    setClickPos(pos);
    setNewTitle('');
    setNewEmoji('');
    setNewFase('nenhuma');
    setShowCreateDialog(true);
  };

  const focusNode = (nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node || !rfi) return;
    rfi.setCenter(node.position.x + 80, node.position.y + 40, { zoom: 1.2, duration: 600 });
    setSelectedNodeId(nodeId);
    setDetailNode(node);
    setShowDetail(true);
  };

  // ── Exportar ────────────────────────────────────────────────────────────────

  const baixar = (href: string, nome: string) => {
    const a = document.createElement('a');
    a.href = href;
    a.download = nome;
    a.click();
  };

  const nomeArquivo = () =>
    `${(currentPage?.nome || 'mapa-mental').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${new Date().toISOString().slice(0, 10)}`;

  /**
   * O export antigo serializava só o <svg> das arestas — os nós são divs HTML e
   * ficavam de fora, gerando um arquivo praticamente vazio. Agora o SVG é
   * desenhado do zero a partir dos dados, com caixas, textos e setas.
   */
  const exportarSvg = () => {
    if (!nodes.length) { toast({ title: 'Nada para exportar' }); return; }
    const svg = buildSvg(nodes, edges, currentPage?.nome || 'Mapa Mental');
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    baixar(url, `${nomeArquivo()}.svg`);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast({ title: 'SVG exportado!', description: 'Com nós, textos e conexões.' });
  };

  const exportarPng = async () => {
    if (!nodes.length) { toast({ title: 'Nada para exportar' }); return; }
    const svg = buildSvg(nodes, edges, currentPage?.nome || 'Mapa Mental');
    const { width, height } = svgSize(svg);
    const escala = 2;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width * escala;
      canvas.height = height * escala;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(escala, 0, 0, escala, 0, 0);
      ctx.drawImage(img, 0, 0);
      baixar(canvas.toDataURL('image/png'), `${nomeArquivo()}.png`);
      toast({ title: 'PNG exportado!', description: `${width * escala}×${height * escala}px` });
    };
    img.onerror = () => toast({ variant: 'destructive', title: 'Falha ao gerar PNG' });
    img.src = url;
  };

  const exportarJson = () => {
    const payload = {
      pagina: currentPage?.nome,
      tipo: currentPage?.tipo,
      exportadoEm: new Date().toISOString(),
      nos: nodes.map(n => ({ id: n.id, position: n.position, ...n.data })),
      conexoes: edges.map(e => ({ id: e.id, de: e.source, para: e.target, ...(e.data as EdgeData) })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    baixar(url, `${nomeArquivo()}.json`);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast({ title: 'JSON exportado!' });
  };

  // ── Duplicar página ─────────────────────────────────────────────────────────

  const duplicarPagina = useCallback(async (page: MindMapPage) => {
    if (!canEdit || duplicatingPage) return;
    setDuplicatingPage(true);
    try {
      const { data: nova, error } = await supabase.from('mind_map_pages').insert({
        nome: `${page.nome} (cópia)`,
        emoji: page.emoji,
        cor: page.cor,
        tipo: page.tipo,
        ordem: pages.length,
        criado_por: user?.id,
      }).select().single();
      if (error || !nova) throw error;

      const [ns, es] = await Promise.all([
        supabase.from('mind_map_nodes').select('*').eq('workspace', page.workspace),
        supabase.from('mind_map_connections').select('*').eq('workspace', page.workspace),
      ]);

      // Ids antigos → novos, para religar as conexões na página clonada.
      const mapaIds = new Map<string, string>();
      const nosOrigem = (ns.data ?? []) as NodeRow[];
      if (nosOrigem.length) {
        const rows = nosOrigem.map(n => {
          const { id: _id, created_at: _criado, ...resto } = n;
          return { ...resto, workspace: nova.workspace };
        });
        const { data: criados } = await supabase.from('mind_map_nodes').insert(rows as never).select();
        (criados as { id: string }[] | null)?.forEach((c, i) => {
          mapaIds.set(String(nosOrigem[i].id), String(c.id));
        });
      }

      const conexoesOrigem = (es.data ?? []) as NodeRow[];
      if (conexoesOrigem.length) {
        const rows = conexoesOrigem.flatMap(e => {
          const { id: _id, created_at: _criado, ...resto } = e;
          const origem = mapaIds.get(String(e.no_origem_id));
          const destino = mapaIds.get(String(e.no_destino_id));
          if (!origem || !destino) return [];
          return [{ ...resto, no_origem_id: origem, no_destino_id: destino, workspace: nova.workspace }];
        });
        if (rows.length) await supabase.from('mind_map_connections').insert(rows as never);
      }

      await fetchPages();
      switchPage(nova.workspace);
      toast({ title: '📑 Página duplicada!', description: nova.nome });
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao duplicar página' });
    } finally {
      setDuplicatingPage(false);
    }
  }, [canEdit, duplicatingPage, pages.length, user, fetchPages, switchPage]);

  // ── Filtro do canvas ────────────────────────────────────────────────────────

  const todasAsTags = useMemo(() => {
    const set = new Set<string>();
    nodes.forEach(n => (n.data.tags || []).forEach(t => set.add(t)));
    return [...set].sort();
  }, [nodes]);

  const nodeCombina = useCallback((d: NodeData) => (
    (filtroFase === 'todas' || (d.fase || 'nenhuma') === filtroFase)
    && (filtroResponsavel === 'todos' || d.responsavelId === filtroResponsavel)
    && (filtroTag === 'todas' || (d.tags || []).includes(filtroTag))
  ), [filtroFase, filtroResponsavel, filtroTag]);

  /** Nós enviados ao canvas: fora do filtro ficam apagados, não escondidos. */
  const displayNodes = useMemo(() => {
    if (!filtroAtivo) return nodes;
    return nodes.map(n => (
      nodeCombina(n.data) ? n : { ...n, data: { ...n.data, dimmed: true }, selectable: false }
    ));
  }, [nodes, filtroAtivo, nodeCombina]);

  const displayEdges = useMemo(() => {
    if (!filtroAtivo) return edges;
    const visiveis = new Set(nodes.filter(n => nodeCombina(n.data)).map(n => n.id));
    return edges.map(e => (
      visiveis.has(e.source) && visiveis.has(e.target)
        ? e
        : { ...e, style: { ...(e.style || {}), opacity: 0.08 } }
    ));
  }, [edges, nodes, filtroAtivo, nodeCombina]);

  const limparFiltros = () => {
    setFiltroFase('todas');
    setFiltroResponsavel('todos');
    setFiltroTag('todas');
  };

  // Estatísticas rápidas
  const stats = useMemo(() => {
    const metas = nodes.filter(n => n.data.tipo === 'meta');
    const progressoMedio = metas.length
      ? metas.reduce((s, n) => s + metaProgresso(n.data), 0) / metas.length
      : 0;
    return {
      total: nodes.length,
      porFase: {
        topo: nodes.filter(n => n.data.fase === 'topo').length,
        meio: nodes.filter(n => n.data.fase === 'meio').length,
        fundo: nodes.filter(n => n.data.fase === 'fundo').length,
        pos_venda: nodes.filter(n => n.data.fase === 'pos_venda').length,
      },
      conexoes: edges.length,
      metas: metas.length,
      metasBatidas: metas.filter(n => metaProgresso(n.data) >= 100).length,
      progressoMedio,
      visiveis: filtroAtivo ? nodes.filter(n => nodeCombina(n.data)).length : nodes.length,
    };
  }, [nodes, edges, filtroAtivo, nodeCombina]);

  // ── Atalhos de teclado ──────────────────────────────────────────────────────
  // Fica depois das ações porque o array de dependências as referencia.

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Não sequestra atalhos enquanto o usuário digita.
      const alvo = e.target as HTMLElement | null;
      const digitando = !!alvo && (
        alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.isContentEditable
      );
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); setShowSearch(true); return; }
      if (e.key === 'Escape') {
        setShowSearch(false); setShowDetail(false); setShowShortcuts(false);
        return;
      }
      if (digitando) return;

      if (e.key === '?') { e.preventDefault(); setShowShortcuts(v => !v); return; }

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) doRedo(); else doUndo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); doRedo(); return; }

      if (!canEdit) return;

      if (mod && e.key.toLowerCase() === 'c') { e.preventDefault(); copySelection(); return; }
      if (mod && e.key.toLowerCase() === 'v') { e.preventDefault(); pasteClipboard(); return; }
      if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSelection(); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const temSelecao = nodesRef.current.some(n => n.selected) || selectedNodeId || selectedEdgeId;
        if (temSelecao) { e.preventDefault(); deleteSelected(); }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    selectedNodeId, selectedEdgeId, canEdit, deleteSelected,
    doUndo, doRedo, copySelection, pasteClipboard, duplicateSelection,
  ]);

  return (
    <div className="h-full flex flex-col" style={{ background: '#f1f5f9' }}>

      {/* ── Páginas (quadros) ── */}
      <div className="border-b border-gray-200 bg-white shrink-0 px-3 pt-2.5 pb-0 flex items-end gap-1 overflow-x-auto">
        {pages.map(page => {
          const active = page.workspace === currentWorkspace;
          const tipoInfo = PAGINA_TIPO_OPTIONS.find(t => t.value === page.tipo);
          return (
            <div
              key={page.id}
              className={`group flex items-center gap-1.5 pl-3 pr-1.5 py-2 rounded-t-lg text-sm font-medium cursor-pointer whitespace-nowrap transition-colors border ${
                active
                  ? 'bg-[#f1f5f9] border-gray-200 border-b-transparent text-gray-800'
                  : 'bg-gray-50 border-transparent text-gray-500 hover:bg-gray-100'
              }`}
              style={active ? { boxShadow: `inset 0 2px 0 ${page.cor}` } : undefined}
              onClick={() => switchPage(page.workspace)}
              title={tipoInfo?.label}
            >
              <span>{page.emoji}</span>
              <span className="max-w-[140px] truncate">{page.nome}</span>
              {canEdit && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      onClick={e => e.stopPropagation()}
                      className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-gray-200 transition-opacity"
                    >
                      <MoreVertical className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={() => openEditPageDialog(page)}>
                      <Pencil className="h-3.5 w-3.5 mr-2" /> Renomear / editar
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => duplicarPagina(page)} disabled={duplicatingPage}>
                      <Copy className="h-3.5 w-3.5 mr-2" /> Duplicar página
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-red-600 focus:text-red-600"
                      onClick={() => setDeletingPage(page)}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-2" /> Excluir página
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          );
        })}
        {canEdit && (
          <button
            onClick={openNewPageDialog}
            className="flex items-center gap-1 px-2.5 py-2 mb-0.5 rounded-lg text-gray-400 hover:text-[#AC1131] hover:bg-red-50 transition-colors text-sm font-medium shrink-0"
            title="Nova página"
          >
            <FolderPlus className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* ── Toolbar Premium ── */}
      <div className="border-b border-gray-200 px-4 py-2.5 flex items-center gap-2 bg-white shrink-0 shadow-sm">
        <div className="flex items-center gap-2">
          {canEdit ? (
            <Button size="sm" onClick={openDialogCenter}
              className="gap-1.5 bg-[#AC1131] hover:bg-[#8f0e29] text-white rounded-lg shadow-sm">
              <Plus className="h-4 w-4" /> Novo Nó
            </Button>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-100 px-3 py-1.5 rounded-lg">
              <Eye className="h-3.5 w-3.5" /> Modo visualização
            </div>
          )}

          <Button size="sm" variant="outline" onClick={() => setShowSearch(true)} className="gap-1.5 rounded-lg text-gray-600">
            <Search className="h-4 w-4" />
            <span className="hidden sm:inline text-xs">Buscar</span>
            <kbd className="hidden sm:inline text-xs bg-gray-100 px-1 rounded">⌘K</kbd>
          </Button>

          {canEdit && (
            <>
              {/* Desfazer / Refazer */}
              <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden">
                <button
                  onClick={doUndo}
                  disabled={!undoStack.length || busyHistory}
                  title={undoStack.length ? `Desfazer: ${undoStack[undoStack.length - 1].label} (Ctrl+Z)` : 'Nada para desfazer'}
                  className="px-2 py-1.5 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                >
                  <Undo2 className="h-4 w-4" />
                </button>
                <div className="w-px h-5 bg-gray-200" />
                <button
                  onClick={doRedo}
                  disabled={!redoStack.length || busyHistory}
                  title={redoStack.length ? `Refazer: ${redoStack[redoStack.length - 1].label} (Ctrl+Shift+Z)` : 'Nada para refazer'}
                  className="px-2 py-1.5 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                >
                  <Redo2 className="h-4 w-4" />
                </button>
              </div>

              {/* Organizar / montar */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" className="gap-1.5 rounded-lg text-gray-600">
                    <Wand2 className="h-4 w-4" />
                    <span className="hidden lg:inline text-xs">Montar</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuItem onClick={montarFunil}>
                    <ArrowRight className="h-3.5 w-3.5 mr-2" /> Montar funil completo
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={layoutPorFase}>
                    <Layers className="h-3.5 w-3.5 mr-2" /> Organizar por fase
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={layoutArvore}>
                    <Network className="h-3.5 w-3.5 mr-2" /> Organizar em árvore
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => alinhar('esquerda')}>
                    <AlignLeft className="h-3.5 w-3.5 mr-2" /> Alinhar à esquerda
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => alinhar('centro-h')}>
                    <AlignCenter className="h-3.5 w-3.5 mr-2" /> Centralizar na horizontal
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => alinhar('topo')}>
                    <AlignStartVertical className="h-3.5 w-3.5 mr-2" /> Alinhar ao topo
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => alinhar('dist-h')}>
                    <Columns className="h-3.5 w-3.5 mr-2" /> Distribuir na horizontal
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => alinhar('dist-v')}>
                    <Rows className="h-3.5 w-3.5 mr-2" /> Distribuir na vertical
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setSnapToGrid(v => !v)}>
                    <Grid3x3 className="h-3.5 w-3.5 mr-2" />
                    Grade magnética {snapToGrid ? '✓' : ''}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}

          {/* Filtros */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant={filtroAtivo ? 'default' : 'outline'}
                className={`gap-1.5 rounded-lg ${filtroAtivo ? 'bg-[#AC1131] hover:bg-[#8f0e29] text-white' : 'text-gray-600'}`}
              >
                <Filter className="h-4 w-4" />
                <span className="hidden lg:inline text-xs">
                  {filtroAtivo ? `${stats.visiveis}/${stats.total}` : 'Filtrar'}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64 p-3 space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1">Fase do funil</label>
                <select
                  value={filtroFase}
                  onChange={e => setFiltroFase(e.target.value as FaseFunil | 'todas')}
                  className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs bg-white"
                >
                  <option value="todas">Todas as fases</option>
                  {(Object.entries(FASE_LABELS) as [FaseFunil, string][]).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1">Responsável</label>
                <select
                  value={filtroResponsavel}
                  onChange={e => setFiltroResponsavel(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs bg-white"
                >
                  <option value="todos">Todos</option>
                  {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
                </select>
              </div>
              {todasAsTags.length > 0 && (
                <div>
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1">Tag</label>
                  <select
                    value={filtroTag}
                    onChange={e => setFiltroTag(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs bg-white"
                  >
                    <option value="todas">Todas</option>
                    {todasAsTags.map(t => <option key={t} value={t}>#{t}</option>)}
                  </select>
                </div>
              )}
              {filtroAtivo && (
                <Button size="sm" variant="outline" onClick={limparFiltros} className="w-full rounded-lg text-xs">
                  <X className="h-3.5 w-3.5 mr-1.5" /> Limpar filtros
                </Button>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Stats */}
        <div className="hidden md:flex items-center gap-4 ml-4 pl-4 border-l border-gray-200">
          {[
            { cor: '#3B82F6', label: 'Topo', val: stats.porFase.topo },
            { cor: '#8B5CF6', label: 'Meio', val: stats.porFase.meio },
            { cor: '#AC1131', label: 'Fundo', val: stats.porFase.fundo },
            { cor: '#10B981', label: 'Pós-venda', val: stats.porFase.pos_venda },
          ].map(s => (
            <div key={s.label} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: s.cor }} />
              <span className="text-xs text-gray-500">{s.label}</span>
              <span className="text-xs font-bold text-gray-700">{s.val}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5 ml-2 pl-2 border-l border-gray-200">
            <Link2 className="h-3 w-3 text-gray-400" />
            <span className="text-xs text-gray-500">{stats.conexoes} conexões</span>
          </div>

          {/* Rollup das metas da página */}
          {stats.metas > 0 && (
            <div className="flex items-center gap-2 ml-2 pl-2 border-l border-gray-200">
              <Target className="h-3.5 w-3.5 text-sky-500" />
              <span className="text-xs text-gray-500">
                {stats.metasBatidas}/{stats.metas} metas
              </span>
              <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${stats.progressoMedio}%`,
                    background: stats.progressoMedio >= 100
                      ? 'linear-gradient(90deg,#34D399,#059669)'
                      : 'linear-gradient(90deg,#38BDF8,#0284C7)',
                  }}
                />
              </div>
              <span className="text-xs font-bold text-gray-700">{stats.progressoMedio.toFixed(0)}%</span>
            </div>
          )}
        </div>

        <div className="ml-auto flex gap-2 items-center">
          <span className="text-xs text-gray-400 hidden lg:block">
            {canEdit ? 'Duplo clique no canvas para criar · Arraste bordas para conectar' : 'Clique em qualquer nó para ver detalhes'}
          </span>
          <Button size="sm" variant="outline" onClick={() => rfi?.fitView({ padding: 0.15, duration: 500 })} className="gap-1.5 rounded-lg" title="Enquadrar tudo">
            <Maximize2 className="h-4 w-4" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="rounded-lg" title="Exportar">
                <Download className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={exportarPng}>
                <ImageIcon className="h-3.5 w-3.5 mr-2" /> Imagem PNG (2x)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportarSvg}>
                <FileText className="h-3.5 w-3.5 mr-2" /> Vetor SVG
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportarJson}>
                <FileJson className="h-3.5 w-3.5 mr-2" /> Dados JSON
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowShortcuts(true)}
            className="rounded-lg"
            title="Atalhos de teclado (?)"
          >
            <Keyboard className="h-4 w-4" />
          </Button>
          {selectedEdgeId && canEdit && (
            <Button size="sm" variant="ghost" onClick={() => setPanelOpen(v => !v)} className="rounded-lg">
              {panelOpen ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </Button>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* Canvas */}
        <div className="flex-1 relative">
          <ReactFlow
            nodes={displayNodes}
            edges={displayEdges}
            onNodesChange={canEdit ? handleNodesChange : undefined}
            onEdgesChange={canEdit ? onEdgesChange : undefined}
            onConnect={canEdit ? onConnect : undefined}
            onNodeDragStart={canEdit ? onNodeDragStart : undefined}
            onNodeDragStop={canEdit ? onNodeDragStop : undefined}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            onPaneClick={() => { setSelectedNodeId(null); setSelectedEdgeId(null); setPanelOpen(false); }}
            onDoubleClick={onPaneDoubleClick}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onInit={setRfi}
            minZoom={0.08}
            maxZoom={4}
            /* O Delete é tratado no nosso handler, que também apaga no banco. */
            deleteKeyCode={null}
            snapToGrid={snapToGrid}
            snapGrid={[20, 20]}
            nodesDraggable={canEdit}
            nodesConnectable={canEdit}
            elementsSelectable={true}
            selectionOnDrag
            multiSelectionKeyCode="Shift"
            fitView
            fitViewOptions={{ padding: 0.15 }}
            style={{ background: 'transparent' }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={28}
              size={1.2}
              color="#cbd5e1"
            />
            <Controls
              style={{
                background: 'white',
                border: '1px solid #e2e8f0',
                borderRadius: 12,
                boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
              }}
            />
            <MiniMap
              nodeColor={(n) => (n.data as NodeData).cor ?? '#8B5CF6'}
              style={{
                borderRadius: 12,
                border: '1px solid #e2e8f0',
                boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
              }}
            />

            {/* Empty state */}
            {nodes.length === 0 && (
              <Panel position="top-center">
                <div className="bg-white border border-gray-200 rounded-2xl px-8 py-6 shadow-xl text-center mt-8">
                  <Sparkles className="h-8 w-8 text-[#AC1131] mx-auto mb-3 opacity-80" />
                  <p className="font-bold text-gray-800 text-lg">Mapa vazio</p>
                  <p className="text-sm text-gray-500 mt-1">
                    {canEdit
                      ? 'Clique em "+ Novo Nó" ou dê duplo clique no canvas'
                      : 'Nenhum nó criado ainda'}
                  </p>
                </div>
              </Panel>
            )}

            {/* Legenda de fases */}
            <Panel position="bottom-left">
              <div className="bg-white/90 backdrop-blur-sm border border-gray-200 rounded-xl p-3 shadow-lg">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Fases do Funil</p>
                {Object.entries(FASE_COLORS).filter(([k]) => k !== 'nenhuma').map(([fase, cor]) => (
                  <div key={fase} className="flex items-center gap-2 mb-1">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: cor }} />
                    <span className="text-xs text-gray-600">
                      {fase === 'topo' ? 'Topo (Atração)' :
                        fase === 'meio' ? 'Meio (Consideração)' :
                        fase === 'fundo' ? 'Fundo (Conversão)' : 'Pós-Venda'}
                    </span>
                  </div>
                ))}
              </div>
            </Panel>
          </ReactFlow>
        </div>

        {/* ── Painel lateral (edição de aresta) ── */}
        {panelOpen && selectedEdgeId && canEdit && (
          <div className="w-64 border-l border-gray-200 bg-white overflow-y-auto flex flex-col shadow-lg">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <h2 className="font-bold text-sm text-gray-700 flex items-center gap-2">
                <Link2 className="h-4 w-4 text-gray-400" /> Editar Conexão
              </h2>
              <button onClick={() => { setPanelOpen(false); setSelectedEdgeId(null); }} className="text-gray-400 hover:text-gray-700 p-1 rounded">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 space-y-4 text-sm flex-1">
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">Rótulo</label>
                <Input value={editEdgeLabel}
                  onChange={e => { setEditEdgeLabel(e.target.value); updateEdge(selectedEdgeId, { label: e.target.value }); }}
                  className="h-8 text-sm rounded-xl" placeholder="Ex: leva para" />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">Cor</label>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_COLORS.slice(0, 12).map(c => (
                    <button key={c}
                      onClick={() => { setEditEdgeCor(c); updateEdge(selectedEdgeId, { cor: c }); }}
                      className={`w-5 h-5 rounded transition-all ${editEdgeCor === c ? 'ring-2 ring-offset-1 ring-blue-500 scale-110' : ''}`}
                      style={{ background: c }} />
                  ))}
                  <input type="color" value={editEdgeCor}
                    onChange={e => { setEditEdgeCor(e.target.value); updateEdge(selectedEdgeId, { cor: e.target.value }); }}
                    className="w-5 h-5 rounded cursor-pointer border border-gray-200 p-0" />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">Espessura</label>
                <div className="flex items-center gap-2">
                  <input type="range" min={1} max={8} value={editEdgeEspessura}
                    onChange={e => { const v = Number(e.target.value); setEditEdgeEspessura(v); updateEdge(selectedEdgeId, { espessura: v }); }}
                    className="flex-1" />
                  <span className="text-xs text-gray-600 w-4">{editEdgeEspessura}</span>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">Tipo</label>
                <div className="grid grid-cols-2 gap-1">
                  {(['bezier', 'reta', 'step', 'suave'] as EdgeTipo[]).map(t => (
                    <button key={t}
                      onClick={() => { setEditEdgeTipo(t); updateEdge(selectedEdgeId, { tipo: t }); }}
                      className={`py-1.5 text-xs rounded-lg border capitalize transition-colors ${editEdgeTipo === t ? 'bg-[#AC1131] text-white border-[#AC1131]' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                    >{t}</button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">Estilo</label>
                <div className="grid grid-cols-3 gap-1">
                  {(['solida', 'tracejada', 'pontilhada'] as EdgeEstilo[]).map(t => (
                    <button key={t}
                      onClick={() => { setEditEdgeEstilo(t); updateEdge(selectedEdgeId, { estilo: t }); }}
                      className={`py-1.5 text-xs rounded-lg border capitalize transition-colors ${editEdgeEstilo === t ? 'bg-[#AC1131] text-white border-[#AC1131]' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                    >{t}</button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl">
                <input type="checkbox" id="animado" checked={editEdgeAnimado}
                  onChange={e => { setEditEdgeAnimado(e.target.checked); updateEdge(selectedEdgeId, { animado: e.target.checked }); }}
                  className="rounded accent-[#AC1131]" />
                <label htmlFor="animado" className="text-xs text-gray-600 cursor-pointer">Animado (fluxo)</label>
              </div>
            </div>

            <div className="p-4 border-t border-gray-100">
              <Button variant="destructive" size="sm" className="w-full rounded-xl" onClick={deleteSelected}>
                <Trash2 className="h-4 w-4 mr-1.5" /> Deletar Conexão
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Spotlight Search ── */}
      <SpotlightSearch
        open={showSearch}
        onClose={() => setShowSearch(false)}
        nodes={nodes}
        onSelect={focusNode}
      />

      {/* ── Node Detail Modal ── */}
      <NodeDetailModal
        node={detailNode}
        open={showDetail}
        onClose={() => { setShowDetail(false); setDetailNode(null); }}
        onUpdate={updateNode}
        onDelete={deleteNode}
        canEdit={canEdit}
        usuarios={usuarios}
      />

      {/* ── Dialog Criar Nó ── */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-sm rounded-2xl p-0 overflow-hidden">
          <div className="h-1.5 w-full" style={{ background: NODE_COLORS[newTipo] }} />
          <div className="p-6">
            <DialogHeader className="mb-4">
              <DialogTitle className="text-lg font-bold flex items-center gap-2">
                <Plus className="h-5 w-5 text-[#AC1131]" /> Novo Nó
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="flex gap-2">
                <div className="w-16">
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Emoji</label>
                  <Input value={newEmoji} onChange={e => setNewEmoji(e.target.value)}
                    placeholder="🔵" className="rounded-xl text-center text-lg" />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Título *</label>
                  <Input value={newTitle} onChange={e => setNewTitle(e.target.value)}
                    placeholder="Nome do nó" className="rounded-xl"
                    onKeyDown={e => e.key === 'Enter' && createNode()}
                    autoFocus />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Tipo</label>
                <select value={newTipo} onChange={e => setNewTipo(e.target.value as NodeTipo)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-gray-50">
                  {(Object.entries(TIPO_LABELS) as [NodeTipo, string][]).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Fase do Funil</label>
                <select value={newFase} onChange={e => setNewFase(e.target.value as FaseFunil)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-gray-50">
                  {(Object.entries(FASE_LABELS) as [FaseFunil, string][]).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>

              {/* Preview da cor */}
              <div className="flex items-center gap-2 p-3 rounded-xl" style={{ background: `${NODE_COLORS[newTipo]}15` }}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-lg flex-shrink-0"
                  style={{ background: NODE_COLORS[newTipo] }}>
                  {newEmoji || <span className="text-white text-xs font-bold">{newTitle.charAt(0) || '?'}</span>}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">{newTitle || 'Título do nó'}</p>
                  <p className="text-xs text-gray-400">{TIPO_LABELS[newTipo]}</p>
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <Button variant="outline" onClick={() => setShowCreateDialog(false)} className="rounded-xl">Cancelar</Button>
              <Button onClick={createNode} disabled={!newTitle.trim()}
                className="flex-1 bg-[#AC1131] hover:bg-[#8f0e29] text-white rounded-xl">
                <Plus className="h-4 w-4 mr-1.5" /> Criar Nó
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Dialog Nova/Editar Página ── */}
      <Dialog open={showPageDialog} onOpenChange={setShowPageDialog}>
        <DialogContent className="max-w-sm rounded-2xl p-0 overflow-hidden">
          <div className="h-1.5 w-full" style={{ background: pageForm.cor }} />
          <div className="p-6">
            <DialogHeader className="mb-4">
              <DialogTitle className="text-lg font-bold flex items-center gap-2">
                <FolderPlus className="h-5 w-5 text-[#AC1131]" />
                {editingPage ? 'Editar Página' : 'Nova Página'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="flex gap-2">
                <div className="w-16">
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Ícone</label>
                  <Input value={pageForm.emoji} onChange={e => setPageForm(f => ({ ...f, emoji: e.target.value }))}
                    placeholder="🧠" className="rounded-xl text-center text-lg" />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Nome *</label>
                  <Input value={pageForm.nome} onChange={e => setPageForm(f => ({ ...f, nome: e.target.value }))}
                    placeholder="Ex: Funil de Vendas, Metas 2026..." className="rounded-xl"
                    onKeyDown={e => e.key === 'Enter' && savePage()}
                    autoFocus />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Tipo de página</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {PAGINA_TIPO_OPTIONS.map(t => (
                    <button
                      key={t.value}
                      onClick={() => setPageForm(f => ({ ...f, tipo: t.value, emoji: f.emoji === '🧠' || f.emoji === '' ? t.emoji : f.emoji }))}
                      className={`flex items-center gap-1.5 py-1.5 px-2 text-xs rounded-lg border transition-colors ${
                        pageForm.tipo === t.value ? 'bg-[#AC1131] text-white border-[#AC1131]' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <span>{t.emoji}</span> {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Cor da aba</label>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setPageForm(f => ({ ...f, cor: c }))}
                      className={`w-6 h-6 rounded-md transition-all ${pageForm.cor === c ? 'ring-2 ring-offset-1 ring-blue-500 scale-110' : ''}`}
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </div>

              {/* Estrutura inicial (só ao criar página de funil) */}
              {!editingPage && pageForm.tipo === 'funil' && (
                <label className="flex items-start gap-2 p-3 rounded-xl bg-blue-50/70 border border-blue-100 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={scaffoldFunil}
                    onChange={e => setScaffoldFunil(e.target.checked)}
                    className="mt-0.5 rounded accent-[#AC1131]"
                  />
                  <span className="text-xs text-gray-600 leading-relaxed">
                    Já criar as 4 etapas conectadas
                    <span className="block text-gray-400">Topo → Meio → Fundo → Pós-venda</span>
                  </span>
                </label>
              )}

              {/* Preview */}
              <div className="flex items-center gap-2 p-3 rounded-xl bg-gray-50">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-lg flex-shrink-0" style={{ background: `${pageForm.cor}20` }}>
                  {pageForm.emoji || '🧠'}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">{pageForm.nome || 'Nome da página'}</p>
                  <p className="text-xs text-gray-400">{PAGINA_TIPO_OPTIONS.find(t => t.value === pageForm.tipo)?.label}</p>
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <Button variant="outline" onClick={() => setShowPageDialog(false)} className="rounded-xl">Cancelar</Button>
              <Button onClick={savePage} disabled={!pageForm.nome.trim()}
                className="flex-1 bg-[#AC1131] hover:bg-[#8f0e29] text-white rounded-xl">
                {editingPage ? <><CheckCircle2 className="h-4 w-4 mr-1.5" /> Salvar</> : <><Plus className="h-4 w-4 mr-1.5" /> Criar Página</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Atalhos de teclado ── */}
      <Dialog open={showShortcuts} onOpenChange={setShowShortcuts}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Keyboard className="h-5 w-5 text-[#AC1131]" /> Atalhos de teclado
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1 py-2">
            {[
              ['Ctrl + K', 'Buscar nós'],
              ['Ctrl + Z', 'Desfazer'],
              ['Ctrl + Shift + Z', 'Refazer'],
              ['Ctrl + C', 'Copiar seleção'],
              ['Ctrl + V', 'Colar'],
              ['Ctrl + D', 'Duplicar seleção'],
              ['Delete', 'Excluir seleção'],
              ['Shift + clique', 'Selecionar vários nós'],
              ['Duplo clique no canvas', 'Criar nó ali'],
              ['?', 'Abrir/fechar esta janela'],
              ['Esc', 'Fechar janelas'],
            ].map(([tecla, acao]) => (
              <div key={tecla} className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
                <span className="text-sm text-gray-600">{acao}</span>
                <kbd className="text-xs bg-gray-100 border border-gray-200 text-gray-600 px-2 py-1 rounded font-mono">
                  {tecla}
                </kbd>
              </div>
            ))}
          </div>
          {!canEdit && (
            <p className="text-xs text-gray-400 italic">
              Você está em modo visualização — os atalhos de edição estão desativados.
            </p>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Confirmar exclusão de página ── */}
      <AlertDialog open={!!deletingPage} onOpenChange={o => { if (!o) setDeletingPage(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir "{deletingPage?.nome}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso vai apagar permanentemente todos os nós e conexões desta página. Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeletePage} className="bg-red-600 hover:bg-red-700">
              Excluir página
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Export ──────────────────────────────────────────────────────────────────

export function MapaMental() {
  return (
    <ReactFlowProvider>
      <MapaMentalInner />
    </ReactFlowProvider>
  );
}
