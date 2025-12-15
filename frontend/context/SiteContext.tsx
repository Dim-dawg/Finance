import React, { createContext, useContext, useState, useCallback } from 'react';
import { ViewState, SiteContextState } from '../types';

const SiteContext = createContext<SiteContextState | undefined>(undefined);

export const SiteContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentPage, setCurrentPage] = useState<ViewState>(ViewState.DASHBOARD);
  const [pageData, setPageData] = useState<Record<string, any>>({});
  const [actionLog, setActionLog] = useState<string[]>([]);

  const updatePageData = useCallback((key: string, value: any) => {
    setPageData(prev => {
      // Only update if value actually changed to prevent loop
      if (JSON.stringify(prev[key]) === JSON.stringify(value)) return prev;
      return { ...prev, [key]: value };
    });
  }, []);

  const logAction = useCallback((action: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setActionLog(prev => [`[${timestamp}] ${action}`, ...prev].slice(0, 20)); // Keep last 20 actions
  }, []);

  const handleSetPage = useCallback((page: ViewState) => {
    setCurrentPage(page);
    setPageData({}); // Clear page-specific data on navigation
    logAction(`Navigated to ${page}`);
  }, [logAction]);

  return (
    <SiteContext.Provider value={{ 
      currentPage, 
      pageData, 
      actionLog, 
      updatePageData, 
      logAction, 
      setCurrentPage: handleSetPage 
    }}>
      {children}
    </SiteContext.Provider>
  );
};

export const useSiteContext = () => {
  const context = useContext(SiteContext);
  if (!context) {
    throw new Error('useSiteContext must be used within a SiteContextProvider');
  }
  return context;
};
