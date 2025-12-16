
export interface User {
  user_id: string;
  email: string;
  name: string;
}

export interface Transaction {
  transaction_id: string;
  user_id: string;
  date: string;
  description: string;
  amount: number;
  category: string;
  notes?: string;
  source_file?: string;
  type?: 'income' | 'expense';
}

export interface RecurringTransaction {
  id: string;
  user_id: string;
  description: string;
  amount: number;
  category: string;
  type: 'income' | 'expense';
  frequency: 'daily' | 'weekly' | 'bi-weekly' | 'monthly' | 'quarterly' | 'annually';
  startDate: string;
  endDate?: string;
}

export interface Rule {
  rule_id: string;
  user_id: string;
  keyword: string;
  category: string;
}

export interface Category {
  category_id: string;
  user_id: string;
  name: string;
  budget?: number;
}

export interface AppSettings {
  sheetUrl: string;
}

export type LinkedCategoryEntry = string | {
  name: string;
  cap?: number;
  period?: 'monthly' | 'quarterly' | 'yearly' | 'lifetime';
};

export interface BalanceSheetItem {
  id: string;
  name: string;
  value: number; // Used for Manual Mode
  type: 'asset' | 'liability';
  category?: 'cash' | 'property' | 'investment' | 'debt' | 'other';
  
  // Dynamic Calculation Fields
  isCalculated?: boolean;
  initialValue?: number; // Starting value at t=0
  linkedCategories?: LinkedCategoryEntry[]; // Transactions with these categories affect this item
  linkedKeywords?: string; // Comma-separated keywords to filter transactions further
  maxValue?: number; // Global Cap/Limit on the calculated value
}

export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  mode: 'local' | 'cloud';
}

export enum ViewState {
  DASHBOARD = 'DASHBOARD',
  TRANSACTIONS = 'TRANSACTIONS',
  PROFIT_LOSS = 'PROFIT_LOSS',
  BALANCE_SHEET = 'BALANCE_SHEET',
  RULES = 'RULES',
  FORECAST = 'FORECAST',
  CHAT = 'CHAT',
  SETTINGS = 'SETTINGS'
}

export type JobStatus = 'queued' | 'processing' | 'completed' | 'error';

export interface FileJob {
  id: string;
  file: File;
  status: JobStatus;
  resultCount?: number;
  error?: string;
  addedAt: number;
}

// --- SITE AWARENESS TYPES ---
export interface SiteContextState {
  currentPage: ViewState;
  pageData: Record<string, any>; // Dynamic data from current view (e.g., search terms)
  actionLog: string[]; // History of user actions (e.g., "Clicked Export")
  updatePageData: (key: string, value: any) => void;
  logAction: (action: string) => void;
  setCurrentPage: (page: ViewState) => void;
}

// --- EXTERNAL INTEGRATION TYPES ---
export interface ExternalProduct {
  name: string;
  price: number;
  imageUrl?: string;
  url?: string;
  description?: string;
}

export interface ApiKey {
  id: string;
  name: string;
  key: string;
  createdAt: string;
  lastUsed?: string;
}
