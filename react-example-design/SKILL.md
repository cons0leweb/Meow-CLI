---
name: react-example-design
description: Design system skill for react-example. Activate when building UI components, pages, or any visual elements. Provides exact color tokens, typography scale, spacing grid, component patterns, and craft rules. Read references/DESIGN.md before writing any CSS or JSX.
---

# react-example Design System

You are building UI for **react-example**. Light-themed, cool palette, sans-serif typography (sans-serif), standard density on a 5px grid, expressive motion.

## Design Philosophy

- **Layered depth** — use shadow tokens to create a sense of physical layering. Each elevation level has a specific shadow.
- **Gradient accents** — gradients are used thoughtfully for emphasis, not decoration.
- **standard density** — 5px base grid. Every dimension is a multiple of 5.
- **cool palette** — the color temperature runs cool, matching the sans-serif typography.
- **Restrained accent** — `#a855f7` is the only pop of color. Used exclusively for CTAs, links, focus rings, and active states.
- **Expressive motion** — animations are an integral part of the experience. Use spring physics and layout animations.
- **Lucide icons** — use Lucide for all iconography. Do not mix icon libraries.

## Color System

### Core Palette

| Role | Token | Hex | Use |
|------|-------|-----|-----|
| Background | `--background` | `#fbfbfa` | Page/app background |
| Surface | `--surface` | `#e7e5e4` | Cards, panels, modals |
| Text Primary | `--text-primary` | `#0e0e11` | Headings, body text |
| Text Muted | `--text-muted` | `#a1a1aa` | Captions, placeholders |
| Accent | `--accent` | `#a855f7` | CTAs, links, focus rings |
| Border | `--border` | `#2a2a30` | Dividers, card borders |

### Status Colors

| Status | Hex | Use |
|--------|-----|-----|
| Danger | `#ff7043` | Errors, destructive actions |

### Extended Palette

- **color-zinc-850:** `#1f1f24`
- **color-zinc-700:** `#3f3f46`
- **color-zinc-600:** `#52525b`
- **color-zinc-500:** `#71717a`
- **color-zinc-350:** `#b4b4bb`
- **color-zinc-300:** `#d4d4d8`

### CSS Variable Tokens

```css
--color-accent-amber: #d97706;
--color-accent-teal: #0f766e;
--color-accent-blue: #2563eb;
--color-accent-muted: #14b8a6;
```

## Typography

### Font Stack


### Type Scale

| Role | Family | Size | Weight |
|------|--------|------|--------|

### Typography Rules

- All text uses **sans-serif** — never add another font family
- Max 3-4 font sizes per screen
- Headings: weight 600-700, body: weight 400
- Use color and opacity for text hierarchy, not additional font sizes
- Line height: 1.5 for body, 1.2 for headings

## Spacing & Layout

### Base Grid: 5px

Every dimension (margin, padding, gap, width, height) must be a multiple of **5px**.

### Spacing Scale

`5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60` px

### Spacing as Meaning

| Spacing | Use |
|---------|-----|
| 2.5-5px | Tight: related items within a group |
| 10px | Medium: between groups |
| 15-20px | Wide: between sections |
| 30px+ | Vast: major section breaks |

### Border Radius

Scale: `4px, 6px, 8px, 12px, 16px`
Default: `8px`

## Component Patterns

### Card

```css
.card {
  background: #e7e5e4;
  border: 1px solid #2a2a30;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 0 0 1px rgba(255,255,255,0.05);
}
```

```html
<div class="card">
  <h3>Card Title</h3>
  <p>Card content goes here.</p>
</div>
```

### Button

```css
/* Primary */
.btn-primary {
  background: #a855f7;
  color: #0e0e11;
  border-radius: 8px;
  padding: 10px 20px;
  font-weight: 500;
  transition: opacity 150ms ease;
}
.btn-primary:hover { opacity: 0.9; }

/* Ghost */
.btn-ghost {
  background: transparent;
  border: 1px solid #2a2a30;
  color: #0e0e11;
  border-radius: 8px;
  padding: 10px 20px;
}
```

