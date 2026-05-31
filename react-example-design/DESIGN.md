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
