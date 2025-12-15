
import React, { useState, useMemo, useEffect } from 'react';
import { Transaction, BalanceSheetItem, LinkedCategoryEntry } from '../types';
import { Landmark, TrendingUp, TrendingDown, Plus, Trash2, DollarSign, Wallet, Building2, CreditCard, Briefcase, Calculator, Calendar, ArrowLeftRight, X, Lock, Pencil, Settings2, Info } from 'lucide-react';
import { useSiteContext } from '../context/SiteContext';
import { STORAGE_KEYS } from '../constants';

interface BalanceSheetViewProps {
  transactions: Transaction[];
}

// Seeded defaults for Sneak Peek (Capital Governance)
const DEFAULT_ITEMS: BalanceSheetItem[] = [
  {
    id: "sp_asset_cash",
    name: "Operating Cash Reserve",
    type: "asset",
    value: 0,
    category: "cash",
    isCalculated: true,
    initialValue: 0,
    linkedCategories: ["Client Revenue", "Stripe", "PayPal"]
  },
  {
    id: "sp_asset_tax",
    name: "Tax Reserve",
    type: "asset",
    value: 0,
    category: "cash",
    isCalculated: true,
    initialValue: 0,
    linkedCategories: [{name:"Taxes", cap:50000, period:"lifetime"}]
  },
  {
    id: "sp_asset_sneakpeek",
    name: "Sneak Peek (Project WIP)",
    type: "asset",
    value: 0,
    category: "other",
    isCalculated: true,
    initialValue: 0,
    linkedCategories: [
      {name:"Contractor Fees", cap:10000, period:"monthly"},
      {name:"Cloud Infrastructure", cap:3000, period:"monthly"},
      {name:"Software Subscriptions", period:"lifetime"}
    ]
  },
  {
    id: "sp_asset_ar",
    name: "Accounts Receivable",
    type: "asset",
    value: 0,
    category: "other",
    isCalculated: false,
    initialValue: 0,
    linkedCategories: []
  },
  {
    id: "sp_liab_loan",
    name: "Launch Equipment Loan",
    type: "liability",
    value: 0,
    category: "debt",
    isCalculated: true,
    initialValue: 0,
    linkedCategories: [{name:"Loan Proceeds", period:"lifetime"}]
  },
  {
    id: "sp_liab_affiliate",
    name: "Affiliate / Integration Payables",
    type: "liability",
    value: 0,
    "category": "other",
    isCalculated: true,
    initialValue: 0,
    linkedCategories: [{name:"Affiliate Commissions", cap:2000, period:"monthly"}]
  }
];