```html
<button class="btn-primary">Get Started</button>
<button class="btn-ghost">Learn More</button>
```

### Input

```css
.input {
  background: #fbfbfa;
  border: 1px solid #2a2a30;
  border-radius: 8px;
  padding: 10px 15px;
  color: #0e0e11;
  font-size: 14px;
}
.input:focus { border-color: #a855f7; outline: none; }
```

```html
<input class="input" type="text" placeholder="Search..." />
```

### Badge / Chip

```css
.badge {
  display: inline-flex;
  align-items: center;
  padding: 5px 10px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 500;
  background: #e7e5e4;
  color: #a1a1aa;
}
```

```html
<span class="badge">New</span>
<span class="badge">Beta</span>
```

### Modal / Dialog

```css
.modal-backdrop { background: rgba(0, 0, 0, 0.6); }
.modal {
  background: #e7e5e4;
  border: 1px solid #2a2a30;
  border-radius: 16px;
  padding: 30px;
  max-width: 480px;
  width: 90vw;
  box-shadow: 0 4px 20px -2px rgba(0,0,0,0.4);
}
```

```html
<div class="modal-backdrop">
  <div class="modal">
    <h2>Dialog Title</h2>
    <p>Dialog content.</p>
    <button class="btn-primary">Confirm</button>
    <button class="btn-ghost">Cancel</button>
  </div>
</div>
```

### Table

```css
.table { width: 100%; border-collapse: collapse; }
.table th {
  text-align: left;
  padding: 10px 15px;
  font-weight: 500;
  font-size: 12px;
  color: #a1a1aa;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid #2a2a30;
}
.table td {
  padding: 15px;
  border-bottom: 1px solid #2a2a30;
}
```

```html
<table class="table">
  <thead><tr><th>Name</th><th>Status</th><th>Date</th></tr></thead>
  <tbody>
    <tr><td>Item One</td><td>Active</td><td>Jan 1</td></tr>
    <tr><td>Item Two</td><td>Pending</td><td>Jan 2</td></tr>
  </tbody>
</table>
```

### Navigation

```css
.nav {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 15px 20px;
  border-bottom: 1px solid #2a2a30;
}
.nav-link {
  color: #a1a1aa;
  padding: 10px 15px;
  border-radius: 8px;
  transition: color 150ms;
}
.nav-link:hover { color: #0e0e11; }
.nav-link.active { color: #a855f7; }
```

```html
<nav class="nav">
  <a href="/" class="nav-link active">Home</a>
  <a href="/about" class="nav-link">About</a>
  <a href="/pricing" class="nav-link">Pricing</a>
  <button class="btn-primary" style="margin-left: auto">Get Started</button>
</nav>
```

### Extracted Components

These components were found in the codebase:

**ActivityTimeline** (`src/components/ActivityTimeline.tsx`)
- Variants: `idle`, `running`, `success`, `thought`, `read`, `edit`, `test`, `build`, `review`, `failed`, `generic`
- Props: `items`, `onItemClick`, `item`
- Styles: `bg-[#16161a]`, `rounded-full`, `pl-6`, `font-display`, `shadow-soft`

**ApiSettings** (`src/components/ApiSettings.tsx`)
- Props: `onNotify`, `msg`, `onConfigChange`, `status`
- Styles: `bg-zinc-900/30`, `border`, `space-y-6`, `text-zinc-300`

**Cards** (`src/components/Cards.tsx`)
- Variants: `idle`, `loading`, `active`, `success`, `warning`, `pending`, `modified`, `added`, `error`, `failed`, `removed`
- Props: `title`, `description`, `steps`, `state`, `onStepClick`, `step`
- Styles: `bg-zinc-950`, `rounded-full`, `gap-4`, `font-display`, `opacity-40`

**Chat** (`src/components/Chat.tsx`)
- Variants: `user`, `assistant`, `system`
- Props: `id`, `role`, `content`, `timestamp`, `reasoning`, `toolsUsed`
- Styles: `bg-zinc-950`, `rounded`, `gap-2`, `font-display`, `shadow-soft`

