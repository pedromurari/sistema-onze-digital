# Performance + Design Harmony — Spec

**Data:** 2026-06-06  
**Escopo:** Abordagem B — cirúrgica, sem quebrar funcionalidades existentes

---

## 1. Performance: Carregamento inicial

### 1a. Remover @import Google Fonts de globals.css
- Linha 1 do `globals.css` tem `@import url('https://fonts.googleapis.com/...')` render-blocking
- `layout.tsx` já carrega as mesmas fontes via `next/font` (self-hosted, zero bloqueio)
- **Ação:** remover o `@import` inteiro

### 1b. Corrigir font-family no body
- `globals.css` aplica `font-family: 'Inter'` no body, mas `layout.tsx` carrega `Manrope`
- A variável `--font-manrope` já está disponível via `layout.tsx`
- **Ação:** trocar `'Inter'` → `var(--font-manrope)` no body e em `--font-sans`
- **Ação:** trocar referências hardcoded a `'Fraunces'` → `var(--font-fraunces)`

### 1c. Dynamic import do HeroCarousel
- Framer Motion (~90 KB gzip) é carregado sincronamente com o bundle inicial
- HeroCarousel não precisa de SSR (usa estado/intervalos de cliente)
- **Ação:** em `dashboard/page.tsx`, trocar import estático por `dynamic(() => import(...), { ssr: false })`
- Adicionar skeleton de mesmo tamanho (`clamp(340px, 60vw, 600px)`) como fallback

---

## 2. Performance: Scroll jank

### 2a. AnimatedSection na Loja
- `AnimatedSection` e `AnimatedCard` em `loja/page.tsx` usam Framer Motion `whileInView`
- Conteúdo fica `opacity: 0` até scroll — mesmo bug corrigido no PromoBanner
- **Ação:** reescrever `AnimatedSection.tsx` como wrapper estático sem animação (só `children`)
- `AnimatedCard` vira wrapper passthrough sem motion

### 2b. Hover GPU-safe nos cards
- `.card-netflix:hover` em `globals.css` anima `box-shadow` — força re-layout por frame
- **Ação:** remover `box-shadow` da transição; manter só `transform`

---

## 3. Performance: Player duplicado

### 3a. Verificar YouTubePlayer
- `plyr-react` e `react-player` ambos no `package.json`
- Verificar qual `YouTubePlayer` usa; remover o não utilizado
- **Ação:** checar `src/components/player/YouTubePlayer.tsx` e remover import não usado do `package.json`

---

## 4. Design Harmonioso

### 4a. Padding horizontal — classe `.page-px`
- 3 valores inconsistentes entre páginas (`px-5 sm:px-8`, `px-4 sm:px-6 lg:px-16`, etc.)
- **Ação:** adicionar `.page-px { padding-left: 1rem; padding-right: 1rem; }` + breakpoints em `globals.css`
- Substituir nas páginas: `dashboard`, `cursos`, `loja`, `lesson`

### 4b. Bordas e superfícies
- 4 tons de cinza hardcoded (`#1a1a1a`, `#2a2a2a`, `#242424`, `#333`) usados de forma inconsistente
- **Ação:** substituir por variáveis CSS do design system já definidas:
  - superfícies: `var(--bg-surface)` (#1a1a1a) ou `var(--bg-elevated)` (#242424)
  - bordas: `var(--border-subtle)` (#2a2a2a)
- Apenas arquivos onde a inconsistência é visível ao usuário (não tocar em admin)

### 4c. Remover Sidebar.tsx morto
- `src/components/layout/Sidebar.tsx` tem tema claro (#fffaf5), não é usado no member layout
- **Ação:** deletar o arquivo

---

## Arquivos a modificar

| Arquivo | Mudança |
|---|---|
| `src/app/globals.css` | Remove @import, fix font vars, fix card hover, add .page-px |
| `src/app/layout.tsx` | Aplicar --font-manrope via className no body |
| `src/app/(member)/dashboard/page.tsx` | dynamic import HeroCarousel |
| `src/components/marketing/AnimatedSection.tsx` | Reescrever como wrapper estático |
| `src/components/player/YouTubePlayer.tsx` | Verificar qual player lib usa |
| `src/components/layout/Sidebar.tsx` | Deletar |
| `package.json` | Remover player não utilizado |

---

## Fora do escopo
- Substituir Framer Motion no HeroCarousel (Abordagem C)
- Refatorar queries Supabase
- Alterar autenticação ou middleware
