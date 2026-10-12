# DESIGN.md — Modelador de Sistemas 2.0

The design system of the 2.0 redesign ("Cuaderno técnico"). It replaces the v1
document; `REDISENO-V2.md` records what changed and why.

## What this is

A desktop modelling tool for the *Diseño de Sistemas* course: projects hold use
case models, flows of events, sequence diagrams, class diagrams and "clases de
secuencias". It ships as a macOS app (WKWebView) and works offline.

The product's output is paper: diagrams and specifications handed in as PDF or
Word. The interface is built around that — **the document is the brightest,
sharpest thing on screen, and the chrome is quieter paper around it.**

## Visual world: Cuaderno técnico

Ink on paper with one petrol accent.

- **Canvas** is a white sheet (`#FFFFFF`). Class diagrams sit on millimetre
  paper: a faint grey line every 20px and a stronger one every 100px.
- **Classes ("lámina técnica")** are ink boxes in three equal compartments:
  1.5px ink border and rules, 2px corners, no shadow — the same look the PDF
  export produces. The name is centred in Plex Sans Condensed; members read as
  a table (visibility · name · type pushed right in grey). A group colour only
  tints the header; without one the header stays white.
- **Relations** share the line weight (1.5px). The line stops exactly at the
  base of a hollow triangle or diamond, and runs to the tip of an open arrow.
  Multiplicities are knocked out of the paper without a frame; relation names
  are italic.
- **Chrome** (sidebar, toolbar, inspector) is a neutral, barely cool grey, so
  the canvas always reads as the lightest plane.
- **Petrol** (`#1C6570`) is the only accent: primary actions, selection, focus,
  the current item. In the document it marks only member types that name
  another class of the diagram.
- **Dark mode is "Pizarra"**: light ink on warm graphite, the same accent lifted
  to `#63B7BC`. Not an inverted grey.
- **Two palettes, picked once.** «Cuaderno» gives each sequence participant a
  colour family by class, and tints groups and notes. «Índigo y ámbar» uses two
  colours with one job each: indigo is the interface accent and every
  participant box; amber is every activation, the note paper and fragment
  guards. Groups keep a third of their hue over the class ink, and notes keep a
  trace of their colour on the amber paper. The palette is global
  (`modelador.palette`), chosen in `PaletteWelcomeDialog` on first launch
  (Índigo y ámbar preselected, the choice previews live on the app) and changed
  later under Apariencia › Paleta. The shell carries `data-palette` and
  `data-appearance`; stylesheets select on those, never on a theme id.

## Type

IBM Plex, bundled with the app (`@fontsource/ibm-plex-sans`, `…-sans-condensed`,
`…-mono`), so it
renders the same on every Mac and in every export.

| Token | Size | Use |
|---|---|---|
| `--text-2xs` | 10.5px | counters, key caps, eyebrow labels (mono, uppercase) |
| `--text-xs` | 11.5px | meta, save state, hints |
| `--text-sm` | 12.5px | field labels, secondary lines |
| `--text-md` | 13px | **default**: every control, menu item and body text |
| `--text-lg` | 15px | dialog and empty-state titles |
| `--text-xl` | 19px | section titles (flow) |
| `--text-2xl` | 26px | page title (home) |

- **Plex Sans** for the interface. Weights 400, 500 (controls), 600 (titles).
- **Plex Sans Condensed** 600 for class names on the canvas.
- Class members (attributes, methods) are **Plex Sans** 12.75px with tabular
  figures: at that size it reads better than mono and long names stay short.
- **Plex Mono** for the rest of what is code: message signatures, key caps,
  eyebrow labels.
- Controls never inherit the page size: `button`, `input`, `select`,
  `textarea` and `summary` are set to `--text-md` at element level.

## Colour

All colours are tokens produced by `useTheme()` from `src/theme/themes.ts` and
set as CSS variables on `.app-shell`. Stylesheets never hard-code a colour
(`src/theme/themes.test.ts` fails if a stylesheet reads a variable the themes
do not define, and checks text contrast in both themes).

| Role | Tokens |
|---|---|
| Planes | `--ui-app-background` < `--ui-sidebar-background` < `--panel-background` (chrome) · `--canvas-background` (document) |
| Surfaces on a panel | `--panel-subtle-background`, `--panel-muted-background`, `--panel-strong-background` |
| Lines | `--panel-border`, `--panel-border-strong`, `--button-border`, `--input-border` |
| Text | `--panel-text` > `--panel-secondary-text` > `--panel-muted-text` > `--panel-faint-text` > `--panel-placeholder-text` |
| Accent | `--accent` (text, icons), `--button-active-background` (fills), `--accent-strong-fill` (pressed), `--accent-soft(-strong)` (tints), `--accent-outline`, `--accent-border` |
| State | `--ui-hover-background`, `--ui-selected-background`, `--ui-selected-text` |
| Status | `--status-{danger,warning,success,info,violet}-{soft,soft-strong,border,border-strong,text}` |
| Document | `--class-*`, `--association-*`, `--note-*`, and `theme.sequence.*` for the SVG sequence canvas |

