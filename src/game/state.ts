export type ToolId = 'hoe' | 'seeds' | 'water' | 'hand';
export type CropStage = 0 | 1 | 2 | 3;

export interface FarmPlotState {
  id: number;
  tilled: boolean;
  planted: boolean;
  watered: boolean;
  stage: CropStage;
  growth: number;
}

export interface TinyLifeSave {
  version: 1;
  day: number;
  minuteOfDay: number;
  money: number;
  inventory: {
    seeds: number;
    turnips: number;
  };
  selectedTool: ToolId;
  player: { x: number; y: number };
  relationships: Record<string, number>;
  talkedToday: Record<string, number>;
  plots: FarmPlotState[];
}

export const SAVE_KEY = 'tiny-life-save-v1';

export function createDefaultPlots(count = 24): FarmPlotState[] {
  return Array.from({ length: count }, (_, id) => ({
    id,
    tilled: false,
    planted: false,
    watered: false,
    stage: 0,
    growth: 0
  }));
}

export function createDefaultSave(): TinyLifeSave {
  return {
    version: 1,
    day: 1,
    minuteOfDay: 7 * 60,
    money: 80,
    inventory: { seeds: 12, turnips: 0 },
    selectedTool: 'hoe',
    player: { x: 740, y: 540 },
    relationships: { Mali: 0 },
    talkedToday: {},
    plots: createDefaultPlots()
  };
}

export function loadSave(): TinyLifeSave {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return createDefaultSave();
    const parsed = JSON.parse(raw) as TinyLifeSave;
    if (parsed.version !== 1 || !Array.isArray(parsed.plots)) return createDefaultSave();
    return parsed;
  } catch {
    return createDefaultSave();
  }
}

export function writeSave(save: TinyLifeSave): void {
  localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  const chip = document.getElementById('save-status');
  if (chip) {
    chip.textContent = 'Saved just now';
    window.setTimeout(() => { chip.textContent = 'Autosave active'; }, 1600);
  }
}
