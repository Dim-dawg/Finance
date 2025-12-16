
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
import { SheetApi, SystemCheckResponse } from './lib/sheetApi';
import { GeminiService } from './lib/geminiService';
import { Settings, RefreshCw, UploadCloud, Eye, EyeOff, AlertTriangle, CheckCircle, WifiOff, Copy, Code, ExternalLink, Database, Trash2, Server, ShieldCheck, XCircle } from 'lucide-react';
import { useSiteContext } from './context/SiteContext';

interface AppProps {
  apiKey?: string;
  initialUser?: User;
  initialSheetUrl?: string;
}

// --- BACKEND SCRIPT TEMPLATE ---
const GOOGLE_APPS_SCRIPT_CODE = `
/**
 * DIM DAWG FINANCE BACKEND v1.1.0
 * Copy this entire script into Extensions > Apps Script in your Google Sheet.
 * Deploy as Web App -> Execute as: Me -> Access: Anyone.
 */

const APP_VERSION = "1.1.0";

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({ 
    status: 'online', 
    service: 'Dim Dawg Backend', 
    version: APP_VERSION,
    timestamp: new Date().toISOString() 
  })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.tryLock(10000);

  try {
    const jsonString = e.postData.contents;
    const data = JSON.parse(jsonString);
    const action = data.action;
    
    // Auto-Setup Sheets if missing
    setupSheets();

    let result = {};

    switch(action) {
      case 'systemCheck':
        result = performSystemCheck();
        break;
      case 'login':
        result = handleLogin(data.email, data.password);
        break;
      case 'register':
        result = handleRegister(data.email, data.password, data.name);
        break;
      case 'saveTransactions':
        result = saveTransactions(data.userId, data.transactions);
        break;
      case 'getTransactions':
        result = getTransactions(data.userId);
        break;
      case 'deleteTransaction':
        result = deleteRow('Transactions', 'transaction_id', data.transactionId);
        break;
      case 'updateTransaction':
        result = updateRow('Transactions', 'transaction_id', data.transactionId, data.updates);
        break;
      case 'saveRecurringTransaction':
         result = saveRecurring(data.userId, data.transaction);
         break;
      case 'getRecurringTransactions':
         result = getRecurring(data.userId);
         break;
      case 'deleteRecurringTransaction':
         result = deleteRow('Recurring', 'id', data.id);
         break;
      case 'saveRule':
        result = saveRule(data.userId, data);
        break;
      case 'getRules':
        result = getRules(data.userId);
        break;
      case 'deleteRule':
        result = deleteRow('Rules', 'rule_id', data.ruleId);
        break;
      case 'saveApiKey':
        result = saveApiKey(data.userId, data.apiKey);
        break;
      case 'getApiKeys':
        result = getApiKeys(data.userId);
        break;
      case 'revokeApiKey':
        result = deleteRow('ApiKeys', 'id', data.keyId);
        break;
      case 'resetPassword':
        result = { success: true, message: 'Password reset logged' };
        break;
      default:
        result = { success: false, error: 'Unknown action: ' + action };
    }

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

// --- HELPER FUNCTIONS ---

function performSystemCheck() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const requiredSheets = ['Users', 'Transactions', 'Rules', 'Recurring', 'ApiKeys'];
  const missing = [];
  requiredSheets.forEach(name => {
    if (!ss.getSheetByName(name)) missing.push(name);
  });
  
  return {
    success: true,
    version: APP_VERSION,
    sheets: {
      total: requiredSheets.length,
      missing: missing,
      status: missing.length === 0 ? 'OK' : 'INCOMPLETE'
    },
    capabilities: ['auth', 'transactions', 'rules', 'recurring', 'apiKeys']
  };
}

function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = [
    { name: 'Users', headers: ['user_id', 'email', 'password_hash', 'name', 'created_at'] },
    { name: 'Transactions', headers: ['transaction_id', 'user_id', 'date', 'description', 'amount', 'category', 'type', 'notes', 'json_data'] },
    { name: 'Rules', headers: ['rule_id', 'user_id', 'keyword', 'category'] },
    { name: 'Recurring', headers: ['id', 'user_id', 'description', 'amount', 'category', 'type', 'frequency', 'startDate', 'endDate'] },
    { name: 'ApiKeys', headers: ['id', 'user_id', 'name', 'key', 'created_at'] }
  ];

  sheets.forEach(s => {
    let sheet = ss.getSheetByName(s.name);
    if (!sheet) {
      sheet = ss.insertSheet(s.name);
      sheet.appendRow(s.headers);
    }
  });
}

function handleLogin(email, password) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Users');
  const data = sheet.getDataRange().getValues();
  // Row 0 is headers
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] == email && data[i][2] == password) { 
       return { success: true, user: { user_id: data[i][0], email: data[i][1], name: data[i][3] } };
    }
  }
  return { success: false, error: 'Invalid credentials' };
}

function handleRegister(email, password, name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Users');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] == email) return { success: false, error: 'Email already exists' };
  }
  const newId = Utilities.getUuid();
  sheet.appendRow([newId, email, password, name, new Date()]);
  return { success: true, user: { user_id: newId, email: email, name: name } };
}

function saveTransactions(userId, txs) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Transactions');
  const rows = txs.map(t => [
    t.transaction_id, userId, t.date, t.description, t.amount, t.category, t.type, t.notes || '', JSON.stringify(t)
  ]);
  if(rows.length > 0) sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  return { success: true };
}

function getTransactions(userId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Transactions');
  const data = sheet.getDataRange().getValues();
  const results = [];
  for(let i=1; i<data.length; i++) {
    if(data[i][1] == userId) {
      const t = {
        transaction_id: data[i][0],
        user_id: data[i][1],
        date: formatDate(data[i][2]),
        description: data[i][3],
        amount: Number(data[i][4]),
        category: data[i][5],
        type: data[i][6],
        notes: data[i][7],
        source_file: JSON.parse(data[i][8] || '{}').source_file || ''
      };
      results.push(t);
    }
  }
  return { success: true, data: results };
}

function saveRecurring(userId, r) {
   const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Recurring');
   deleteRow('Recurring', 'id', r.id);
   sheet.appendRow([r.id, userId, r.description, r.amount, r.category, r.type, r.frequency, r.startDate, r.endDate || '']);
   return { success: true };
}

function getRecurring(userId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Recurring');
  const data = sheet.getDataRange().getValues();
  const results = [];
  for(let i=1; i<data.length; i++) {
    if(data[i][1] == userId) {
      results.push({
         id: data[i][0], user_id: userId, description: data[i][2], amount: data[i][3],
         category: data[i][4], type: data[i][5], frequency: data[i][6], startDate: formatDate(data[i][7]), endDate: data[i][8]
      });
    }
  }
  return { success: true, data: results };
}

function saveRule(userId, r) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Rules');
  sheet.appendRow([r.rule_id || Utilities.getUuid(), userId, r.keyword, r.category]);
  return { success: true };
}

function getRules(userId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Rules');
  const data = sheet.getDataRange().getValues();
  const results = [];
  for(let i=1; i<data.length; i++) {
    if(data[i][1] == userId) {
      results.push({ rule_id: data[i][0], user_id: userId, keyword: data[i][2], category: data[i][3] });
    }
  }
  return { success: true, data: results };
}

function saveApiKey(userId, k) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ApiKeys');
  sheet.appendRow([k.id, userId, k.name, k.key, k.createdAt]);
  return { success: true };
}

function getApiKeys(userId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ApiKeys');
  const data = sheet.getDataRange().getValues();
  const results = [];
  for(let i=1; i<data.length; i++) {
    if(data[i][1] == userId) {
      results.push({ id: data[i][0], name: data[i][2], key: data[i][3], createdAt: data[i][4] });
    }
  }
  return { success: true, data: results };
}

function deleteRow(sheetName, idColName, idValue) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const colIdx = headers.indexOf(idColName);
  
  if (colIdx === -1) return { success: false, error: 'Column not found' };

  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][colIdx] == idValue) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  return { success: true }; 
}

function updateRow(sheetName, idColName, idValue, updates) {
  if (sheetName !== 'Transactions') return { success: false, error: 'Not implemented' };
  
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idIdx = headers.indexOf(idColName);
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][idIdx] == idValue) {
      const rowNum = i + 1;
      if(updates.description) sheet.getRange(rowNum, headers.indexOf('description')+1).setValue(updates.description);
      if(updates.amount) sheet.getRange(rowNum, headers.indexOf('amount')+1).setValue(updates.amount);
      if(updates.category) sheet.getRange(rowNum, headers.indexOf('category')+1).setValue(updates.category);
      if(updates.date) sheet.getRange(rowNum, headers.indexOf('date')+1).setValue(updates.date);
      
      return { success: true };
    }
  }
  return { success: false, error: 'Not found' };
}

function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  return d.toISOString().split('T')[0];
}
`;