Exports always use the light theme of the current palette (`getExportTheme`), whatever the screen shows.

## Space, shape, elevation, motion

- **Space**: 4px grid — `--space-1…8` = 4, 8, 12, 16, 20, 24, 32px.
- **Radii**: sharp like paper. `--radius-xs` 3px (chips, class boxes),
  `--radius-sm` 5px (controls, fields), `--radius-md` 7px (menus, floating
  panels), `--radius-lg` 10px (dialogs, cards), `--radius-pill`.
- **Controls**: `--control-sm` 26px (canvas zoom), `--control-md` 30px (toolbar,
  fields, menu items), `--control-lg` 34px (dialog and card buttons). Every
  target is ≥24×24px.
- **Elevation**: ink-tinted shadows only on things that float —
  `--shadow-1` (zoom control), `--shadow-popover` (menus, cards),
  `--shadow-dialog`. Panels are separated by lines, not shadows.
- **Motion**: `--duration-fast` 120ms (hover, press), `--duration` 180ms (menus,
  toasts), `--duration-slow` 260ms (dialogs, empty-state cards), all on
  `--ease-out`. Menus pop in, cards rise in, nothing bounces. Transitions list
  their properties; never `transition: all`.

## Components

Shared React components live in `src/components/ui/`; their styles in
`src/design/system.css`. **The same control looks and behaves the same in every
editor.**

### Editor toolbar — `EditorToolbar`

One bar, three zones, identical order in all five editors:

1. **Start** — save state (a check
   that expands to "Guardado" on hover; "Guardando…" and errors stay expanded),
   Deshacer, Rehacer.
2. **Create** — the editor's own tools. The most common creation is the one
   filled primary button (`ToolButton variant="primary"`): *Clase*, *Mensaje*,
   *Caso de uso*. Secondary creations are icon buttons or one menu.
3. **End** — `NotebookButton` (Apuntes) · `ReviewButton` (where the editor
   can check its work) · `Vista ▾` (everything that changes how the document is
   shown) · `Exportar ▾` (only the formats of this artifact).

Project-level actions (export/import the whole project as JSON) are not in the
editor toolbar: they live in the project menu and on the home screen.

### Artifact tabs — `ArtifactTabs`

A shared 36px row above the editor toolbar identifies the project and its open
artifacts. The project label is muted and truncates at 22ch. Tabs are 28px high,
200px wide, shrinking to 112px before the list scrolls. The selected tab shares
the toolbar background and joins it without a bottom rule; inactive tabs sit
on the sidebar chrome. Each carries its artifact icon, name and close button.
Overflow uses directional 24px masks and a menu of all open tabs. The artifact
name remains the view's single, visually hidden `h1`.

Open order is a UI preference per project, outside the exported model. Opening
inserts beside the current tab; closing selects the next neighbor. Tabs support
pointer reordering, middle-click closing and keyboard navigation. Viewports,
zoom and scroll positions stay in memory for the session.

### Apuntes — `NotebookButton` / `NotebookSheet`

Every artifact has a private notebook (notes, questions, a sketch) that lives
beside the artifact, outside its content: it never enters the undo history or
the review, and the read-only window does not show it. `NotebookButton` is the first
control of the toolbar's end zone, in all editors: a labelled tool with the
`NotebookPen` icon, `aria-pressed`, and the tooltip «Apuntes (⇧⌘E)» (Ctrl+Mayús+E
off Mac). Its counter is the artifact's open questions, in the neutral
`.v2-count` style on purpose — a doubt is not an error, so it never takes the
warning tone of Revisar — and it disappears at zero.

`NotebookSheet` is rendered once, by `App`, in `.artifact-workspace` next to the
editor panel: a 280–520px column (340 by default, resizable, remembered)
separated by a 1px `--panel-border` line. The open/closed state and the width
are global, so the sheet stays open while switching tabs and shows each
artifact's own notes. The shortcut toggles it from anywhere and moves focus into
the sheet; closing returns focus to the canvas (`data-editor-canvas`). Esc
inside the sheet returns focus to the canvas and leaves it open. Key events
inside `[data-notebook]` never reach the editors' global handlers
(`isNotebookEvent`), so ⌘Z, Backspace or letters act on the notes, not on the
diagram.

### Sidebar — project sections