**ChatContainer** (`src/components/ChatContainer.tsx`)
- Variants: `idle`, `thinking`, `read`, `edit`, `build`, `generic`, `thought`, `review`, `streaming`, `test`
- Props: `currentSession`, `messages`, `thinkingState`, `composerVal`, `onComposerValChange`, `val`
- Styles: `bg-[#09090c]/90`, `rounded-lg`, `my-3`, `font-mono`, `shadow-sm`

**Header** (`src/components/Header.tsx`)
- Variants: `changes`, `context`
- Props: `activeSheet`, `onToggleSheet`, `sheet`, `apiStatus`
- Styles: `bg-[#070709]`, `border-b`, `px-6`, `font-bold`, `opacity-60`

**RightDrawer** (`src/components/RightDrawer.tsx`)
- Variants: `changes`, `context`, `none`, `default`
- Props: `activeSheet`, `onClose`, `selectedActionDetail`, `apiStatus`, `projectFiles`, `onNotify`
- Styles: `bg-black/50`, `border-l`, `px-5`, `font-semibold`, `shadow-soft`

**Sidebar** (`src/components/Sidebar.tsx`)
- Variants: `changes`, `context`, `local`
- Props: `currentSession`, `onSetCurrentSession`, `id`, `sessions`, `userInfo`, `activeSheet`
- Styles: `bg-[#070709]`, `border-r`, `p-4`, `text-xs`, `shadow-soft`

## Animation & Motion

This project uses **expressive motion**. Animations are part of the design language.

### Framer Motion

```tsx
// Standard enter animation
<motion.div
  initial={{ opacity: 0, y: 8 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.3, ease: "easeOut" }}
/>

// List stagger
const container = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } }
const item = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }
```

### CSS Animations

- `gradient-shift`
- `text-shimmer-move`
- `working-shimmer`
- `working-dot-pulse`
- `working-glow`

### Motion Guidelines

- **Duration:** 150-300ms for micro-interactions, 300-500ms for page transitions
- **Easing:** `ease-out` for enters, `ease-in` for exits
- **Direction:** Elements enter from bottom/right, exit to top/left
- **Reduced motion:** Always respect `prefers-reduced-motion` — disable animations when set

## Depth & Elevation

### Shadow Tokens

- Subtle: `0 0 0 1px rgba(255,255,255,0.05)`
- Floating (dropdowns, popovers): `0 4px 20px -2px rgba(0,0,0,0.4)`
- Floating (dropdowns, popovers): `0 0 8px rgba(168,85,247,0.08),0 0 20px rgba(168,85,247,0.03)`
- Overlay (modals, dialogs): `0 0 16px rgba(168,85,247,0.15),0 0 40px rgba(168,85,247,0.05)`

## Anti-Patterns (Never Do)

- **No blur effects** — no backdrop-blur, no filter: blur()
- **No zebra striping** — tables and lists use borders for separation
- **No invented colors** — every hex value must come from the palette above
- **No arbitrary spacing** — every dimension is a multiple of 5px
- **No arbitrary border-radius** — use the scale: 4px, 6px, 8px, 12px, 16px
- **No opacity for disabled states** — use muted colors instead
- **No pill shapes** — this design doesn't use rounded-full / 9999px radius

## Workflow

1. **Read** `references/DESIGN.md` before writing any UI code
2. **Pick colors** from the Color System section — never invent new ones
3. **Set typography** — project font only, using the type scale
4. **Build layout** on the 5px grid — check every margin, padding, gap
5. **Match components** to patterns above before creating new ones
6. **Apply elevation** — use shadow tokens
7. **Validate** — every value traces back to a design token. No magic numbers.

## Brand Spec

- **Brand color:** `#a855f7`

## Quick Reference

```
Background:     #fbfbfa
Surface:        #e7e5e4
Text:           #0e0e11 / #a1a1aa
Accent:         #a855f7
Border:         #2a2a30
Font:           sans-serif
Spacing:        5px grid
Radius:         8px
Frameworks:     Tailwind CSS, React
Icons:          Lucide
Components:     8 detected
```