export const BalanceSheetView: React.FC<BalanceSheetViewProps> = ({ transactions }) => {
  const { logAction } = useSiteContext();

  // --- STATE ---
  const [startingBalance, setStartingBalance] = useState<number>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.STARTING_BALANCE);
    return saved ? parseFloat(saved) : 0;
  });

  const [items, setItems] = useState<BalanceSheetItem[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.BALANCE_SHEET);
    if (saved) {
       return JSON.parse(saved);
    }
    return DEFAULT_ITEMS;
  });

  const currentYear = new Date().getFullYear();
  const [selectedSnapshot, setSelectedSnapshot] = useState<string>('today');
  const [isAdding, setIsAdding] = useState(false);
  
  // Edit State
  const [editItem, setEditItem] = useState<Partial<BalanceSheetItem>>({
    name: '',
    value: 0,
    type: 'asset',
    category: 'other',
    isCalculated: false,
    initialValue: 0,
    linkedCategories: [],
    linkedKeywords: '',
    maxValue: 0
  });

  // Category Config Sub-modal State
  const [configuringCategory, setConfiguringCategory] = useState<{ index: number, entry: any } | null>(null);

  // --- PERSISTENCE ---
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.STARTING_BALANCE, startingBalance.toString());
  }, [startingBalance]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.BALANCE_SHEET, JSON.stringify(items));
  }, [items]);

  // --- HELPERS ---
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    transactions.forEach(t => {
      const d = new Date(t.date);
      if (!isNaN(d.getTime())) years.add(d.getFullYear());
    });
    years.add(currentYear);
    return Array.from(years).sort((a, b) => b - a);
  }, [transactions, currentYear]);

  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    transactions.forEach(t => t.category && cats.add(t.category));
    return Array.from(cats).sort();
  }, [transactions]);

  const snapshotTransactions = useMemo(() => {
    if (selectedSnapshot === 'today') return transactions;
    const cutoff = `${selectedSnapshot}-12-31`;
    return transactions.filter(t => t.date <= cutoff);
  }, [transactions, selectedSnapshot]);

  // --- CORE CALCULATION LOGIC ---
  const getPeriodKey = (dateStr: string, period?: string) => {
    const d = new Date(dateStr);
    const y = d.getFullYear();
    const m = d.getMonth() + 1; // 1-12
    if (period === 'quarterly') {
      const q = Math.ceil(m / 3);
      return `${y}-Q${q}`;
    }
    if (period === 'yearly') return `${y}`;
    // Default monthly
    return `${y}-${String(m).padStart(2, '0')}`;
  };

  const calculateDynamicValue = (item: BalanceSheetItem | Partial<BalanceSheetItem>) => {
    if (!item.isCalculated) return item.value || 0;

    let runningTotal = item.initialValue || 0;
    const globalKeywords = item.linkedKeywords ? item.linkedKeywords.toLowerCase().split(',').map(k => k.trim()) : [];

    // Normalize categories to objects
    const categories = (item.linkedCategories || []).map(c => 
      typeof c === 'string' ? { name: c, cap: 0, period: 'lifetime' } : { ...c, period: c.period || 'lifetime' }
    );

    for (const catConfig of categories) {
      // 1. Filter relevant transactions
      const catTxs = snapshotTransactions.filter(t => {
         const matchesCat = t.category.toLowerCase() === catConfig.name.toLowerCase();
         const matchesKey = globalKeywords.length === 0 || globalKeywords.some(k => t.description.toLowerCase().includes(k));
         return matchesCat && matchesKey;
      });

      // 2. Determine Impact (Sign)
      // Asset: Expense contributes (+), Income reduces (-) -> e.g. WIP Investment
      // Liability: Income increases (+), Expense reduces (-) -> e.g. Loan Balance
      const getTxImpact = (t: Transaction) => {
         if (item.type === 'asset') return t.type === 'expense' ? t.amount : -t.amount;
         return t.type === 'income' ? t.amount : -t.amount;
      };

      // 3. Apply Grouping & Caps
      if (!catConfig.cap || catConfig.period === 'lifetime') {
         // Simple lifetime sum (clamped only if cap exists on lifetime)
         const totalImpact = catTxs.reduce((sum, t) => sum + getTxImpact(t), 0);
         const contribution = (catConfig.cap && totalImpact > catConfig.cap) ? catConfig.cap : totalImpact;
         runningTotal += contribution;
      } else {
         // Periodic grouping
         const groups: Record<string, number> = {};
         catTxs.forEach(t => {
            const key = getPeriodKey(t.date, catConfig.period);
            groups[key] = (groups[key] || 0) + getTxImpact(t);
         });

         Object.values(groups).forEach(amount => {
            // Apply cap only to positive growth (investment/debt increase)
            // If amount is negative (refund/payment), allow full reduction usually
            let effective = amount;
            if (amount > 0 && catConfig.cap) {
               effective = Math.min(amount, catConfig.cap);
            }
            runningTotal += effective;
         });
      }
    }

    // 4. Global Item Cap
    if (item.maxValue && item.maxValue > 0) {
       runningTotal = Math.min(runningTotal, item.maxValue);
    }

    return Math.max(0, runningTotal);
  };

  const calculatedCash = useMemo(() => {
    const income = snapshotTransactions.filter(t => t.type === 'income').reduce((a, b) => a + b.amount, 0);
    const expense = snapshotTransactions.filter(t => t.type === 'expense').reduce((a, b) => a + b.amount, 0);
    return startingBalance + (income - expense);
  }, [snapshotTransactions, startingBalance]);

  const processedItems = useMemo(() => {
    return items.map(item => ({
      ...item,
      currentSnapshotValue: calculateDynamicValue(item)
    }));
  }, [items, snapshotTransactions]); // eslint-disable-line

  const totalAssets = useMemo(() => {
    const itemsValue = processedItems.filter(i => i.type === 'asset').reduce((a, b) => a + b.currentSnapshotValue, 0);
    return (calculatedCash > 0 ? calculatedCash : 0) + itemsValue;
  }, [processedItems, calculatedCash]);

  const totalLiabilities = useMemo(() => {
    const itemsValue = processedItems.filter(i => i.type === 'liability').reduce((a, b) => a + b.currentSnapshotValue, 0);
    return itemsValue + (calculatedCash < 0 ? Math.abs(calculatedCash) : 0);
  }, [processedItems, calculatedCash]);

  const netWorth = totalAssets - totalLiabilities;

  // --- FORM HANDLERS ---
  const handleSaveItem = () => {
    if (!editItem.name) return;
    
    const newItem: BalanceSheetItem = {
      id: editItem.id || crypto.randomUUID(),
      name: editItem.name!,
      value: Number(editItem.value || 0),
      type: editItem.type as 'asset' | 'liability',
      category: editItem.category as any,
      isCalculated: !!editItem.isCalculated,
      initialValue: Number(editItem.initialValue || 0),
      linkedCategories: editItem.linkedCategories || [],
      linkedKeywords: editItem.linkedKeywords || '',
      maxValue: Number(editItem.maxValue || 0)
    };

    if (editItem.id) {
       setItems(items.map(i => i.id === editItem.id ? newItem : i));
       logAction(`Updated Balance Sheet item: ${newItem.name}`);
    } else {
       setItems([...items, newItem]);
       logAction(`Added Balance Sheet item: ${newItem.name}`);
    }
    
    setEditItem({ name: '', value: 0, type: 'asset', category: 'other', isCalculated: false, initialValue: 0, linkedCategories: [], linkedKeywords: '', maxValue: 0 });
    setIsAdding(false);
  };

  const startEdit = (item: BalanceSheetItem) => {
    setEditItem(item);
    setIsAdding(true);
  };

  const handleRemoveItem = (id: string) => {
    setItems(items.filter(i => i.id !== id));
    logAction(`Removed Balance Sheet item`);
  };

  const addCategoryToItem = (cat: string) => {
    const current = editItem.linkedCategories || [];
    // Check duplicates
    if (current.some(c => (typeof c === 'string' ? c : c.name) === cat)) return;
    setEditItem({ ...editItem, linkedCategories: [...current, cat] });
  };

  const removeCategoryFromItem = (index: number) => {
    const current = [...(editItem.linkedCategories || [])];
    current.splice(index, 1);
    setEditItem({ ...editItem, linkedCategories: current });
  };

  const updateCategoryConfig = (index: number, updates: any) => {
    const current = [...(editItem.linkedCategories || [])];
    const item = current[index];
    const name = typeof item === 'string' ? item : item.name;
    
    current[index] = {
      name,
      cap: updates.cap ? parseFloat(updates.cap) : undefined,
      period: updates.period
    };
    setEditItem({ ...editItem, linkedCategories: current });
    setConfiguringCategory(null);
  };

  const getIcon = (category?: string) => {
    switch(category) {
      case 'property': return <Building2 size={16} />;
      case 'investment': return <TrendingUp size={16} />;
      case 'debt': return <CreditCard size={16} />;
      case 'cash': return <Wallet size={16} />;
      case 'other': return <Briefcase size={16} />;
      default: return <DollarSign size={16} />;
    }
  };

  return (
    <div className="max-w-6xl mx-auto pb-12 space-y-8 animate-fade-in">
      
      {/* HEADER & TIME TRAVEL */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-800 pb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center">
            <Landmark className="text-emerald-400 mr-3" size={28} />
            Balance Sheet
          </h1>
          <p className="text-slate-400 mt-1 flex items-center">
            Company Financial Position — Sneak Peek
            <span className="ml-2 text-xs bg-indigo-900/30 text-indigo-300 px-2 py-0.5 rounded border border-indigo-500/20">Governance Active</span>
          </p>
        </div>

        <div className="flex items-center space-x-2 bg-slate-900 p-1 rounded-lg border border-slate-800">
           <Calendar className="text-slate-500 ml-2" size={16}/>
           <span className="text-sm text-slate-400 font-medium">As of:</span>
           <select 
             value={selectedSnapshot}
             onChange={(e) => setSelectedSnapshot(e.target.value)}
             className="bg-transparent text-white text-sm font-bold p-2 outline-none cursor-pointer"
           >
             <option value="today">Today</option>
             {availableYears.map(y => (
               <option key={y} value={y}>End of {y}</option>
             ))}
           </select>
        </div>
      </div>

      {/* SUMMARY CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-lg relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500 transition-all group-hover:w-2"></div>
          <p className="text-slate-400 text-sm font-medium mb-1 flex items-center">
            <TrendingUp size={16} className="mr-2 text-emerald-500"/> Total Assets
          </p>
          <h2 className="text-3xl font-bold text-white tracking-tight">
            ${totalAssets.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </h2>
          <p className="text-[10px] text-slate-500 mt-1">Cash, Accounts Receivable, Equipment</p>
        </div>

        <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-lg relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-1 h-full bg-rose-500 transition-all group-hover:w-2"></div>
          <p className="text-slate-400 text-sm font-medium mb-1 flex items-center">
             <TrendingDown size={16} className="mr-2 text-rose-500"/> Total Liabilities
          </p>
          <h2 className="text-3xl font-bold text-white tracking-tight">
            ${totalLiabilities.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </h2>
          <p className="text-[10px] text-slate-500 mt-1">Loans, Accounts Payable</p>
        </div>

        <div className="bg-gradient-to-br from-blue-900 to-slate-900 p-6 rounded-xl border border-blue-500/30 shadow-lg relative overflow-hidden">
          <p className="text-blue-200 text-sm font-medium mb-1 flex items-center">
             <Landmark size={16} className="mr-2"/> Total Equity
          </p>
          <h2 className="text-4xl font-bold text-white tracking-tight">
            ${netWorth.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </h2>
          <p className="text-[10px] text-blue-300 mt-1">Net Book Value</p>
        </div>
      </div>

      {/* EDIT MODAL */}
      {isAdding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
           <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl relative">
              <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-800/50">
                 <h3 className="text-xl font-bold text-white">{editItem.id ? 'Edit Item' : 'Add Asset/Liability'}</h3>
                 <button onClick={() => setIsAdding(false)} className="text-slate-400 hover:text-white"><X size={24}/></button>
              </div>
              
              <div className="p-6 space-y-6">
                 {/* Basic Info */}
                 <div className="grid grid-cols-2 gap-4">
                    <div>
                       <label className="text-xs text-slate-500 uppercase font-bold mb-1 block">Item Name</label>
                       <input type="text" className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white" value={editItem.name} onChange={e => setEditItem({...editItem, name: e.target.value})} placeholder="e.g. Sneak Peek WIP" />
                    </div>
                    <div>
                       <label className="text-xs text-slate-500 uppercase font-bold mb-1 block">Type</label>
                       <select className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white" value={editItem.type} onChange={e => setEditItem({...editItem, type: e.target.value as any})}>
                          <option value="asset">Asset (Business Owned)</option>
                          <option value="liability">Liability (Business Owed)</option>
                       </select>
                    </div>
                    <div>
                       <label className="text-xs text-slate-500 uppercase font-bold mb-1 block">Category</label>
                       <select className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white" value={editItem.category} onChange={e => setEditItem({...editItem, category: e.target.value as any})}>
                          <option value="other">Other</option>
                          <option value="property">Property / Equipment</option>
                          <option value="investment">Investments / IP</option>
                          <option value="debt">Liabilities / Loans</option>
                          <option value="cash">Cash / Reserves</option>
                       </select>
                    </div>
                 </div>

                 {/* Calculation Mode */}
                 <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                    <label className="text-xs text-slate-500 uppercase font-bold mb-3 block">Value Source</label>
                    <div className="flex space-x-4 mb-4">
                       <button onClick={() => setEditItem({...editItem, isCalculated: false})} className={`flex-1 py-2 rounded-lg border text-sm flex items-center justify-center ${!editItem.isCalculated ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-900 border-slate-700 text-slate-400'}`}>
                          <DollarSign size={16} className="mr-2"/> Manual Entry
                       </button>
                       <button onClick={() => setEditItem({...editItem, isCalculated: true})} className={`flex-1 py-2 rounded-lg border text-sm flex items-center justify-center ${editItem.isCalculated ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-900 border-slate-700 text-slate-400'}`}>
                          <Calculator size={16} className="mr-2"/> Auto-Calculated
                       </button>
                    </div>

                    {!editItem.isCalculated ? (
                       <div>
                          <label className="text-xs text-slate-500 mb-1 block">Current Value ($)</label>
                          <input type="number" className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white font-mono" value={editItem.value} onChange={e => setEditItem({...editItem, value: parseFloat(e.target.value)})} placeholder="0.00" />
                       </div>
                    ) : (
                       <div className="space-y-4 animate-fade-in">
                          <p className="text-xs text-indigo-300 bg-indigo-900/20 p-2 rounded border border-indigo-500/20">
                             Calculated dynamically from transactions. Add governed categories to track Project WIP.
                          </p>
                          <div className="grid grid-cols-2 gap-4">
                             <div>
                                <label className="text-xs text-slate-500 mb-1 block">Starting / Initial Value ($)</label>
                                <input type="number" className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white font-mono" value={editItem.initialValue} onChange={e => setEditItem({...editItem, initialValue: parseFloat(e.target.value)})} placeholder="0.00" />
                             </div>
                             <div>
                                <label className="text-xs text-slate-500 mb-1 flex items-center"><Lock size={12} className="mr-1"/> Global Max Cap ($)</label>
                                <input type="number" className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white font-mono" value={editItem.maxValue || ''} onChange={e => setEditItem({...editItem, maxValue: parseFloat(e.target.value)})} placeholder="No Limit" />
                             </div>
                          </div>
                          
                          <div>
                             <label className="text-xs text-slate-500 mb-2 flex items-center justify-between">
                               <span>Linked Transactions & Governance</span>
                               <span className="text-[10px] text-slate-600">Select tags to track</span>
                             </label>
                             
                             {/* SELECTED TAGS LIST */}
                             <div className="flex flex-wrap gap-2 mb-3">
                                {editItem.linkedCategories?.map((cat, idx) => {
                                   const isObj = typeof cat !== 'string';
                                   const name = isObj ? (cat as any).name : cat;
                                   const hasCap = isObj && (cat as any).cap;
                                   
                                   return (
                                     <div key={idx} className="flex items-center bg-indigo-900/40 border border-indigo-500/30 rounded-lg pl-2 pr-1 py-1 text-xs text-indigo-200 group">
                                        <span className="mr-2 font-medium">{name}</span>
                                        {hasCap && <span className="text-[10px] bg-indigo-950 px-1 rounded mr-2 border border-indigo-800">${(cat as any).cap}/{(cat as any).period?.substring(0,2)}</span>}
                                        
                                        <button onClick={() => setConfiguringCategory({ index: idx, entry: cat })} className="p-1 hover:text-white text-indigo-400">
                                           <Settings2 size={12} />
                                        </button>
                                        <button onClick={() => removeCategoryFromItem(idx)} className="p-1 hover:text-red-400 text-indigo-400 ml-1">
                                           <X size={12} />
                                        </button>
                                     </div>
                                   );
                                })}
                                {editItem.linkedCategories?.length === 0 && <span className="text-xs text-slate-600 italic py-1">No categories linked. Select below.</span>}
                             </div>

                             {/* AVAILABLE TAGS CLOUD */}
                             <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 bg-slate-900 rounded border border-slate-800">
                                {availableCategories.map(cat => {
                                   const isSelected = editItem.linkedCategories?.some(c => (typeof c === 'string' ? c : c.name) === cat);
                                   if (isSelected) return null;
                                   return (
                                     <button 
                                       key={cat} 
                                       onClick={() => addCategoryToItem(cat)}
                                       className="text-xs px-2 py-1 rounded-full border bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200 transition-colors"
                                     >
                                        + {cat}
                                     </button>
                                   );
                                })}
                             </div>
                          </div>
                       </div>
                    )}
                 </div>
              </div>

              {/* CATEGORY CONFIG OVERLAY */}
              {configuringCategory && (
                 <div className="absolute inset-0 bg-slate-900/95 z-20 flex items-center justify-center p-6 backdrop-blur-sm rounded-xl">
                    <div className="w-full max-w-sm bg-slate-800 border border-slate-600 p-6 rounded-xl shadow-2xl">
                       <h4 className="text-white font-bold mb-4 flex items-center">
                          <Settings2 size={18} className="mr-2 text-indigo-400"/>
                          Governance: {typeof configuringCategory.entry === 'string' ? configuringCategory.entry : configuringCategory.entry.name}
                       </h4>
                       <div className="space-y-4">
                          <div>
                             <label className="text-xs text-slate-400 mb-1 block">Cap Limit ($)</label>
                             <input 
                                type="number" 
                                className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white" 
                                placeholder="No Cap"
                                defaultValue={configuringCategory.entry.cap}
                                id="conf_cap"
                             />
                          </div>
                          <div>
                             <label className="text-xs text-slate-400 mb-1 block">Time Period</label>
                             <select className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white" id="conf_period" defaultValue={configuringCategory.entry.period || 'lifetime'}>
                                <option value="monthly">Monthly (e.g. max $10k/mo)</option>
                                <option value="quarterly">Quarterly</option>
                                <option value="yearly">Yearly</option>
                                <option value="lifetime">Lifetime (Total Project)</option>
                             </select>
                          </div>
                          <div className="flex justify-end gap-3 pt-4">
                             <button onClick={() => setConfiguringCategory(null)} className="px-3 py-2 text-sm text-slate-400 hover:text-white">Cancel</button>
                             <button 
                                onClick={() => updateCategoryConfig(configuringCategory.index, {
                                   cap: (document.getElementById('conf_cap') as HTMLInputElement).value,
                                   period: (document.getElementById('conf_period') as HTMLSelectElement).value
                                })} 
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-sm font-bold"
                             >
                                Apply Rule
                             </button>
                          </div>
                       </div>
                    </div>
                 </div>
              )}

              <div className="p-6 border-t border-slate-800 flex justify-end space-x-3 bg-slate-800/50 rounded-b-xl">
                 <button onClick={() => setIsAdding(false)} className="px-4 py-2 text-slate-400 hover:text-white transition-colors">Cancel</button>
                 <button onClick={handleSaveItem} className="px-6 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg font-bold shadow-lg shadow-green-900/20">Save Item</button>
              </div>
           </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* ASSETS COLUMN */}
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-emerald-400 flex items-center">
            Assets <span className="text-xs text-slate-500 ml-2 font-normal">(Business Owned)</span>
          </h3>
          
          <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
             {/* AUTOMATED CASH ROW */}
             <div className="p-4 border-b border-slate-800/50 flex justify-between items-center bg-slate-800/20">
                <div className="flex items-center">
                   <div className="p-2 bg-emerald-900/20 text-emerald-400 rounded-lg mr-3">
                      <Wallet size={18} />
                   </div>
                   <div>
                      <h4 className="font-semibold text-white">Cash & Equivalents</h4>
                      <p className="text-xs text-slate-500">Auto-calculated from Transactions</p>
                   </div>
                </div>
                <div className="text-right">
                   <div className={`font-mono font-bold text-lg ${calculatedCash < 0 ? 'text-rose-400' : 'text-white'}`}>
                      ${calculatedCash.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                   </div>
                   <div className="flex items-center justify-end gap-2 mt-1">
                      <label className="text-[10px] text-slate-500">Starting Balance Adj:</label>
                      <input 
                        type="number" 
                        value={startingBalance}
                        onChange={(e) => setStartingBalance(parseFloat(e.target.value) || 0)}
                        className="w-20 bg-slate-950 border border-slate-700 rounded px-1 py-0.5 text-[10px] text-right text-slate-300 focus:border-blue-500 outline-none"
                      />
                   </div>
                </div>
             </div>

             {/* ASSETS LIST */}
             <div className="divide-y divide-slate-800">
                {processedItems.filter(i => i.type === 'asset').map(item => (
                   <div key={item.id} className="p-4 flex justify-between items-center hover:bg-slate-800/30 transition-colors group cursor-pointer" onClick={() => startEdit(item)}>
                      <div className="flex items-center">
                         <div className="p-2 bg-slate-800 text-slate-400 rounded-lg mr-3 relative">
                            {getIcon(item.category)}
                            {item.isCalculated && <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-indigo-500 rounded-full border border-slate-900"></div>}
                         </div>
                         <div>
                            <span className="text-slate-200 font-medium block">{item.name}</span>
                            <div className="flex items-center space-x-2 mt-0.5">
                               {item.name.includes("Sneak Peek") && <span className="text-[9px] bg-blue-900/50 text-blue-300 px-1.5 rounded border border-blue-800">Project WIP</span>}
                               {item.isCalculated && <span className="text-[10px] text-indigo-400 flex items-center"><ArrowLeftRight size={10} className="mr-1"/> Linked</span>}
                               {item.maxValue && item.maxValue > 0 && <span className="text-[10px] text-amber-500 flex items-center"><Lock size={10} className="mr-1"/> Max ${item.maxValue.toLocaleString()}</span>}
                            </div>
                         </div>
                      </div>
                      <div className="flex items-center space-x-4">
                         <span className="font-mono text-emerald-400 font-semibold">
                            ${item.currentSnapshotValue.toLocaleString()}
                         </span>
                         <button 
                           onClick={(e) => { e.stopPropagation(); handleRemoveItem(item.id); }}
                           className="text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                         >
                            <Trash2 size={16} />
                         </button>
                      </div>
                   </div>
                ))}
             </div>
          </div>
        </div>

        {/* LIABILITIES COLUMN */}
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-rose-400 flex items-center">
            Liabilities <span className="text-xs text-slate-500 ml-2 font-normal">(Business Owed)</span>
          </h3>

          <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden min-h-[100px]">
             {calculatedCash < 0 && (
                <div className="p-4 border-b border-slate-800/50 flex justify-between items-center bg-rose-900/10">
                   <div className="flex items-center">
                      <div className="p-2 bg-rose-900/20 text-rose-400 rounded-lg mr-3">
                         <Wallet size={18} />
                      </div>
                      <div>
                         <h4 className="font-semibold text-rose-200">Cash Overdraft</h4>
                         <p className="text-xs text-rose-400/70">Negative cash balance</p>
                      </div>
                   </div>
                   <div className="font-mono font-bold text-rose-400 text-lg">
                      ${Math.abs(calculatedCash).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                   </div>
                </div>
             )}

             <div className="divide-y divide-slate-800">
                {processedItems.filter(i => i.type === 'liability').map(item => (
                   <div key={item.id} className="p-4 flex justify-between items-center hover:bg-slate-800/30 transition-colors group cursor-pointer" onClick={() => startEdit(item)}>
                      <div className="flex items-center">
                         <div className="p-2 bg-slate-800 text-slate-400 rounded-lg mr-3 relative">
                            {getIcon(item.category)}
                            {item.isCalculated && <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-indigo-500 rounded-full border border-slate-900"></div>}
                         </div>
                         <div>
                            <span className="text-slate-200 font-medium block">{item.name}</span>
                            <div className="flex items-center space-x-2 mt-0.5">
                               {item.isCalculated && <span className="text-[10px] text-indigo-400 flex items-center"><ArrowLeftRight size={10} className="mr-1"/> Linked</span>}
                               {item.maxValue && item.maxValue > 0 && <span className="text-[10px] text-amber-500 flex items-center"><Lock size={10} className="mr-1"/> Max ${item.maxValue.toLocaleString()}</span>}
                            </div>
                         </div>
                      </div>
                      <div className="flex items-center space-x-4">
                         <span className="font-mono text-rose-400 font-semibold">
                            ${item.currentSnapshotValue.toLocaleString()}
                         </span>
                         <button 
                           onClick={(e) => { e.stopPropagation(); handleRemoveItem(item.id); }}
                           className="text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                         >
                            <Trash2 size={16} />
                         </button>
                      </div>
                   </div>
                ))}
             </div>
             
             {processedItems.filter(i => i.type === 'liability').length === 0 && calculatedCash >= 0 && (
                <div className="p-8 text-center text-slate-500 italic text-sm">
                   No liabilities recorded.
                </div>
             )}
          </div>
        </div>
      </div>

      {/* ADD ITEM TRIGGER */}
      {!isAdding && (
         <button 
           onClick={() => {
              setEditItem({ name: '', value: 0, type: 'asset', category: 'other', isCalculated: false, initialValue: 0, linkedCategories: [], linkedKeywords: '', maxValue: 0 });
              setIsAdding(true);
           }}
           className="w-full py-4 border-2 border-dashed border-slate-700 rounded-lg text-slate-400 hover:text-blue-400 hover:border-blue-500/50 hover:bg-slate-800/50 transition-all flex items-center justify-center font-medium"
         >
           <Plus size={20} className="mr-2" /> Add Asset or Liability
         </button>
      )}

    </div>
  );
};
