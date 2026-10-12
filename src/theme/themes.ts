export type ThemeAppearance = 'light' | 'dark';

export type DiagramTheme = {
  id: DiagramThemeId;
  /** Global palette: «Cuaderno» colors participants, groups and notes; «Grafito» keeps the document in ink. */
  palette: PaletteId;
  name: string;
  description: string;
  appearance: ThemeAppearance;
  canvas: {
    background: string;
    gridColor: string;
    gridColorStrong: string;
    /** Millimetre paper under class diagrams: a fine line every 20px, a stronger one every 100px. */
    paperLine: string;
    paperLineStrong: string;
  };
  classNode: {
    background: string;
    border: string;
    borderSelected: string;
    text: string;
    mutedText: string;
    headerText: string;
    divider: string;
    shadow: string;
    borderRadius: string;
    borderWidth: string;
  };
  parametricNote: {
    background: string;
    border: string;
    text: string;
    connectionLine: string;
    connectionDash: string;
    borderRadius: string;
  };
  association: {
    stroke: string;
    strokeSelected: string;
    strokeWidth: number;
    multiplicityText: string;
    markerStroke: string;
    markerFill: string;
  };
  handles: {
    background: string;
    border: string;
    size: number;
  };
  typography: {
    fontFamily: string;
    codeFontFamily: string;
    classNameSize: string;
    attributeSize: string;
    multiplicitySize: string;
    noteSize: string;
    fontWeightClassName: number;
    fontWeightNormal: number;
  };
  /** Sequence canvas ink. These used to be hardcoded in the component behind a
      flag that was always true, which kept a whole warm palette out of the
      system and out of this file. Every hue here sits in the app's cool band. */
  sequence: {
    stroke: string;
    strokeSelected: string;
    participantFill: string;
    participantBorder: string;
    text: string;
    mutedText: string;
    canvasBackground: string;
    canvasGrid: string;
    lifeline: string;
    fragmentStroke: string;
    fragmentFill: string;
    nestedFragmentFill: string;
    fragmentTabFill: string;
    guardFill: string;
    guardText: string;
  };
  ui: {
    accent: string;
    /** Accent ramp: pressed state, two tints for hover/active chrome, and a hairline. */
    accentStrong: string;
    accentSoft: string;
    accentSoftStrong: string;
    accentOutline: string;
    warningText: string;
    panelBackground: string;
    /** Three named fills for surfaces that sit on the panel, lightest first. */
    panelSubtleBackground: string;
    panelMutedBackground: string;
    panelStrongBackground: string;
    panelBorder: string;
    panelText: string;
    panelMutedText: string;
    toolbarBackground: string;
    buttonBackground: string;
    buttonBorder: string;
    buttonText: string;
    buttonActiveBackground: string;
    buttonActiveText: string;
    inputBackground: string;
    inputText: string;
    inputBorder: string;
    /** Extra neutral steps between the panel border and the text ramp. */
    panelBorderStrong: string;
    panelSecondaryText: string;
    panelFaintText: string;
    panelPlaceholderText: string;
    /** Focus borders and the solid fill behind white text on hover. */
    accentBorder: string;
    accentStrongFill: string;
    /** Application chrome around the editors. */
    appBackground: string;
    sidebarBackground: string;
    hoverBackground: string;
    selectedBackground: string;
    selectedText: string;
    danger: string;
    feedbackBackground: string;
    projectTones: readonly [string, string, string, string, string, string, string];
  };
  /** Semantic status colors: badges, review items, save state. */
  status: Record<StatusTone, { soft: string; softStrong: string; border: string; borderStrong: string; text: string }>;
};

export type StatusTone = 'danger' | 'warning' | 'success' | 'info' | 'violet';

/** Two palettes, each in two appearances. */
export type DiagramThemeId = 'academic-light' | 'academic-dark' | 'grafito-light' | 'grafito-dark';

export type PaletteId = 'cuaderno' | 'grafito';

export const PALETTES: ReadonlyArray<{ id: PaletteId; name: string; description: string }> = [
  { id: 'grafito', name: 'Grafito', description: 'Tinta y grises, un solo acento' },
  { id: 'cuaderno', name: 'Cuaderno', description: 'Cada clase con su color' },
];

export const isPaletteId = (value: unknown): value is PaletteId => value === 'cuaderno' || value === 'grafito';

