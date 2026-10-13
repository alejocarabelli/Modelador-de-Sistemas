export type ThemeAppearance = 'light' | 'dark';

export type DiagramTheme = {
  id: DiagramThemeId;
  /** Global palette: «Cuaderno» colours each participant by its class; «Índigo y ámbar» uses two colours with one job each. */
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
  /** One identity for every sequence participant (boxes in one colour, activations in the other); without it, each class gets its own family. */
  participants?: {
    headerFill: string;
    headerBorder: string;
    lifelineStroke: string;
    activationFill: string;
    activationBorder: string;
    glyphStroke: string;
  };
  /** Semantic status colors: badges, review items, save state. */
  status: Record<StatusTone, { soft: string; softStrong: string; border: string; borderStrong: string; text: string }>;
};

export type StatusTone = 'danger' | 'warning' | 'success' | 'info' | 'violet';

/** Two palettes, each in two appearances. */
export type DiagramThemeId = 'academic-light' | 'academic-dark' | 'indigo-light' | 'indigo-dark';

export type PaletteId = 'cuaderno' | 'indigo';

export const PALETTES: ReadonlyArray<{ id: PaletteId; name: string; description: string }> = [
  { id: 'indigo', name: 'Índigo y ámbar', description: 'Dos colores, uno por papel' },
  { id: 'cuaderno', name: 'Cuaderno', description: 'Cada clase con su color' },
];

export const isPaletteId = (value: unknown): value is PaletteId => value === 'cuaderno' || value === 'indigo';

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
 * "Índigo y ámbar": dos colores, cada uno con un solo papel. El índigo es el
 * acento de la interfaz y el color de todas las cajas de participantes; el
 * ámbar, el de todas las activaciones, las notas y las condiciones de los
 * fragmentos. Las entidades no cambian de color según su clase.
 */
export const indigoLightTheme: DiagramTheme = {
  ...academicLightTheme,
  id: 'indigo-light',
  palette: 'indigo',
  name: 'Índigo y ámbar',
  description: 'Cajas índigo, activaciones ámbar',
  classNode: { ...academicLightTheme.classNode, borderSelected: '#3B4D8C' },
  parametricNote: {
    ...academicLightTheme.parametricNote,
    background: '#FCF4E3',
    border: '#D7B97A',
    text: '#4A3A1C',
    connectionLine: '#A0712A',
  },
  association: { ...academicLightTheme.association, strokeSelected: '#3B4D8C' },
  handles: { ...academicLightTheme.handles, border: '#3B4D8C' },
  sequence: {
    ...academicLightTheme.sequence,
    strokeSelected: '#3B4D8C',
    lifeline: '#A3A8B8',
    fragmentStroke: '#7F8BB3',
    fragmentFill: '#FAFBFD',
    nestedFragmentFill: '#F3F5FA',
    fragmentTabFill: '#ECEFF8',
    guardFill: '#FBF1DF',
    guardText: '#7A5010',
  },
  participants: {
    headerFill: '#ECEFF8',
    headerBorder: '#4A5B96',
    lifelineStroke: '#A3A8B8',
    activationFill: '#F5E3C1',
    activationBorder: '#A0712A',
    glyphStroke: '#2E3538',
  },
  ui: {
    ...academicLightTheme.ui,
    accent: '#3B4D8C',
    accentStrong: '#2D3C73',
    accentSoft: '#E9ECF7',
    accentSoftStrong: '#DCE1F2',
    accentOutline: '#AEB8DD',
    panelBackground: '#FCFCFE',
    panelSubtleBackground: '#F7F8FB',
    panelMutedBackground: '#F0F1F6',
    panelStrongBackground: '#E4E7EF',
    panelBorder: '#DFE2EA',
    panelText: '#1B2030',
    panelMutedText: '#5D6375',
    toolbarBackground: '#FCFCFE',
    buttonBorder: '#D3D7E2',
    buttonText: '#262B3A',
    buttonActiveBackground: '#3B4D8C',
    inputText: '#1B2030',
    inputBorder: '#D3D7E2',
    panelBorderStrong: '#BEC3D1',
    panelSecondaryText: '#3D4354',
    panelFaintText: '#6A7080',
    panelPlaceholderText: '#9599A8',
    accentBorder: '#6F7DB5',
    accentStrongFill: '#2F3F78',
    appBackground: '#F0F1F5',
    sidebarBackground: '#EBEDF2',
    hoverBackground: '#E4E7EF',
    selectedBackground: '#E1E6F5',
    selectedText: '#2D3C73',
    feedbackBackground: '#1B2030',
    projectTones: ['#3B4D8C', '#3B4D8C', '#3B4D8C', '#3B4D8C', '#3B4D8C', '#3B4D8C', '#3B4D8C'],
  },
};

