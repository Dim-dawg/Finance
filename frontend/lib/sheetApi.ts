import { Transaction, Rule, User, Category, ApiKey, RecurringTransaction } from '../types';

// Simplified response interface, as our backend will be more consistent.
interface ApiResponse {
  success: boolean;
  error?: string;
  data?: any;
  user?: any;
  transactions?: any[];
  [key: string]: any;
}

export class SheetApi {
  // The backend proxy endpoint. All requests go through our own serverless function.
  private backendUrl = '/api/sheets-proxy';

  /**
   * Centralized request handler for our backend proxy.
   */
  private async request(action: string, payload: any = {}): Promise<ApiResponse> {
    const startTime = Date.now();
    const requestId = Math.random().toString(36).substring(7);
    console.group(`[SheetApi] Req ${requestId}: ${action}`);
    console.log('Payload:', payload);

    try {
      const requestBody = { action, ...payload };

      const response = await fetch(this.backendUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        // Our backend should send a JSON error, but handle cases where it doesn't.
        const errorText = await response.text();
        console.error(`[SheetApi] HTTP Error: ${response.status}`, errorText);
        try {
          const errorJson = JSON.parse(errorText);
          throw new Error(errorJson.error || `HTTP Error: ${response.status}`);
        } catch {
          throw new Error(errorText || `HTTP Error: ${response.status}`);
        }
      }

      const data: ApiResponse = await response.json();

      console.log('Response:', data);
      console.log(`Duration: ${Date.now() - startTime}ms`);
      
      if (!data.success) {
        console.warn(`[SheetApi] Backend returned error: ${data.error}`);
      }
      
      return data;

    } catch (error: any) {
      console.error(`[SheetApi] Network/System Error:`, error);
      return { success: false, error: error.message || "A network error occurred." };
    } finally {
      console.groupEnd();
    }
  }

  // --- AUTH ---
  async login(email: string, password: string): Promise<ApiResponse> {
    return await this.request('login', { email: email.toLowerCase().trim(), password: password.trim() });
  }

  async register(email: string, password: string, name: string): Promise<ApiResponse> {
    return await this.request('register', { email: email.toLowerCase().trim(), password: password.trim(), name });
  }

  async resetPassword(email: string): Promise<ApiResponse> {
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
