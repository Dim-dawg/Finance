
import { GoogleGenAI, Type } from "@google/genai";
import { Transaction, Rule, SiteContextState, ExternalProduct, RecurringTransaction } from '../types';
import { DEFAULT_CATEGORIES } from '../constants';

export class GeminiService {
  private client: GoogleGenAI;

  constructor(apiKey?: string) {
    // Prioritize passed key, then env
    const key = apiKey || process.env.API_KEY;
    if (!key) console.error("API Key missing for GeminiService");
    this.client = new GoogleGenAI({ apiKey: key });
  }

  /**
   * Helper to handle Rate Limits (429) and Server Errors (500/503) with Backoff
   */
  private async withRetry<T>(fn: () => Promise<T>, retries = 3, baseDelay = 2000): Promise<T> {
    try {
      return await fn();
    } catch (error: any) {
      let msg = error.message || error.toString();
      
      // Attempt to extract cleaner message from JSON noise often returned by Gemini
      if (msg.includes('{')) {
         try {
           const jsonStart = msg.indexOf('{');
           const jsonPart = msg.substring(jsonStart);
           const parsed = JSON.parse(jsonPart);
           if (parsed.error && parsed.error.message) {
              msg = parsed.error.message;
           }
         } catch(e) {}
      }

      const isRateLimit = msg.includes('429') || msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('exhausted');
      const isServerErr = msg.includes('503') || msg.includes('500') || msg.includes('overloaded');

      if ((isRateLimit || isServerErr) && retries > 0) {
        let delay = baseDelay;
        // If error says "retry in X seconds", use that
        const waitMatch = msg.match(/retry in (\d+(\.\d+)?)s/);
        if (waitMatch && waitMatch[1]) {
           delay = Math.ceil(parseFloat(waitMatch[1]) * 1000) + 1000; // Add 1s buffer
        }

        console.warn(`[Gemini] Rate limit or Server busy. Retrying in ${delay}ms... (${retries} retries left)`);
        await new Promise(r => setTimeout(r, delay));
        return this.withRetry(fn, retries - 1, delay * 1.5); // Exponential backoff
      }

      // If we can't retry, throw the cleaner message
      throw new Error(msg); 
    }
  }

