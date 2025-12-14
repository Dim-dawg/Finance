
import React, { useState, useMemo } from 'react';
import { RecurringTransaction, Transaction } from '../types';
import { GeminiService } from '../lib/geminiService';
import { Plus, Trash2, Wand2, Calendar, CheckCircle, XCircle, Tag, RefreshCw, Clock } from 'lucide-react';
import { useSiteContext } from '../context/SiteContext';

interface RecurringTransactionManagerProps {
  recurring: RecurringTransaction[];
  transactions: Transaction[];
  categories: string[];
  onAdd: (item: RecurringTransaction) => void;
  onRemove: (id: string) => void;
  onAddCategory: (category: string) => void;
}

export const RecurringTransactionManager: React.FC<RecurringTransactionManagerProps> = ({
  recurring,
  transactions,
  categories,
  onAdd,
  onRemove,
  onAddCategory
}) => {
  const { logAction } = useSiteContext();
  const [isScanning, setIsScanning] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<Partial<RecurringTransaction>[] | null>(null);
  const [aiCategorySuggestions, setAiCategorySuggestions] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('calendar');

  // Form State
  const [form, setForm] = useState<Partial<RecurringTransaction>>({
    description: '',
    amount: 0,
    type: 'expense',
    category: categories[0] || 'Uncategorized',
    frequency: 'monthly',
    startDate: new Date().toISOString().split('T')[0]
  });

  // Derived Calendar Data
  const calendarDays = useMemo(() => {
    const days = Array.from({ length: 31 }, (_, i) => i + 1);
    const dayMap: Record<number, RecurringTransaction[]> = {};
    
    recurring.forEach(item => {
      const d = new Date(item.startDate);
      if (!isNaN(d.getTime())) {
        const day = d.getDate(); // 1-31
        if (!dayMap[day]) dayMap[day] = [];
        dayMap[day].push(item);
      }
    });

    return days.map(d => ({
       day: d,
       items: dayMap[d] || []
    }));
  }, [recurring]);

  const handleScan = async () => {
    setIsScanning(true);
    setAiSuggestions(null);
    setAiCategorySuggestions([]);
    try {
      const gemini = new GeminiService();
      const result = await gemini.detectRecurringPatterns(transactions);
      setAiSuggestions(result.recurring);
      setAiCategorySuggestions(result.suggestedCategories || []);
      logAction('Ran AI Recurring Pattern Detection');
    } catch (e) {
      console.error(e);
      alert("Failed to scan patterns.");
    } finally {
      setIsScanning(false);
    }
  };

  const handleManualAdd = () => {
    if (!form.description || !form.amount) return;
    const newItem: RecurringTransaction = {
      id: crypto.randomUUID(),
      user_id: 'local', // Handled by App context usually, simple stub here
      description: form.description,
      amount: Number(form.amount),
      category: form.category || 'Uncategorized',
      type: form.type as 'income' | 'expense',
      frequency: form.frequency as any,
      startDate: form.startDate || new Date().toISOString().split('T')[0]
    };
    onAdd(newItem);
    setForm({ ...form, description: '', amount: 0 });
    setShowForm(false);
    logAction(`Added recurring item: ${newItem.description}`);
  };

  const acceptSuggestion = (s: Partial<RecurringTransaction>) => {
    const newItem: RecurringTransaction = {
      id: crypto.randomUUID(),
      user_id: 'local',
      description: s.description || 'Unknown',
      amount: s.amount || 0,
      category: s.category || 'Uncategorized',
      type: s.type || 'expense',
      frequency: s.frequency as any || 'monthly',
      startDate: new Date().toISOString().split('T')[0]
    };
    onAdd(newItem);
    setAiSuggestions(prev => prev ? prev.filter(i => i !== s) : null);
  };

  const acceptCategory = (cat: string) => {
    onAddCategory(cat);
    setAiCategorySuggestions(prev => prev.filter(c => c !== cat));
  };

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
           <h3 className="text-lg font-bold text-white flex items-center">
             <RefreshCw className="mr-2 text-emerald-400" size={20} />
             Recurring Revenue & Fixed Costs
           </h3>
           <p className="text-xs text-slate-400 mt-1">
             Define MRR (income) and Fixed OpEx to make your forecast rock-solid.
           </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
           <div className="flex bg-slate-800 p-1 rounded-lg mr-2">
              <button 
                onClick={() => setViewMode('calendar')}
                className={`p-1.5 rounded ${viewMode === 'calendar' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
                title="Calendar View"
              >
                <Calendar size={14} />
              </button>
              <button 
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
                title="List View"
              >
                <Clock size={14} />
              </button>
           </div>
           
           <button 
             onClick={handleScan}
             disabled={isScanning || transactions.length < 5}
             className="flex items-center space-x-2 px-3 py-2 bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/40 rounded-lg text-sm border border-indigo-500/30 transition-colors disabled:opacity-50"
           >
             {isScanning ? <RefreshCw className="animate-spin" size={16} /> : <Wand2 size={16} />}
             <span className="hidden sm:inline">Auto-Detect</span>
           </button>
           <button 
             onClick={() => setShowForm(!showForm)}
             className="flex items-center space-x-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
           >
             <Plus size={16} />
             <span className="hidden sm:inline">Add</span>
           </button>
        </div>
      </div>

      {/* AI SUGGESTIONS ZONE */}
      {(aiSuggestions?.length || 0) > 0 && (
         <div className="bg-indigo-900/10 border border-indigo-500/30 rounded-lg p-4 animate-fade-in">
            <h4 className="text-sm font-semibold text-indigo-300 mb-3 flex items-center">
              <Wand2 size={14} className="mr-2" /> AI Suggestions Found
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
               {aiSuggestions!.map((s, idx) => (
                 <div key={idx} className="bg-slate-900 p-3 rounded border border-slate-700 flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start">
                         <span className="text-white font-medium">{s.description}</span>
                         <span className={`text-xs px-1.5 py-0.5 rounded ${s.type === 'income' ? 'bg-emerald-900 text-emerald-400' : 'bg-rose-900 text-rose-400'}`}>
                           {s.type}
                         </span>
                      </div>
                      <p className="text-slate-400 text-xs mt-1">
                        ${s.amount} • {s.frequency}
                      </p>
                      <p className="text-slate-500 text-[10px] mt-0.5">Category: {s.category}</p>
                    </div>
                    <div className="flex space-x-2 mt-3 pt-3 border-t border-slate-800">
                       <button onClick={() => acceptSuggestion(s)} className="flex-1 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs rounded flex items-center justify-center">
                         <CheckCircle size={12} className="mr-1"/> Add
                       </button>
                       <button onClick={() => setAiSuggestions(prev => prev!.filter(i => i !== s))} className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs rounded">
                         <XCircle size={12}/>
                       </button>
                    </div>
                 </div>
               ))}
            </div>
         </div>
      )}

      {/* NEW CATEGORY SUGGESTIONS */}
      {aiCategorySuggestions.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center bg-slate-800/50 p-3 rounded-lg border border-slate-700">
           <span className="text-xs text-slate-400 mr-2 flex items-center"><Tag size={12} className="mr-1"/> Suggested Categories:</span>
           {aiCategorySuggestions.map(cat => (
             <div key={cat} className="flex items-center bg-slate-700 text-slate-200 text-xs px-2 py-1 rounded-full border border-slate-600">
                <span>{cat}</span>
                <button onClick={() => acceptCategory(cat)} className="ml-2 text-green-400 hover:text-green-300"><Plus size={12}/></button>
                <button onClick={() => setAiCategorySuggestions(prev => prev.filter(c => c !== cat))} className="ml-1 text-slate-500 hover:text-red-400"><XCircle size={12}/></button>
             </div>
           ))}
        </div>
      )}

      {/* ADD FORM */}
      {showForm && (
        <div className="bg-slate-800 p-4 rounded-lg border border-slate-700 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3 animate-fade-in">
           <div className="md:col-span-2">
              <label className="text-xs text-slate-400 block mb-1">Description</label>
              <input type="text" className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-sm text-white" value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="e.g. Rent" />
           </div>
           <div className="md:col-span-1">
              <label className="text-xs text-slate-400 block mb-1">Amount</label>
              <input type="number" className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-sm text-white" value={form.amount} onChange={e => setForm({...form, amount: parseFloat(e.target.value)})} placeholder="0.00" />
           </div>
           <div className="md:col-span-1">
              <label className="text-xs text-slate-400 block mb-1">Type</label>
              <select className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-sm text-white" value={form.type} onChange={e => setForm({...form, type: e.target.value as any})}>
                 <option value="expense">Expense</option>
                 <option value="income">Income</option>
              </select>
           </div>
           <div className="md:col-span-1">
              <label className="text-xs text-slate-400 block mb-1">Frequency</label>
              <select className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-sm text-white" value={form.frequency} onChange={e => setForm({...form, frequency: e.target.value as any})}>
                 <option value="weekly">Weekly</option>
                 <option value="bi-weekly">Bi-Weekly</option>
                 <option value="monthly">Monthly</option>
                 <option value="quarterly">Quarterly</option>
                 <option value="annually">Annually</option>
              </select>
           </div>
           <div className="md:col-span-1 flex items-end">
              <button onClick={handleManualAdd} className="w-full bg-green-600 hover:bg-green-700 text-white p-2 rounded text-sm h-10">Save</button>
           </div>
        </div>
      )}

      {/* VIEW MODES */}
      {recurring.length === 0 ? (
           <div className="text-center py-6 text-slate-500 bg-slate-950/30 rounded border border-slate-800 border-dashed">
             No recurring items defined. Add one manually or use Auto-Detect.
           </div>
      ) : viewMode === 'list' ? (
           /* LIST VIEW */
           <div className="space-y-2">
             {recurring.map(item => (
               <div key={item.id} className="flex items-center justify-between p-3 bg-slate-950 rounded border border-slate-800 hover:border-slate-600 transition-colors">
                  <div className="flex items-center space-x-3">
                     <div className={`p-2 rounded-full ${item.type === 'income' ? 'bg-emerald-900/30 text-emerald-400' : 'bg-rose-900/30 text-rose-400'}`}>
                        <Calendar size={16} />
                     </div>
                     <div>
                        <h5 className="text-sm font-medium text-slate-200">{item.description}</h5>
                        <div className="text-xs text-slate-500 flex space-x-2">
                           <span className="capitalize">{item.frequency}</span>
                           <span>•</span>
                           <span>{item.category}</span>
                           <span>•</span>
                           <span>Next: {item.startDate}</span>
                        </div>
                     </div>
                  </div>
                  <div className="flex items-center space-x-4">
                     <span className={`font-mono font-bold ${item.type === 'income' ? 'text-emerald-400' : 'text-slate-200'}`}>
                        {item.type === 'income' ? '+' : '-'}${item.amount.toLocaleString()}
                     </span>
                     <button onClick={() => onRemove(item.id)} className="text-slate-600 hover:text-red-400 transition-colors">
                        <Trash2 size={16} />
                     </button>
                  </div>
               </div>
             ))}
           </div>
      ) : (
           /* CALENDAR HEATMAP VIEW */
           <div className="overflow-x-auto pb-2">
             <div className="min-w-[600px] grid grid-cols-7 gap-2">
                {calendarDays.map(({ day, items }) => (
                  <div key={day} className={`min-h-[60px] p-2 rounded border transition-colors ${items.length > 0 ? 'bg-slate-800 border-slate-700' : 'bg-slate-950/50 border-slate-900'}`}>
                     <div className="text-[10px] text-slate-500 font-mono mb-1">{day}</div>
                     <div className="space-y-1">
                        {items.map(item => (
                           <div key={item.id} className={`text-[9px] truncate px-1 py-0.5 rounded cursor-pointer group relative ${item.type === 'income' ? 'bg-emerald-900/40 text-emerald-400' : 'bg-rose-900/40 text-rose-400'}`}>
                              {item.description}
                              {/* Tooltip */}
                              <div className="hidden group-hover:block absolute bottom-full left-0 bg-slate-900 text-white p-2 rounded shadow-xl border border-slate-700 z-10 w-48 mb-1">
                                 <p className="font-bold text-xs">{item.description}</p>
                                 <p className="text-xs">${item.amount} • {item.frequency}</p>
                                 <button onClick={() => onRemove(item.id)} className="text-red-400 text-[10px] mt-1 hover:underline flex items-center">
                                    <Trash2 size={10} className="mr-1"/> Remove
                                 </button>
                              </div>
                           </div>
                        ))}
                     </div>
                  </div>
                ))}
             </div>
             <p className="text-[10px] text-center text-slate-500 mt-2">Days of the month (1-31). Shows when bills are expected to hit.</p>
           </div>
      )}
    </div>
  );
};
