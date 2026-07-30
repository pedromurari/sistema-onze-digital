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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/components/ui/use-toast';
import {
  Plus, Trash2, Download, ChevronRight, ChevronLeft,
  Type, Palette, Maximize2, Link2, AlignCenter,
  Bold, Italic, Search, X, User, Flag, FileText,
  Eye, Edit3, Lock, Unlock, Layers, ZoomIn, ZoomOut,
  RotateCcw, MessageSquare, Calendar, CheckCircle2,
  ChevronDown, Users, Tag, ArrowRight, Sparkles,
  MoreVertical, Pencil, FolderPlus, Target, Filter,
} from 'lucide-react';

// ─── Tipos ────────────────────────────────────────────────────────────────────

type NodeTipo = 'empresa' | 'funil' | 'etapa_funil' | 'canal' | 'metrica' | 'observacao';
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

// ─── Constantes ───────────────────────────────────────────────────────────────

const NODE_COLORS: Record<NodeTipo, string> = {
  empresa: '#AC1131',
  funil: '#3B82F6',
  etapa_funil: '#8B5CF6',
  canal: '#10B981',
  metrica: '#F59E0B',
  observacao: '#6B7280',
};

const TIPO_LABELS: Record<NodeTipo, string> = {
  empresa: '🏢 Empresa/Produto',
  funil: '📊 Funil',
  etapa_funil: '🔄 Etapa do Funil',
  canal: '📡 Canal de Tráfego',
  metrica: '📈 Resultado/Métrica',
  observacao: '📝 Observação',
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

// ─── Nó Customizado ───────────────────────────────────────────────────────────

function MindMapNode({
  data, selected, id,
}: {
  data: NodeData; selected: boolean; id: string;
}) {
  const formato = data.formato || 'redondo';
  const tamanho = data.tamanho || 'medio';

  const sizeMap = { pequeno: 110, medio: 155, grande: 210, personalizado: data.largura || 155 };
  const heightMap = { pequeno: 54, medio: 74, grande: 100, personalizado: data.altura || 74 };

  const width = sizeMap[tamanho];
  const height = heightMap[tamanho];

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
    <div style={{ position: 'relative' }}>
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
          width: `${width}px`,
          height: `${height}px`,
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

  useEffect(() => {
    if (node) {
      setForm({
        label: node.data.label,
        sublabel: node.data.sublabel || '',
        descricao: node.data.descricao || '',
        notas: node.data.notas || '',
        fase: node.data.fase || 'nenhuma',
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
      });
      setEditing(false);
    }
  }, [node]);

  const handleSave = () => {
    if (!node) return;
    onUpdate(node.id, form);
    setEditing(false);
  };

  const responsavel = usuarios.find(u => u.id === form.responsavelId);
  const fase = (form.fase || 'nenhuma') as FaseFunil;

  if (!node) return null;

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

          {/* Aparência (só em edição) */}
          {editing && (
            <div className="rounded-xl border border-gray-100 p-4 bg-gray-50 space-y-4">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                <Palette className="h-3.5 w-3.5" /> Aparência
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

  const currentPage = useMemo(
    () => pages.find(p => p.workspace === currentWorkspace) || null,
    [pages, currentWorkspace]
  );

  const nodeTypes: NodeTypes = useMemo(() => ({ mindmap: MindMapNode }), []);
  const edgeTypes = useMemo(() => ({ custom: CustomEdge }), []);

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
      const rfNodes: Node<NodeData>[] = nodesRes.data.map((n: any) => ({
        id: n.id.toString(),
        type: 'mindmap',
        position: { x: n.posicao_x ?? 200, y: n.posicao_y ?? 200 },
        data: {
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
          largura: n.largura || 155,
          altura: n.altura || 74,
          fontSize: n.font_size || 13,
          fontWeight: n.font_weight || '700',
          fontStyle: n.font_style || 'normal',
          emoji: n.emoji || '',
          fase: (n.fase || 'nenhuma') as FaseFunil,
          responsavelId: n.responsavel_id || '',
          responsavelNome: n.responsavel_nome || '',
          tags: n.tags || [],
          dataCriacao: n.created_at || '',
        },
      }));
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

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setShowSearch(true); }
      if (e.key === 'Escape') { setShowSearch(false); setShowDetail(false); }
      if (e.key === 'Delete' && canEdit && (selectedNodeId || selectedEdgeId)) deleteSelected();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedNodeId, selectedEdgeId, canEdit]);

  // ── Selecionar nó ───────────────────────────────────────────────────────────

  const onNodeClick = useCallback((_: any, node: Node<NodeData>) => {
    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
    setPanelOpen(false);
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

  const updateNode = useCallback(async (nodeId: string, updates: Partial<NodeData>) => {
    setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, ...updates } } : n));
    // Também atualiza detailNode se aberto
    setDetailNode(prev => prev && prev.id === nodeId ? { ...prev, data: { ...prev.data, ...updates } } : prev);

    const db: any = {};
    if (updates.label !== undefined) db.titulo = updates.label;
    if (updates.sublabel !== undefined) db.sublabel = updates.sublabel;
    if (updates.descricao !== undefined) db.descricao = updates.descricao;
    if (updates.notas !== undefined) db.notas = updates.notas;
    if (updates.emoji !== undefined) db.emoji = updates.emoji;
    if (updates.cor !== undefined) db.cor = updates.cor;
    if (updates.corTexto !== undefined) db.cor_texto = updates.corTexto;
    if (updates.corBorda !== undefined) db.cor_borda = updates.corBorda;
    if (updates.espessuraBorda !== undefined) db.espessura_borda = updates.espessuraBorda;
    if (updates.tamanho !== undefined) db.tamanho = updates.tamanho;
    if (updates.formato !== undefined) db.formato = updates.formato;
    if (updates.largura !== undefined) db.largura = updates.largura;
    if (updates.altura !== undefined) db.altura = updates.altura;
    if (updates.fontSize !== undefined) db.font_size = updates.fontSize;
    if (updates.fontWeight !== undefined) db.font_weight = updates.fontWeight;
    if (updates.fontStyle !== undefined) db.font_style = updates.fontStyle;
    if (updates.fase !== undefined) db.fase = updates.fase;
    if (updates.responsavelId !== undefined) db.responsavel_id = updates.responsavelId;
    if (updates.responsavelNome !== undefined) db.responsavel_nome = updates.responsavelNome;
    if (updates.tags !== undefined) db.tags = updates.tags;

    if (Object.keys(db).length > 0) {
      await supabase.from('mind_map_nodes').update(db).eq('id', nodeId);
    }
  }, [setNodes]);

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

  // ── Drag stop ───────────────────────────────────────────────────────────────

  const onNodeDragStop = useCallback(async (_: any, node: Node) => {
    if (!canEdit) return;
    await supabase.from('mind_map_nodes').update({
      posicao_x: Math.round(node.position.x),
      posicao_y: Math.round(node.position.y),
    }).eq('id', node.id);
  }, [canEdit]);

  // ── Conectar ────────────────────────────────────────────────────────────────

  const onConnect = useCallback(async (params: Connection) => {
    if (!user || !params.source || !params.target || !canEdit) return;
    const exists = edges.some(e =>
      (e.source === params.source && e.target === params.target) ||
      (e.source === params.target && e.target === params.source)
    );
    if (exists) { toast({ title: 'Conexão já existe.' }); return; }

    const { data, error } = await supabase.from('mind_map_connections').insert({
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
    }).select().single();

    if (error) { toast({ variant: 'destructive', title: 'Erro ao conectar' }); return; }
    setEdges(eds => addEdge({
      ...params,
      id: data.id.toString(),
      type: 'custom',
      markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8', width: 16, height: 16 },
      data: { label: '', cor: '#94a3b8', espessura: 2, tipo: 'bezier', estilo: 'solida', animado: false },
    }, eds));
  }, [user, edges, setEdges, canEdit, currentWorkspace]);

  // ── Criar nó ────────────────────────────────────────────────────────────────

  const createNode = async () => {
    if (!newTitle.trim() || !user || !canEdit) return;
    const cor = NODE_COLORS[newTipo];
    const { data, error } = await supabase.from('mind_map_nodes').insert({
      user_id: user.id,
      titulo: newTitle.trim(),
      tipo: newTipo,
      posicao_x: Math.round(clickPos.x),
      posicao_y: Math.round(clickPos.y),
      cor,
      tamanho: 'medio',
      formato: 'redondo',
      cor_texto: '#ffffff',
      cor_borda: 'rgba(255,255,255,0.2)',
      espessura_borda: 2,
      font_size: 13,
      font_weight: '700',
      font_style: 'normal',
      emoji: newEmoji,
      fase: newFase,
      workspace: currentWorkspace,
    }).select().single();

    if (error) { toast({ variant: 'destructive', title: 'Erro ao criar nó' }); return; }

    setNodes(nds => [...nds, {
      id: data.id.toString(),
      type: 'mindmap',
      position: clickPos,
      data: {
        label: newTitle.trim(),
        tipo: newTipo,
        cor,
        corTexto: '#ffffff',
        tamanho: 'medio',
        formato: 'redondo',
        emoji: newEmoji,
        fase: newFase,
      },
    }]);

    toast({ title: '✨ Nó criado!', description: newTitle.trim() });
    setShowCreateDialog(false);
    setNewTitle('');
    setNewEmoji('');
    setNewFase('nenhuma');
  };

  // ── Deletar ─────────────────────────────────────────────────────────────────

  const deleteSelected = async () => {
    if (!canEdit) return;
    if (selectedNodeId) {
      await supabase.from('mind_map_connections').delete()
        .or(`no_origem_id.eq.${selectedNodeId},no_destino_id.eq.${selectedNodeId}`);
      await supabase.from('mind_map_nodes').delete().eq('id', selectedNodeId);
      setNodes(nds => nds.filter(n => n.id !== selectedNodeId));
      setEdges(eds => eds.filter(e => e.source !== selectedNodeId && e.target !== selectedNodeId));
      setSelectedNodeId(null);
      toast({ title: 'Nó deletado.' });
    } else if (selectedEdgeId) {
      await supabase.from('mind_map_connections').delete().eq('id', selectedEdgeId);
      setEdges(eds => eds.filter(e => e.id !== selectedEdgeId));
      setSelectedEdgeId(null);
      setPanelOpen(false);
      toast({ title: 'Conexão deletada.' });
    }
  };

  const deleteNode = async (nodeId: string) => {
    if (!canEdit) return;
    await supabase.from('mind_map_connections').delete()
      .or(`no_origem_id.eq.${nodeId},no_destino_id.eq.${nodeId}`);
    await supabase.from('mind_map_nodes').delete().eq('id', nodeId);
    setNodes(nds => nds.filter(n => n.id !== nodeId));
    setEdges(eds => eds.filter(e => e.source !== nodeId && e.target !== nodeId));
    toast({ title: 'Nó deletado.' });
  };

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

  const exportSvg = () => {
    const svg = document.querySelector('.react-flow__renderer svg') as SVGElement;
    if (!svg) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `mapa-mental-${Date.now()}.svg`;
    a.click();
    toast({ title: 'SVG exportado!' });
  };

  // Estatísticas rápidas
  const stats = useMemo(() => ({
    total: nodes.length,
    porFase: {
      topo: nodes.filter(n => n.data.fase === 'topo').length,
      meio: nodes.filter(n => n.data.fase === 'meio').length,
      fundo: nodes.filter(n => n.data.fase === 'fundo').length,
      pos_venda: nodes.filter(n => n.data.fase === 'pos_venda').length,
    },
    conexoes: edges.length,
  }), [nodes, edges]);

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
        </div>

        <div className="ml-auto flex gap-2 items-center">
          <span className="text-xs text-gray-400 hidden lg:block">
            {canEdit ? 'Duplo clique no canvas para criar · Arraste bordas para conectar' : 'Clique em qualquer nó para ver detalhes'}
          </span>
          <Button size="sm" variant="outline" onClick={() => rfi?.fitView({ padding: 0.15, duration: 500 })} className="gap-1.5 rounded-lg">
            <Maximize2 className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={exportSvg} className="rounded-lg" title="Exportar SVG">
            <Download className="h-4 w-4" />
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
            nodes={nodes}
            edges={edges}
            onNodesChange={canEdit ? onNodesChange : undefined}
            onEdgesChange={canEdit ? onEdgesChange : undefined}
            onConnect={canEdit ? onConnect : undefined}
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
            deleteKeyCode={canEdit ? 'Delete' : null}
            nodesDraggable={canEdit}
            nodesConnectable={canEdit}
            elementsSelectable={true}
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
