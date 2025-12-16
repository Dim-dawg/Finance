
import React, { useState } from 'react';
import { ApiKey, AppSettings } from '../types';
import { Key, Plus, Trash2, Copy, CheckCircle, Shield, Server, Terminal } from 'lucide-react';

interface ApiDocsProps {
  apiKeys: ApiKey[];
  onGenerateKey: (name: string) => void;
  onRevokeKey: (id: string) => void;
  settings: AppSettings;
}

export const ApiDocs: React.FC<ApiDocsProps> = ({ apiKeys, onGenerateKey, onRevokeKey, settings }) => {
  const [newKeyName, setNewKeyName] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCreate = () => {
    if (!newKeyName.trim()) return;
    onGenerateKey(newKeyName);
    setNewKeyName('');
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(text);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const endpointUrl = settings.sheetUrl || "https://script.google.com/macros/s/.../exec";

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-800 pb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center">
            <Server className="text-blue-500 mr-3" size={28} />
            External Integrations
          </h1>
          <p className="text-slate-400 mt-1">
            Manage API keys to let other AIs (like Sneak Peek) securely consult your financial data.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* LEFT: Key Management */}
        <div className="space-y-6">
          <div className="bg-slate-900 p-6 rounded-xl border border-slate-800">
            <div className="flex items-center mb-6">
              <Key className="text-emerald-400 mr-2" size={20} />
              <h3 className="text-lg font-bold text-white">Active API Keys</h3>
            </div>

            <div className="flex gap-2 mb-6">
              <input
                type="text"
                placeholder="App Name (e.g. Sneak Peek)"
                className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
              />
              <button 
                onClick={handleCreate}
                disabled={!newKeyName.trim()}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg font-medium flex items-center"
              >
                <Plus size={16} className="mr-1" /> Generate
              </button>
            </div>

            <div className="space-y-3">
              {apiKeys.length === 0 ? (
                <div className="text-center py-8 text-slate-500 bg-slate-950/50 rounded-lg border border-slate-800 border-dashed">
                  No active keys. Generate one to start.
                </div>
              ) : (
                apiKeys.map(key => (
                  <div key={key.id} className="p-4 bg-slate-950 rounded-lg border border-slate-800 flex justify-between items-center group">
                    <div className="min-w-0 flex-1 mr-4">
                      <div className="flex items-center mb-1">
                        <span className="font-semibold text-white mr-2">{key.name}</span>
                        <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">
                          Created: {new Date(key.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="flex items-center bg-slate-900 rounded px-2 py-1 border border-slate-800">
                        <code className="text-xs text-blue-400 font-mono truncate flex-1">
                          {key.key}
                        </code>
                        <button 
                          onClick={() => copyToClipboard(key.key)}
                          className="ml-2 text-slate-500 hover:text-white"
                        >
                          {copiedKey === key.key ? <CheckCircle size={14} className="text-green-500"/> : <Copy size={14}/>}
                        </button>
                      </div>
                    </div>
                    <button 
                      onClick={() => onRevokeKey(key.id)}
                      className="p-2 text-slate-600 hover:text-red-400 hover:bg-red-900/10 rounded transition-colors"
                      title="Revoke Key"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 flex items-start">
            <Shield className="text-slate-400 mr-3 mt-1 flex-shrink-0" size={20} />
            <div>
              <h4 className="text-sm font-semibold text-slate-200">Security Note</h4>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                These keys provide read-only access to your financial summary (Balance, Forecast). 
                They <strong>cannot</strong> see individual transaction details or transfer money. 
                Revoking a key immediately cuts off access.
              </p>
            </div>
          </div>
        </div>

        {/* RIGHT: Developer Docs */}
        <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 flex flex-col h-full">
          <div className="flex items-center mb-4">
            <Terminal className="text-purple-400 mr-2" size={20} />
            <h3 className="text-lg font-bold text-white">Developer Integration</h3>
          </div>

          <div className="prose prose-invert max-w-none text-sm text-slate-300 space-y-4">
            <p>
              Share this documentation with the developers of the external app (e.g., Sneak Peek).
            </p>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-500 uppercase">Endpoint URL</label>
              <div className="bg-slate-950 p-3 rounded border border-slate-700 font-mono text-xs text-blue-300 break-all select-all">
                {endpointUrl}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-500 uppercase">Example Request (JSON)</label>
              <div className="bg-slate-950 p-4 rounded border border-slate-700 font-mono text-xs text-emerald-400 overflow-x-auto">
{`POST /exec
{
  "action": "externalQuery",
  "apiKey": "dd_sk_...",
  "payload": {
    "query": "Can I afford these $200 shoes?",
    "productContext": {
      "price": 200,
      "name": "Air Max 90"
    }
  }
}`}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-500 uppercase">Example Response</label>
              <div className="bg-slate-950 p-4 rounded border border-slate-700 font-mono text-xs text-amber-400 overflow-x-auto">
{`{
  "success": true,
  "analysis": {
    "canAfford": false,
    "confidence": 0.9,
    "reasoning": "Projected balance drops below $0 next week due to rent.",
    "suggestion": "Wait 5 days until payday."
  }
}`}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