## When to Trigger

Activate this skill when:
- Creating new components, pages, or visual elements for react-example
- Writing CSS, Tailwind classes, styled-components, or inline styles
- Building page layouts, templates, or responsive designs
- Reviewing UI code for design consistency
- The user mentions "react-example" design, style, UI, or theme
- Generating mockups, wireframes, or visual prototypes

---

# Full Reference Files

> Every output file is embedded below. Claude has full design system context from /skills alone.

## Design System Tokens (DESIGN.md)

# react-example DESIGN.md

> Auto-generated design system — reverse-engineered via static analysis by skillui.
> Frameworks: Tailwind CSS 4.1.14 + React 19.0.1
> Colors: 17 · Fonts: 0 · Components: 8
> Icon library: Lucide · State: not detected
> Primary theme: light · Dark mode toggle: no · Motion: expressive

---

## 1. Visual Theme & Atmosphere

This is a **light-themed** interface with a cool, approachable feel. The light background emphasizes content clarity. Typography uses **sans-serif** throughout — a clean, modern choice that maintains consistency. Spacing follows a **5px base grid** (standard density), with scale: 5, 10, 15, 20, 25, 30, 35, 40px. The accent color **#a855f7** anchors interactive elements (buttons, links, focus rings). Motion is expressive — spring physics, layout animations, and staggered reveals are part of the visual language.

---

## 2. Color Palette & Roles

| Token | Hex | Role | Use |
|---|---|---|---|
| color-sand-50 | `#fbfbfa` | background | Page background, darkest surface |
| color-sand-200 | `#e7e5e4` | surface | Card and panel backgrounds |
| color-zinc-950 | `#0e0e11` | text-primary | Headings and body text |
| color-zinc-400 | `#a1a1aa` | text-muted | Captions, placeholders, secondary info |
| color-zinc-800 | `#2a2a30` | border | Dividers, card borders, outlines |
| accent | `#a855f7` | accent | CTAs, links, focus rings, active states |
| color-accent-amber | `#d97706` | accent | CTAs, links, focus rings, active states |
| color-accent-teal | `#0f766e` | accent | CTAs, links, focus rings, active states |
| color-accent-blue | `#2563eb` | accent | CTAs, links, focus rings, active states |
| color-accent-muted | `#14b8a6` | accent | CTAs, links, focus rings, active states |
| danger | `#ff7043` | danger | Error states, destructive actions |
| color-zinc-850 | `#1f1f24` | unknown | Palette color |
| color-zinc-700 | `#3f3f46` | unknown | Palette color |
| color-zinc-600 | `#52525b` | unknown | Palette color |
| color-zinc-500 | `#71717a` | unknown | Palette color |
| color-zinc-350 | `#b4b4bb` | unknown | Palette color |
| color-zinc-300 | `#d4d4d8` | unknown | Palette color |

### CSS Variable Tokens

```css
--color-accent-amber: #d97706;
--color-accent-teal: #0f766e;
--color-accent-blue: #2563eb;
--color-accent-muted: #14b8a6;
```


---

## 3. Typography Rules

No typography tokens detected.

---

## 4. Component Stylings

### Layout (2)

**Header** — `src/components/Header.tsx`
- Variants: `changes`, `context`
- Props: `activeSheet`, `onToggleSheet`, `sheet`, `apiStatus`
- Key Styles: `rounded-md`, `border-zinc-900`, `bg-[#070709]`, `px-6`, `text-xs`, `font-bold`, `opacity-60`, `cursor-pointer`
- Animation: framer-motion, tw-animate-pulse

```tsx
<header className="h-14 border-b border-zinc-900 bg-[#070709] px-6 flex items-center justify-between z-20 shrink-0">
      
      {/* Left branding context */}
      <div className="flex items-center gap-3">
        <div className="w-5 h-5 rounded-md bg-zinc-900 border border-zinc-800 flex items-center justify-center font-bold text-[11px] text-[#ff7043]">
          M
        </div>
        <span className="font-semibold text-xs text-white tracking-tight uppercase">Meow Core Client</span>
        <span className="h-3 w-[1px] bg-zinc-800" />
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] text-zinc-500 font-mono">Agent Active</span>
```

