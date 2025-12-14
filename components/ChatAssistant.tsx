
import React, { useState, useRef, useEffect } from 'react';
import { Transaction, Rule, AppSettings, ExternalProduct, RecurringTransaction } from '../types';
import { GeminiService } from '../lib/geminiService';
import { Send, Bot, User as UserIcon, Loader, TrendingUp, X, MessageSquare, Sparkles, ShoppingBag, ChevronDown } from 'lucide-react';
import { useSiteContext } from '../context/SiteContext';

interface ChatAssistantProps {
  transactions: Transaction[];
  rules: Rule[];
  settings: AppSettings;
  isOpen: boolean;
  onToggle: () => void; 
  apiKey?: string;
  externalProduct?: ExternalProduct | null;
  recurringTransactions?: RecurringTransaction[];
}

interface Message {
  role: 'user' | 'assistant';
  content: string | React.ReactNode;
}

const queryTransactions = (query: string, transactions: Transaction[]): string | null => {
  const normalizedQuery = query.toLowerCase().trim();

  if (normalizedQuery.includes('number of unique descriptions') || normalizedQuery.includes('unique descriptions count')) {
    const uniqueDescriptions = new Set(transactions.map(t => (t.description || '').toLowerCase().trim()));
    return `There are ${uniqueDescriptions.size} unique descriptions in your transaction history.`;
  }

  if (normalizedQuery.includes('total expenses')) {
    const totalExpenses = transactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);
    return `Total Expenses: $${totalExpenses.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  }

  if (normalizedQuery.includes('total income') || normalizedQuery.includes('total revenue')) {
    const totalIncome = transactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);
    return `Total Revenue: $${totalIncome.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  }

  const categoryMatch = normalizedQuery.match(/total of category\s+(.+)/i);
  if (categoryMatch) {
    const categoryName = categoryMatch[1].replace(/[?.]/g, '').trim(); 
    const categoryTransactions = transactions.filter(t => 
      (t.category || '').toLowerCase() === categoryName.toLowerCase()
    );

    if (categoryTransactions.length > 0) {
      const total = categoryTransactions.reduce((sum, t) => sum + t.amount, 0);
      return `Total of category "${categoryName}": $${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    }
  }

  return null;
};

export const ChatAssistant: React.FC<ChatAssistantProps> = ({ transactions, rules, settings, isOpen, onToggle, apiKey, externalProduct, recurringTransactions = [] }) => {
  const { currentPage, pageData, actionLog } = useSiteContext();
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Hello! I am Dim Dawg AI. I am here to analyze your business finance, burn rate, and runway.' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  // Handle Incoming Product Context automatically
  useEffect(() => {
    if (externalProduct && isOpen) {
       // Check if we haven't already greeted this product
       const alreadyDiscussed = messages.some(m => 
          typeof m.content === 'string' && m.content.includes(externalProduct.name)
       );
       
       if (!alreadyDiscussed) {
          const prompt = `Can the business afford the ${externalProduct.name} for $${externalProduct.price}?`;
          
          setMessages(prev => [
             ...prev, 
             { role: 'user', content: prompt }
          ]);
          
          // Trigger AI automatically
          triggerAI(prompt, externalProduct);
       }
    }
  }, [externalProduct, isOpen]); // eslint-disable-line

  const triggerAI = async (text: string, productContext: ExternalProduct | null) => {
    setLoading(true);
    try {
      const localAnswer = queryTransactions(text, transactions);
      if (localAnswer) {
        await new Promise(resolve => setTimeout(resolve, 600));
        setMessages(prev => [...prev, { role: 'assistant', content: localAnswer }]);
        setLoading(false);
        return;
      }

      const gemini = new GeminiService(apiKey);
      const siteAwareness = { currentPage, pageData, actionLog };
      
      const rawForecast = localStorage.getItem('dd_forecast_data');
      const forecastData = rawForecast ? JSON.parse(rawForecast) : null;

      const response = await gemini.chat(
        text, 
        { 
          transactions, 
          rules, 
          forecast: forecastData, 
          externalProduct: productContext,
          recurring: recurringTransactions
        }, 
        siteAwareness, 
        messages
      );
      
      setMessages(prev => [...prev, { role: 'assistant', content: response }]);
    } catch (e) {
      console.error(e);
      setMessages(prev => [...prev, { role: 'assistant', content: "Sorry, I encountered an error connecting to the AI." }]);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    await triggerAI(userMsg, externalProduct || null);
  };

  const handleGenerateForecast = async () => {
    if (loading) return;
    setLoading(true);
    setMessages(prev => [...prev, { role: 'user', content: "Generate a 12-month runway forecast based on history." }]);

    try {
      const gemini = new GeminiService(apiKey);
      const income = transactions.filter(t => t.type === 'income').reduce((a, b) => a + b.amount, 0);
      const expense = transactions.filter(t => t.type === 'expense').reduce((a, b) => a + b.amount, 0);
      const currentBalance = income - expense;

      const data = await gemini.generateForecast(transactions, currentBalance, recurringTransactions);
      localStorage.setItem('dd_forecast_data', JSON.stringify(data));
      
      const ForecastDisplay = (
        <div className="space-y-4 w-full">
          <p className="font-semibold text-blue-300 flex items-center"><Sparkles size={14} className="mr-1"/> Forecast Analysis</p>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-600 text-slate-400">
                  <th className="py-2 px-1">Mo</th>
                  <th className="py-2 px-1 text-right">Rev</th>
                  <th className="py-2 px-1 text-right">Burn</th>
                  <th className="py-2 px-1 text-right">Net</th>
                </tr>
              </thead>
              <tbody>
                {data.forecast?.slice(0, 6).map((f: any, i: number) => (
                  <tr key={i} className="border-b border-slate-700/50">
                    <td className="py-2 px-1 text-slate-300 whitespace-nowrap">{f.month}</td>
                    <td className="py-2 px-1 text-right text-emerald-400">${Math.round(f.projectedIncome).toLocaleString()}</td>
                    <td className="py-2 px-1 text-right text-rose-400">-${Math.round(f.projectedExpenses).toLocaleString()}</td>
                    <td className={`py-2 px-1 text-right font-bold ${f.cashFlow >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {f.cashFlow >= 0 ? '+' : ''}{Math.round(f.cashFlow).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="bg-slate-800/50 p-3 rounded border border-slate-700">
            <p className="text-xs italic text-slate-300">💡 {data.insights}</p>
          </div>
        </div>
      );

      setMessages(prev => [...prev, { role: 'assistant', content: ForecastDisplay }]);
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Forecast failed: ${e.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  const drawerClasses = `fixed inset-y-0 right-0 w-full sm:w-[450px] bg-slate-900 shadow-2xl transform transition-transform duration-300 ease-in-out z-[60] border-l border-slate-800 flex flex-col ${isOpen ? 'translate-x-0' : 'translate-x-full'}`;

  return (
    <>
      {/* FLOATING ACTION BUTTON (BUBBLE) */}
      <button 
        onClick={onToggle}
        className="fixed bottom-6 right-6 z-[70] w-14 h-14 bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-full shadow-2xl flex items-center justify-center hover:scale-110 transition-transform active:scale-95 group"
        title={isOpen ? "Close Chat" : "Open Assistant"}
      >
        {isOpen ? (
           <ChevronDown size={28} className="group-hover:translate-y-1 transition-transform" />
        ) : (
           <MessageSquare size={24} className={externalProduct ? "animate-pulse" : ""} />
        )}
        {externalProduct && !isOpen && (
           <span className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-slate-900"></span>
        )}
      </button>

      {/* OVERLAY BACKDROP */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-[55] backdrop-blur-sm transition-opacity duration-300"
          onClick={onToggle}
        />
      )}
      
      {/* CHAT DRAWER */}
      <div className={drawerClasses}>
        <div className="flex-shrink-0 p-4 border-b border-slate-800 bg-slate-900 flex items-center justify-between">
          <div className="flex items-center">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center mr-3 shadow-lg shadow-blue-900/20">
               <Bot className="text-white" size={18} />
            </div>
            <div>
              <h3 className="font-bold text-slate-100 text-sm">Dim Dawg AI</h3>
              <p className="text-xs text-blue-400 flex items-center">
                 {externalProduct ? (
                   <span className="text-amber-400 flex items-center font-bold"><ShoppingBag size={10} className="mr-1"/> Procurement Advisor</span>
                 ) : (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5"></span>
                      Tech CFO Mode
                    </>
                 )}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button 
              onClick={handleGenerateForecast}
              disabled={loading || transactions.length === 0}
              className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-blue-400 transition-colors"
              title="Generate Forecast"
            >
              <TrendingUp size={18} />
            </button>
            <button 
              onClick={onToggle}
              className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-950/50" ref={scrollRef}>
          
          {/* PRODUCT CONTEXT CARD */}
          {externalProduct && (
             <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex items-center space-x-4 animate-fade-in mx-auto w-full max-w-[90%]">
                 <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center overflow-hidden">
                    {externalProduct.imageUrl ? (
                        <img src={externalProduct.imageUrl} alt={externalProduct.name} className="w-full h-full object-cover" />
                    ) : (
                        <ShoppingBag className="text-slate-900" size={24} />
                    )}
                 </div>
                 <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-400 uppercase font-semibold">Analyzing Purchase</p>
                    <h4 className="text-white font-bold truncate">{externalProduct.name}</h4>
                    <p className="text-emerald-400 font-mono">${externalProduct.price.toLocaleString()}</p>
                 </div>
             </div>
          )}

          {messages.map((m, idx) => (
            <div key={idx} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex items-start max-w-[90%] ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mx-2 ${m.role === 'user' ? 'bg-blue-600/20 text-blue-400' : 'bg-emerald-600/20 text-emerald-400'}`}>
                  {m.role === 'user' ? <UserIcon size={14} /> : <Bot size={14} />}
                </div>
                <div className={`p-3 rounded-2xl text-sm leading-relaxed shadow-sm ${m.role === 'user' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-slate-800 text-slate-200 rounded-tl-none border border-slate-700'}`}>
                  {m.content}
                </div>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-slate-800 p-4 rounded-2xl rounded-tl-none ml-12 flex space-x-2 items-center border border-slate-700">
                <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0ms'}}></span>
                <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '150ms'}}></span>
                <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '300ms'}}></span>
              </div>
            </div>
          )}
        </div>

        <div className="flex-shrink-0 p-4 border-t border-slate-800 bg-slate-900">
          <div className="flex items-center bg-slate-800 rounded-xl border border-slate-700 px-2 py-1 focus-within:ring-2 focus-within:ring-blue-500/50 focus-within:border-blue-500 transition-all">
            <input
              type="text"
              className="flex-1 bg-transparent p-3 focus:outline-none text-sm text-slate-100 placeholder-slate-500"
              placeholder="Ask about burn rate, runway, or expenses..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            />
            <button 
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="p-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:bg-slate-700"
            >
              <Send size={16} />
            </button>
          </div>
          <p className="text-[10px] text-center text-slate-600 mt-2">
             AI has access to page context, transactions & forecasts.
          </p>
        </div>
      </div>
    </>
  );
};
