
import React, { useMemo, useEffect, useState } from 'react';
import { Transaction, RecurringTransaction } from '../types';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  PieChart, Pie, Cell, LineChart, Line
} from 'recharts';
import { DollarSign, TrendingUp, TrendingDown, CreditCard, CalendarClock, Wallet, Filter, Calendar, X } from 'lucide-react';
import { useSiteContext } from '../context/SiteContext';

interface DashboardProps {
  transactions: Transaction[];
  recurringTransactions?: RecurringTransaction[];
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#6366F1'];

export const Dashboard: React.FC<DashboardProps> = ({ transactions, recurringTransactions = [] }) => {
  const { updatePageData } = useSiteContext();

  // --- FILTER STATE ---
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');

  // --- HELPERS ---
  const years = useMemo(() => {
    const y = new Set<string>();
    transactions.forEach(t => {
      const d = new Date(t.date);
      if (!isNaN(d.getTime())) y.add(d.getFullYear().toString());
    });
    return Array.from(y).sort((a, b) => Number(b) - Number(a));
  }, [transactions]);

  const months = [
    { value: '01', label: 'January' }, { value: '02', label: 'February' },
    { value: '03', label: 'March' }, { value: '04', label: 'April' },
    { value: '05', label: 'May' }, { value: '06', label: 'June' },
    { value: '07', label: 'July' }, { value: '08', label: 'August' },
    { value: '09', label: 'September' }, { value: '10', label: 'October' },
    { value: '11', label: 'November' }, { value: '12', label: 'December' }
  ];

  const clearFilters = () => {
    setSelectedYear('all');
    setSelectedMonth('all');
  };

  const hasActiveFilters = selectedYear !== 'all' || selectedMonth !== 'all';

  // --- FILTER LOGIC ---
  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      if (selectedYear !== 'all' && !t.date.startsWith(selectedYear)) return false;
      if (selectedMonth !== 'all') {
        const parts = t.date.split('-');
        if (parts.length > 1 && parts[1] !== selectedMonth) return false;
      }
      return true;
    });
  }, [transactions, selectedYear, selectedMonth]);

  const stats = useMemo(() => {
    const totalIncome = filteredTransactions.filter(t => t.type === 'income').reduce((acc, t) => acc + t.amount, 0);
    const totalExpense = filteredTransactions.filter(t => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0);
    const balance = totalIncome - totalExpense;
    const txCount = filteredTransactions.length;

    // Calculate Monthly Recurring Commitments (Fixed cost doesn't change with filter, it's a rate)
    const monthlyFixed = recurringTransactions
      .filter(t => t.type === 'expense')
      .reduce((acc, t) => {
        let multiplier = 0;
        switch (t.frequency) {
          case 'daily': multiplier = 30; break;
          case 'weekly': multiplier = 4; break;
          case 'bi-weekly': multiplier = 2; break;
          case 'monthly': multiplier = 1; break;
          case 'quarterly': multiplier = 1/3; break;
          case 'annually': multiplier = 1/12; break;
        }
        return acc + (t.amount * multiplier);
      }, 0);

    return { totalIncome, totalExpense, balance, txCount, monthlyFixed };
  }, [filteredTransactions, recurringTransactions]);

  // Report visible stats to Site Awareness Context
  useEffect(() => {
    updatePageData('dashboardStats', {
       balance: stats.balance,
       totalIncome: stats.totalIncome,
       totalExpense: stats.totalExpense,
       monthlyFixedBurn: stats.monthlyFixed,
       activeFilters: { year: selectedYear, month: selectedMonth }
    });
  }, [stats, selectedYear, selectedMonth, updatePageData]);

  const categoryData = useMemo(() => {
    const expenses = filteredTransactions.filter(t => t.type === 'expense');
    const grouped: Record<string, number> = {};
    expenses.forEach(t => {
      grouped[t.category] = (grouped[t.category] || 0) + t.amount;
    });
    return Object.entries(grouped)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 7);
  }, [filteredTransactions]);

  const chartData = useMemo(() => {
    const grouped: Record<string, { name: string, income: number, expense: number }> = {};
    
    filteredTransactions.forEach(t => {
      const date = new Date(t.date);
      if (isNaN(date.getTime())) return;

      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!grouped[key]) grouped[key] = { name: key, income: 0, expense: 0 };
      if (t.type === 'income') grouped[key].income += t.amount;
      else grouped[key].expense += t.amount;
    });

    const sorted = Object.values(grouped).sort((a, b) => a.name.localeCompare(b.name));

    let currentBalance = 0;
    return sorted.map(item => {
      currentBalance += (item.income - item.expense);
      return {
        ...item,
        balance: currentBalance
      };
    });
  }, [filteredTransactions]);

  const Card = ({ title, value, icon: Icon, color, subtext }: any) => (
    <div className="bg-slate-900 p-6 rounded-xl shadow-sm border border-slate-800 flex items-center justify-between">
      <div className="overflow-hidden min-w-0">
        <p className="text-sm font-medium text-slate-400 truncate">{title}</p>
        <h3 className="text-2xl font-bold text-white mt-1 truncate">${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</h3>
        {subtext && <p className="text-xs text-slate-500 mt-1">{subtext}</p>}
      </div>
      <div className={`p-3 rounded-full ${color} flex-shrink-0 ml-4`}>
        <Icon size={24} className="text-white" />
      </div>
    </div>
  );

  // Global Empty State (No data at all)
  if (transactions.length === 0) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
           <Card title="Net Cash" value={0} icon={DollarSign} color="bg-blue-600" />
           <Card title="Revenue" value={0} icon={TrendingUp} color="bg-emerald-600" />
           <Card title="OpEx & COGS" value={0} icon={TrendingDown} color="bg-rose-600" />
           <Card title="Transactions" value={0} icon={CreditCard} color="bg-violet-600" />
        </div>
        <div className="bg-slate-900 p-12 rounded-xl border border-slate-800 text-center text-slate-500">
           <p>No transaction data available yet. Please upload a bank statement or sync with the cloud.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12 w-full max-w-full">
      
      {/* FILTER BAR */}
      <div className="flex flex-col sm:flex-row justify-end items-center gap-3">
          <div className="flex items-center space-x-2 bg-slate-900 p-1 rounded-lg border border-slate-800">
             {/* Year Select */}
             <div className="relative">
                <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                <select 
                  value={selectedYear} 
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="pl-8 pr-8 py-1.5 bg-transparent text-slate-200 text-sm focus:outline-none appearance-none cursor-pointer hover:text-white"
                >
                  <option value="all">All Years</option>
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
             </div>
             
             <div className="w-px h-4 bg-slate-700"></div>

             {/* Month Select */}
             <div className="relative">
                 <select 
                   value={selectedMonth} 
                   onChange={(e) => setSelectedMonth(e.target.value)}
                   className="pl-3 pr-8 py-1.5 bg-transparent text-slate-200 text-sm focus:outline-none appearance-none cursor-pointer hover:text-white"
                 >
                   <option value="all">All Months</option>
                   {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                 </select>
             </div>
          </div>

          {hasActiveFilters && (
             <button 
                onClick={clearFilters}
                className="flex items-center space-x-1 px-3 py-1.5 bg-slate-800 hover:bg-red-900/30 text-slate-400 hover:text-red-400 rounded-lg text-sm transition-colors border border-slate-700 hover:border-red-500/30"
             >
                <X size={14} />
                <span>Clear</span>
             </button>
          )}
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 sm:gap-6">
        <Card title="Net Cash Position" value={stats.balance} icon={Wallet} color="bg-blue-600" subtext="For selected period" />
        <Card title="Total Revenue" value={stats.totalIncome} icon={TrendingUp} color="bg-emerald-600" />
        <Card title="OpEx & COGS" value={stats.totalExpense} icon={TrendingDown} color="bg-rose-600" />
        
        {/* Recurring Stats */}
        <div className="sm:col-span-2 xl:col-span-2 grid grid-cols-2 gap-4">
           <Card 
             title="Fixed Monthly Burn" 
             value={stats.monthlyFixed} 
             icon={CalendarClock} 
             color="bg-indigo-600" 
             subtext="Recurring commitments"
            />
            {/* If looking at a single month, this calculation holds up okay. If All Time, it's weird, but we keep it consistent. */}
            <Card 
              title="Net Operating Flow" 
              value={Math.max(0, stats.balance - stats.monthlyFixed)} 
              icon={CreditCard} 
              color="bg-violet-600"
              subtext="Est. Cash after Fixed Burn" 
            />
        </div>
      </div>

      {/* Main Charts Row */}
      {filteredTransactions.length > 0 ? (
      <>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">
          {/* Income vs Expenses Bar Chart */}
          <div className="bg-slate-900 p-4 sm:p-6 rounded-xl shadow-sm border border-slate-800 min-w-0 overflow-hidden">
            <h3 className="text-lg font-bold text-white mb-4">Revenue vs OpEx</h3>
            <div style={{ height: 300, width: '99%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8'}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8'}} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1e293b', borderRadius: '8px', border: '1px solid #334155', color: '#f1f5f9' }}
                    itemStyle={{ color: '#f1f5f9' }}
                    cursor={{fill: 'rgba(51, 65, 85, 0.4)'}}
                  />
                  <Legend wrapperStyle={{ color: '#94a3b8' }}/>
                  <Bar dataKey="income" fill="#10B981" radius={[4, 4, 0, 0]} name="Revenue" />
                  <Bar dataKey="expense" fill="#EF4444" radius={[4, 4, 0, 0]} name="OpEx" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Category Pie Chart */}
          <div className="bg-slate-900 p-4 sm:p-6 rounded-xl shadow-sm border border-slate-800 min-w-0 overflow-hidden">
            <h3 className="text-lg font-bold text-white mb-4">Spending Breakdown</h3>
            <div style={{ height: 300, width: '99%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    fill="#8884d8"
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1e293b', borderRadius: '8px', border: '1px solid #334155', color: '#f1f5f9' }}
                    itemStyle={{ color: '#f1f5f9' }}
                  />
                  <Legend verticalAlign="bottom" height={36}/>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Cumulative Balance Line Chart */}
        <div className="bg-slate-900 p-4 sm:p-6 rounded-xl shadow-sm border border-slate-800 min-w-0 overflow-hidden">
          <h3 className="text-lg font-bold text-white mb-4">Cumulative Net Operating Flow</h3>
          <div style={{ height: 300, width: '99%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8'}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8'}} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1e293b', borderRadius: '8px', border: '1px solid #334155', color: '#f1f5f9' }}
                  itemStyle={{ color: '#f1f5f9' }}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="balance" 
                  stroke="#3B82F6" 
                  strokeWidth={3} 
                  dot={{r: 4}} 
                  activeDot={{r: 6}} 
                  name="Net Change" 
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </>
      ) : (
        <div className="bg-slate-900 p-12 rounded-xl border border-slate-800 text-center text-slate-500">
           <Filter size={48} className="mx-auto mb-4 opacity-50" />
           <p>No transactions match the selected timeframe.</p>
           <button onClick={clearFilters} className="text-blue-400 text-sm mt-2 hover:underline">Clear Filters</button>
        </div>
      )}
    </div>
  );
};