/**
 * "Cuaderno técnico": tinta sobre papel con acento petróleo. El documento
 * (lienzo, clases, líneas) se lee como UML impreso sobre hoja blanca; el chrome
 * es gris neutro apenas frío, para que el diagrama siempre sea lo más claro.
 */
export const academicLightTheme: DiagramTheme = {
  id: 'academic-light',
  palette: 'cuaderno',
  name: 'Cuaderno',
  description: 'Tinta sobre papel, acento petróleo',
  appearance: 'light',
  canvas: { background: '#FFFFFF', gridColor: '#DADDE0', gridColorStrong: '#C5CACE', paperLine: '#F0F2F3', paperLineStrong: '#E2E5E8' },
  classNode: {
    background: '#FFFFFF',
    border: '#3B4347',
    borderSelected: '#1C6570',
    text: '#273034',
    mutedText: '#5F6668',
    headerText: '#1C2326',
    divider: '#D9DCDF',
    shadow: '3px 3px 0 rgba(28, 35, 38, 0.07)',
    borderRadius: '3px',
    borderWidth: '1px',
  },
  parametricNote: {
    background: '#FFFBEA',
    border: '#CDBB7E',
    text: '#3A3320',
    connectionLine: '#8F7F48',
    connectionDash: '4 4',
    borderRadius: '3px',
  },
  association: {
    stroke: '#3B4347',
    strokeSelected: '#1C6570',
    strokeWidth: 1.5,
    multiplicityText: '#1C2326',
    markerStroke: '#3B4347',
    markerFill: 'none',
  },
  handles: { background: '#FFFFFF', border: '#1C6570', size: 8 },
  typography: {
    fontFamily: '"IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif',
    codeFontFamily: '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
    classNameSize: '13.5px',
    attributeSize: '12px',
    multiplicitySize: '12px',
    noteSize: '12.5px',
    fontWeightClassName: 600,
    fontWeightNormal: 400,
  },
  sequence: {
    stroke: '#2E3538',
    strokeSelected: '#1C6570',
    participantFill: '#FFFFFF',
    participantBorder: '#5F6668',
    text: '#273034',
    mutedText: '#5F6668',
    canvasBackground: '#FFFFFF',
    canvasGrid: '#E3E6E9',
    lifeline: '#8A8F8F',
    fragmentStroke: '#5F6668',
    fragmentFill: '#F8F9FA',
    nestedFragmentFill: '#F1F3F5',
    fragmentTabFill: '#F3F5F7',
    guardFill: '#EDF4F3',
    guardText: '#134A52',
  },
  ui: {
    accent: '#1C6570',
    accentStrong: '#134A52',
    accentSoft: '#E8F1F0',
    accentSoftStrong: '#DCEAE8',
    accentOutline: '#A9C8C6',
    warningText: '#8A5A12',
    panelBackground: '#FCFCFD',
    panelSubtleBackground: '#F7F8F9',
    panelMutedBackground: '#F0F2F3',
    panelStrongBackground: '#E5E8EA',
    panelBorder: '#E1E4E7',
    panelText: '#1C2326',
    panelMutedText: '#5F6668',
    toolbarBackground: '#FCFCFD',
    buttonBackground: '#FFFFFF',
    buttonBorder: '#D3D7DB',
    buttonText: '#273034',
    buttonActiveBackground: '#1C6570',
    buttonActiveText: '#FFFFFF',
    inputBackground: '#FFFFFF',
    inputText: '#1C2326',
    inputBorder: '#D3D7DB',
    panelBorderStrong: '#BEC4C9',
    panelSecondaryText: '#3D4548',
    panelFaintText: '#6B7173',
    panelPlaceholderText: '#959A9E',
    accentBorder: '#5E9A9F',
    accentStrongFill: '#155059',
    appBackground: '#F1F2F4',
    sidebarBackground: '#EDEEF0',
    hoverBackground: '#E5E8EB',
    selectedBackground: '#DFEAE8',
    selectedText: '#134A52',
    danger: '#A8392F',
    feedbackBackground: '#1C2326',
    projectTones: ['#55728F', '#4C7A7A', '#60785C', '#887550', '#70688D', '#886876', '#5E6A73'],
  },
  status: {
    danger: { soft: '#FCF0EE', softStrong: '#F8E0DC', border: '#EDB5AD', borderStrong: '#D9776B', text: '#A12F25' },
    warning: { soft: '#FDF6E7', softStrong: '#FAEBC8', border: '#E8CE8F', borderStrong: '#C9962F', text: '#8A5A12' },
    success: { soft: '#EEF6F0', softStrong: '#DCEEE1', border: '#B3D7BD', borderStrong: '#4F8A62', text: '#2D6B40' },
    info: { soft: '#EBF3F6', softStrong: '#DAEAF0', border: '#AFCFDB', borderStrong: '#5A93A8', text: '#1F5E75' },
    violet: { soft: '#F3F0F8', softStrong: '#E7E0F2', border: '#CDC0E2', borderStrong: '#8F79B8', text: '#5E4691' },
  },
};

