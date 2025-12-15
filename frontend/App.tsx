import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { Dashboard } from './components/Dashboard';
import { TransactionTable } from './components/TransactionTable';
import { FileUpload } from './components/FileUpload';
import { FileQueue } from './components/FileQueue';
import { ChatAssistant } from './components/ChatAssistant';
import { RulesManager } from './components/RulesManager';
import { ForecastView } from './components/ForecastView';
import { ProfitLossView } from './components/ProfitLossView';
import { BalanceSheetView } from './components/BalanceSheetView';
import { ApiDocs } from './components/ApiDocs'; 
import { ViewState, AuthState, Transaction, Rule, AppSettings, User, FileJob, ExternalProduct, ApiKey, RecurringTransaction } from './types';
import { STORAGE_KEYS, DEFAULT_CATEGORIES } from './constants';
import { SheetApi } from './lib/sheetApi';
import { GeminiService } from './lib/geminiService';
import { Settings, RefreshCw, UploadCloud, Eye, EyeOff, AlertTriangle, CheckCircle, WifiOff } from 'lucide-react';
import { useSiteContext } from './context/SiteContext';

interface AppProps {
  apiKey?: string;
  initialUser?: User;
}

// A single instance of the API client for the entire app.
const api = new SheetApi();

const App: React.FC<AppProps> = ({ apiKey, initialUser }) => {
  const { setCurrentPage, logAction } = useSiteContext();

  // --- STATE ---
  const [view, setView] = useState<ViewState>(ViewState.DASHBOARD);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isEmbedMode, setIsEmbedMode] = useState(false); 
  const [externalProduct, setExternalProduct] = useState<ExternalProduct | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  useEffect(() => {
    setCurrentPage(view);
  }, [view, setCurrentPage]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'embed') {
      setIsEmbedMode(true);
      setIsChatOpen(true); 
    }
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'DD_PRODUCT_VIEW') {
        const product = event.data.payload as ExternalProduct;
        setExternalProduct(product);
        setIsChatOpen(true); 
        logAction(`Received product data from external site: ${product.name}`);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [logAction]);

  const [settings, setSettings] = useState<AppSettings>(() => {
    const stored = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    // sheetUrl is no longer stored in settings
    return stored ? JSON.parse(stored) : {};
  });

  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    const stored = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
    return stored ? JSON.parse(stored) : [];
  });
  const transactionsRef = useRef(transactions);
  useEffect(() => { transactionsRef.current = transactions; }, [transactions]);

  // Trash Bin State
  const [deletedTransactions, setDeletedTransactions] = useState<Transaction[]>(() => {
    const stored = localStorage.getItem(STORAGE_KEYS.DELETED);
    return stored ? JSON.parse(stored) : [];
  });

  const [rules, setRules] = useState<Rule[]>(() => {
    const stored = localStorage.getItem(STORAGE_KEYS.RULES);
    return stored ? JSON.parse(stored) : [];
  });

  const [recurringTransactions, setRecurringTransactions] = useState<RecurringTransaction[]>(() => {
    const stored = localStorage.getItem(STORAGE_KEYS.RECURRING);
    return stored ? JSON.parse(stored) : [];
  });
  const recurringRef = useRef(recurringTransactions);
  useEffect(() => { recurringRef.current = recurringTransactions; }, [recurringTransactions]);

  const [categories, setCategories] = useState<string[]>(() => {
    const stored = localStorage.getItem('dd_categories');
    return stored ? JSON.parse(stored) : DEFAULT_CATEGORIES;
  });

  // --- AUTO-HARVEST CATEGORIES FROM TRANSACTIONS ---
  useEffect(() => {
    if (transactions.length === 0) return;
    
    setCategories(prev => {
      const existingSet = new Set(prev.map(c => c.toLowerCase()));
      const txCats = new Set<string>();
      
      transactions.forEach(t => {
         if (t.category && t.category.trim()) {
            txCats.add(t.category.trim());
         }
      });
      
      // Identify new ones
      const missing = Array.from(txCats).filter(c => !existingSet.has(c.toLowerCase()));
      
      if (missing.length > 0) {
         // Add missing categories to the list
         return [...prev, ...missing];
      }
      return prev;
    });
  }, [transactions]);


  const [apiKeys, setApiKeys] = useState<ApiKey[]>(() => {
    const stored = localStorage.getItem('dd_api_keys');
    return stored ? JSON.parse(stored) : [];
  });
  useEffect(() => { localStorage.setItem('dd_api_keys', JSON.stringify(apiKeys)); }, [apiKeys]);

  const [authState, setAuthState] = useState<AuthState>(() => {
    if (initialUser) return { isAuthenticated: true, user: initialUser, mode: 'cloud' }; 
    const storedUser = localStorage.getItem(STORAGE_KEYS.USER);
    const storedAuthMode = localStorage.getItem(STORAGE_KEYS.AUTH_MODE);
    if (storedUser) {
      return {
        isAuthenticated: true,
        user: JSON.parse(storedUser),
        mode: (storedAuthMode as 'local' | 'cloud') || 'local'
      };
    }
    return { isAuthenticated: false, user: null, mode: 'local' };
  });

  // Auth UI State
  const [authModeData, setAuthModeData] = useState<'local' | 'cloud'>(() => {
     // Default to cloud if a user exists, otherwise local
     return localStorage.getItem(STORAGE_KEYS.USER) ? 'cloud' : 'local';
  });
  const [isRegistering, setIsRegistering] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  
  const [fileQueue, setFileQueue] = useState<FileJob[]>([]);
  const isProcessingRef = useRef(false);
  
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string>('');

  // --- PERSISTENCE ---
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(transactions)); }, [transactions]);
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.DELETED, JSON.stringify(deletedTransactions)); }, [deletedTransactions]);
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings)); }, [settings]);
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.RULES, JSON.stringify(rules)); }, [rules]);
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.RECURRING, JSON.stringify(recurringTransactions)); }, [recurringTransactions]);
  useEffect(() => { localStorage.setItem('dd_categories', JSON.stringify(categories)); }, [categories]);

  // --- SYNC LOGIC ---
  const syncData = useCallback(async () => {
    if (!authState.user || authState.mode !== 'cloud') return;
    
    const currentUserId = authState.user.user_id;
    if (!currentUserId) { setSyncStatus('Error: Invalid User ID.'); return; }

    setIsSyncing(true);
    setSyncStatus('Fetching Cloud Data...');

    try {
      // Parallel fetch
      const [cloudTxs, cloudKeys, cloudRules, cloudRecurring] = await Promise.all([
         api.getTransactions(currentUserId),
         api.getApiKeys(currentUserId),
         api.getRules(currentUserId),
         api.getRecurringTransactions(currentUserId)
      ]);

      // Sync Transactions
      const mergedMap = new Map();
      cloudTxs.forEach(t => mergedMap.set(t.transaction_id, t));
      const getSig = (t: Transaction) => `${t.date}-${t.amount}-${(t.description || '').trim().toLowerCase()}`;
      const cloudSignatures = new Set(cloudTxs.map(t => getSig(t)));
      const localOnlyTxs = transactionsRef.current.filter(t => !mergedMap.has(t.transaction_id) && !cloudSignatures.has(getSig(t)));
      
      if (localOnlyTxs.length > 0) {
        setSyncStatus(`Syncing ${localOnlyTxs.length} items to cloud...`);
        const toPush = localOnlyTxs.map(t => ({...t, user_id: currentUserId }));
        const success = await api.saveTransactions(currentUserId, toPush);
        if (success) {
           toPush.forEach(t => mergedMap.set(t.transaction_id, t));
        }
      }
      const finalTransactions = Array.from(mergedMap.values()).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      if (finalTransactions.length > 0) setTransactions(finalTransactions);

      // Sync Recurring
      const recurringMap = new Map();
      cloudRecurring.forEach(r => recurringMap.set(r.id, r));
      const localOnlyRecurring = recurringRef.current.filter(r => !recurringMap.has(r.id));
      for (const r of localOnlyRecurring) {
        await api.saveRecurringTransaction(currentUserId, r);
        recurringMap.set(r.id, r);
      }
      setRecurringTransactions(Array.from(recurringMap.values()));

      // Sync Configs
      setApiKeys(cloudKeys);
      if (cloudRules.length > 0) setRules(cloudRules); // Simple overwrite for rules for now
      
      setSyncStatus('Sync Complete');
      setTimeout(() => setSyncStatus(''), 2000);

    } catch (e: any) {
      console.error("Sync Error:", e);
      setSyncStatus(`Sync Failed: ${e.message}`);
    } finally {
      setIsSyncing(false);
    }
  }, [authState.user, authState.mode]); 

  useEffect(() => {
    if (authState.isAuthenticated && authState.mode === 'cloud') {
      syncData();
    }
  }, [authState.isAuthenticated, authState.mode, syncData]);

  // --- HANDLERS ---
  const handleAddFiles = (files: File[]) => {
    const newJobs: FileJob[] = files.map(f => ({ id: crypto.randomUUID(), file: f, status: 'queued', addedAt: Date.now() }));
    setFileQueue(prev => [...prev, ...newJobs]);
  };
  const handleClearCompletedQueue = () => setFileQueue(prev => prev.filter(j => j.status !== 'completed' && j.status !== 'error'));
  
  const handleAuth = async () => {
      setAuthLoading(true); 
      setAuthError('');
      setAuthMessage('');
      
      // --- LOCAL MODE ---
      if (authModeData === 'local') {
          if (!name.trim()) {
            setAuthError('Please enter a display name for your session.');
            setAuthLoading(false);
            return;
          }
          const mockUser: User = { user_id: 'local_user', email: 'local@device', name: name.trim() };
          localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(mockUser));
          localStorage.setItem(STORAGE_KEYS.AUTH_MODE, 'local');
          setAuthState({ isAuthenticated: true, user: mockUser, mode: 'local' });
          setAuthLoading(false); 
          return;
      }

      // --- CLOUD MODE ---
      if (!email || !password) {
         setAuthError('Please fill in email and password.');
         setAuthLoading(false);
         return;
      }

      try {
        let res;
        if (isRegistering) {
            if (!name) { setAuthError('Name is required for registration.'); setAuthLoading(false); return; }
            res = await api.register(email, password, name);
        } else {
            res = await api.login(email, password);
        }

        if (res.success && res.user) {
          const normalizedUser: User = { 
              user_id: res.user.user_id || res.user.userId, 
              email: res.user.email || email, 
              name: res.user.name || name 
          };
          localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(normalizedUser));
          localStorage.setItem(STORAGE_KEYS.AUTH_MODE, 'cloud');
          setAuthState({ isAuthenticated: true, user: normalizedUser, mode: 'cloud' });
          setPassword('');
        } else { 
            setAuthError(res.error || 'Authentication failed. Check credentials.'); 
        }
      } catch (e: any) { 
          setAuthError(e.message || "Network error. Check console."); 
      } finally { 
          setAuthLoading(false); 
      }
  };

  const handleResetPassword = async () => {
    if (!email) {
       setAuthError('Please enter your email.');
       return;
    }
    setAuthLoading(true);
    setAuthError('');
    setAuthMessage('');
    
    try {
       const res = await api.resetPassword(email);
       if (res.success) {
          setAuthMessage('Reset instructions have been sent to your email.');
       } else {
          setAuthError(res.error || 'Reset failed. Please contact the administrator.');
       }
    } catch (e: any) {
       setAuthError(e.message || 'Connection failed.');
    } finally {
       setAuthLoading(false);
    }
  };

  const handleLogout = () => { 
    localStorage.removeItem(STORAGE_KEYS.USER); 
    setAuthState({ isAuthenticated: false, user: null, mode: 'local' }); 
    setView(ViewState.DASHBOARD); 
  };

  // --- TRANSACTION HANDLERS ---
  const handleDeleteTransaction = async (id: string) => {
    const txToDelete = transactions.find(t => t.transaction_id === id);
    if (txToDelete) {
      setDeletedTransactions(prev => [...prev, txToDelete]);
    }
    setTransactions(prev => prev.filter(t => t.transaction_id !== id));
    logAction(`Moved transaction to trash: ${id}`);
  };

  const handleRestoreTransaction = async (id: string) => {
    const txToRestore = deletedTransactions.find(t => t.transaction_id === id);
    if (!txToRestore) return;

    setTransactions(prev => [...prev, txToRestore].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    setDeletedTransactions(prev => prev.filter(t => t.transaction_id !== id));
    logAction(`Restored transaction: ${id}`);
  };

  const handlePermanentDelete = async (id: string) => {
    if (authState.mode === 'cloud') {
        setIsSyncing(true);
        try {
            const success = await api.deleteTransaction(id);
            if (!success) {
                alert("Failed to delete from Cloud. Check backend.");
                return;
            }
        } catch(e) {
            console.error(e);
            alert("Network error deleting transaction.");
            return;
        } finally {
            setIsSyncing(false);
        }
    }
    setDeletedTransactions(prev => prev.filter(t => t.transaction_id !== id));
    logAction(`Permanently deleted transaction: ${id}`);
  };

  const handleUpdateTransaction = async (tx: Transaction) => {
    if (authState.mode === 'cloud') {
        setIsSyncing(true);
        try {
            const success = await api.updateTransaction(tx);
            if (!success) {
                 alert("Update failed on server.");
                 return;
            }
        } catch(e) {
            console.error(e);
            alert("Network error updating transaction.");
            return;
        } finally {
            setIsSyncing(false);
        }
    }
    setTransactions(prev => prev.map(t => t.transaction_id === tx.transaction_id ? tx : t));
  };

  // --- RECURRING HANDLERS ---
  const handleAddRecurring = async (item: RecurringTransaction) => {
    if (authState.mode === 'cloud' && authState.user) {
        setIsSyncing(true);
        try {
           const success = await api.saveRecurringTransaction(authState.user.user_id, item);
           if (!success) throw new Error("Backend refused save");
        } catch(e) {
           console.error(e);
           alert("Failed to save recurring transaction.");
           setIsSyncing(false);
           return;
        }
        setIsSyncing(false);
    }
    setRecurringTransactions(prev => [...prev, item]);
  };

  const handleRemoveRecurring = async (id: string) => {
    if (authState.mode === 'cloud') {
       setIsSyncing(true);
       try {
           const success = await api.deleteRecurringTransaction(id);
           if (!success) throw new Error("Backend delete failed");
       } catch(e) {
           console.error(e);
           alert("Failed to delete recurring transaction.");
           setIsSyncing(false);
           return;
       }
       setIsSyncing(false);
    }
    setRecurringTransactions(prev => prev.filter(i => i.id !== id));
  };

  // --- RULE HANDLERS ---
  const handleAddRule = async (newRule: Rule) => {
    if (authState.mode === 'cloud' && authState.user) {
      setIsSyncing(true);
      try {
        const success = await api.addRule(authState.user.user_id, newRule);
        if (!success) throw new Error("Save rule failed");
      } catch (e) {
        console.error(e);
        alert("Failed to save rule to cloud.");
        setIsSyncing(false);
        return;
      }
      setIsSyncing(false);
    }
    setRules(prev => [...prev, newRule]);
  };

  const handleDeleteRule = async (id: string) => {
    if (authState.mode === 'cloud') {
      setIsSyncing(true);
      try {
        const success = await api.deleteRule(id);
        if (!success) throw new Error("Delete rule failed");
      } catch (e) {
         console.error(e);
         alert("Failed to delete rule from cloud.");
         setIsSyncing(false);
         return;
      }
      setIsSyncing(false);
    }
    setRules(prev => prev.filter(r => r.rule_id !== id));
  };

  const handleAddCategory = (cat: string) => setCategories(prev => [...prev, cat]);
  const handleDeleteCategory = (cat: string) => setCategories(prev => prev.filter(c => c !== cat));
  
  const handleApplyRules = async () => {
    if (rules.length === 0) return;
    setIsSyncing(true);
    setSyncStatus("Applying rules...");
    
    const sortedRules = [...rules].sort((a, b) => b.keyword.length - a.keyword.length);
    const updates: Transaction[] = [];

    const updatedTransactions = transactions.map(t => {
      const matchingRule = sortedRules.find(r => (t.description || '').toLowerCase().includes(r.keyword.toLowerCase()));
      
      if (matchingRule && t.category !== matchingRule.category) {
         const updated = { ...t, category: matchingRule.category };
         updates.push(updated);
         return updated;
      }
      return t;
    });

    if (authState.mode === 'cloud' && updates.length > 0) {
        try {
            setSyncStatus(`Updating ${updates.length} items on cloud...`);
            for (let i = 0; i < updates.length; i++) {
                const tx = updates[i];
                await api.updateTransaction(tx);
                if (i % 5 === 0) setSyncStatus(`Updating... (${i+1}/${updates.length})`);
            }
        } catch (e) {
            console.error("Batch update failed", e);
            alert("Some updates failed to sync to cloud. Please check connection.");
        }
    }

    setTransactions(updatedTransactions);
    setIsSyncing(false);
    setSyncStatus("");
  };

  const handleQuickRule = (tx: Transaction) => { handleAddRule({ rule_id: crypto.randomUUID(), user_id: authState.user?.user_id || 'local', keyword: tx.description, category: tx.category }); setView(ViewState.RULES); };

  const handleConnectToCloud = () => { setAuthState(prev => { const next = { ...prev, mode: 'cloud' as const }; localStorage.setItem(STORAGE_KEYS.AUTH_MODE, 'cloud'); return next; }); };
  const handleGenerateKey = async (name: string) => {
    const newKey: ApiKey = { id: crypto.randomUUID(), name, key: `dd_sk_${Array.from(crypto.getRandomValues(new Uint8Array(24))).map(b => b.toString(16).padStart(2, '0')).join('')}`, createdAt: new Date().toISOString() };
    
    if (authState.mode === 'cloud' && authState.user) { 
        setIsSyncing(true);
        await api.saveApiKey(authState.user.user_id, newKey); 
        setIsSyncing(false);
    }
    setApiKeys(prev => [newKey, ...prev]);
  };
  const handleRevokeKey = async (id: string) => {
    if (authState.mode === 'cloud') { 
        setIsSyncing(true);
        await api.revokeApiKey(id); 
        setIsSyncing(false);
    }
    setApiKeys(prev => prev.filter(k => k.id !== id));
  };

  // --- BACKGROUND FILE PROCESSOR (BATCH) ---
  useEffect(() => {
    const processQueue = async () => {
      if (isProcessingRef.current) return;
      
      const queuedJobs = fileQueue.filter(j => j.status === 'queued');
      if (queuedJobs.length === 0) return;

      isProcessingRef.current = true;
      const batch = queuedJobs.slice(0, 4);

      setFileQueue(prev => prev.map(j => batch.find(b => b.id === j.id) ? { ...j, status: 'processing' } : j));

      try {
        const filePayloads = await Promise.all(batch.map(async (job) => {
           return new Promise<{ data: string, mimeType: string, filename: string, jobId: string }>((resolve, reject) => {
              const reader = new FileReader();
              const isPdf = job.file.type === 'application/pdf' || job.file.name.toLowerCase().endsWith('.pdf');
              
              reader.onload = (e) => {
                const raw = e.target?.result as string;
                const data = isPdf ? raw.split(',')[1] : raw;
                resolve({ data, mimeType: isPdf ? 'application/pdf' : 'text/csv', filename: job.file.name, jobId: job.id });
              };
              reader.onerror = reject;
              if (isPdf) reader.readAsDataURL(job.file);
              else reader.readAsText(job.file);
           });
        }));

        const gemini = new GeminiService(apiKey);
        const extractedTxs = await gemini.batchParseBankStatements(
           filePayloads.map(f => ({ data: f.data, mimeType: f.mimeType, filename: f.filename })),
           authState.user?.user_id || 'local'
        );

        const sortedRules = [...rules].sort((a, b) => b.keyword.length - a.keyword.length);
        const processedTxs = extractedTxs.map(t => {
           const rule = sortedRules.find(r => (t.description || '').toLowerCase().includes(r.keyword.toLowerCase()));
           return rule ? { ...t, category: rule.category } : t;
        });

        const existingSignatures = new Set(transactionsRef.current.map(t => 
            `${t.date}-${t.amount}-${(t.description || '').trim().toLowerCase()}`
        ));

        const uniqueNewTxs = processedTxs.filter(t => {
             const sig = `${t.date}-${t.amount}-${(t.description || '').trim().toLowerCase()}`;
             if (existingSignatures.has(sig)) return false;
             existingSignatures.add(sig);
             return true;
        });

        if (uniqueNewTxs.length > 0) {
            setTransactions(prev => [...uniqueNewTxs, ...prev]);

            if (authState.mode === 'cloud' && authState.user) {
                api.saveTransactions(authState.user.user_id, uniqueNewTxs).catch(console.error);
            }
        }

        setFileQueue(prev => prev.map(j => {
           const payload = filePayloads.find(p => p.jobId === j.id);
           if (payload) {
              const count = uniqueNewTxs.filter(t => t.source_file === payload.filename).length;
              return { ...j, status: 'completed', resultCount: count };
           }
           return j;
        }));

      } catch (error: any) {
         console.error("Batch Processing Failed:", error);
         setFileQueue(prev => prev.map(j => batch.find(b => b.id === j.id) ? { ...j, status: 'error', error: error.message } : j));
      } finally {
         isProcessingRef.current = false;
      }
    };

    const timer = setInterval(processQueue, 1500);
    return () => clearInterval(timer);
  }, [fileQueue, apiKey, authState, rules]);

  // --- RENDER LOGIN SCREEN ---
  if (!authState.isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="mb-8 flex flex-col items-center animate-fade-in">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white font-bold text-3xl shadow-xl shadow-blue-900/30 mb-4 transform hover:scale-105 transition-transform duration-300">
            DD
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Dim Dawg Finance</h1>
          <p className="text-slate-400 mt-2 text-center max-w-sm">Secure, AI-Powered Financial Analysis</p>
        </div>

        <div className="bg-slate-900 p-8 rounded-2xl shadow-2xl border border-slate-800 w-full max-w-md animate-slide-up relative overflow-hidden">
          {authLoading && (
             <div className="absolute inset-0 bg-slate-900/80 z-20 flex flex-col items-center justify-center">
                 <RefreshCw className="animate-spin text-blue-500 mb-2" size={32}/>
                 <p className="text-blue-400 text-sm font-medium">Authenticating...</p>
             </div>
          )}

          {/* Mode Tabs */}
          <div className="flex bg-slate-950 p-1 rounded-xl mb-6 border border-slate-800">
             <button 
               onClick={() => { setAuthModeData('local'); setAuthError(''); }}
               className={`flex-1 flex items-center justify-center py-2 rounded-lg text-sm font-medium transition-all ${authModeData === 'local' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
             >
               <WifiOff size={16} className="mr-2" /> Local Only
             </button>
             <button 
               onClick={() => { setAuthModeData('cloud'); setAuthError(''); }}
               className={`flex-1 flex items-center justify-center py-2 rounded-lg text-sm font-medium transition-all ${authModeData === 'cloud' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
             >
               <UploadCloud size={16} className="mr-2" /> Cloud Sync
             </button>
          </div>

          {authError && (
             <div className="mb-4 p-3 bg-red-900/30 border border-red-500/50 rounded-lg flex items-center text-red-300 text-sm">
                <AlertTriangle size={16} className="mr-2 flex-shrink-0" />
                {authError}
             </div>
          )}
           {authMessage && (
             <div className="mb-4 p-3 bg-green-900/30 border border-green-500/50 rounded-lg flex items-center text-green-300 text-sm">
                <CheckCircle size={16} className="mr-2 flex-shrink-0" />
                {authMessage}
             </div>
          )}

          {authModeData === 'local' ? (
             <div className="space-y-4">
               <div>
                  <label className="text-xs text-slate-500 mb-1 block">Display Name</label>
                  <input type="text" className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="e.g. Finance Pro" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAuth()} />
               </div>
               <button onClick={handleAuth} className="w-full bg-slate-800 hover:bg-slate-700 text-white py-3 rounded-lg font-bold transition-colors border border-slate-700">
                  Enter Offline Mode
               </button>
               <p className="text-xs text-slate-500 text-center">Data stays on this device.</p>
             </div>
          ) : (
             <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                      <label className="text-xs text-slate-500 mb-1 block">Email</label>
                      <input type="email" className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none" value={email} onChange={e => setEmail(e.target.value)} />
                  </div>
                   <div>
                      <label className="text-xs text-slate-500 mb-1 block">Password</label>
                      <div className="relative">
                         <input type={showPassword ? "text" : "password"} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAuth()} />
                         <button onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
                            {showPassword ? <EyeOff size={16}/> : <Eye size={16}/>}
                         </button>
                      </div>
                  </div>
                </div>

                {isRegistering && (
                   <div>
                      <label className="text-xs text-slate-500 mb-1 block">Full Name</label>
                      <input type="text" className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none" value={name} onChange={e => setName(e.target.value)} />
                   </div>
                )}

                <button onClick={handleAuth} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-bold transition-colors shadow-lg shadow-blue-900/20">
                   {isRegistering ? 'Create Account' : 'Sign In'}
                </button>
                
                <div className="flex justify-between items-center text-xs mt-2">
                   <button onClick={() => setIsRegistering(!isRegistering)} className="text-blue-400 hover:text-blue-300">
                      {isRegistering ? 'Already have an account?' : 'Need an account?'}
                   </button>
                   {!isRegistering && (
                      <button onClick={handleResetPassword} className="text-slate-500 hover:text-slate-300">Forgot Password?</button>
                   )}
                </div>
             </div>
          )}
        </div>
      </div>
    );
  }

  // --- RENDER MAIN APP ---
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Navbar 
        currentView={view} 
        setView={setView} 
        authState={authState}
        onLogout={handleLogout}
        onSync={syncData}
        isSyncing={isSyncing}
      />
      
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 relative">
        {/* VIEW ROUTING */}
        <div className="animate-fade-in">
          {view === ViewState.DASHBOARD && (
             <>
               <Dashboard transactions={transactions} recurringTransactions={recurringTransactions} />
               <div className="mt-8">
                 <FileUpload onAddFiles={handleAddFiles} />
               </div>
             </>
          )}

          {view === ViewState.TRANSACTIONS && (
            <TransactionTable 
              transactions={transactions} 
              deletedTransactions={deletedTransactions}
              onUpdate={handleUpdateTransaction}
              onDelete={handleDeleteTransaction}
              onRestore={handleRestoreTransaction}
              onPermanentDelete={handlePermanentDelete}
              onQuickRule={handleQuickRule}
              categories={categories}
              onAddCategory={handleAddCategory}
              onManageRules={() => setView(ViewState.RULES)}
            />
          )}

          {view === ViewState.RULES && (
            <RulesManager 
               rules={rules} 
               categories={categories}
               onAddRule={handleAddRule} 
               onDeleteRule={handleDeleteRule}
               onAddCategory={handleAddCategory}
               onDeleteCategory={handleDeleteCategory}
               onApplyRules={handleApplyRules}
               userId={authState.user?.user_id || 'local'}
            />
          )}

          {view === ViewState.FORECAST && (
             <ForecastView 
               transactions={transactions} 
               recurringTransactions={recurringTransactions}
               onAddRecurring={handleAddRecurring}
               onRemoveRecurring={handleRemoveRecurring}
               categories={categories}
               onAddCategory={handleAddCategory}
             />
          )}

          {view === ViewState.PROFIT_LOSS && (
             <ProfitLossView transactions={transactions} />
          )}

          {view === ViewState.BALANCE_SHEET && (
             <BalanceSheetView transactions={transactions} />
          )}

          {view === ViewState.SETTINGS && (
            <div className="max-w-4xl mx-auto space-y-8">
               <div className="flex items-center space-x-4 mb-6">
                  <div className="p-3 bg-slate-800 rounded-full text-slate-400"><Settings size={24}/></div>
                  <div>
                     <h2 className="text-2xl font-bold text-white">Settings</h2>
                     <p className="text-slate-400">Manage your connection and data.</p>
                  </div>
               </div>

               <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 space-y-6">
                  <div className="pt-6 border-t border-slate-800">
                     <h4 className="font-bold text-red-400 mb-2 flex items-center"><AlertTriangle size={18} className="mr-2"/> Danger Zone</h4>
                     {!showResetConfirm ? (
                       <button onClick={() => setShowResetConfirm(true)} className="text-red-400 hover:text-red-300 text-sm hover:underline">
                          Factory Reset (Clear All Local Data)
                       </button>
                     ) : (
                       <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-4 animate-fade-in mt-2">
                          <p className="text-white font-bold text-sm mb-1">Are you absolutely sure?</p>
                          <p className="text-slate-300 text-xs mb-3">This action cannot be undone. All local transactions and settings will be erased.</p>
                          <div className="flex space-x-3">
                             <button onClick={() => setShowResetConfirm(false)} className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors">
                                Cancel
                             </button>
                             <button onClick={() => { localStorage.clear(); window.location.reload(); }} className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-colors shadow-lg">
                                Yes, Wipe Everything
                             </button>
                          </div>
                       </div>
                     )}
                  </div>
               </div>
               
               <ApiDocs 
                 apiKeys={apiKeys} 
                 onGenerateKey={handleGenerateKey} 
                 onRevokeKey={handleRevokeKey}
               />
            </div>
          )}
        </div>
      </main>

      <ChatAssistant 
        transactions={transactions} 
        rules={rules} 
        settings={settings}
        isOpen={isChatOpen}
        onToggle={() => setIsChatOpen(!isChatOpen)}
        apiKey={apiKey}
        externalProduct={externalProduct}
        recurringTransactions={recurringTransactions}
      />
      
      <FileQueue queue={fileQueue} clearCompleted={handleClearCompletedQueue} />
    </div>
  );
};

export default App;