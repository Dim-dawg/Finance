
import React, { useState, useMemo } from 'react';
import { Transaction } from '../types';
import { Download, TrendingUp, TrendingDown, Calendar, Printer, DollarSign, Filter, Check } from 'lucide-react';
import { useSiteContext } from '../context/SiteContext';

interface ProfitLossViewProps {
  transactions: Transaction[];
}

export const ProfitLossView: React.FC<ProfitLossViewProps> = ({ transactions }) => {
  const { logAction } = useSiteContext();
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [excludeTransfers, setExcludeTransfers] = useState(true);

  // Extract unique years from transactions
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    transactions.forEach(t => {
      const d = new Date(t.date);
      if (!isNaN(d.getTime())) {
        years.add(d.getFullYear());
      }
    });
    years.add(currentYear);
    return Array.from(years).sort((a, b) => b - a);
  }, [transactions, currentYear]);

  // Calculations
  const report = useMemo(() => {
    // 1. Filter by Year
    const yearlyTxs = transactions.filter(t => new Date(t.date).getFullYear() === selectedYear);

    const incomeByCategory: Record<string, number> = {};
    const expenseByCategory: Record<string, number> = {};
    let totalIncome = 0;
    let totalExpenses = 0;
    let skippedCount = 0;

    // Helper: Title Case Normalization (merges "food" and "Food")
    const normalizeCategory = (cat: string) => {
      if (!cat) return 'Uncategorized';
      const trimmed = cat.trim();
      return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
    };

    yearlyTxs.forEach(t => {
      const normalizedCat = normalizeCategory(t.category);
      
      // Filter Logic: Exclude Transfers/Payments if toggle is on
      if (excludeTransfers) {
        const lowerCat = normalizedCat.toLowerCase();
        if (
          lowerCat === 'transfer' || 
          lowerCat === 'credit card payment' || 
          lowerCat === 'payment' ||
          lowerCat === 'internal transfer'
        ) {
          skippedCount++;
          return; 
        }
      }

      if (t.type === 'income') {
        incomeByCategory[normalizedCat] = (incomeByCategory[normalizedCat] || 0) + t.amount;
        totalIncome += t.amount;
      } else {
        expenseByCategory[normalizedCat] = (expenseByCategory[normalizedCat] || 0) + t.amount;
        totalExpenses += t.amount;
      }
    });

    // Sort categories by amount desc
    const sortedIncomeCats = Object.entries(incomeByCategory).sort((a, b) => b[1] - a[1]);
    const sortedExpenseCats = Object.entries(expenseByCategory).sort((a, b) => b[1] - a[1]);

    const netProfit = totalIncome - totalExpenses;
    const margin = totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0;

    return {
      totalIncome,
      totalExpenses,
      netProfit,
      margin,
      sortedIncomeCats,
      sortedExpenseCats,
      txCount: yearlyTxs.length,
      skippedCount
    };
  }, [transactions, selectedYear, excludeTransfers]);

  const handlePrint = () => {
    logAction('Printed P&L Statement');
    window.print();
  };

  if (transactions.length === 0) {
     return (
        <div className="flex flex-col items-center justify-center h-[50vh] text-slate-500">
           <DollarSign size={48} className="mb-4 opacity-20" />
           <p>No transaction data available to generate report.</p>
        </div>
     );
  }

  return (
    <div className="max-w-4xl mx-auto pb-12 print:max-w-none print:p-0">
      
      {/* HEADER & CONTROLS */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-white">Profit & Loss Statement</h1>
          <p className="text-slate-400 mt-1 text-sm">Financial performance summary</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          
          {/* Transfer Toggle */}
          <button 
             onClick={() => setExcludeTransfers(!excludeTransfers)}
             className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm border transition-colors ${
               excludeTransfers 
                 ? 'bg-blue-900/30 border-blue-500/50 text-blue-400' 
                 : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
             }`}
             title="Exclude 'Transfer', 'Payment', etc."
          >
             <Filter size={16} />
             <span>{excludeTransfers ? 'Transfers Hidden' : 'Show All'}</span>
             {excludeTransfers && <Check size={14} className="ml-1" />}
          </button>

          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <select 
              value={selectedYear} 
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="pl-10 pr-8 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none appearance-none cursor-pointer hover:bg-slate-800 transition-colors"
            >
              {availableYears.map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>
          
          <button 
            onClick={handlePrint}
            className="flex items-center space-x-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm border border-slate-700 transition-colors"
          >
            <Printer size={16} />
            <span className="hidden sm:inline">Print</span>
          </button>
        </div>
      </div>

      {/* REPORT CONTAINER */}
      <div className="bg-white text-slate-900 rounded-xl shadow-xl overflow-hidden print:shadow-none print:rounded-none">
        
        {/* REPORT HEADER */}
        <div className="p-8 border-b border-slate-200 bg-slate-50 print:bg-white print:border-none print:pb-4">
           <div className="flex justify-between items-end">
              <div>
                <h2 className="text-3xl font-bold text-slate-900 tracking-tight">P&L Statement</h2>
                <div className="flex flex-col mt-1">
                   <p className="text-slate-500 uppercase text-xs font-semibold tracking-wider">Fiscal Year {selectedYear}</p>
                   {excludeTransfers && <p className="text-slate-400 text-[10px] mt-1 italic">Excluding internal transfers & payments</p>}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-slate-500">Net Profit</div>
                <div className={`text-2xl font-bold ${report.netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                   {report.netProfit >= 0 ? '$' : '-$'}{Math.abs(report.netProfit).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
                <div className={`text-xs font-medium px-2 py-0.5 rounded-full inline-block mt-1 ${report.margin >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                   {report.margin.toFixed(1)}% Margin
                </div>
              </div>
           </div>
        </div>

        {/* VISUAL SUMMARY BAR */}
        <div className="flex h-2 w-full bg-slate-100">
           {report.totalIncome > 0 && (
              <div style={{ width: `${(report.totalIncome / (report.totalIncome + report.totalExpenses)) * 100}%` }} className="bg-emerald-500 h-full"></div>
           )}
           {report.totalExpenses > 0 && (
              <div style={{ width: `${(report.totalExpenses / (report.totalIncome + report.totalExpenses)) * 100}%` }} className="bg-rose-500 h-full"></div>
           )}
        </div>

        {/* STATEMENT TABLE */}
        <div className="p-8 space-y-8 print:p-0 print:mt-4">
           
           {/* REVENUE SECTION */}
           <div>
              <div className="flex items-center justify-between mb-2 pb-2 border-b-2 border-slate-900">
                 <h3 className="font-bold text-slate-900 uppercase tracking-wide text-sm flex items-center">
                    <TrendingUp size={16} className="mr-2 text-emerald-600" /> Revenue
                 </h3>
                 <span className="font-bold text-slate-900">Amount</span>
              </div>
              
              <div className="space-y-1 mb-4">
                 {report.sortedIncomeCats.map(([cat, amount]) => (
                    <div key={cat} className="flex justify-between text-sm py-1 border-b border-slate-100 last:border-0 hover:bg-slate-50">
                       <span className="text-slate-600 pl-4">{cat}</span>
                       <span className="font-mono text-slate-800">${amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                 ))}
                 {report.sortedIncomeCats.length === 0 && (
                    <div className="text-sm text-slate-400 italic py-2 pl-4">No income recorded for this period.</div>
                 )}
              </div>

              <div className="flex justify-between items-center bg-emerald-50 p-3 rounded-lg print:bg-transparent print:p-0 print:pt-2 print:border-t print:border-slate-300">
                 <span className="font-bold text-emerald-900">Total Revenue</span>
                 <span className="font-bold text-emerald-700 font-mono">${report.totalIncome.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
           </div>

           {/* EXPENSE SECTION */}
           <div>
              <div className="flex items-center justify-between mb-2 pb-2 border-b-2 border-slate-900">
                 <h3 className="font-bold text-slate-900 uppercase tracking-wide text-sm flex items-center">
                    <TrendingDown size={16} className="mr-2 text-rose-600" /> Operating Expenses
                 </h3>
                 <span className="font-bold text-slate-900">Amount</span>
              </div>
              
              <div className="space-y-1 mb-4">
                 {report.sortedExpenseCats.map(([cat, amount]) => (
                    <div key={cat} className="flex justify-between text-sm py-1 border-b border-slate-100 last:border-0 hover:bg-slate-50">
                       <span className="text-slate-600 pl-4">{cat}</span>
                       <span className="font-mono text-slate-800">${amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                 ))}
                 {report.sortedExpenseCats.length === 0 && (
                    <div className="text-sm text-slate-400 italic py-2 pl-4">No expenses recorded for this period.</div>
                 )}
              </div>

              <div className="flex justify-between items-center bg-rose-50 p-3 rounded-lg print:bg-transparent print:p-0 print:pt-2 print:border-t print:border-slate-300">
                 <span className="font-bold text-rose-900">Total Operating Expenses</span>
                 <span className="font-bold text-rose-700 font-mono">${report.totalExpenses.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
           </div>

           {/* TOTALS */}
           <div className="pt-4 border-t-2 border-slate-900">
              <div className="flex justify-between items-center text-lg">
                 <span className="font-bold text-slate-900 uppercase">Net Profit / (Loss)</span>
                 <span className={`font-bold font-mono ${report.netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {report.netProfit >= 0 ? '$' : '-$'}{Math.abs(report.netProfit).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                 </span>
              </div>
           </div>

           {/* FOOTER */}
           <div className="text-center text-xs text-slate-400 pt-8 print:pt-12">
              <p>Generated by Dim Dawg Finance on {new Date().toLocaleDateString()}. Not an official tax document.</p>
           </div>

        </div>
      </div>
    </div>
  );
};
