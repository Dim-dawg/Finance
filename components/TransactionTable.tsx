
import React, { useState, useEffect, useMemo } from 'react';
import { Transaction } from '../types';
import { Search, Save, Edit2, Trash2, Download, Wand2, Calendar, Filter, X, RefreshCw, AlertTriangle, AlertCircle, Tag, FileText } from 'lucide-react';
import { useSiteContext } from '../context/SiteContext';

interface TransactionTableProps {
  transactions: Transaction[];
  deletedTransactions?: Transaction[];
  onUpdate: (updated: Transaction) => void;
  onDelete: (id: string) => void;
  onRestore?: (id: string) => void;
  onPermanentDelete?: (id: string) => void;
  onQuickRule: (tx: Transaction) => void;
  categories: string[];
  onAddCategory: (category: string) => void;
  onManageRules: () => void;
}

export const TransactionTable: React.FC<TransactionTableProps> = ({ 
  transactions, 
  deletedTransactions = [], 
  onUpdate, 
  onDelete, 
  onRestore, 
  onPermanentDelete, 
  onQuickRule,
  categories,
  onAddCategory,
  onManageRules
}) => {
  const { updatePageData, logAction } = useSiteContext();
  const [search, setSearch] = useState('');
  
  // Filters
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // View Mode: Active vs Trash
  const [viewMode, setViewMode] = useState<'active' | 'trash'>('active');

  // Deletion Confirmation Logic
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Transaction>>({});

  // Report Search Filter to Site Awareness
  useEffect(() => {
    updatePageData('searchFilter', search);
  }, [search, updatePageData]);

  // Derive available years from data
  const years = useMemo(() => {
    const y = new Set<string>();
    const all = [...transactions, ...deletedTransactions];
    all.forEach(t => {
      const d = new Date(t.date);
      if (!isNaN(d.getTime())) {
        y.add(d.getFullYear().toString());
      }
    });
    return Array.from(y).sort((a, b) => Number(b) - Number(a));
  }, [transactions, deletedTransactions]);

  // Sort categories alphabetically
  const sortedCategories = useMemo(() => {
    return [...categories].sort((a, b) => a.localeCompare(b));
  }, [categories]);

  const months = [
    { value: '01', label: 'January' }, { value: '02', label: 'February' },
    { value: '03', label: 'March' }, { value: '04', label: 'April' },
    { value: '05', label: 'May' }, { value: '06', label: 'June' },
    { value: '07', label: 'July' }, { value: '08', label: 'August' },
    { value: '09', label: 'September' }, { value: '10', label: 'October' },
    { value: '11', label: 'November' }, { value: '12', label: 'December' }
  ];

  const sourceData = viewMode === 'active' ? transactions : deletedTransactions;

  const filtered = sourceData.filter(t => {
    // 1. Text Search
    const matchesSearch = (t.description || '').toLowerCase().includes(search.toLowerCase()) || 
                          (t.category || '').toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;

    // 2. Year Filter
    if (selectedYear !== 'all' && !t.date.startsWith(selectedYear)) {
      return false;
    }

    // 3. Month Filter
    if (selectedMonth !== 'all') {
      const parts = t.date.split('-');
      if (parts.length > 1 && parts[1] !== selectedMonth) {
        return false;
      }
    }

    // 4. Category Filter (Case-insensitive)
    if (selectedCategory !== 'all') {
      const txCat = (t.category || '').toLowerCase().trim();
      const filterCat = selectedCategory.toLowerCase().trim();
      if (txCat !== filterCat) return false;
    }

    return true;
  });

  const startEdit = (t: Transaction) => {
    setEditingId(t.transaction_id);
    setEditForm(t);
    logAction(`Started editing transaction ${t.description}`);
  };

  const saveEdit = () => {
    if (editingId && editForm.transaction_id) {
      // Auto-add category if it doesn't exist
      if (editForm.category) {
        const catName = editForm.category.trim();
        // Case-insensitive check
        const exists = categories.some(c => c.toLowerCase() === catName.toLowerCase());
        if (!exists && catName.length > 0) {
           onAddCategory(catName);
           logAction(`Auto-added new category from edit: ${catName}`);
        }
      }

      onUpdate(editForm as Transaction);
      setEditingId(null);
      logAction(`Saved edits for transaction ${editForm.description}`);
    }
  };

  const confirmDelete = () => {
    if (confirmDeleteId) {
      if (viewMode === 'active') {
        onDelete(confirmDeleteId);
      } else if (viewMode === 'trash' && onPermanentDelete) {
        onPermanentDelete(confirmDeleteId);
      }
      setConfirmDeleteId(null);
    }
  };

  const downloadCsv = () => {
    logAction('Downloaded Transactions CSV');
    const headers = ['Date', 'Description', 'Category', 'Type', 'Amount', 'Notes'];
    const rows = filtered.map(t => [
      t.date,
      `"${(t.description || '').replace(/"/g, '""')}"`, // Escape quotes
      t.category || '',
      t.type,
      t.amount,
      `"${(t.notes || '').replace(/"/g, '""')}"`
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `dim_dawg_transactions_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const clearFilters = () => {
    setSearch('');
    setSelectedYear('all');
    setSelectedMonth('all');
    setSelectedCategory('all');
  };

  const hasActiveFilters = search || selectedYear !== 'all' || selectedMonth !== 'all' || selectedCategory !== 'all';

  return (
    <>
      <div className={`bg-slate-900 rounded-xl shadow-sm border overflow-hidden transition-colors ${viewMode === 'trash' ? 'border-red-900/50' : 'border-slate-800'}`}>
        {/* TOOLBAR */}
        <div className={`p-4 border-b flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 ${viewMode === 'trash' ? 'bg-red-900/10 border-red-900/30' : 'border-slate-800'}`}>
          
          {/* Left: Title & Actions */}
          <div className="flex items-center space-x-4 w-full lg:w-auto justify-between lg:justify-start">
            <div className="flex items-center">
              {viewMode === 'trash' ? (
                 <div className="flex items-center text-red-400">
                    <Trash2 size={20} className="mr-2" />
                    <h3 className="text-lg font-bold mr-3">Trash Bin</h3>
                 </div>
              ) : (
                <h3 className="text-lg font-bold text-slate-100 mr-3">Transactions</h3>
              )}
              <span className={`text-xs px-2 py-1 rounded-full border ${viewMode === 'trash' ? 'bg-red-950 border-red-800 text-red-300' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>
                 {filtered.length} visible
              </span>
            </div>

            <div className="flex space-x-2">
               {viewMode === 'active' && (
                 <>
                   <button 
                     onClick={downloadCsv}
                     className="hidden sm:flex items-center space-x-1 text-sm text-blue-400 hover:text-blue-300 bg-blue-900/30 hover:bg-blue-900/50 px-3 py-1.5 rounded-lg transition-colors border border-blue-500/30"
                   >
                     <Download size={14} />
                     <span>Export</span>
                   </button>
                   <button 
                     onClick={onManageRules}
                     className="hidden sm:flex items-center space-x-1 text-sm text-amber-400 hover:text-amber-300 bg-amber-900/30 hover:bg-amber-900/50 px-3 py-1.5 rounded-lg transition-colors border border-amber-500/30"
                   >
                     <FileText size={14} />
                     <span>Rules</span>
                   </button>
                 </>
               )}
               
               <button 
                 onClick={() => setViewMode(viewMode === 'active' ? 'trash' : 'active')}
                 className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg transition-colors text-sm border ${
                    viewMode === 'active' 
                      ? 'bg-slate-800 text-slate-400 border-slate-700 hover:text-red-400 hover:border-red-500/50' 
                      : 'bg-slate-800 text-slate-200 border-slate-600 hover:bg-slate-700'
                 }`}
               >
                 {viewMode === 'active' ? (
                    <>
                       <Trash2 size={14} />
                       <span className="hidden sm:inline">Trash ({deletedTransactions.length})</span>
                    </>
                 ) : (
                    <>
                       <X size={14} />
                       <span>Close Trash</span>
                    </>
                 )}
               </button>
            </div>
          </div>

          {/* Right: Filters */}
          <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto flex-wrap">
            
            {/* Year Select */}
            <div className="relative min-w-[90px]">
              <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
              <select 
                value={selectedYear} 
                onChange={(e) => setSelectedYear(e.target.value)}
                className="w-full pl-8 pr-6 py-2 bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer hover:bg-slate-700 transition-colors"
              >
                <option value="all">Year</option>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>

            {/* Month Select */}
            <div className="relative min-w-[100px]">
               <select 
                 value={selectedMonth} 
                 onChange={(e) => setSelectedMonth(e.target.value)}
                 className="w-full pl-3 pr-6 py-2 bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer hover:bg-slate-700 transition-colors"
               >
                 <option value="all">Month</option>
                 {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
               </select>
            </div>

            {/* Category Select */}
            <div className="relative min-w-[130px]">
               <Tag className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
               <select 
                 value={selectedCategory} 
                 onChange={(e) => setSelectedCategory(e.target.value)}
                 className="w-full pl-8 pr-6 py-2 bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer hover:bg-slate-700 transition-colors"
               >
                 <option value="all">Category</option>
                 {sortedCategories.map(c => <option key={c} value={c}>{c}</option>)}
               </select>
            </div>

            {/* Search Input */}
            <div className="relative flex-1 sm:min-w-[150px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500" size={16} />
              <input 
                type="text" 
                placeholder="Search..." 
                className="w-full pl-10 pr-8 py-2 bg-slate-800 border border-slate-700 text-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button 
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            
            {/* Clear All */}
            {hasActiveFilters && (
               <button 
                  onClick={clearFilters}
                  className="flex items-center justify-center p-2 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors"
                  title="Clear Filters"
               >
                  <Filter size={16} className="strikethrough" />
               </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className={`text-xs uppercase font-semibold ${viewMode === 'trash' ? 'bg-red-900/20 text-red-300' : 'bg-slate-800/50 text-slate-400'}`}>
              <tr>
                <th className="px-4 sm:px-6 py-3">Date</th>
                <th className="px-4 sm:px-6 py-3">Description</th>
                <th className="px-4 sm:px-6 py-3">Category</th>
                <th className="px-4 sm:px-6 py-3 text-right">Amount</th>
                <th className="px-4 sm:px-6 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-sm">
              {filtered.map(t => (
                <tr key={t.transaction_id} className={`hover:bg-slate-800/50 ${viewMode === 'trash' ? 'opacity-75' : ''}`}>
                  {editingId === t.transaction_id ? (
                    <>
                      <td className="px-4 sm:px-6 py-3">
                        <input 
                          type="date" 
                          value={editForm.date} 
                          onChange={e => setEditForm({...editForm, date: e.target.value})}
                          className="w-full border border-slate-600 bg-slate-700 text-white rounded p-1 min-w-[100px]"
                        />
                      </td>
                      <td className="px-4 sm:px-6 py-3">
                        <input 
                          type="text" 
                          value={editForm.description} 
                          onChange={e => setEditForm({...editForm, description: e.target.value})}
                          className="w-full border border-slate-600 bg-slate-700 text-white rounded p-1 min-w-[120px]"
                        />
                      </td>
                      <td className="px-4 sm:px-6 py-3">
                        <input 
                          type="text" 
                          value={editForm.category} 
                          list="category-suggestions"
                          onChange={e => setEditForm({...editForm, category: e.target.value})}
                          className="w-full border border-slate-600 bg-slate-700 text-white rounded p-1 min-w-[100px]"
                        />
                        <datalist id="category-suggestions">
                           {sortedCategories.map(c => <option key={c} value={c} />)}
                        </datalist>
                      </td>
                      <td className="px-4 sm:px-6 py-3 text-right">
                        <input 
                          type="number" 
                          value={editForm.amount} 
                          onChange={e => setEditForm({...editForm, amount: parseFloat(e.target.value)})}
                          className="w-full border border-slate-600 bg-slate-700 text-white rounded p-1 text-right min-w-[80px]"
                        />
                      </td>
                      <td className="px-4 sm:px-6 py-3 flex justify-center space-x-2">
                        <button onClick={saveEdit} className="text-green-500 hover:bg-green-900/30 p-1 rounded"><Save size={16} /></button>
                        <button onClick={() => setEditingId(null)} className="text-slate-500 hover:bg-slate-700 p-1 rounded">X</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 sm:px-6 py-3 text-slate-400 whitespace-nowrap">{t.date}</td>
                      <td className="px-4 sm:px-6 py-3 font-medium text-slate-200 min-w-[150px]">{t.description || 'Unknown'}</td>
                      <td className="px-4 sm:px-6 py-3">
                        <span className="px-2 py-1 bg-slate-800 text-slate-300 rounded text-xs whitespace-nowrap">
                          {t.category || 'Uncategorized'}
                        </span>
                      </td>
                      <td className={`px-4 sm:px-6 py-3 text-right font-semibold whitespace-nowrap ${t.type === 'income' ? 'text-green-500' : 'text-slate-200'}`}>
                        {t.type === 'income' ? '+' : '-'}${t.amount.toFixed(2)}
                      </td>
                      <td className="px-4 sm:px-6 py-3 flex justify-center space-x-2">
                        {viewMode === 'active' ? (
                          <>
                            <button 
                               onClick={() => onQuickRule(t)} 
                               title="Create Rule from this"
                               className="text-slate-500 hover:text-amber-400"
                            >
                              <Wand2 size={16} />
                            </button>
                            <button onClick={() => startEdit(t)} className="text-slate-500 hover:text-blue-400"><Edit2 size={16} /></button>
                            <button onClick={() => setConfirmDeleteId(t.transaction_id)} className="text-slate-500 hover:text-red-400"><Trash2 size={16} /></button>
                          </>
                        ) : (
                          <>
                             <button 
                               onClick={() => onRestore && onRestore(t.transaction_id)} 
                               className="text-emerald-500 hover:text-emerald-300 bg-emerald-900/20 p-1.5 rounded"
                               title="Restore Transaction"
                             >
                                <RefreshCw size={16} />
                             </button>
                             <button 
                               onClick={() => setConfirmDeleteId(t.transaction_id)} 
                               className="text-red-500 hover:text-red-300 bg-red-900/20 p-1.5 rounded"
                               title="Permanently Delete"
                             >
                                <X size={16} />
                             </button>
                          </>
                        )}
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-slate-500">
                     <div className="flex flex-col items-center">
                       {viewMode === 'trash' ? (
                         <>
                            <Trash2 size={32} className="mb-2 opacity-50 text-slate-600" />
                            <p>Trash is empty.</p>
                         </>
                       ) : (
                         <>
                            <Filter size={32} className="mb-2 opacity-50" />
                            <p>No transactions match your filters.</p>
                         </>
                       )}
                       {hasActiveFilters && (
                          <button onClick={clearFilters} className="text-blue-400 text-sm mt-2 hover:underline">
                            Clear Filters
                          </button>
                       )}
                     </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CONFIRMATION MODAL */}
      {confirmDeleteId && (
         <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-sm w-full shadow-2xl scale-100">
               <div className="flex flex-col items-center text-center">
                  <div className={`p-4 rounded-full mb-4 ${viewMode === 'trash' ? 'bg-red-900/30 text-red-500' : 'bg-amber-900/30 text-amber-500'}`}>
                     <AlertTriangle size={32} />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">
                     {viewMode === 'trash' ? 'Permanently Delete?' : 'Move to Trash?'}
                  </h3>
                  <p className="text-slate-400 text-sm mb-6 leading-relaxed">
                     {viewMode === 'trash' 
                        ? 'This action cannot be undone. This transaction will be wiped from your history forever.'
                        : 'This transaction will be moved to the Trash. You can restore it later if this was a mistake.'}
                  </p>
                  
                  <div className="flex space-x-3 w-full">
                     <button 
                        onClick={() => setConfirmDeleteId(null)}
                        className="flex-1 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 transition-colors"
                     >
                        Cancel
                     </button>
                     <button 
                        onClick={confirmDelete}
                        className={`flex-1 py-2 rounded-lg font-bold text-white transition-colors ${viewMode === 'trash' ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'}`}
                     >
                        {viewMode === 'trash' ? 'Delete Forever' : 'Trash It'}
                     </button>
                  </div>
               </div>
            </div>
         </div>
      )}
    </>
  );
};