**Sidebar** — `src/components/Sidebar.tsx`
- Variants: `changes`, `context`, `local`
- Props: `currentSession`, `onSetCurrentSession`, `id`, `sessions`, `userInfo`, `activeSheet`, `onToggleSheet`, `sheet` (+5 more)
- Key Styles: `rounded-xl`, `border-r`, `bg-[#070709]`, `p-4`, `text-xs`, `font-semibold`, `shadow-soft`, `select-none`
- Animation: framer-motion, hover-transforms

```tsx
<aside className="w-64 border-r border-[#141418]/60 bg-[#070709] flex flex-col shrink-0 min-h-0 select-none">
      <div className="p-4 flex flex-col justify-between h-full">
        
        <div className="space-y-6">
          
          {/* Luxury Claude New Chat Button */}
          <motion.button 
            whileHover={{ scale: 1.015 }}
            whileTap={{ scale: 0.985 }}
            onClick={onCreateNewChat}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-[#111115] border border-zinc-850 hover:border-zinc-750 hover:bg-zinc-900/50 text-xs font-semibold text-zinc-100 transition shadow-soft cursor-pointer group"
          >
```

### Data Display (1)

**Cards** — `src/components/Cards.tsx`
- Variants: `idle`, `loading`, `active`, `success`, `warning`, `pending`, `modified`, `added`, `error`, `failed`, `removed`
- Props: `title`, `description`, `steps`, `state`, `onStepClick`, `step`
- Key Styles: `rounded-full`, `border-zinc-800`, `bg-zinc-950`, `gap-4`, `text-xs`, `font-display`, `opacity-40`, `hover:bg-white`
- Animation: tw-animate-pulse, tw-transitions: duration-300, duration-150

```tsx
<div className={`p-5 rounded-2xl bg-zinc-900 border transition duration-300 ${
      state === 'success' ? 'border-emerald-950/40 bg-zinc-900/60' :
      state === 'warning' ? 'border-amber-950/40 bg-zinc-900/60' :
      'border-zinc-850'
    } shadow-soft`}>
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <h4 className="font-display font-semibold text-xs text-white uppercase tracking-wider">
            {title}
          </h4>
          {description && (
            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
```

### Data Input (2)

**Chat** — `src/components/Chat.tsx`
- Variants: `user`, `assistant`, `system`
- Props: `id`, `role`, `content`, `timestamp`, `reasoning`, `toolsUsed`
- Key Styles: `rounded`, `border-zinc-800`, `bg-zinc-950`, `gap-2`, `text-xs`, `font-display`, `shadow-soft`, `focus:ring-0`
- Animation: tw-animate-pulse, tw-transitions: duration-200, duration-300, duration-150

