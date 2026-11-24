export type FlowTextField = 'actor' | 'system';

export type TextInsertion = {
  caretPosition: number;
  value: string;
};

export type CompletionSuggestion = {
  detail?: string;
  id: string;
  label: string;
  badge?: string;
  apply: (value: string, position: number) => TextInsertion;
};

export type FlowExportOptions = {
  includeDescription: boolean;
  descriptionMode: 'full' | 'brief-and-initial';
  includeBasicFlow: boolean;
  includeAlternatives: boolean;
  selectedAlternativeIds?: string[];
  orientation: 'portrait' | 'landscape';
};

export const DEFAULT_FLOW_EXPORT_OPTIONS: FlowExportOptions = {
  includeDescription: true,
  descriptionMode: 'full',
  includeBasicFlow: true,
  includeAlternatives: true,
  orientation: 'portrait',
};
