
import { Transaction, Rule, User, Category, ApiKey, RecurringTransaction } from '../types';

interface SheetResponse {
  success: boolean;
  error?: string;
  data?: any;
  user?: any;
  transactions?: any[];
  [key: string]: any;
}

export class SheetApi {
  private baseUrl: string;

  constructor(url: string) {
    this.baseUrl = url ? url.trim() : '';
  }

  private async request(action: string, payload: any = {}): Promise<SheetResponse> {
    if (!this.baseUrl) {
      return { success: false, error: "Backend URL is missing. Please go to Settings." };
    }

    if (!this.baseUrl.includes('script.google.com')) {
      return { success: false, error: "Invalid URL. It must be a Google Apps Script Web App URL." };
    }

    // Append cache buster to prevent cached responses
    const urlWithParam = this.baseUrl.includes('?') 
      ? `${this.baseUrl}&t=${Date.now()}` 
      : `${this.baseUrl}?t=${Date.now()}`;

    try {
      const requestBody = { 
        ...payload, 
        action,
        sheetUrl: this.baseUrl 
      };

      // Use text/plain to avoid CORS preflight (Simple Request)
      const response = await fetch(urlWithParam, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(requestBody), 
      });

      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
      }

      const text = await response.text();
      
      // CRITICAL: Check if response is HTML (Google Login Page / Error Page)
      if (text.trim().startsWith('<')) {
        console.error("Received HTML instead of JSON:", text.substring(0, 200));
        return { 
          success: false, 
          error: "Access Denied. Please ensure your Web App is deployed as 'Who has access: Anyone'." 
        };
      }

      try {
        const data = JSON.parse(text);
        return data;
      } catch (e) {
        console.error("JSON Parse Error. Raw text:", text);
        return { success: false, error: "Server returned invalid JSON. Check Server Logs." };
      }

    } catch (error: any) {
      console.error(`[SheetAPI] Error ${action}:`, error);
      let msg = error.message || "Network request failed";
      if (msg.includes('Failed to fetch')) {
        msg = "Network Error: Unable to reach Google. Check your internet or ad-blockers.";
      }
      return { success: false, error: msg };
    }
  }

  /**
   * Pings the backend to verify the URL is correct and accessible.
   */
  async healthCheck(): Promise<{ success: boolean; message?: string }> {
    if (!this.baseUrl) return { success: false, message: "URL Missing" };
    try {
      // We use a simple GET request. The doGet in Code.gs returns a JSON status.
      // We append a random param to bypass cache.
      const response = await fetch(`${this.baseUrl}${this.baseUrl.includes('?') ? '&' : '?'}ping=${Date.now()}`);
      
      if (!response.ok) return { success: false, message: `HTTP ${response.status}` };
      
      const text = await response.text();
      if (text.includes("Dim Dawg Backend")) {
        return { success: true };
      } else if (text.startsWith('<')) {
         return { success: false, message: "Auth Error: Deploy as 'Anyone'" };
      }
      return { success: false, message: "Invalid Response" };
    } catch (e: any) {
      return { success: false, message: "Connection Failed" };
    }
  }

  async login(email: string, password: string): Promise<SheetResponse> {
    // Normalize email to lowercase to prevent case mismatches
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
    return res.success && res.data ? res.data : [];
  }

  async saveTransactions(userId: string, transactions: Transaction[]): Promise<boolean> {
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
    return res.success && res.data ? res.data : [];
  }

  async addRule(userId: string, rule: Partial<Rule>): Promise<string | null> {
    const res = await this.request('saveRule', { userId, ...rule });
    return res.success ? 'success' : null;
  }

  async deleteRule(ruleId: string): Promise<boolean> {
    const res = await this.request('deleteRule', { ruleId });
    return res.success;
  }

  // --- RECURRING TRANSACTIONS ---
  async getRecurringTransactions(userId: string): Promise<RecurringTransaction[]> {
    const res = await this.request('getRecurringTransactions', { userId });
    return res.success && res.data ? res.data : [];
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
    return res.success && res.data ? res.data : [];
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