```tsx
<div className={`flex gap-4 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {/* Sender Avatar */}
      {!isUser && (
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
          isSystem 
            ? 'bg-zinc-900 border-zinc-805 text-zinc-500' 
            : 'bg-amber-500/10 border-amber-500/25 text-amber-500'
        }`}>
          {isSystem ? <HelpCircle className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
        </div>
```

**ChatContainer** — `src/components/ChatContainer.tsx`
- Variants: `idle`, `thinking`, `read`, `edit`, `build`, `generic`, `thought`, `review`, `streaming`, `test`
- Props: `currentSession`, `messages`, `thinkingState`, `composerVal`, `onComposerValChange`, `val`, `onSubmitComposer`, `e` (+10 more)
- Key Styles: `rounded-lg`, `border-zinc-800/80`, `bg-[#09090c]/90`, `my-3`, `text-xs`, `font-mono`, `shadow-sm`, `hover:text-white`
- Animation: framer-motion, transition: {duration: 0.55, 
                    ease: [0.16, 1, 0.3, 1]}, animate-presence
- State: useState, useRef

```tsx
<div className="relative my-3 rounded-lg border border-zinc-800/80 bg-[#09090c]/90 overflow-hidden font-mono text-[11px]">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#121216]/50 border-b border-zinc-900 text-zinc-500 text-[10px]">
        <span>terminal output / code</span>
        <button 
          onClick={handleCopy} 
          className="hover:text-white transition flex items-center gap-1 cursor-pointer"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <div className="p-3.5 overflow-x-auto text-zinc-300 select-text leading-relaxed">
```

### Overlay (3)

**ActivityTimeline** — `src/components/ActivityTimeline.tsx`
- Variants: `idle`, `running`, `success`, `thought`, `read`, `edit`, `test`, `build`, `review`, `failed`, `generic`
- Props: `items`, `onItemClick`, `item`
- Key Styles: `rounded-full`, `border-zinc-850`, `bg-[#16161a]`, `pl-6`, `text-xs`, `font-display`, `shadow-soft`, `cursor-pointer`
- Animation: framer-motion, transition: {duration: 0.25, ease: [0.16, 1, 0.3, 1]}, animate-presence

```tsx
<div className="relative pl-6 space-y-4 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[1px] before:bg-zinc-800">
      <AnimatePresence initial={false}>
        {items.map((item, index
```

**ApiSettings** — `src/components/ApiSettings.tsx`
- Props: `onNotify`, `msg`, `onConfigChange`, `status`
- Key Styles: `rounded-xl`, `border-zinc-900`, `bg-zinc-900/30`, `space-y-6`, `text-xs`, `font-semibold`, `select-text`
- Animation: framer-motion, animate-presence
- State: useState

```tsx
<div className="space-y-6 pt-1 select-text text-zinc-300">
      
      {/* Introduction */}
      <div className="p-4 bg-zinc-900/30 border border-zinc-900 rounded-xl flex gap-3 items-start">
        <Sparkles className="w-5 h-5 text-[#ff7043] shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h5 className="text-xs font-semibold text-white">Engine parameters manager</h5>
          <p className="text-[11px] text-zinc-450 leading-relaxed">
            Modify target runtime engines, authorize secure cryptographic client credentials keys and review network usage telemetry.
          </p>
        </div>
      </div>
```

**RightDrawer** — `src/components/RightDrawer.tsx`
- Variants: `changes`, `context`, `none`, `default`
- Props: `activeSheet`, `onClose`, `selectedActionDetail`, `apiStatus`, `projectFiles`, `onNotify`, `msg`, `onConfigChange`
- Key Styles: `rounded-full`, `border-l`, `bg-black/50`, `px-5`, `text-xs`, `font-semibold`, `shadow-soft`, `cursor-pointer`
- Animation: framer-motion, transition: {type: 'spring', damping: 28, stiffness: 220}, animate-presence

```tsx
<AnimatePresence>
      {activeSheet && (
        <>
          {/* Overlay background blur trigger */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.35 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-30 cursor-pointer"
          />
```



---

## 5. Layout Principles

- **Base spacing unit:** 5px
- **Spacing scale:** 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60
- **Border radius:** 4px, 6px, 8px, 12px, 16px
- **Grid usage:** `grid-cols-2`
- **Container:** Tailwind `container` class with responsive padding

**Spacing as Meaning:**
| Spacing | Use |
|---|---|
| 2.5-5px | Tight: related items within a group |
| 10px | Medium: between groups |
| 15-20px | Wide: between sections |
| 30px+ | Vast: major section breaks |


---

## 6. Depth & Elevation

### Flat — subtle depth hints

- `0 0 0 1px rgba(255,255,255,0.05)`

### Floating — dropdowns, popovers, modals

- `0 4px 20px -2px rgba(0,0,0,0.4)`
- `0 0 8px rgba(168,85,247,0.08),0 0 20px rgba(168,85,247,0.03)`

### Overlay — full-screen overlays, top-level dialogs

- `0 0 16px rgba(168,85,247,0.15),0 0 40px rgba(168,85,247,0.05)`



---

## 7. Animation & Motion

This project uses **expressive motion**. Animations are an integral part of the experience.

### Framer Motion Patterns

```tsx
// Standard enter animation
<motion.div
  initial={{ opacity: 0, y: 8 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.3, ease: "easeOut" }}
/>

// List stagger
const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } }
}
const item = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0 }
}
```

### CSS Animations

- `@keyframes gradient-shift`
- `@keyframes text-shimmer-move`
- `@keyframes working-shimmer`
- `@keyframes working-dot-pulse`
- `@keyframes working-glow`
- `@keyframes working-border-shift`
- `@keyframes animate-pulse`
- `@keyframes animate-shimmer-fast`

### Animated Components

- **ActivityTimeline**: framer-motion, transition: {duration: 0.25, ease: [0.16, 1, 0.3, 1]}, animate-presence
- **ApiSettings**: framer-motion, animate-presence
- **Cards**: tw-animate-pulse, tw-transitions: duration-300, duration-150
- **Chat**: tw-animate-pulse, tw-transitions: duration-200, duration-300, duration-150
- **ChatContainer**: framer-motion, transition: {duration: 0.55, 
                    ease: [0.16, 1, 0.3, 1]}, animate-presence

### Motion Guidelines

- Duration: 150-300ms for micro-interactions, 300-500ms for page transitions
- Easing: `ease-out` for enters, `ease-in` for exits
- Always respect `prefers-reduced-motion`


---

## 8. Do's and Don'ts

### Do's

- Use `#a855f7` for interactive elements (buttons, links, focus rings)
- Use `#fbfbfa` as the primary page background
- Follow the **5px** spacing grid for all margins, padding, and gaps
- Use the defined shadow tokens for elevation — see Section 6
- Use border-radius from the scale: 4px, 6px, 8px, 12px, 16px
- Reuse existing components from Section 4 before creating new ones
- Use **Lucide** for all icons

### Don'ts

- Don't introduce colors outside this palette — extend the design tokens first
- Don't use arbitrary spacing values — stick to multiples of 5px
- Don't create custom box-shadow values outside the system tokens
- Don't use arbitrary border-radius values — pick from the defined scale
- Don't duplicate component patterns — check Section 4 first
- Don't mix icon libraries — consistency matters
- Don't use backdrop-blur or blur effects

### Anti-Patterns (detected from codebase)

- No blur or backdrop-blur effects
- No zebra striping on tables/lists


---

## 9. Responsive Behavior

No breakpoints detected. Consider adding responsive breakpoints to the design system.

---

## 10. Agent Prompt Guide

Use these as starting points when building new UI:

### Build a Card

```
Background: #e7e5e4
Border: 1px solid #2a2a30
Radius: 8px
Padding: 20px
Font: sans-serif
Use shadow tokens from Section 6.
```

### Build a Button

```
Primary: bg #a855f7, text white
Ghost: bg transparent, border #2a2a30
Padding: 10px 20px
Radius: 8px
Hover: opacity 0.9 or lighter shade
Focus: ring with #a855f7
```

### Build a Page Layout

```
Background: #fbfbfa
Max-width: 1280px, centered
Grid: 5px base
Responsive: mobile-first, breakpoints from Section 9
```

### Build a Stats Card

```
Surface: #e7e5e4
Label: #a1a1aa (muted, 12px, uppercase)
Value: #0e0e11 (primary, 24-32px, bold)
Status: use success/warning/danger from Section 2
```

### Build a Form

```
Input bg: #fbfbfa
Input border: 1px solid #2a2a30
Focus: border-color #a855f7
Label: #a1a1aa 12px
Spacing: 20px between fields
Radius: 8px
```

### General Component

```
1. Read DESIGN.md Sections 2-6 for tokens
2. Colors: only from palette
3. Font: sans-serif, type scale from Section 3
4. Spacing: 5px grid
5. Components: match patterns from Section 4
6. Elevation: shadow tokens
```