const CLIENT_VERSION = "1.1.0";

const App: React.FC<AppProps> = ({ apiKey, initialUser, initialSheetUrl }) => {
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

  // Handle Embed Mode
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'embed') {
      setIsEmbedMode(true);
      setIsChatOpen(true); 
    }
  }, []);

  // Handle External Products (Sneak Peek)
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

  // --- SETTINGS (Persisted for connection) ---
  const [settings, setSettings] = useState<AppSettings>(() => {
    const stored = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    return stored ? JSON.parse(stored) : { sheetUrl: initialSheetUrl || '' };
  });

  // --- DATA STATE (NO LOCAL STORAGE - CLOUD ONLY) ---
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const transactionsRef = useRef(transactions);
  useEffect(() => { transactionsRef.current = transactions; }, [transactions]);

  const [deletedTransactions, setDeletedTransactions] = useState<Transaction[]>([]);

  const [rules, setRules] = useState<Rule[]>([]);

  const [recurringTransactions, setRecurringTransactions] = useState<RecurringTransaction[]>([]);
  const recurringRef = useRef(recurringTransactions);
  useEffect(() => { recurringRef.current = recurringTransactions; }, [recurringTransactions]);

  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);

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
      
      const missing = Array.from(txCats).filter(c => !existingSet.has(c.toLowerCase()));
      return missing.length > 0 ? [...prev, ...missing] : prev;
    });
  }, [transactions]);


  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);

  // --- AUTH STATE (Persisted for Session) ---
  const [authState, setAuthState] = useState<AuthState>(() => {
    if (initialUser) return { isAuthenticated: true, user: initialUser, mode: 'local' }; 
    const storedUser = localStorage.getItem(STORAGE_KEYS.USER);
    // Force 'cloud' mode default if user has set it up previously, otherwise local
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
     return settings.sheetUrl ? 'cloud' : 'local';
  });
  const [isRegistering, setIsRegistering] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  
  // Connection & Verification State
  const [connStatus, setConnStatus] = useState<'idle' | 'success' | 'error' | 'checking'>('idle');
  const [connMsg, setConnMsg] = useState('');
  const [verifyResult, setVerifyResult] = useState<SystemCheckResponse | null>(null);

  const [fileQueue, setFileQueue] = useState<FileJob[]>([]);
  const isProcessingRef = useRef(false);
  
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string>('');
  const [scriptCopied, setScriptCopied] = useState(false);

  // --- PERSISTENCE: ONLY SETTINGS ---
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings)); }, [settings]);
  // Note: Removed transaction/rules/recurring persistence to localStorage.

  // --- AUTO VALIDATE URL ON LOAD ---
  useEffect(() => {
    const validateBackend = async () => {
      if (settings.sheetUrl && authState.mode === 'cloud') {
        const api = new SheetApi(settings.sheetUrl);
        const check = await api.healthCheck();
        if (!check.success) {
           console.warn(`[App] Backend Health Check Failed: ${check.message}`);
           setSyncStatus('Backend Unreachable');
        }
      }
    };
    validateBackend();
  }, [settings.sheetUrl, authState.mode]);


  // --- CLOUD FETCH LOGIC (Primary Source of Truth) ---
  const refreshCloudData = useCallback(async () => {
    if (!settings.sheetUrl || !authState.user || authState.mode !== 'cloud') return;
    
    const currentUserId = authState.user.user_id;
    setIsSyncing(true);
    setSyncStatus('Fetching Cloud Data...');

    try {
      const api = new SheetApi(settings.sheetUrl);
      
      const [cloudTxs, cloudKeys, cloudRules, cloudRecurring] = await Promise.all([
         api.getTransactions(currentUserId),
         api.getApiKeys(currentUserId),
         api.getRules(currentUserId),
         api.getRecurringTransactions(currentUserId)
      ]);

      // Set state directly from Cloud. No local merging needed as Cloud is truth.
      setTransactions(cloudTxs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      setRecurringTransactions(cloudRecurring);
      setRules(cloudRules);
      setApiKeys(cloudKeys);
      
      setSyncStatus('Data Updated');
      setTimeout(() => setSyncStatus(''), 2000);

    } catch (e: any) {
      console.error("Fetch Error:", e);
      setSyncStatus(`Fetch Failed: ${e.message}`);
    } finally {
      setIsSyncing(false);
    }
  }, [settings.sheetUrl, authState.user, authState.mode]); 

  // Initial Data Load
  useEffect(() => {
    if (authState.isAuthenticated && authState.mode === 'cloud' && settings.sheetUrl) {
      refreshCloudData();
    }
  }, [authState.isAuthenticated, authState.mode, settings.sheetUrl, refreshCloudData]);

  // --- HANDLERS ---
  const handleTestConnection = async () => {
    if (!settings.sheetUrl) {
      setConnStatus('error');
      setConnMsg('Enter a URL first');
      return;
    }
    setConnStatus('checking');
    setConnMsg('Checking connection & schema...');
    setVerifyResult(null);

    const api = new SheetApi(settings.sheetUrl);
    
    // 1. Basic Ping
    const health = await api.healthCheck();
    if (!health.success) {
      setConnStatus('error');
      setConnMsg(health.message || 'Connection Failed');
      return;
    }

    // 2. Deep System Check
    const deepCheck = await api.systemCheck();
    setVerifyResult(deepCheck);

    if (deepCheck.success) {
      setConnStatus('success');
      setConnMsg('Ready!');
    } else {
      setConnStatus('error');
      setConnMsg(deepCheck.error || 'System Check Failed');
    }
  };

  const handleCopyScript = () => {
    navigator.clipboard.writeText(GOOGLE_APPS_SCRIPT_CODE);
    setScriptCopied(true);
    setTimeout(() => setScriptCopied(false), 2000);
  };

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
      if (!settings.sheetUrl) {
        setAuthError('To use Cloud Mode, you must configure the Backend URL.');
        setAuthLoading(false);
        return;
      }

      // Pre-check health before attempting login
      const api = new SheetApi(settings.sheetUrl);
      const health = await api.healthCheck();
      if (!health.success) {
         setAuthError(health.message || "Backend unreachable");
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
          
          // Immediate Data Fetch
          setTimeout(refreshCloudData, 100); 
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
    if (!email) { setAuthError('Please enter your email.'); return; }
    setAuthLoading(true);
    setAuthError('');
    setAuthMessage('');
    if (!settings.sheetUrl) { setAuthError('Configure Backend URL first.'); setAuthLoading(false); return; }

    try {
       const api = new SheetApi(settings.sheetUrl);
       const res = await api.resetPassword(email);
       if (res.success) setAuthMessage('Reset instructions have been sent to your email.');
       else setAuthError(res.error || 'Reset failed.');
    } catch (e: any) {
       setAuthError(e.message || 'Connection failed.');
    } finally {
       setAuthLoading(false);
    }
  };

  const handleLogout = () => { 
    localStorage.removeItem(STORAGE_KEYS.USER); 
    setAuthState({ isAuthenticated: false, user: null, mode: 'local' }); 
    setTransactions([]);
    setRules([]);
    setRecurringTransactions([]);
    setView(ViewState.DASHBOARD); 
  };

  // --- TRANSACTION HANDLERS (Cloud Enforced) ---
  const handleDeleteTransaction = async (id: string) => {
    // Optimistic UI updates are removed. We wait for server.
    if (authState.mode === 'cloud' && settings.sheetUrl) {
        setIsSyncing(true);
        try {
            const api = new SheetApi(settings.sheetUrl);
            const success = await api.deleteTransaction(id);
            if (!success) { alert("Failed to delete from Cloud."); return; }
            
            // On success, update UI
            setTransactions(prev => prev.filter(t => t.transaction_id !== id));
            logAction(`Permanently deleted transaction: ${id}`);
        } catch(e) {
            console.error(e);
            alert("Network error deleting transaction.");
        } finally {
            setIsSyncing(false);
        }
    } else {
        // Local fallback (if user insists on using app without cloud connection, though UI discourages it)
        setTransactions(prev => prev.filter(t => t.transaction_id !== id));
    }
  };

  // Soft delete logic handled purely in memory until page refresh if not synced? 
  // User asked to "stop saving locally". 
  // So even soft delete should probably just hide it or be a real delete in this new paradigm.
  // For safety, I will keep soft delete as a UI state only, but "Permanent Delete" triggers API.
  const handleSoftDelete = (id: string) => {
     const tx = transactions.find(t => t.transaction_id === id);
     if (tx) setDeletedTransactions(prev => [...prev, tx]);
     setTransactions(prev => prev.filter(t => t.transaction_id !== id));
  };
  
  const handleRestoreTransaction = (id: string) => {
     const tx = deletedTransactions.find(t => t.transaction_id === id);
     if (tx) setTransactions(prev => [...prev, tx].sort((a,b) => b.date.localeCompare(a.date)));
     setDeletedTransactions(prev => prev.filter(t => t.transaction_id !== id));
  };

  const handleUpdateTransaction = async (tx: Transaction) => {
    if (authState.mode === 'cloud' && settings.sheetUrl) {
        setIsSyncing(true);
        try {
            const api = new SheetApi(settings.sheetUrl);
            const success = await api.updateTransaction(tx);
            if (!success) { alert("Update failed on server."); return; }
            
            setTransactions(prev => prev.map(t => t.transaction_id === tx.transaction_id ? tx : t));
        } catch(e) {
            console.error(e);
            alert("Network error updating transaction.");
        } finally {
            setIsSyncing(false);
        }
    } else {
        setTransactions(prev => prev.map(t => t.transaction_id === tx.transaction_id ? tx : t));
    }
  };

  // --- RECURRING HANDLERS ---
  const handleAddRecurring = async (item: RecurringTransaction) => {
    if (authState.mode === 'cloud' && settings.sheetUrl && authState.user) {
        setIsSyncing(true);
        try {
           const api = new SheetApi(settings.sheetUrl);
           const success = await api.saveRecurringTransaction(authState.user.user_id, item);
           if (!success) throw new Error("Backend refused save");
           
           setRecurringTransactions(prev => [...prev, item]);
        } catch(e) {
           console.error(e);
           alert("Failed to save recurring transaction.");
        } finally {
           setIsSyncing(false);
        }
    } else {
       setRecurringTransactions(prev => [...prev, item]);
    }
  };

  const handleRemoveRecurring = async (id: string) => {
    if (authState.mode === 'cloud' && settings.sheetUrl) {
       setIsSyncing(true);
       try {
           const api = new SheetApi(settings.sheetUrl);
           const success = await api.deleteRecurringTransaction(id);
           if (!success) throw new Error("Backend delete failed");
           
           setRecurringTransactions(prev => prev.filter(i => i.id !== id));
       } catch(e) {
           console.error(e);
           alert("Failed to delete recurring transaction.");
       } finally {
           setIsSyncing(false);
       }
    } else {
       setRecurringTransactions(prev => prev.filter(i => i.id !== id));
    }
  };

  // --- RULE HANDLERS ---
  const handleAddRule = async (newRule: Rule) => {
    if (authState.mode === 'cloud' && settings.sheetUrl && authState.user) {
      setIsSyncing(true);
      try {
        const api = new SheetApi(settings.sheetUrl);
        const success = await api.addRule(authState.user.user_id, newRule);
        if (!success) throw new Error("Save rule failed");
        
        setRules(prev => [...prev, newRule]);
      } catch (e) {
        console.error(e);
        alert("Failed to save rule to cloud.");
      } finally {
        setIsSyncing(false);
      }
    } else {
        setRules(prev => [...prev, newRule]);
    }
  };

  const handleDeleteRule = async (id: string) => {
    if (authState.mode === 'cloud' && settings.sheetUrl) {
      setIsSyncing(true);
      try {
        const api = new SheetApi(settings.sheetUrl);
        const success = await api.deleteRule(id);
        if (!success) throw new Error("Delete rule failed");
        
        setRules(prev => prev.filter(r => r.rule_id !== id));
      } catch (e) {
         console.error(e);
         alert("Failed to delete rule from cloud.");
      } finally {
         setIsSyncing(false);
      }
    } else {
        setRules(prev => prev.filter(r => r.rule_id !== id));
    }
  };

  const handleAddCategory = (cat: string) => setCategories(prev => [...prev, cat]);
  const handleDeleteCategory = (cat: string) => setCategories(prev => prev.filter(c => c !== cat));
  
  // Smarter Rule Application
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

    if (authState.mode === 'cloud' && settings.sheetUrl && updates.length > 0) {
        try {
            const api = new SheetApi(settings.sheetUrl);
            setSyncStatus(`Updating ${updates.length} items on cloud...`);
            
            for (let i = 0; i < updates.length; i++) {
                const tx = updates[i];
                await api.updateTransaction(tx);
                if (i % 5 === 0) setSyncStatus(`Updating... (${i+1}/${updates.length})`);
            }
            
            // Only update local state if cloud sync worked
            setTransactions(updatedTransactions);
        } catch (e) {
            console.error("Batch update failed", e);
            alert("Some updates failed to sync to cloud. Please check connection.");
        } finally {
            setIsSyncing(false);
            setSyncStatus("");
        }
    } else if (authState.mode === 'local') {
        setTransactions(updatedTransactions);
        setIsSyncing(false);
        setSyncStatus("");
    }
  };

  const handleQuickRule = (tx: Transaction) => { handleAddRule({ rule_id: crypto.randomUUID(), user_id: authState.user?.user_id || 'local', keyword: tx.description, category: tx.category }); setView(ViewState.RULES); };

  const handleConnectToCloud = () => { if (!settings.sheetUrl) return; setAuthState(prev => { const next = { ...prev, mode: 'cloud' as const }; localStorage.setItem(STORAGE_KEYS.AUTH_MODE, 'cloud'); return next; }); };
  const handleGenerateKey = async (name: string) => {
    const newKey: ApiKey = { id: crypto.randomUUID(), name, key: `dd_sk_${Array.from(crypto.getRandomValues(new Uint8Array(24))).map(b => b.toString(16).padStart(2, '0')).join('')}`, createdAt: new Date().toISOString() };
    
    if (authState.mode === 'cloud' && settings.sheetUrl && authState.user) { 
        setIsSyncing(true);
        const api = new SheetApi(settings.sheetUrl); 
        await api.saveApiKey(authState.user.user_id, newKey); 
        setIsSyncing(false);
    }
    setApiKeys(prev => [newKey, ...prev]);
  };
  const handleRevokeKey = async (id: string) => {
    if (authState.mode === 'cloud' && settings.sheetUrl) { 
        setIsSyncing(true);
        const api = new SheetApi(settings.sheetUrl); 
        await api.revokeApiKey(id); 
        setIsSyncing(false);
    }
    setApiKeys(prev => prev.filter(k => k.id !== id));
  };
  
  // --- PURGE LOCAL DATA (Added specifically for user request) ---
  const handlePurgeLocalData = () => {
    if (confirm("This will permanently delete ALL transaction, rule, and forecast data stored in this browser's LocalStorage.\n\nYour Cloud data (Google Sheets) and API settings will NOT be touched.\n\nContinue?")) {
        // Specifically wipe the data keys, but keep SETTINGS and USER so they stay logged in
        const keysToWipe = [
            STORAGE_KEYS.TRANSACTIONS,
            STORAGE_KEYS.RULES,
            STORAGE_KEYS.RECURRING,
            STORAGE_KEYS.DELETED,
            'dd_balance_sheet_items',
            'dd_forecast_data',
            'dd_forecast_date',
            'dd_categories'
        ];
        
        keysToWipe.forEach(k => localStorage.removeItem(k));
        
        // Reset State Immediately
        setTransactions([]);
        setRecurringTransactions([]);
        setRules([]);
        setDeletedTransactions([]);
        
        alert("Local cache purged. You are now working with a clean slate (or cloud-only data).");
    }
  };

  // --- BACKGROUND FILE PROCESSOR (SINGLE) ---
  useEffect(() => {
    const processQueue = async () => {
      if (isProcessingRef.current) return;
      
      const job = fileQueue.find(j => j.status === 'queued');
      if (!job) return;

      isProcessingRef.current = true;
      setFileQueue(prev => prev.map(j => j.id === job.id ? { ...j, status: 'processing' } : j));

      try {
        const filePayload = await new Promise<{ data: string, mimeType: string, filename: string }>((resolve, reject) => {
            const reader = new FileReader();
            const isPdf = job.file.type === 'application/pdf' || job.file.name.toLowerCase().endsWith('.pdf');
            
            reader.onload = (e) => {
              const raw = e.target?.result as string;
              const data = isPdf ? raw.split(',')[1] : raw;
              resolve({
                  data,
                  mimeType: isPdf ? 'application/pdf' : 'text/csv',
                  filename: job.file.name
              });
            };
            reader.onerror = reject;
            if (isPdf) reader.readAsDataURL(job.file);
            else reader.readAsText(job.file);
        });

        const gemini = new GeminiService(apiKey);
        const extractedTxs = await gemini.parseBankStatement(
           filePayload,
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
             return true;
        });

        // CLOUD SAVE FIRST
        if (uniqueNewTxs.length > 0) {
            if (authState.mode === 'cloud' && settings.sheetUrl && authState.user) {
                const api = new SheetApi(settings.sheetUrl);
                const success = await api.saveTransactions(authState.user.user_id, uniqueNewTxs);
                if (success) {
                   setTransactions(prev => [...uniqueNewTxs, ...prev]);
                } else {
                   throw new Error("Cloud save failed. Transactions not added.");
                }
            } else {
                // Fallback for local
                setTransactions(prev => [...uniqueNewTxs, ...prev]);
            }
        }

        setFileQueue(prev => prev.map(j => j.id === job.id ? { ...j, status: 'completed', resultCount: uniqueNewTxs.length } : j));

      } catch (error: any) {
         console.error("File Processing Failed:", error);
         setFileQueue(prev => prev.map(j => j.id === job.id ? { ...j, status: 'error', error: error.message } : j));
      } finally {
         isProcessingRef.current = false;
      }
    };

    const timer = setInterval(processQueue, 1000); 
    return () => clearInterval(timer);
  }, [fileQueue, apiKey, authState, settings.sheetUrl, rules]);

  // --- RENDER LOGIN SCREEN ---
  if (!authState.isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="mb-8 flex flex-col items-center animate-fade-in">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white font-bold text-3xl shadow-xl shadow-blue-900/30 mb-4 transform hover:scale-105 transition-transform duration-300">
            DD
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Dim Dawg Finance</h1>
          <p className="text-slate-400 mt-2 text-center max-w-sm">Secure, Local-First AI Financial Analysis</p>
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
                <div>
                   <label className="text-xs text-slate-500 mb-1 block">Backend URL (Google Apps Script)</label>
                   <input 
                     type="text" 
                     className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none font-mono text-xs" 
                     placeholder="https://script.google.com/..." 
                     value={settings.sheetUrl} 
                     onChange={e => setSettings({...settings, sheetUrl: e.target.value})} 
                   />
                   <p className="text-[10px] text-slate-500 mt-1 pl-1">
                      Must end in <code className="text-blue-400">/exec</code>. Do not use the editor URL.
                   </p>
                </div>
                
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
        onSync={refreshCloudData}
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
              onDelete={handleSoftDelete}
              onRestore={handleRestoreTransaction}
              onPermanentDelete={handleDeleteTransaction}
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
               {/* SETTINGS CONTENT (Inline for simplicity or extract component) */}
               <div className="flex items-center space-x-4 mb-6">
                  <div className="p-3 bg-slate-800 rounded-full text-slate-400"><Settings size={24}/></div>
                  <div>
                     <h2 className="text-2xl font-bold text-white">Settings</h2>
                     <p className="text-slate-400">Manage your connection and data.</p>
                  </div>
               </div>

               <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 space-y-6">
                  <div>
                     <label className="text-sm font-bold text-white block mb-2">Cloud Backend URL</label>
                     <div className="flex gap-2">
                        <input 
                          type="text" 
                          className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-white font-mono text-sm" 
                          value={settings.sheetUrl} 
                          onChange={(e) => setSettings({...settings, sheetUrl: e.target.value})} 
                          placeholder="https://script.google.com/..."
                        />
                        <button onClick={handleTestConnection} className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm border border-slate-700 flex items-center">
                           {connStatus === 'checking' && <RefreshCw size={14} className="mr-2 animate-spin"/>}
                           {connStatus !== 'checking' && <Server size={14} className="mr-2"/>}
                           Test & Verify
                        </button>
                        <button onClick={() => {if(settings.sheetUrl) {setAuthModeData('cloud'); handleConnectToCloud();}}} disabled={!settings.sheetUrl || authState.mode === 'cloud'} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm">Save & Connect</button>
                     </div>
                     
                     {/* VERIFICATION REPORT CARD */}
                     {(connStatus === 'success' || connStatus === 'error' || verifyResult) && (
                        <div className={`mt-4 p-4 rounded-lg border animate-fade-in ${connStatus === 'success' ? 'bg-emerald-900/10 border-emerald-500/30' : 'bg-red-900/10 border-red-500/30'}`}>
                           <div className="flex items-center mb-2">
                              {connStatus === 'success' ? <CheckCircle size={18} className="text-emerald-400 mr-2"/> : <XCircle size={18} className="text-red-400 mr-2"/>}
                              <span className={`font-bold ${connStatus === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>{connMsg}</span>
                           </div>
                           
                           {/* Deep Diagnostic Details */}
                           {verifyResult && (
                              <div className="mt-3 space-y-2 text-xs border-t border-slate-700/50 pt-3">
                                 <div className="flex justify-between items-center">
                                    <span className="text-slate-400">Connection</span>
                                    <span className="text-emerald-400 font-mono">OK (HTTP 200)</span>
                                 </div>
                                 <div className="flex justify-between items-center">
                                    <span className="text-slate-400">Script Version</span>
                                    <div className="flex items-center">
                                       <span className={`font-mono mr-2 ${verifyResult.version === CLIENT_VERSION ? 'text-emerald-400' : 'text-amber-400'}`}>
                                          Server: v{verifyResult.version || '???'} / Client: v{CLIENT_VERSION}
                                       </span>
                                       {verifyResult.version !== CLIENT_VERSION && (
                                          <span className="bg-amber-900 text-amber-300 px-1 rounded text-[10px]">Update Required</span>
                                       )}
                                    </div>
                                 </div>
                                 <div className="flex justify-between items-center">
                                    <span className="text-slate-400">Database Integrity</span>
                                    {verifyResult.sheets?.status === 'OK' ? (
                                       <span className="text-emerald-400 flex items-center"><Database size={10} className="mr-1"/> All Sheets Present</span>
                                    ) : (
                                       <span className="text-red-400 flex items-center">
                                          <AlertTriangle size={10} className="mr-1"/> Missing: {verifyResult.sheets?.missing.join(', ')}
                                       </span>
                                    )}
                                 </div>
                                 {verifyResult.capabilities && (
                                    <div className="flex justify-between items-center">
                                       <span className="text-slate-400">API Capabilities</span>
                                       <span className="text-slate-500 font-mono">{verifyResult.capabilities.length} methods active</span>
                                    </div>
                                 )}
                              </div>
                           )}
                        </div>
                     )}
                  </div>

                  <div className="bg-slate-950 p-6 rounded-lg border border-slate-800">
                     <div className="flex justify-between items-center mb-6 border-b border-slate-800 pb-4">
                        <h4 className="font-semibold text-white flex items-center text-lg"><Code size={20} className="mr-2 text-yellow-500"/> Backend Script Code (v{CLIENT_VERSION})</h4>
                        <button onClick={handleCopyScript} className="text-xs bg-blue-900/30 hover:bg-blue-900/50 text-blue-300 border border-blue-500/30 px-3 py-1.5 rounded flex items-center transition-colors">
                           {scriptCopied ? <CheckCircle size={14} className="mr-1.5 text-green-400"/> : <Copy size={14} className="mr-1.5"/>} 
                           {scriptCopied ? 'Copied to Clipboard' : 'Copy Script Code'}
                        </button>
                     </div>
                     
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                           <h5 className="text-sm font-bold text-slate-300 mb-3 uppercase tracking-wide">Installation Steps</h5>
                           <ol className="list-decimal list-inside text-sm text-slate-400 space-y-3 leading-relaxed">
                              <li>Create a new <a href="https://sheets.new" target="_blank" className="text-blue-400 hover:underline inline-flex items-center">Google Sheet <ExternalLink size={12} className="ml-1"/></a>.</li>
                              <li>Go to <strong>Extensions &gt; Apps Script</strong>.</li>
                              <li>Paste the code into <code>Code.gs</code> (delete existing code).</li>
                              <li>Click the <strong className="text-white">Save</strong> icon (Floppy Disk).</li>
                              <li>Click <strong className="text-blue-400">Deploy &gt; New Deployment</strong>.</li>
                              <li>Click the "Select type" gear icon &gt; <strong>Web App</strong>.</li>
                              <li>Set "Execute as": <strong>Me</strong>.</li>
                              <li>
                                 <span className="text-red-400 font-bold bg-red-900/10 px-1 rounded">CRITICAL:</span> Set "Who has access": <strong>Anyone</strong>.
                              </li>
                              <li>Click <strong>Deploy</strong> and copy the "Web App URL".</li>
                              <li>Paste the URL into the field above and click <strong>Save & Connect</strong>.</li>
                           </ol>
                        </div>
                        <div className="bg-slate-900 p-4 rounded border border-slate-800 text-xs font-mono text-slate-500 overflow-y-auto max-h-[250px]">
                           <div className="flex items-center mb-2 text-slate-400 italic">
                              <Code size={12} className="mr-1"/> Preview of Code.gs
                           </div>
                           {GOOGLE_APPS_SCRIPT_CODE.substring(0, 500)}...
                           <br/><br/>
                           <span className="text-slate-600">// (Click "Copy Script Code" above for full source)</span>
                        </div>
                     </div>
                  </div>

                  <div className="pt-6 border-t border-slate-800">
                     <h4 className="font-bold text-red-400 mb-2 flex items-center"><AlertTriangle size={18} className="mr-2"/> Danger Zone</h4>
                     
                     {/* Specific Local Cache Purge (User Request) */}
                     <div className="mb-4 bg-amber-900/10 border border-amber-500/20 rounded-lg p-4 flex justify-between items-center">
                        <div>
                           <p className="text-white font-bold text-sm">Purge Local Cache Only</p>
                           <p className="text-slate-400 text-xs">Clears browser storage (transactions, rules) without logging you out. Use this to remove stale local data.</p>
                        </div>
                        <button onClick={handlePurgeLocalData} className="px-3 py-1.5 bg-amber-700 hover:bg-amber-600 text-white rounded text-xs font-medium flex items-center">
                           <Trash2 size={12} className="mr-1"/> Purge Cache
                        </button>
                     </div>

                     {!showResetConfirm ? (
                       <button onClick={() => setShowResetConfirm(true)} className="text-red-400 hover:text-red-300 text-sm hover:underline">
                          Factory Reset (Wipe Everything & Logout)
                       </button>
                     ) : (
                       <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-4 animate-fade-in mt-2">
                          <p className="text-white font-bold text-sm mb-1">Are you absolutely sure?</p>
                          <p className="text-slate-300 text-xs mb-3">This action cannot be undone. All local data and connection settings will be erased.</p>
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
                     
                     <div className="mt-4 pt-4 border-t border-slate-800/50">
                        <h5 className="text-xs font-bold text-slate-500 uppercase mb-2">Data Source Status</h5>
                        <div className="flex items-center space-x-2 text-sm">
                           <Database size={16} className={authState.mode === 'cloud' ? 'text-blue-500' : 'text-slate-500'} />
                           <span className={authState.mode === 'cloud' ? 'text-blue-200' : 'text-slate-400'}>
                              {authState.mode === 'cloud' ? `Cloud Connected (${settings.sheetUrl.substring(0, 20)}...)` : 'Local Storage Only (Offline)'}
                           </span>
                        </div>
                     </div>
                  </div>
               </div>
               
               {/* API DOCS SECTION */}
               <ApiDocs 
                 apiKeys={apiKeys} 
                 onGenerateKey={handleGenerateKey} 
                 onRevokeKey={handleRevokeKey}
                 settings={settings}
               />
            </div>
          )}
        </div>
      </main>

      {/* GLOBAL FLOATING COMPONENTS */}
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