/** "Pizarra": el mismo cuaderno de noche, tinta clara sobre grafito cálido. */
export const academicDarkTheme: DiagramTheme = {
  ...academicLightTheme,
  id: 'academic-dark',
  name: 'Pizarra',
  description: 'Tinta clara sobre grafito, acento petróleo',
  appearance: 'dark',
  canvas: { background: '#131617', gridColor: '#2A3031', gridColorStrong: '#3B4344', paperLine: '#1B1F20', paperLineStrong: '#252B2C' },
  classNode: {
    ...academicLightTheme.classNode,
    background: '#1B1F20',
    border: '#8D9695',
    borderSelected: '#63B7BC',
    text: '#DCD8CE',
    mutedText: '#A2A6A2',
    headerText: '#EFEBE1',
    divider: '#353C3D',
    shadow: '3px 3px 0 rgba(0, 0, 0, 0.35)',
  },
  parametricNote: {
    ...academicLightTheme.parametricNote,
    background: '#27241A',
    border: '#6D6138',
    text: '#EDE3C4',
    connectionLine: '#A8965C',
  },
  association: {
    ...academicLightTheme.association,
    stroke: '#A9B1AF',
    strokeSelected: '#63B7BC',
    multiplicityText: '#E6E2D8',
    markerStroke: '#A9B1AF',
  },
  handles: { ...academicLightTheme.handles, background: '#1B1F20', border: '#63B7BC' },
  sequence: {
    stroke: '#C3C8C4',
    strokeSelected: '#63B7BC',
    participantFill: '#1D2122',
    participantBorder: '#6E7776',
    text: '#DCD8CE',
    mutedText: '#A2A6A2',
    canvasBackground: '#131617',
    canvasGrid: '#262B2C',
    lifeline: '#6E7776',
    fragmentStroke: '#7F8786',
    fragmentFill: '#1B2021',
    nestedFragmentFill: '#222829',
    fragmentTabFill: '#2A3031',
    guardFill: '#1D3134',
    guardText: '#A9D8DA',
  },
  ui: {
    accent: '#63B7BC',
    accentStrong: '#A1D6D8',
    accentSoft: '#172A2C',
    accentSoftStrong: '#1C3336',
    accentOutline: '#2F5A5E',
    warningText: '#E3B66A',
    panelBackground: '#1B1F20',
    panelSubtleBackground: '#1F2425',
    panelMutedBackground: '#252A2B',
    panelStrongBackground: '#2E3435',
    panelBorder: '#2F3637',
    panelText: '#E6E2D8',
    panelMutedText: '#A3A7A2',
    toolbarBackground: '#1B1F20',
    buttonBackground: '#232829',
    buttonBorder: '#3A4243',
    buttonText: '#DEDACF',
    buttonActiveBackground: '#23757D',
    buttonActiveText: '#FFFFFF',
    inputBackground: '#161A1B',
    inputText: '#E6E2D8',
    inputBorder: '#3A4243',
    panelBorderStrong: '#4A5354',
    panelSecondaryText: '#C8C4BA',
    panelFaintText: '#8D918D',
    panelPlaceholderText: '#6E7472',
    accentBorder: '#4B9096',
    accentStrongFill: '#1C636A',
    appBackground: '#111415',
    sidebarBackground: '#151919',
    hoverBackground: '#232829',
    selectedBackground: '#1C3336',
    selectedText: '#A9DADC',
    danger: '#E48A7F',
    feedbackBackground: '#2E3435',
    projectTones: ['#86AACF', '#7AB4B2', '#96B28A', '#CCAE79', '#AB9CCD', '#CC9CAD', '#929EA8'],
  },
  status: {
    danger: { soft: '#35201D', softStrong: '#442622', border: '#6E3B34', borderStrong: '#B35C50', text: '#F0A89E' },
    warning: { soft: '#31291A', softStrong: '#42361D', border: '#6E5A2C', borderStrong: '#B88A34', text: '#EBC47E' },
    success: { soft: '#1B2D22', softStrong: '#213A2A', border: '#2F5A3C', borderStrong: '#4F8A62', text: '#98D4AA' },
    info: { soft: '#172A31', softStrong: '#1C343D', border: '#2C5463', borderStrong: '#4E8CA1', text: '#96CADA' },
    violet: { soft: '#282238', softStrong: '#322A47', border: '#4A3F6B', borderStrong: '#7D6AAE', text: '#C6B6EC' },
  },
};

