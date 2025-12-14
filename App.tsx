
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
import { Settings, RefreshCw, UploadCloud, Eye, EyeOff, AlertTriangle, CheckCircle, WifiOff, Copy, Code } from 'lucide-react';
import { useSiteContext } from './context/SiteContext';

interface AppProps {
  apiKey?: string;
  initialUser?: User;
  initialSheetUrl?: string;
}

// --- BACKEND SCRIPT TEMPLATE ---
const GOOGLE_APPS_SCRIPT_CODE = `
/**
 * DIM DAWG FINANCE BACKEND
 * Copy this entire script into Extensions > Apps Script in your Google Sheet.
 * Deploy as Web App -> Execute as: Me -> Access: Anyone.
 */

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({ 
    status: 'online', 
    service: 'Dim Dawg Backend', 
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
        // Placeholder for email logic
        result = { success: true, message: 'Password reset logged' };
        break;
      default:
        result = { success: false, error: 'Unknown action' };
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
    if (data[i][1] == email && data[i][2] == password) { // In prod, verify hash
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
  // Delete existing for this user to avoid dups on full sync, or handle merge. 
  // For simplicity in this script, we just append new ones (client handles dedup).
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
      // Reconstruct object, preferring JSON column if valid, else headers
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
   // Check if update
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
  // Basic update implementation for Transactions
  if (sheetName !== 'Transactions') return { success: false, error: 'Not implemented' };
  
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idIdx = headers.indexOf(idColName);
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][idIdx] == idValue) {
      // Update columns based on header mapping
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

const App: React.FC<AppProps> = ({ apiKey, initialUser, initialSheetUrl }) => {
  const { setCurrentPage, logAction } = useSiteContext();

  // --- STATE ---
  const [view, setView] = useState<ViewState>(ViewState.DASHBOARD);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isEmbedMode, setIsEmbedMode] = useState(false); 
  const [externalProduct, setExternalProduct] = useState<ExternalProduct | null>(null);

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
    return stored ? JSON.parse(stored) : { sheetUrl: initialSheetUrl || '' };
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
    if (initialUser) return { isAuthenticated: true, user: initialUser, mode: 'local' }; 
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
     return settings.sheetUrl ? 'cloud' : 'local';
  });
  const [isRegistering, setIsRegistering] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [connStatus, setConnStatus] = useState<'idle' | 'success' | 'error' | 'checking'>('idle');
  const [connMsg, setConnMsg] = useState('');

  const [fileQueue, setFileQueue] = useState<FileJob[]>([]);
  const isProcessingRef = useRef(false);
  
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string>('');
  const [scriptCopied, setScriptCopied] = useState(false);

  // --- PERSISTENCE ---
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(transactions)); }, [transactions]);
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.DELETED, JSON.stringify(deletedTransactions)); }, [deletedTransactions]);
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings)); }, [settings]);
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.RULES, JSON.stringify(rules)); }, [rules]);
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.RECURRING, JSON.stringify(recurringTransactions)); }, [recurringTransactions]);
  useEffect(() => { localStorage.setItem('dd_categories', JSON.stringify(categories)); }, [categories]);

  // --- SYNC LOGIC ---
  const syncData = useCallback(async () => {
    if (!settings.sheetUrl || !authState.user || authState.mode !== 'cloud') return;
    
    const currentUserId = authState.user.user_id || (authState.user as any).userId;
    if (!currentUserId) { setSyncStatus('Error: Invalid User ID.'); return; }

    setIsSyncing(true);
    setSyncStatus('Fetching Cloud Data...');

    try {
      const api = new SheetApi(settings.sheetUrl);
      
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
        await api.saveTransactions(currentUserId, toPush);
        toPush.forEach(t => mergedMap.set(t.transaction_id, t));
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
  }, [settings.sheetUrl, authState.user, authState.mode]); 

  useEffect(() => {
    if (authState.isAuthenticated && authState.mode === 'cloud' && settings.sheetUrl) {
      syncData();
    }
  }, [authState.isAuthenticated, authState.mode, settings.sheetUrl, syncData]);

  // --- HANDLERS ---
  const handleTestConnection = async () => {
    if (!settings.sheetUrl) {
      setConnStatus('error');
      setConnMsg('Enter a URL first');
      return;
    }
    setConnStatus('checking');
    setConnMsg('Pinging backend...');
    const api = new SheetApi(settings.sheetUrl);
    const result = await api.healthCheck();
    if (result.success) {
      setConnStatus('success');
      setConnMsg('Connected! Ready to login.');
    } else {
      setConnStatus('error');
      setConnMsg(result.message || 'Connection Failed');
    }
  };

  const handleCopyScript = () => {
    navigator.clipboard.writeText(GOOGLE_APPS_SCRIPT_CODE);
    setScriptCopied(true);
    setTimeout(() => setScriptCopied(false), 2000);
  };

  const handleFactoryReset = () => {
    if (confirm("⚠️ DANGER: This will delete ALL transaction data, settings, and rules stored on this device. This cannot be undone. Are you sure?")) {
      localStorage.clear();
      window.location.reload();
    }
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
        setAuthError('To use Cloud Mode, you must configure the Backend URL below.');
        setAuthLoading(false);
        return;
      }

      if (!email || !password) {
         setAuthError('Please fill in email and password.');
         setAuthLoading(false);
         return;
      }

      const api = new SheetApi(settings.sheetUrl);
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
    
    if (!settings.sheetUrl) {
       setAuthError('Configure Backend URL first.');
       setAuthLoading(false);
       return;
    }

    try {
       const api = new SheetApi(settings.sheetUrl);
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
    // 1. Move to deleted array (Soft Delete)
    const txToDelete = transactions.find(t => t.transaction_id === id);
    if (txToDelete) {
      setDeletedTransactions(prev => [...prev, txToDelete]);
    }
    // 2. Remove from active
    setTransactions(prev => prev.filter(t => t.transaction_id !== id));
    
    // 3. Sync Delete to Cloud immediately to keep lists clean
    if (authState.mode === 'cloud' && settings.sheetUrl) { 
      const api = new SheetApi(settings.sheetUrl); 
      api.deleteTransaction(id).catch(console.error); 
    }
    logAction(`Moved transaction to trash: ${id}`);
  };

  const handleRestoreTransaction = async (id: string) => {
    // 1. Find in deleted
    const txToRestore = deletedTransactions.find(t => t.transaction_id === id);
    if (!txToRestore) return;

    // 2. Add back to active
    setTransactions(prev => [...prev, txToRestore].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    
    // 3. Remove from deleted
    setDeletedTransactions(prev => prev.filter(t => t.transaction_id !== id));

    // 4. Sync Add to Cloud
    if (authState.mode === 'cloud' && settings.sheetUrl && authState.user) {
      const api = new SheetApi(settings.sheetUrl);
      // Re-save it
      api.saveTransactions(authState.user.user_id, [txToRestore]).catch(console.error);
    }
    logAction(`Restored transaction: ${id}`);
  };

  const handlePermanentDelete = (id: string) => {
    setDeletedTransactions(prev => prev.filter(t => t.transaction_id !== id));
    // Cloud is already deleted from handleDeleteTransaction step
    logAction(`Permanently deleted transaction: ${id}`);
  };

  const handleUpdateTransaction = async (tx: Transaction) => {
    setTransactions(prev => prev.map(t => t.transaction_id === tx.transaction_id ? tx : t));
    if (authState.mode === 'cloud' && settings.sheetUrl) { setIsSyncing(true); try { const api = new SheetApi(settings.sheetUrl); await api.updateTransaction(tx); } finally { setIsSyncing(false); } }
  };

  // --- RECURRING HANDLERS ---
  const handleAddRecurring = async (item: RecurringTransaction) => {
    setRecurringTransactions(prev => [...prev, item]);
    if (authState.mode === 'cloud' && settings.sheetUrl && authState.user) {
       const api = new SheetApi(settings.sheetUrl);
       await api.saveRecurringTransaction(authState.user.user_id, item);
    }
  };
  const handleRemoveRecurring = async (id: string) => {
    setRecurringTransactions(prev => prev.filter(i => i.id !== id));
    if (authState.mode === 'cloud' && settings.sheetUrl) {
       const api = new SheetApi(settings.sheetUrl);
       await api.deleteRecurringTransaction(id);
    }
  };

  // --- RULE HANDLERS ---
  const handleAddRule = async (newRule: Rule) => {
    setRules(prev => [...prev, newRule]);
    if (authState.mode === 'cloud' && settings.sheetUrl && authState.user) {
      const api = new SheetApi(settings.sheetUrl);
      await api.addRule(authState.user.user_id, newRule);
    }
  };
  const handleDeleteRule = async (id: string) => {
    setRules(prev => prev.filter(r => r.rule_id !== id));
    if (authState.mode === 'cloud' && settings.sheetUrl) {
      const api = new SheetApi(settings.sheetUrl);
      await api.deleteRule(id);
    }
  };
  const handleAddCategory = (cat: string) => setCategories(prev => [...prev, cat]);
  const handleDeleteCategory = (cat: string) => setCategories(prev => prev.filter(c => c !== cat));
  
  // Smarter Rule Application (Sorts by length desc so specific rules match first)
  const handleApplyRules = async () => {
    if (rules.length === 0) return;
    setIsSyncing(true);
    
    // Sort rules: longer keywords first (Specificity)
    const sortedRules = [...rules].sort((a, b) => b.keyword.length - a.keyword.length);

    const updatedTransactions = transactions.map(t => {
      const matchingRule = sortedRules.find(r => (t.description || '').toLowerCase().includes(r.keyword.toLowerCase()));
      // Only apply if category is different to avoid unnecessary updates
      return matchingRule && t.category !== matchingRule.category ? { ...t, category: matchingRule.category } : t;
    });
    setTransactions(updatedTransactions);
    setIsSyncing(false);
  };
  const handleQuickRule = (tx: Transaction) => { handleAddRule({ rule_id: crypto.randomUUID(), user_id: authState.user?.user_id || 'local', keyword: tx.description, category: tx.category }); setView(ViewState.RULES); };

  const handleConnectToCloud = () => { if (!settings.sheetUrl) return; setAuthState(prev => { const next = { ...prev, mode: 'cloud' as const }; localStorage.setItem(STORAGE_KEYS.AUTH_MODE, 'cloud'); return next; }); };
  const handleGenerateKey = async (name: string) => {
    const newKey: ApiKey = { id: crypto.randomUUID(), name, key: `dd_sk_${Array.from(crypto.getRandomValues(new Uint8Array(24))).map(b => b.toString(16).padStart(2, '0')).join('')}`, createdAt: new Date().toISOString() };
    setApiKeys(prev => [newKey, ...prev]);
    if (authState.mode === 'cloud' && settings.sheetUrl && authState.user) { const api = new SheetApi(settings.sheetUrl); await api.saveApiKey(authState.user.user_id, newKey); }
  };
  const handleRevokeKey = async (id: string) => {
    setApiKeys(prev => prev.filter(k => k.id !== id));
    if (authState.mode === 'cloud' && settings.sheetUrl) { const api = new SheetApi(settings.sheetUrl); await api.revokeApiKey(id); }
  };

  // --- BACKGROUND FILE PROCESSOR (BATCH) ---
  useEffect(() => {
    const processQueue = async () => {
      if (isProcessingRef.current) return;
      
      const queuedJobs = fileQueue.filter(j => j.status === 'queued');
      if (queuedJobs.length === 0) return;

      isProcessingRef.current = true;
      const batch = queuedJobs.slice(0, 4); // Process max 4 files to avoid payload limits

      // Set status to processing
      setFileQueue(prev => prev.map(j => batch.find(b => b.id === j.id) ? { ...j, status: 'processing' } : j));

      try {
        // Read files in parallel
        const filePayloads = await Promise.all(batch.map(async (job) => {
           return new Promise<{ data: string, mimeType: string, filename: string, jobId: string }>((resolve, reject) => {
              const reader = new FileReader();
              const isPdf = job.file.type === 'application/pdf' || job.file.name.toLowerCase().endsWith('.pdf');
              
              reader.onload = (e) => {
                const raw = e.target?.result as string;
                const data = isPdf ? raw.split(',')[1] : raw; // Base64 for PDF, Text for CSV
                resolve({
                   data,
                   mimeType: isPdf ? 'application/pdf' : 'text/csv',
                   filename: job.file.name,
                   jobId: job.id
                });
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

        // Apply Rules immediately to new transactions (Smart Logic)
        const sortedRules = [...rules].sort((a, b) => b.keyword.length - a.keyword.length);
        const finalTxs = extractedTxs.map(t => {
           const rule = sortedRules.find(r => (t.description || '').toLowerCase().includes(r.keyword.toLowerCase()));
           return rule ? { ...t, category: rule.category } : t;
        });

        // Update State
        setTransactions(prev => [...finalTxs, ...prev]);

        // Sync to Cloud
        if (authState.mode === 'cloud' && settings.sheetUrl && authState.user) {
            const api = new SheetApi(settings.sheetUrl);
            api.saveTransactions(authState.user.user_id, finalTxs).catch(console.error);
        }

        // Update Job Status
        setFileQueue(prev => prev.map(j => {
           const payload = filePayloads.find(p => p.jobId === j.id);
           if (payload) {
              const count = finalTxs.filter(t => t.source_file === payload.filename).length;
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

    const timer = setInterval(processQueue, 1500); // Check queue every 1.5s
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
                   <input type="text" className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none font-mono text-xs" placeholder="https://script.google.com/..." value={settings.sheetUrl} onChange={e => setSettings({...settings, sheetUrl: e.target.value})} />
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
                        <button onClick={handleTestConnection} className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm border border-slate-700">Test</button>
                        <button onClick={() => {if(settings.sheetUrl) {setAuthModeData('cloud'); handleConnectToCloud();}}} disabled={!settings.sheetUrl || authState.mode === 'cloud'} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm">Save & Connect</button>
                     </div>
                     {connMsg && <p className={`text-xs mt-2 ${connStatus === 'success' ? 'text-green-400' : connStatus === 'error' ? 'text-red-400' : 'text-slate-400'}`}>{connMsg}</p>}
                  </div>

                  <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
                     <div className="flex justify-between items-center mb-2">
                        <h4 className="font-semibold text-white flex items-center"><Code size={16} className="mr-2 text-yellow-500"/> Backend Script</h4>
                        <button onClick={handleCopyScript} className="text-xs bg-slate-800 hover:bg-slate-700 text-white px-2 py-1 rounded flex items-center">
                           {scriptCopied ? <CheckCircle size={12} className="mr-1 text-green-400"/> : <Copy size={12} className="mr-1"/>} 
                           {scriptCopied ? 'Copied' : 'Copy Code'}
                        </button>
                     </div>
                     <p className="text-xs text-slate-500 mb-2">
                        Copy this code into <strong>Extensions &gt; Apps Script</strong> in your Google Sheet. Deploy as Web App (Access: Anyone).
                     </p>
                  </div>

                  <div className="pt-6 border-t border-slate-800">
                     <h4 className="font-bold text-red-400 mb-2 flex items-center"><AlertTriangle size={18} className="mr-2"/> Danger Zone</h4>
                     <button onClick={handleFactoryReset} className="text-red-400 hover:text-red-300 text-sm hover:underline">
                        Factory Reset (Clear All Local Data)
                     </button>
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
