
import React, { useState, useMemo, useEffect } from 'react';
import { Transaction, RecurringTransaction } from '../types';
import { GeminiService } from '../lib/geminiService';
import { RecurringTransactionManager } from './RecurringTransactionManager';
import { 
  ComposedChart, Area, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
  BarChart, Line
} from 'recharts';
import { Sparkles, Loader, AlertTriangle, RefreshCw, Sliders, Target, Plus, Trash2, Zap, TrendingUp, Download, RotateCcw, PenTool, ShieldCheck, AlertCircle, ArrowDownRight } from 'lucide-react';
import { useSiteContext } from '../context/SiteContext';

interface ForecastViewProps {
  transactions: Transaction[];
  recurringTransactions: RecurringTransaction[];
  onAddRecurring: (item: RecurringTransaction) => void;
  onRemoveRecurring: (id: string) => void;
  categories: string[];
  onAddCategory: (cat: string) => void;
}

type TabView = '3mo' | '6mo';

interface SimulationItem {
  id: string;
  name: string;
  amount: number;
  monthIndex: number; // 0-based index relative to forecast start
}

interface ForecastOverride {
  income?: number;
  expense?: number;
}

export const ForecastView: React.FC<ForecastViewProps> = ({ 
  transactions, 
  recurringTransactions, 
  onAddRecurring,
  onRemoveRecurring,
  categories,
  onAddCategory
}) => {
  const { logAction } = useSiteContext();
  
  // --- STATE ---
  const [baseForecastData, setBaseForecastData] = useState<any>(() => {
    const saved = localStorage.getItem('dd_forecast_data');
    return saved ? JSON.parse(saved) : null;
  });

  const [lastUpdated, setLastUpdated] = useState<string | null>(() => {
    return localStorage.getItem('dd_forecast_date');
  });

  const [overrides, setOverrides] = useState<Record<string, ForecastOverride>>(() => {
    const saved = localStorage.getItem('dd_forecast_overrides');
    return saved ? JSON.parse(saved) : {};
  });

  const [isForecasting, setIsForecasting] = useState(false);
  const [forecastError, setForecastError] = useState('');
  const [activeTab, setActiveTab] = useState<TabView>('6mo');
  const [expenseAdjustment, setExpenseAdjustment] = useState(0);

  // Simulation State
  const [simulations, setSimulations] = useState<SimulationItem[]>([]);
  const [newSim, setNewSim] = useState<{name: string, amount: number, monthIndex: number}>({ name: '', amount: 0, monthIndex: 0 });

  // --- PERSISTENCE ---
  useEffect(() => {
    if (baseForecastData) {
      localStorage.setItem('dd_forecast_data', JSON.stringify(baseForecastData));
      if (!localStorage.getItem('dd_forecast_date')) {
         const now = new Date().toLocaleString();
         localStorage.setItem('dd_forecast_date', now);
         setLastUpdated(now);
      }
    }
  }, [baseForecastData]);

  useEffect(() => {
    localStorage.setItem('dd_forecast_overrides', JSON.stringify(overrides));
  }, [overrides]);

  // --- STALENESS CHECK ---
  const isStale = useMemo(() => {
    if (!baseForecastData?.metadata) return false;
    return transactions.length !== baseForecastData.metadata.sourceTxCount;
  }, [baseForecastData, transactions.length]);

  // --- CALCULATIONS ---
  const currentBalance = useMemo(() => {
    const income = transactions.filter(t => t.type === 'income').reduce((a, b) => a + b.amount, 0);
    const expense = transactions.filter(t => t.type === 'expense').reduce((a, b) => a + b.amount, 0);
    return income - expense;
  }, [transactions]);

  // 2. AI GENERATION
  const handleGenerateForecast = async () => {
    logAction('User clicked "Generate Forecast"');
    setIsForecasting(true);
    setForecastError('');
    setExpenseAdjustment(0); 
    setOverrides({}); // Reset overrides on new AI run to avoid confusion
    try {
      const gemini = new GeminiService();
      const result = await gemini.generateForecast([...transactions], currentBalance, recurringTransactions);
      setBaseForecastData(result);
      
      const now = new Date().toLocaleString();
      localStorage.setItem('dd_forecast_date', now);
      setLastUpdated(now);
      
      setActiveTab('6mo'); 
    } catch (err: any) {
      console.error(err);
      setForecastError(err.message || 'Failed to generate forecast.');
    } finally {
      setIsForecasting(false);
    }
  };

  // 3. SCENARIO ENGINE
  const scenarioForecast = useMemo(() => {
    if (!baseForecastData?.forecast) return null;
    let runningBalance = currentBalance; 
    
    return baseForecastData.forecast.map((item: any, index: number) => {
      // 0. Apply Manual Overrides first (User said "No, I know I'll make this much")
      const userOverride = overrides[item.month];
      
      const baseIncome = userOverride?.income !== undefined ? userOverride.income : Math.abs(item.projectedIncome);
      const baseExpense = userOverride?.expense !== undefined ? userOverride.expense : Math.abs(item.projectedExpenses);

      // 1. Apply Percentage Adjustment (Global slider affects expense only)
      const multiplier = 1 + (expenseAdjustment / 100);
      let adjustedExpense = baseExpense * multiplier;
      
      // 2. Apply Simulations (One-time purchases injected)
      const monthsSims = simulations.filter(s => s.monthIndex === index);
      const simTotal = monthsSims.reduce((sum, s) => sum + s.amount, 0);
      adjustedExpense += simTotal;

      const netCashFlow = baseIncome - adjustedExpense;
      runningBalance += netCashFlow;

      // Handle Confidence Intervals
      // We adjust the original AI bounds by the drift caused by our edits
      const originalBalance = item.balance;
      const balanceDelta = runningBalance - originalBalance;

      return {
        ...item,
        projectedIncome: baseIncome,
        projectedExpenses: adjustedExpense,
        cashFlow: netCashFlow,
        balance: runningBalance,
        optimistic: (item.optimisticBalance || runningBalance) + balanceDelta,
        pessimistic: (item.pessimisticBalance || runningBalance) + balanceDelta,
        incomeBar: baseIncome,
        expenseBar: adjustedExpense,
        isOverridden: !!userOverride
      };
    });
  }, [baseForecastData, expenseAdjustment, currentBalance, simulations, overrides]);

  const filteredForecast = useMemo(() => {
    if (!scenarioForecast) return null;
    if (activeTab === '3mo') return scenarioForecast.slice(0, 3);
    return scenarioForecast; 
  }, [scenarioForecast, activeTab]);

  const metrics = useMemo(() => {
    if (!filteredForecast || filteredForecast.length === 0) return null;
    const totalSavings = filteredForecast.reduce((sum: number, item: any) => sum + item.cashFlow, 0);
    const lowestBalance = Math.min(...filteredForecast.map((item: any) => item.balance));
    const finalBalance = filteredForecast[filteredForecast.length - 1].balance;
    const avgMonthlyBurn = filteredForecast.reduce((sum: number, item: any) => sum + item.projectedExpenses, 0) / filteredForecast.length;
    
    const healthStatus = finalBalance > currentBalance ? 'growing' : (finalBalance > 0 ? 'stable' : 'danger');
    
    return { totalSavings, lowestBalance, finalBalance, avgMonthlyBurn, healthStatus };
  }, [filteredForecast, currentBalance]);

  const addSimulation = () => {
    if (!newSim.name || !newSim.amount) return;
    setSimulations(prev => [...prev, { ...newSim, id: crypto.randomUUID() }]);
    setNewSim({ name: '', amount: 0, monthIndex: 0 });
    logAction('Added forecast simulation');
  };

  const removeSimulation = (id: string) => {
    setSimulations(prev => prev.filter(s => s.id !== id));
  };

  const handleOverrideChange = (month: string, field: 'income' | 'expense', value: string) => {
    const num = parseFloat(value);
    if (isNaN(num)) return;
    setOverrides(prev => ({
      ...prev,
      [month]: { ...prev[month], [field]: num }
    }));
  };

  const clearOverride = (month: string) => {
    const newOverrides = { ...overrides };
    delete newOverrides[month];
    setOverrides(newOverrides);
  };

  const exportForecastCSV = () => {
    if (!filteredForecast) return;
    const headers = ['Month', 'Projected Revenue', 'Projected OpEx', 'Net Cash Flow', 'Projected Balance'];
    const rows = filteredForecast.map((f: any) => [
      f.month,
      f.projectedIncome.toFixed(2),
      f.projectedExpenses.toFixed(2),
      f.cashFlow.toFixed(2),
      f.balance.toFixed(2)
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `dim_dawg_forecast_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    logAction('Exported Forecast CSV');
  };

  if (transactions.length < 5) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-4 px-4">
        <div className="p-4 bg-slate-800 rounded-full text-amber-500">
          <AlertTriangle size={48} />
        </div>
        <h2 className="text-2xl font-bold text-white">Insufficient Operational Data</h2>
        <p className="text-slate-400 max-w-md">
          To generate an accurate business forecast, we need a bit more history. 
          Please upload a bank statement or add at least 5 transactions.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-800 pb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center">
            <Sparkles className="text-amber-400 mr-2" size={28} />
            Runway & Cash Flow Forecast
          </h1>
          <p className="text-slate-400 mt-1">
            Predictive modeling for Burn Rate and Cash Runway.
          </p>
        </div>
        
        <div className="flex items-center space-x-4 w-full md:w-auto justify-between md:justify-end">
          {lastUpdated && <span className="text-xs text-slate-500 hidden sm:block">Last Analysis: {lastUpdated}</span>}
          <button 
            onClick={handleGenerateForecast}
            disabled={isForecasting}
            className={`flex items-center space-x-2 px-4 md:px-6 py-3 rounded-xl transition-all shadow-lg font-semibold text-sm md:text-base ${
               isStale ? 'bg-amber-600 hover:bg-amber-700 text-white animate-pulse' : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white'
            }`}
          >
            {isForecasting ? <Loader className="animate-spin" size={20} /> : <RefreshCw size={20} />}
            <span>{baseForecastData ? (isStale ? 'Update Required' : 'Regenerate Forecast') : 'Generate Forecast'}</span>
          </button>
        </div>
      </div>

      {isStale && !isForecasting && baseForecastData && (
         <div className="bg-amber-900/20 border border-amber-500/50 rounded-lg p-3 flex items-center text-amber-200 text-sm">
            <AlertTriangle size={16} className="mr-2 flex-shrink-0" />
            <span>New transactions detected. The forecast below may be outdated. Click "Update Required" to refresh.</span>
         </div>
      )}

      {forecastError && (
        <div className="p-4 bg-red-900/20 text-red-400 text-sm border-l-4 border-red-500 rounded-r-lg flex items-center">
          <AlertTriangle size={20} className="mr-2 text-red-500 flex-shrink-0" />
          <span>{forecastError}</span>
        </div>
      )}

      {/* RECURRING MANAGER */}
      <RecurringTransactionManager 
        recurring={recurringTransactions}
        transactions={transactions}
        categories={categories}
        onAdd={onAddRecurring}
        onRemove={onRemoveRecurring}
        onAddCategory={onAddCategory}
      />

      {isForecasting && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center animate-pulse mt-8">
          <Loader className="mx-auto text-blue-500 mb-4 animate-spin" size={48} />
          <h3 className="text-xl font-medium text-white">Calculating Burn Rate...</h3>
          <p className="text-slate-500 mt-2">Integrating recurring items and variable spending history.</p>
          <p className="text-slate-600 text-xs mt-4">If this takes longer than usual, we might be retrying due to API limits.</p>
        </div>
      )}

      {filteredForecast && metrics && !isForecasting && (
        <div className="space-y-6 animate-fade-in pt-8 border-t border-slate-800">
          
          {/* SIMULATION & CONTROLS TOOLBAR */}
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 lg:p-6">
             <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-6 mb-6">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center mb-1">
                     <Target className="mr-2 text-blue-400" size={20}/>
                     Scenario Simulator
                  </h2>
                  <p className="text-xs text-slate-400">Inject hypothetical one-time costs or adjust operating spend.</p>
                </div>
                
                {/* Global Adjustment Slider */}
                <div className="bg-slate-800/50 px-4 py-3 rounded-xl border border-slate-700/50 flex flex-col sm:flex-row items-center gap-4 w-full lg:w-auto">
                   <div className="flex items-center text-slate-300 text-sm font-medium whitespace-nowrap">
                      <Sliders size={16} className="mr-2 text-slate-400"/> Variable OpEx:
                   </div>
                   <input type="range" min="-30" max="30" step="5" value={expenseAdjustment} onChange={(e) => setExpenseAdjustment(parseInt(e.target.value))} className="w-full lg:w-32 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                   <div className={`text-xs font-mono px-2 py-1 rounded min-w-[4rem] text-center ${expenseAdjustment > 0 ? 'bg-red-900/30 text-red-400' : expenseAdjustment < 0 ? 'bg-emerald-900/30 text-emerald-400' : 'bg-slate-800 text-slate-400'}`}>
                      {expenseAdjustment > 0 ? '+' : ''}{expenseAdjustment}%
                   </div>
                </div>
             </div>

             {/* Simulation Input Row */}
             <div className="flex flex-col md:flex-row gap-2 items-end bg-slate-950/50 p-3 rounded-lg border border-slate-800">
                <div className="w-full md:flex-1">
                   <label className="text-[10px] text-slate-500 uppercase font-bold mb-1 block">Expense Name</label>
                   <input type="text" className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-sm text-white focus:border-blue-500 outline-none" placeholder="e.g. New Server Cluster" value={newSim.name} onChange={e => setNewSim({...newSim, name: e.target.value})} />
                </div>
                <div className="w-full md:w-32">
                   <label className="text-[10px] text-slate-500 uppercase font-bold mb-1 block">Cost ($)</label>
                   <input type="number" className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-sm text-white focus:border-blue-500 outline-none" placeholder="0" value={newSim.amount} onChange={e => setNewSim({...newSim, amount: parseFloat(e.target.value)})} />
                </div>
                <div className="w-full md:w-40">
                   <label className="text-[10px] text-slate-500 uppercase font-bold mb-1 block">When?</label>
                   <select className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-sm text-white focus:border-blue-500 outline-none" value={newSim.monthIndex} onChange={e => setNewSim({...newSim, monthIndex: parseInt(e.target.value)})}>
                      {filteredForecast.map((f: any, i: number) => (
                         <option key={i} value={i}>{f.month}</option>
                      ))}
                   </select>
                </div>
                <button onClick={addSimulation} className="w-full md:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-medium flex items-center justify-center h-[38px]">
                   <Plus size={16} className="mr-1"/> Add
                </button>
             </div>

             {/* Active Simulations Chips */}
             {simulations.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4">
                   {simulations.map(s => (
                      <div key={s.id} className="flex items-center bg-indigo-900/30 text-indigo-200 border border-indigo-500/30 px-3 py-1 rounded-full text-xs">
                         <Zap size={12} className="mr-2 text-yellow-400" />
                         <span>{s.name} (${s.amount}) in Month {s.monthIndex + 1}</span>
                         <button onClick={() => removeSimulation(s.id)} className="ml-2 hover:text-red-400"><Trash2 size={12}/></button>
                      </div>
                   ))}
                </div>
             )}
          </div>

          {/* MAIN VISUALIZATION - SPLIT CHARTS */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
             
             {/* LEFT: BALANCE TRAJECTORY */}
             <div className="bg-slate-900 p-4 sm:p-6 rounded-xl border border-slate-800 shadow-sm min-w-0 flex flex-col">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-sm font-bold text-white flex items-center">
                    <TrendingUp size={16} className="mr-2 text-emerald-400"/> Runway Trajectory
                  </h3>
                  {metrics.healthStatus === 'danger' && (
                     <span className="text-xs bg-red-900/30 text-red-400 px-2 py-1 rounded border border-red-500/30 flex items-center">
                        <AlertCircle size={12} className="mr-1" /> Negative Trend
                     </span>
                  )}
                  {metrics.healthStatus === 'growing' && (
                     <span className="text-xs bg-emerald-900/30 text-emerald-400 px-2 py-1 rounded border border-emerald-500/30 flex items-center">
                        <ShieldCheck size={12} className="mr-1" /> Growing
                     </span>
                  )}
                </div>
                <div style={{ height: 300, width: '99%' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={filteredForecast} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                       <defs>
                         <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                           <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3}/>
                           <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                         </linearGradient>
                       </defs>
                       <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
                       <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                       <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                       <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f1f5f9' }} />
                       <Legend wrapperStyle={{fontSize: '12px'}} />
                       
                       <Area type="monotone" dataKey="optimistic" stroke="none" fill="#10B981" fillOpacity={0.05} name="Optimistic" />
                       <Area type="monotone" dataKey="pessimistic" stroke="none" fill="#EF4444" fillOpacity={0.05} name="Pessimistic" />

                       <ReferenceLine y={currentBalance} stroke="#64748b" strokeDasharray="3 3" label={{ value: 'Current', fill: '#64748b', fontSize: 10 }} />
                       <Area type="monotone" dataKey="balance" stroke="#3B82F6" strokeWidth={3} fillOpacity={1} fill="url(#colorBalance)" name="Projected Cash" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
             </div>

             {/* RIGHT: CASH FLOW */}
             <div className="bg-slate-900 p-4 sm:p-6 rounded-xl border border-slate-800 shadow-sm min-w-0 flex flex-col">
                <h3 className="text-sm font-bold text-white mb-4 flex items-center">
                   <ArrowDownRight size={16} className="mr-2 text-blue-400"/> Monthly Cash Flow
                </h3>
                <div style={{ height: 300, width: '99%' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={filteredForecast} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                       <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
                       <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                       <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                       <Tooltip cursor={{fill: 'rgba(51, 65, 85, 0.4)'}} contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f1f5f9' }} />
                       <Legend wrapperStyle={{fontSize: '12px'}} />
                       
                       <Bar dataKey="incomeBar" fill="#10B981" radius={[4, 4, 0, 0]} name="Revenue" />
                       <Bar dataKey="expenseBar" fill="#EF4444" radius={[4, 4, 0, 0]} name="OpEx" />
                       <Line type="monotone" dataKey="cashFlow" stroke="#f59e0b" strokeWidth={2} dot={{r:3}} name="Net Change" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
             </div>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 space-y-6">
               <div className="bg-slate-800/80 p-6 rounded-xl border border-blue-500/30 shadow-lg relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
                <h4 className="font-semibold text-blue-300 mb-3 flex items-center text-lg">
                    <Sparkles size={20} className="mr-2" /> AI Strategic Insights
                </h4>
                <p className="text-slate-200 leading-relaxed text-sm">"{baseForecastData.insights}"</p>
              </div>

              {/* ACTION CARD */}
              <div className="bg-slate-900 p-6 rounded-xl border border-slate-800">
                <h4 className="font-semibold text-white mb-4">Export Report</h4>
                <button 
                  onClick={exportForecastCSV}
                  className="w-full flex items-center justify-center space-x-2 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-all"
                >
                  <Download size={16} />
                  <span>Download CSV</span>
                </button>
              </div>
            </div>

            {/* EDITABLE FORECAST GRID */}
            <div className="lg:col-span-2 bg-slate-900 rounded-xl shadow-sm border border-slate-800 overflow-hidden flex flex-col">
              <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900">
                <div className="flex items-center">
                   <h3 className="font-bold text-white mr-2">Interactive Forecast Grid</h3>
                   <span className="text-[10px] bg-indigo-900/30 text-indigo-300 px-2 py-0.5 rounded border border-indigo-500/20">Editable</span>
                </div>
                <button 
                   onClick={() => setOverrides({})}
                   className={`text-xs flex items-center space-x-1 ${Object.keys(overrides).length > 0 ? 'text-amber-400 hover:text-amber-300' : 'text-slate-600 cursor-default'}`}
                   disabled={Object.keys(overrides).length === 0}
                >
                   <RotateCcw size={12} />
                   <span>Reset Overrides</span>
                </button>
              </div>
              
              <div className="overflow-x-auto flex-1">
                <table className="w-full text-sm text-left border-collapse">
                  <thead className="sticky top-0 bg-slate-950 z-10 shadow-sm border-b border-slate-800">
                    <tr className="text-slate-400">
                      <th className="py-3 px-4 w-24">Month</th>
                      <th className="py-3 px-4 text-right">Proj. Revenue</th>
                      <th className="py-3 px-4 text-right">Proj. OpEx</th>
                      <th className="py-3 px-4 text-right">Cash Flow</th>
                      <th className="py-3 px-4 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {filteredForecast.map((f: any, i: number) => {
                       const hasOverride = f.isOverridden;
                       const rowClass = hasOverride ? 'bg-indigo-900/10' : 'hover:bg-slate-800/30';
                       
                       return (
                        <tr key={i} className={`transition-colors ${rowClass}`}>
                          <td className="py-3 px-4 font-medium text-slate-200">{f.month}</td>
                          
                          {/* EDITABLE INCOME */}
                          <td className="py-2 px-2 text-right">
                             <div className="relative group">
                                <input 
                                   type="number"
                                   value={f.projectedIncome.toFixed(0)}
                                   onChange={(e) => handleOverrideChange(f.month, 'income', e.target.value)}
                                   className="w-24 text-right bg-transparent border border-transparent hover:border-slate-700 focus:border-blue-500 focus:bg-slate-800 rounded px-1 py-0.5 outline-none text-emerald-400 font-mono transition-all"
                                />
                                <PenTool size={10} className="absolute right-full top-1/2 -translate-y-1/2 mr-1 text-slate-600 opacity-0 group-hover:opacity-100 pointer-events-none" />
                             </div>
                          </td>

                          {/* EDITABLE EXPENSE */}
                          <td className="py-2 px-2 text-right">
                             <div className="relative group">
                                <input 
                                   type="number"
                                   value={Math.abs(f.projectedExpenses).toFixed(0)}
                                   onChange={(e) => handleOverrideChange(f.month, 'expense', e.target.value)}
                                   className="w-24 text-right bg-transparent border border-transparent hover:border-slate-700 focus:border-blue-500 focus:bg-slate-800 rounded px-1 py-0.5 outline-none text-rose-400 font-mono transition-all"
                                />
                                <PenTool size={10} className="absolute right-full top-1/2 -translate-y-1/2 mr-1 text-slate-600 opacity-0 group-hover:opacity-100 pointer-events-none" />
                             </div>
                          </td>

                          <td className={`py-3 px-4 text-right font-mono font-bold ${f.cashFlow >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                             {f.cashFlow >= 0 ? '+' : ''}{f.cashFlow?.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </td>
                          <td className="py-3 px-4 text-right text-blue-400 font-bold font-mono">
                             ${f.balance?.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