  /**
   * Parses a single Bank Statement file
   */
  async parseBankStatement(
    file: { data: string; mimeType: string; filename: string }, 
    userId: string
  ): Promise<Transaction[]> {
    const categoriesList = DEFAULT_CATEGORIES.join(", ");
    
    const parts: any[] = [
      { text: `
        Analyze the provided bank statement file ("${file.filename}") for a Technology Services Company.
        Extract all financial transactions into a JSON array.
        
        DATA SOURCE GUIDANCE:
        - Input is a single corporate bank statement or card statement (PDF or CSV).
        
        EXTRACTION INSTRUCTIONS:
        1. IGNORE non-transaction rows (headers, footers, balances, account summaries).
        2. DATES: 
           - Extract the effective date.
           - CONVERT all dates strictly to "YYYY-MM-DD" format.
        3. AMOUNTS: 
           - Expense = negative value (e.g. Server costs, Payroll).
           - Income = positive value (e.g. Client Invoices).
        4. CATEGORY: 
           - Map to standard business categories if possible: ${categoriesList}.
           - Distinguish between "Software Subscriptions" (e.g. Github, Jira), "Cloud Infrastructure" (AWS, Azure), and "General Admin".
           - Recognize "Payroll" or "Contractor Fees".
           - Otherwise create a descriptive Title Case category.
        5. SOURCE_FILE: 
           - Set "source_file" to "${file.filename}".
        
        OUTPUT SCHEMA:
        Return a JSON array of objects.
      `}
    ];

    if (file.mimeType === 'application/pdf') {
      parts.push({ inlineData: { mimeType: file.mimeType, data: file.data } });
    } else {
      parts.push({ text: file.data });
    }

    return this.withRetry(async () => {
      const response = await this.client.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                date: { type: Type.STRING },
                description: { type: Type.STRING },
                amount: { type: Type.NUMBER },
                category: { type: Type.STRING },
                type: { type: Type.STRING, enum: ['income', 'expense'] },
                source_file: { type: Type.STRING }
              }
            }
          }
        }
      });

      const rawText = response.text;
      if (!rawText) throw new Error("Empty response from AI");
      
      const rawData = JSON.parse(rawText);
      
      return rawData.map((t: any) => ({
        transaction_id: crypto.randomUUID(),
        user_id: userId,
        date: t.date,
        description: t.description || 'Unknown Transaction',
        amount: Math.abs(t.amount),
        category: t.category || 'Uncategorized',
        type: t.type || (t.amount < 0 ? 'expense' : 'income'),
        source_file: t.source_file || file.filename
      }));
    });
  }

  /**
   * Scans history for recurring patterns (MRR & OpEx)
   */
  async detectRecurringPatterns(transactions: Transaction[]): Promise<{ recurring: Partial<RecurringTransaction>[], suggestedCategories: string[] }> {
    const prompt = `
      Analyze the provided transaction history for a Tech Business and identify recurring revenue and operational costs.
      
      Input: A list of financial transactions.
      
      Goal: 
      1. Identify recurring items:
         - Recurring Revenue (Retainers, Maintenance Contracts).
         - Recurring OpEx (SaaS subscriptions like Slack/Zoom, Cloud bills like AWS, Payroll, Contractor payouts).
      2. Suggest new, high-value Categories if you see clusters of transactions that don't fit generic categories (e.g. if you see many "Upwork" and "Fiverr" txns, suggest "Freelance Labor").

      Rules:
      - Only suggest items that have appeared at least twice or strongly look like a subscription/retainer.
      - Estimate frequency based on dates.
      - Infer the best category (e.g. "Cloud Infrastructure" for AWS).
      
      Output Schema:
      {
        "recurring": [
           { description: string, amount: number, category: string, type: "income" | "expense", frequency: "monthly" | "weekly" | "annually" }
        ],
        "suggestedCategories": [ string ]
      }
    `;

    // Send a sample to avoid token limits, prioritize recent
    const sampleTx = transactions.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 100).map(t => ({
      date: t.date,
      desc: t.description,
      amt: t.amount,
      type: t.type
    }));

    return this.withRetry(async () => {
      const response = await this.client.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
           { text: prompt },
           { text: JSON.stringify(sampleTx) }
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              recurring: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    description: { type: Type.STRING },
                    amount: { type: Type.NUMBER },
                    category: { type: Type.STRING },
                    type: { type: Type.STRING, enum: ['income', 'expense'] },
                    frequency: { type: Type.STRING, enum: ['daily', 'weekly', 'bi-weekly', 'monthly', 'quarterly', 'annually'] },
                  }
                }
              },
              suggestedCategories: { type: Type.ARRAY, items: { type: Type.STRING } }
            }
          }
        }
      });
      
      const text = response.text || "{}";
      return JSON.parse(text);
    });
  }

  /**
   * Generates a 6-month financial forecast (Runway & Burn)
   */
  async generateForecast(transactions: Transaction[], currentBalance: number, recurringItems: RecurringTransaction[] = []): Promise<any> {
    const simpleTx = transactions
      .slice(0, 60)
      .map(t => ({
        date: t.date,
        amount: t.type === 'expense' ? -Math.abs(t.amount) : Math.abs(t.amount),
        category: t.category
      }));

    const recurringContext = recurringItems.map(r => 
      `${r.description} (${r.type}): $${r.amount} - ${r.frequency} (From: ${r.startDate || 'Now'})`
    ).join('\n');

    const prompt = `
      You are the Financial Forecast Engine for a Tech Services Business using Dim Dawg.

      Your job:
      - Create a realistic 6-month financial forecast focused on CASH RUNWAY and BURN RATE.
      - **CRITICAL:** Incorporate "KNOWN RECURRING TRANSACTIONS" (Retainers, SaaS costs, Payroll).
      - Use "HISTORICAL TRANSACTIONS" to estimate variable spend (e.g. Usage-based cloud costs, variable contractor hours).
      
      Inputs:
      1. KNOWN RECURRING:
      ${recurringContext || "None provided."}

      2. HISTORICAL TRANSACTIONS (Last 60):
      ${JSON.stringify(simpleTx)}

      Rules:
      - Start from NEXT month.
      - "projectedIncome" = Recurring Revenue (Retainers) + Estimated Project/Client Revenue.
      - "projectedExpenses" = Fixed OpEx + Variable Costs (Cloud/Ads).
      - "balance" = The expected ending cash position.
      - "optimisticBalance" = (High Revenue / Low Burn) scenario.
      - "pessimisticBalance" = (Low Revenue / High Burn) scenario.
      
      Output JSON Structure:
      {
        "forecast": [
          {
            "month": "YYYY-MM",
            "projectedIncome": number,
            "projectedExpenses": number,
            "cashFlow": number,
            "balance": number,
            "optimisticBalance": number,
            "pessimisticBalance": number
          }
        ],
        "insights": "Short paragraph analyzing Burn Rate, Runway (months left), and recommendations for optimizing SaaS/Cloud spend."
      }
    `;

    return this.withRetry(async () => {
      const response = await this.client.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              forecast: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    month: { type: Type.STRING },
                    projectedIncome: { type: Type.NUMBER },
                    projectedExpenses: { type: Type.NUMBER },
                    cashFlow: { type: Type.NUMBER },
                    balance: { type: Type.NUMBER },
                    optimisticBalance: { type: Type.NUMBER },
                    pessimisticBalance: { type: Type.NUMBER },
                  }
                }
              },
              insights: { type: Type.STRING }
            }
          }
        }
      });

      let rawText = response.text || "{}";
      rawText = rawText.replace(/```json\n?|\n?```/g, "").trim();
      const parsed = JSON.parse(rawText);

      // Append metadata for staleness checking
      return {
        ...parsed,
        metadata: {
           generatedAt: new Date().toISOString(),
           sourceTxCount: transactions.length,
           sourceTxHash: transactions.length > 0 ? transactions[0].transaction_id : 'empty' // Simple "hash"
        }
      };
    });
  }

  /**
   * Chat Agent - Tech Business CFO Persona
   */
  async chat(
    message: string, 
    context: { 
      transactions: Transaction[], 
      rules: Rule[], 
      recurring?: RecurringTransaction[], 
      forecast?: any, 
      externalProduct?: ExternalProduct | null 
    },
    siteAwareness: Pick<SiteContextState, 'currentPage' | 'pageData' | 'actionLog'>,
    history: any[]
  ): Promise<string> {
    const recentTx = context.transactions.slice(0, 50);
    
    const awarenessContext = `
      [SITE AWARENESS DATA]
      Current View: ${siteAwareness.currentPage}
      Current Page Status: ${JSON.stringify(siteAwareness.pageData)}
      Recent User Actions: ${JSON.stringify(siteAwareness.actionLog)}
      ---------------------
    `;

    const forecastContext = context.forecast 
      ? JSON.stringify(context.forecast.forecast) 
      : "No forecast generated yet.";

    const recurringContext = context.recurring?.length 
      ? JSON.stringify(context.recurring)
      : "No recurring/fixed expenses defined.";

    const shoppingContext = context.externalProduct
      ? `
        [PROCUREMENT ADVISOR CONTEXT]
        The user is currently considering a purchase for the business.
        Product/Service: "${context.externalProduct.name}"
        Cost: $${context.externalProduct.price}
      ` 
      : "No external product selected.";

    const contextString = `
      ${awarenessContext}
      ${shoppingContext}

      [DATA SOURCES]
      1. HISTORY (Recent 50): ${JSON.stringify(recentTx)}
      
      2. RECURRING/FIXED BURN: ${recurringContext}
      
      3. FORECAST (FUTURE): ${forecastContext}
      
      4. RULES: ${JSON.stringify(context.rules)}
    `;

    const systemInstruction = `
      You are Dim Dawg's Tech Business Financial Analyst. 
      Your mission is to optimize the company's Cash Flow, Burn Rate, and Operating Margins.

      CORE DIRECTIVES:
      1. **Business Context**: 
         - Assume the user is a Founder or Operator of a Technology Services Company.
         - Interpret "expenses" as OpEx (Operating Expenses) or COGS (Cost of Goods Sold like hosting/APIs).
         - Interpret "income" as Client Revenue or ARR/MRR.

      2. **Procurement Advisor Mode** (Active when [PROCUREMENT ADVISOR CONTEXT] is present):
         - **Step 1:** Compare Cost against Current Cash.
         - **Step 2:** Check [FORECAST]. Will this purchase reduce Runway significantly?
         - **Step 3:** Evaluate ROI. Is this a critical tool for operations?
         - **Step 4:** Verdict: 
           - 🟢 "Approved" (High liquidity).
           - 🟡 "Review Needed" (Tight burn).
           - 🔴 "Not Recommended" (Risk to runway).

      3. **Site Awareness**:
         - Use [SITE AWARENESS DATA] to guide the user.

      4. **Tone**: Professional, analytical, forward-looking. Use terms like "Runway", "Burn Rate", "Margin", "Allocation".
    `;

    return this.withRetry(async () => {
      const chat = this.client.chats.create({
        model: 'gemini-2.5-flash',
        config: { systemInstruction }
      });

      const fullMessage = `${contextString}\n\nUser Query: ${message}`;
      const result = await chat.sendMessage({ message: fullMessage });
      return result.text || "I couldn't process that.";
    });
  }
}
