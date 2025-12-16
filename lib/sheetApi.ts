
import { Transaction, Rule, User, Category, ApiKey, RecurringTransaction } from '../types';

interface SheetResponse {
  success: boolean;
  error?: string;
  data?: any;
  user?: any;
  transactions?: any[];
  [key: string]: any;
}

export interface SystemCheckResponse {
  success: boolean;
  version?: string;
  sheets?: {
    status: 'OK' | 'INCOMPLETE';
    missing: string[];
    total: number;
  };
  capabilities?: string[];
  error?: string;
}

export class SheetApi {
  private baseUrl: string;

  constructor(url: string) {
    this.baseUrl = url ? url.trim() : '';
  }

  /**
   * Centralized request handler with logging and error normalization.
   */
  private async request(action: string, payload: any = {}): Promise<SheetResponse> {
    if (!this.baseUrl) {
      console.warn(`[SheetApi] Attempted ${action} without Base URL.`);
      return { success: false, error: "Backend URL is missing. Please go to Settings." };
    }

    // Basic validation of URL format
    if (!this.baseUrl.includes('script.google.com')) {
      return { success: false, error: "Invalid URL. It must be a Google Apps Script Web App URL." };
    }

    const startTime = Date.now();
    const requestId = Math.random().toString(36).substring(7);
    console.group(`[SheetApi] Req ${requestId}: ${action}`);
    console.log('Payload:', payload);

    // Append cache buster
    const urlWithParam = this.baseUrl.includes('?') 
      ? `${this.baseUrl}&t=${startTime}` 
      : `${this.baseUrl}?t=${startTime}`;

    try {
      const requestBody = { 
        ...payload, 
        action,
        sheetUrl: this.baseUrl 
      };

      const response = await fetch(urlWithParam, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // Avoid CORS preflight
        body: JSON.stringify(requestBody), 
      });

      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
      }

      const text = await response.text();
      
      // Check for HTML response (Google Error/Auth page)
      if (text.trim().startsWith('<')) {
        console.error("Received HTML response:", text.substring(0, 100));
        return { 
          success: false, 
          error: "Access Denied. Ensure Web App is deployed as 'Who has access: Anyone'." 
        };
      }

      let data: SheetResponse;
      try {
        data = JSON.parse(text);
      } catch (e) {
        console.error("JSON Parse Error. Raw text:", text);
        return { success: false, error: "Invalid server response. Check backend logs." };
      }

      console.log('Response:', data);
      console.log(`Duration: ${Date.now() - startTime}ms`);
      
      if (!data.success) {
        console.warn(`[SheetApi] Backend returned error: ${data.error}`);
      }
      
      return data;

    } catch (error: any) {
      console.error(`[SheetApi] Network/System Error:`, error);
      let msg = error.message || "Network request failed";
      if (msg.includes('Failed to fetch')) {
        msg = "Network Error: Unable to reach Google. Check internet connection.";
      }
      return { success: false, error: msg };
    } finally {
      console.groupEnd();
    }
  }

  /**
   * Validates connection and permissions.
   */
  async healthCheck(): Promise<{ success: boolean; message?: string }> {
    if (!this.baseUrl) return { success: false, message: "URL Missing" };
    
    // Strict Validation to catch common user errors (pasting editor link vs deploy link)
    if (!this.baseUrl.includes('script.google.com')) {
       return { success: false, message: "Invalid URL: Must start with https://script.google.com" };
    }
    if (!this.baseUrl.includes('/exec')) {
       return { success: false, message: "Invalid URL: Must end in /exec (Deploy > Web App)" };
    }

    try {
      const response = await fetch(`${this.baseUrl}${this.baseUrl.includes('?') ? '&' : '?'}ping=${Date.now()}`);
      if (!response.ok) return { success: false, message: `HTTP ${response.status}` };
      
      const text = await response.text();
      if (text.includes("Dim Dawg Backend")) {
        return { success: true };
      } else if (text.startsWith('<')) {
         return { success: false, message: "Permission Error: Deploy as 'Anyone'" };
      }
      return { success: false, message: "Invalid Response Content" };
    } catch (e: any) {
      return { success: false, message: "Unreachable" };
    }
  }

  /**
   * Performs a deep diagnostic of the backend.
   */
  async systemCheck(): Promise<SystemCheckResponse> {
    const res = await this.request('systemCheck');
    if (!res.success) {
      return { success: false, error: res.error || "Unknown Error" };
    }
    return {
      success: true,
      version: res.version,
      sheets: res.sheets,
      capabilities: res.capabilities
    };
  }

  async login(email: string, password: string): Promise<SheetResponse> {
    return await this.request('login', { email: email.toLowerCase().trim(), password: password.trim() });
  }

  async register(email: string, password: string, name: string): Promise<SheetResponse> {
    return await this.request('register', { email: email.toLowerCase().trim(), password: password.trim(), name });
  }

  async resetPassword(email: string): Promise<SheetResponse> {
    return await this.request('resetPassword', { email: email.toLowerCase().trim() });
  }

  // --- TRANSACTIONS ---
  async getTransactions(userId: string): Promise<Transaction[]> {
    const res = await this.request('getTransactions', { userId });
    return res.success && Array.isArray(res.data) ? res.data : [];
  }

  async saveTransactions(userId: string, transactions: Transaction[]): Promise<boolean> {
    if (transactions.length === 0) return true;
    const res = await this.request('saveTransactions', { userId, transactions });
    return res.success;
  }

  async updateTransaction(transaction: Transaction): Promise<boolean> {
    const res = await this.request('updateTransaction', { 
      transactionId: transaction.transaction_id,
      updates: transaction
    });
    return res.success;
  }

  async deleteTransaction(transactionId: string): Promise<boolean> {
    const res = await this.request('deleteTransaction', { transactionId });
    return res.success;
  }

  // --- RULES ---
  async getRules(userId: string): Promise<Rule[]> {
    const res = await this.request('getRules', { userId });
    return res.success && Array.isArray(res.data) ? res.data : [];
  }

  async addRule(userId: string, rule: Partial<Rule>): Promise<boolean> {
    const res = await this.request('saveRule', { userId, ...rule });
    return res.success;
  }

  async deleteRule(ruleId: string): Promise<boolean> {
    const res = await this.request('deleteRule', { ruleId });
    return res.success;
  }

  // --- RECURRING TRANSACTIONS ---
  async getRecurringTransactions(userId: string): Promise<RecurringTransaction[]> {
    const res = await this.request('getRecurringTransactions', { userId });
    return res.success && Array.isArray(res.data) ? res.data : [];
  }

  async saveRecurringTransaction(userId: string, transaction: RecurringTransaction): Promise<boolean> {
    const res = await this.request('saveRecurringTransaction', { userId, transaction });
    return res.success;
  }

  async deleteRecurringTransaction(id: string): Promise<boolean> {
    const res = await this.request('deleteRecurringTransaction', { id });
    return res.success;
  }

  // --- API KEYS ---
  async getApiKeys(userId: string): Promise<ApiKey[]> {
    const res = await this.request('getApiKeys', { userId });
    return res.success && Array.isArray(res.data) ? res.data : [];
  }

  async saveApiKey(userId: string, apiKey: ApiKey): Promise<boolean> {
    const res = await this.request('saveApiKey', { userId, apiKey });
    return res.success;
  }

  async revokeApiKey(keyId: string): Promise<boolean> {
    const res = await this.request('revokeApiKey', { keyId });
    return res.success;
  }
}