export const indigoDarkTheme: DiagramTheme = {
  ...academicDarkTheme,
  id: 'indigo-dark',
  palette: 'indigo',
  name: 'Índigo y ámbar de noche',
  description: 'Cajas índigo, activaciones ámbar',
  canvas: { background: '#12141C', gridColor: '#2A2E3A', gridColorStrong: '#3A3F4E', paperLine: '#191C26', paperLineStrong: '#232735' },
  classNode: {
    ...academicDarkTheme.classNode,
    background: '#191C26',
    border: '#9AA0B3',
    borderSelected: '#9AA9E6',
    text: '#DCDFEA',
    mutedText: '#A2A7B8',
    headerText: '#EEF0F7',
    divider: '#30364A',
  },
  parametricNote: {
    ...academicDarkTheme.parametricNote,
    background: '#2A2418',
    border: '#6E5A2C',
    text: '#EDE0C0',
    connectionLine: '#D3A253',
  },
  association: {
    ...academicDarkTheme.association,
    stroke: '#AEB3C4',
    strokeSelected: '#9AA9E6',
    multiplicityText: '#E3E6F0',
    markerStroke: '#AEB3C4',
  },
  handles: { ...academicDarkTheme.handles, background: '#191C26', border: '#9AA9E6' },
  sequence: {
    stroke: '#C9CDDA',
    strokeSelected: '#9AA9E6',
    participantFill: '#1B1E29',
    participantBorder: '#8F99C6',
    text: '#DCDFEA',
    mutedText: '#A2A7B8',
    canvasBackground: '#12141C',
    canvasGrid: '#262A36',
    lifeline: '#4E5568',
    fragmentStroke: '#4E5880',
    fragmentFill: '#151824',
    nestedFragmentFill: '#1A1E2C',
    fragmentTabFill: '#1E2440',
    guardFill: '#2E2516',
    guardText: '#E3B66A',
  },
  participants: {
    headerFill: '#1E2440',
    headerBorder: '#9AA9E6',
    lifelineStroke: '#4E5568',
    activationFill: '#3A2E19',
    activationBorder: '#D3A253',
    glyphStroke: '#C9CDDA',
  },
  ui: {
    ...academicDarkTheme.ui,
    accent: '#9AA9E6',
    accentStrong: '#C9D1F5',
    accentSoft: '#1C2238',
    accentSoftStrong: '#232A45',
    accentOutline: '#3A4677',
    panelBackground: '#181B26',
    panelSubtleBackground: '#1C1F2B',
    panelMutedBackground: '#212534',
    panelStrongBackground: '#2A2F40',
    panelBorder: '#2A2F40',
    panelText: '#E0E3EE',
    panelMutedText: '#9EA4B8',
    toolbarBackground: '#181B26',
    buttonBackground: '#1F2230',
    buttonBorder: '#353B4F',
    buttonText: '#D9DCE8',
    buttonActiveBackground: '#4558A0',
    inputBackground: '#13151E',
    inputText: '#E0E3EE',
    inputBorder: '#353B4F',
    panelBorderStrong: '#454C63',
    panelSecondaryText: '#C3C7D6',
    panelFaintText: '#8A90A3',
    panelPlaceholderText: '#6B7185',
    accentBorder: '#6676B8',
    accentStrongFill: '#3A4C92',
    appBackground: '#10121A',
    sidebarBackground: '#141720',
    hoverBackground: '#1F2230',
    selectedBackground: '#232A45',
    selectedText: '#C9D1F5',
    feedbackBackground: '#2A2F40',
    projectTones: ['#9AA9E6', '#9AA9E6', '#9AA9E6', '#9AA9E6', '#9AA9E6', '#9AA9E6', '#9AA9E6'],
  },
};

export const themes = [academicLightTheme, academicDarkTheme, indigoLightTheme, indigoDarkTheme] as const;

export const DEFAULT_THEME_ID: DiagramThemeId = 'academic-light';

/** Exports are documents: they always render on a light theme; `getExportTheme` picks the palette's. */
export const EXPORT_THEME = academicLightTheme;

export const getThemeById = (themeId: string | null): DiagramTheme =>
  themes.find((theme) => theme.id === themeId) ?? academicLightTheme;

export const getTheme = (palette: PaletteId, appearance: ThemeAppearance): DiagramTheme =>
  themes.find((theme) => theme.palette === palette && theme.appearance === appearance) ?? academicLightTheme;

export const getExportTheme = (palette: PaletteId): DiagramTheme => getTheme(palette, 'light');