Under Inicio the expanded sidebar is two VS Code–style panes (`SidebarPane`,
labelled regions with an `h2`). **The open project** is the first and never folds,
so its artifacts are always in view: its name as the eyebrow title (mono, uppercase,
`--text-2xs`, in `--panel-text`, ellipsis, full name in the tooltip), then its
artifacts behind a 1px `--panel-border` tree guide. Its `+` (Nuevo artefacto) and
`···` (project options) show on header hover or focus, stay in the tab order and
stay visible while their menu is open. **Otros proyectos** is the second: every
other project by `updatedAt` descending, folder icon, name, relative date (which
gives way to the row's `···` on hover), a count pill, `+` Nuevo proyecto, and a
«Filtrar proyectos» field (accent- and case-insensitive, Esc clears) once the list
has more than 6. It is the only pane that folds (`<button aria-expanded
aria-controls>`); it starts folded, its header at the foot of the nav, and the
fold state is a UI preference. With both open they share the nav's height: the project keeps
its content height up to 60%, each pane scrolls on its own, and a `role="separator"`
sash (1px line, 7px hit area, `--accent` 2px on hover, drag or focus; ↑/↓ resize,
Home/End to the limits, double click back to automatic) moves the split, remembered
as a share of the height and never leaving a pane under header + 3 rows. With no
project open (Inicio) there is a single, always open «Proyectos» pane.

### Tool buttons — `ToolButton`

30px high, transparent until hovered, 5px radius, 16px Lucide icon. Icon-only
buttons carry the label as `aria-label` and tooltip (with the shortcut when
there is one). `pressed` shows the accent tint; `variant="primary"` is the one
filled button per toolbar.

### Menus — `ToolMenu`, `MenuItem`, `MenuLabel`, `MenuSeparator`, `MenuField`

A native `<details>` (keyboard and VoiceOver for free) with a popover panel:
only one menu open in the window, closes on outside click, Escape (focus back
to the trigger) and after choosing an item. Items are 30px rows with a 16px
icon column; toggles use `role="menuitemcheckbox"` and a check mark; sections
use mono uppercase labels. Canvas context menus and the sidebar's floating
menus share the same panel and item styles.

### Inspector — `InspectorPanel`, `InspectorDeleteButton`, `PanelSection`

Every editor's right-hand panel. A fixed 56px header — fold · kind · name ·
delete — over a scrolling body; folded it is a 44px rail with only the fold
button. The kind is a mono uppercase label with a tone dot (accent for the
main element, status tones for message kinds, violet fragments, amber notes).
Field labels inside are sentence case (`--text-sm`, secondary text); section
titles are `--text-md` 600. Collapsible sections are native `<details>` with a
thin chevron, closed by default. Native selects keep the system menu but draw
a thin chevron in the muted text colour.

### Canvas zoom — `CanvasZoom`

The only zoom control: bottom-left of every canvas, `− 100% + | ⤢`. The
percentage appears where the editor knows it and resets to 100% on click.

### Empty states

One card centred on the empty canvas: a title that says what to start with, one
sentence, and the actions to do it. Rises in over 260ms.

### Dialogs, toasts

Dialogs are paper cards (`--radius-lg`, `--shadow-dialog`) over a blurred ink
scrim; primary action on the right. Toasts are ink pills at the bottom.

## Layout contracts

1. **Toolbars never overflow.** The start zone shrinks
   before the create and end zones do; labels in the create zone collapse to
   icons at narrow widths. Every collapsible label has an `aria-label` and a
   tooltip on its control, so collapsing costs no accessible name.
2. **The canvas is never a residual column.** Side panels collapse before the
   canvas drops under 480px. The Apuntes sheet pushes the editor only while
   the editor stays at least as wide as in the narrowest supported window
   (900px − the 240px sidebar = 660px), where every editor and its panels
   already work. Below that it floats over the right edge, under the toolbar,
   with `--shadow-popover`, and pushes nothing.

## Accessibility contract

- Every control has a programmatic label; one `h1` per view (the artifact
  name); panel titles are `h2`.
- Focus is always visible: a 2px accent ring with a 2px paper gap
  (`--focus-ring`), including on React Flow nodes.
- Targets ≥24×24 CSS px (WCAG 2.2 SC 2.5.8).
- Body text meets 4.5:1 in both themes; `themes.test.ts` checks the key pairs.
- No `window.confirm/alert/prompt`: destructive actions go through
  `useDialogs().confirm()`; the dialog portals into `.app-shell`, focus lands on
  *Cancelar*.
- Reduced motion removes travel, not feedback: pop-in and rise-in animations
  are dropped, colour and opacity transitions stay. Never a blanket kill.
- All UI copy is Spanish, including third-party controls.

## Performance contract

- Editors are route-split via `React.lazy`; `jspdf`, `svg2pdf` and
  `html-to-image` load only when an export runs.
- `SequenceDiagramCanvas` is memoised; pointer drags measure once at
  pointerdown and coalesce to one `requestAnimationFrame`.
- `src/utils/sequenceDiagramPerformance.test.tsx` guards layout cost at 120
  messages / 20 participants.

## Deliberately absent

- **More themes.** One language in two appearances (Cuaderno, Pizarra).
- **Mobile.** A desktop tool; narrow windows (down to ~900px, the macOS
  minimum) must work, phones are a courtesy.
