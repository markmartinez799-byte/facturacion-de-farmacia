import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CompanySettings, NCFSequence, NCFType } from '@/types';

const DEFAULT_SEQ: NCFSequence[] = [
  { type: 'B02', label: 'Consumidor Final', prefix: 'B02', lastNumber: 0, limit: 9999999, isActive: true },
  { type: 'B01', label: 'Crédito Fiscal', prefix: 'B01', lastNumber: 0, limit: 9999999, isActive: true },
  { type: 'B14', label: 'Gubernamental', prefix: 'B14', lastNumber: 0, limit: 9999999, isActive: true },
  { type: 'B15', label: 'Exportaciones', prefix: 'B15', lastNumber: 0, limit: 9999999, isActive: true },
];

export interface BackupSettings {
  enabled: boolean;
  frequency: 'daily' | 'weekly';
  lastBackupDate: string | null;
}

export type PrintMode = 'auto' | 'ask' | 'never';

export interface PrinterSettings {
  printerName: string;
  printerType: '58mm' | '80mm' | 'A4';
  copies: number;
  autoPrint: boolean;
  printLogo: boolean;
  printFooter: boolean;
  footerText: string;
  fontSize: 'small' | 'medium' | 'large';
  printMode: PrintMode;
}

const DEFAULT_PRINTER: PrinterSettings = {
  printerName: '',
  printerType: '80mm',
  copies: 1,
  autoPrint: false,
  printLogo: true,
  printFooter: true,
  footerText: 'Gracias por su compra. ¡Vuelva pronto!',
  fontSize: 'medium',
  printMode: 'auto',
};

const DEFAULT_BACKUP: BackupSettings = {
  enabled: false,
  frequency: 'daily',
  lastBackupDate: null,
};

interface AppState {
  isDarkMode: boolean;
  isSoundEnabled: boolean;
  settings: CompanySettings;
  ncfSequences: NCFSequence[];
  printerSettings: PrinterSettings;
  backupSettings: BackupSettings;
  toggleDarkMode: () => void;
  toggleSound: () => void;
  updateSettings: (updates: Partial<CompanySettings>) => void;
  updateNCFSequence: (type: NCFType, updates: Partial<NCFSequence>) => void;
  nextNCF: (type: NCFType) => string;
  updatePrinterSettings: (updates: Partial<PrinterSettings>) => void;
  updateBackupSettings: (updates: Partial<BackupSettings>) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      isDarkMode: false,
      isSoundEnabled: true,
      printerSettings: DEFAULT_PRINTER,
      backupSettings: DEFAULT_BACKUP,
      settings: {
        name: 'Farmacia GENOSAN',
        rnc: '1-01-00000-0',
        address: 'Av. 27 de Febrero #48, Santiago de los Caballeros',
        phone: '809-555-1001',
        logo: 'https://public.readdy.ai/ai/img_res/d0d3026a-1720-4eff-93a8-50eeb3e4d3db.png',
        printFormat: '80mm',
        email: 'info@genosan.com.do',
        website: 'www.genosan.com.do',
      },
      ncfSequences: DEFAULT_SEQ,
      toggleDarkMode: () => set((s) => ({ isDarkMode: !s.isDarkMode })),
      toggleSound: () => set((s) => ({ isSoundEnabled: !s.isSoundEnabled })),
      updateSettings: (updates) => set((s) => ({ settings: { ...s.settings, ...updates } })),
      updateNCFSequence: (type, updates) =>
        set((s) => ({ ncfSequences: s.ncfSequences.map((sq) => sq.type === type ? { ...sq, ...updates } : sq) })),
      updatePrinterSettings: (updates) =>
        set((s) => ({ printerSettings: { ...s.printerSettings, ...updates } })),
      updateBackupSettings: (updates) =>
        set((s) => ({ backupSettings: { ...s.backupSettings, ...updates } })),
      nextNCF: (type) => {
        const seq = get().ncfSequences.find((s) => s.type === type);
        if (!seq) return 'B0200000001';
        const next = seq.lastNumber + 1;
        set((s) => ({ ncfSequences: s.ncfSequences.map((sq) => sq.type === type ? { ...sq, lastNumber: next } : sq) }));
        return `${seq.prefix}${String(next).padStart(8, '0')}`;
      },
    }),
    { name: 'genosan-app' }
  )
);