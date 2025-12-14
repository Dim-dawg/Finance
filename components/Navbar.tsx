
import React from 'react';
import { ViewState, AuthState } from '../types';
import { LayoutDashboard, Table, FileText, Settings, LogOut, WifiOff, RefreshCw, Sparkles, PieChart, Landmark } from 'lucide-react';

interface NavbarProps {
  currentView: ViewState;
  setView: (view: ViewState) => void;
  authState: AuthState;
  onLogout: () => void;
  onSync: () => void;
  isSyncing: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({ currentView, setView, authState, onLogout, onSync, isSyncing }) => {
  const navItem = (view: ViewState, label: string, Icon: any) => (
    <button
      onClick={() => setView(view)}
      className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
        currentView === view 
          ? 'bg-blue-600 text-white shadow-md' 
          : 'text-slate-400 hover:bg-slate-800'
      }`}
    >
      <Icon size={18} />
      <span className="font-medium">{label}</span>
    </button>
  );

  const mobileNavItem = (view: ViewState, Icon: any, label: string) => (
    <button 
      onClick={() => setView(view)} 
      className={`flex flex-col items-center justify-center p-2 rounded min-w-[3.5rem] transition-colors ${
        currentView === view ? 'text-blue-500' : 'text-slate-500 hover:text-slate-300'
      }`}
    >
      <Icon size={20} className="mb-1" />
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );

  return (
    <>
      {/* DESKTOP / TOP NAVBAR */}
      <nav className="bg-slate-900 border-b border-slate-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center space-x-8">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold shadow-lg shadow-blue-900/20">
                  DD
                </div>
                <span className="text-xl font-bold text-white hidden md:block">Dim Dawg</span>
              </div>
              
              <div className="hidden md:flex items-center space-x-2">
                {navItem(ViewState.DASHBOARD, 'Dashboard', LayoutDashboard)}
                {navItem(ViewState.TRANSACTIONS, 'Transactions', Table)}
                {navItem(ViewState.PROFIT_LOSS, 'P&L', PieChart)}
                {navItem(ViewState.BALANCE_SHEET, 'Balance', Landmark)}
                {navItem(ViewState.FORECAST, 'Forecast', Sparkles)}
                {navItem(ViewState.RULES, 'Rules', FileText)}
              </div>
            </div>

            <div className="flex items-center space-x-3 sm:space-x-4">
              {authState.mode === 'cloud' && (
                  <button 
                    onClick={onSync} 
                    disabled={isSyncing}
                    className={`flex items-center px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      isSyncing ? 'bg-blue-900/30 text-blue-400' : 'bg-slate-800 text-green-400 hover:bg-slate-700'
                    }`}
                  >
                    <RefreshCw size={14} className={`mr-1.5 ${isSyncing ? 'animate-spin' : ''}`} />
                    {isSyncing ? 'Syncing...' : 'Sync'}
                  </button>
              )}
              
              {authState.mode === 'local' && (
                  <div className="hidden sm:flex items-center px-3 py-1 rounded-full bg-slate-800 text-xs font-medium text-amber-500">
                    <WifiOff size={14} className="mr-1" /> Local
                  </div>
              )}
              
              <button onClick={() => setView(ViewState.SETTINGS)} className={`p-2 rounded-lg transition-colors text-slate-500 hover:text-blue-400 hover:bg-slate-800 ${currentView === ViewState.SETTINGS ? 'text-blue-400 bg-slate-800' : ''}`}>
                <Settings size={20} />
              </button>
              
              <button onClick={onLogout} className="p-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-800 transition-colors" title="Logout">
                <LogOut size={20} />
              </button>
            </div>
          </div>
        </div>
      </nav>
      
      {/* MOBILE BOTTOM NAV */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 border-t border-slate-800 bg-slate-900/95 backdrop-blur supports-[backdrop-filter]:bg-slate-900/80 z-50 pb-safe">
        <div className="flex justify-between items-center px-2 py-1">
          {mobileNavItem(ViewState.DASHBOARD, LayoutDashboard, 'Dash')}
          {mobileNavItem(ViewState.TRANSACTIONS, Table, 'Txns')}
          {mobileNavItem(ViewState.BALANCE_SHEET, Landmark, 'Balance')}
          {mobileNavItem(ViewState.PROFIT_LOSS, PieChart, 'P&L')}
          {mobileNavItem(ViewState.FORECAST, Sparkles, 'Future')}
        </div>
      </div>
    </>
  );
};