/**
 * "Grafito": el mismo cuaderno con el color reservado a lo que significa algo.
 * El documento queda en tinta y grises (los participantes no toman un color por
 * clase, los grupos y las notas se apagan hacia el gris); el petróleo sigue
 * siendo el único acento, para la selección y la acción principal.
 */
export const grafitoLightTheme: DiagramTheme = {
  ...academicLightTheme,
  id: 'grafito-light',
  palette: 'grafito',
  name: 'Grafito',
  description: 'Tinta y grises, acento petróleo',
  parametricNote: {
    ...academicLightTheme.parametricNote,
    background: '#F5F5F2',
    border: '#BABDB8',
    text: '#3A3F41',
    connectionLine: '#8C918F',
  },
  sequence: {
    ...academicLightTheme.sequence,
    stroke: '#23292C',
    participantBorder: '#2B3134',
    text: '#23292C',
    mutedText: '#61686B',
    lifeline: '#A3A8AB',
    fragmentStroke: '#8C9295',
    fragmentFill: '#FAFAFB',
    nestedFragmentFill: '#F3F4F5',
    fragmentTabFill: '#F0F1F2',
    guardFill: '#F0F1F2',
    guardText: '#3D4548',
  },
  ui: {
    ...academicLightTheme.ui,
    selectedBackground: '#E3E8E9',
    selectedText: '#163F45',
    projectTones: ['#5E6A73', '#56626A', '#66717A', '#4F5A61', '#6B757D', '#5A656D', '#626C74'],
  },
};

export const grafitoDarkTheme: DiagramTheme = {
  ...academicDarkTheme,
  id: 'grafito-dark',
  palette: 'grafito',
  name: 'Grafito de noche',
  description: 'Tinta clara y grises, acento petróleo',
  parametricNote: {
    ...academicDarkTheme.parametricNote,
    background: '#222526',
    border: '#4A4F50',
    text: '#D6D8D4',
    connectionLine: '#7A807E',
  },
  sequence: {
    ...academicDarkTheme.sequence,
    stroke: '#D9DCDB',
    participantBorder: '#C9CDCB',
    text: '#D9DCDB',
    mutedText: '#9BA19F',
    lifeline: '#5E6566',
    fragmentStroke: '#6C7374',
    fragmentFill: '#181B1C',
    nestedFragmentFill: '#1E2223',
    fragmentTabFill: '#242829',
    guardFill: '#242829',
    guardText: '#C3C8C6',
  },
  ui: {
    ...academicDarkTheme.ui,
    selectedBackground: '#262C2D',
    selectedText: '#CFE6E7',
    projectTones: ['#929EA8', '#8A969F', '#9AA5AE', '#848F98', '#A0AAB2', '#8E99A2', '#96A1AA'],
  },
};

export const themes = [academicLightTheme, academicDarkTheme, grafitoLightTheme, grafitoDarkTheme] as const;

export const DEFAULT_THEME_ID: DiagramThemeId = 'academic-light';

/** Exports are documents: they always render on a light theme; `getExportTheme` picks the palette's. */
export const EXPORT_THEME = academicLightTheme;

export const getThemeById = (themeId: string | null): DiagramTheme =>
  themes.find((theme) => theme.id === themeId) ?? academicLightTheme;

export const getTheme = (palette: PaletteId, appearance: ThemeAppearance): DiagramTheme =>
  themes.find((theme) => theme.palette === palette && theme.appearance === appearance) ?? academicLightTheme;

export const getExportTheme = (palette: PaletteId): DiagramTheme => getTheme(palette, 'light');
