import React, { useState } from 'react';
import { Rule, Transaction } from '../types';
import { Plus, Trash2, Play, Save, Tag } from 'lucide-react';
import { useSiteContext } from '../context/SiteContext';

interface RulesManagerProps {
  rules: Rule[];
  categories: string[];
  onAddRule: (rule: Rule) => void;
  onDeleteRule: (id: string) => void;
  onAddCategory: (category: string) => void;
  onDeleteCategory: (category: string) => void;
  onApplyRules: () => void;
  userId: string;
}

export const RulesManager: React.FC<RulesManagerProps> = ({
  rules,
  categories,
  onAddRule,
  onDeleteRule,
  onAddCategory,
  onDeleteCategory,
  onApplyRules,
  userId
}) => {
  const { logAction } = useSiteContext();
  
  // Rule Form State
  const [keyword, setKeyword] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(categories[0] || '');
  
  // Category Form State
  const [newCategory, setNewCategory] = useState('');

  const handleCreateRule = () => {
    if (!keyword.trim() || !selectedCategory) return;
    
    const newRule: Rule = {
      rule_id: crypto.randomUUID(),
      user_id: userId,
      keyword: keyword.trim(),
      category: selectedCategory
    };

    onAddRule(newRule);
    setKeyword('');
    logAction(`Created rule: "${keyword}" -> ${selectedCategory}`);
  };

  const handleCreateCategory = () => {
    if (!newCategory.trim()) return;
    if (categories.includes(newCategory.trim())) return;

    onAddCategory(newCategory.trim());
    setNewCategory('');
    logAction(`Created category: "${newCategory}"`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-2xl font-bold text-white">Automation Rules</h2>
        <button
          onClick={onApplyRules}
          className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-lg transition-all shadow-lg w-full sm:w-auto justify-center"
        >
          <Play size={18} />
          <span>Run Rules on All Data</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT COLUMN: Categories */}
        <div className="lg:col-span-1 bg-slate-900 p-6 rounded-xl border border-slate-800">
          <div className="flex items-center mb-4 text-slate-100">
            <Tag className="mr-2 text-blue-500" size={20} />
            <h3 className="text-lg font-semibold">Categories</h3>
          </div>
          
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              placeholder="New Category..."
              className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none w-full"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateCategory()}
            />
            <button 
              onClick={handleCreateCategory}
              className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-lg"
            >
              <Plus size={18} />
            </button>
          </div>

          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
            {categories.map(cat => (
              <div key={cat} className="flex justify-between items-center group p-2 rounded hover:bg-slate-800/50">
                <span className="text-sm text-slate-300">{cat}</span>
                <button 
                  onClick={() => onDeleteCategory(cat)}
                  className="text-slate-600 hover:text-red-400 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT COLUMN: Rules */}
        <div className="lg:col-span-2 bg-slate-900 p-6 rounded-xl border border-slate-800">
          <div className="flex items-center mb-4 text-slate-100">
            <Play className="mr-2 text-amber-500" size={20} />
            <h3 className="text-lg font-semibold">Categorization Rules</h3>
          </div>

          <div className="bg-slate-800/50 p-4 rounded-lg mb-6 border border-slate-700">
            <h4 className="text-sm font-medium text-slate-400 mb-3">Add New Rule</h4>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="If description contains... (e.g. 'Netflix')"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-amber-500 outline-none"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                />
              </div>
              <div className="w-full sm:w-48">
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-amber-500 outline-none"
                >
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleCreateRule}
                className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg flex items-center justify-center font-medium transition-colors w-full sm:w-auto"
              >
                <Plus size={18} className="mr-1" /> Add
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Note: Rules are case-insensitive. Running rules will update all matching past transactions.
            </p>
          </div>

          <div className="space-y-3">
            {rules.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                No rules defined yet. Create one above or from the Transactions table.
              </div>
            ) : (
              rules.map(rule => (
                <div key={rule.rule_id} className="flex items-center justify-between p-3 bg-slate-800 rounded-lg border border-slate-700/50">
                  <div className="flex items-center space-x-3 overflow-hidden">
                    <div className="text-xs font-mono bg-slate-900 text-slate-400 px-2 py-1 rounded border border-slate-700 truncate max-w-[120px] sm:max-w-xs">
                      "{rule.keyword}"
                    </div>
                    <span className="text-slate-500">→</span>
                    <span className="text-sm font-medium text-amber-400 truncate">{rule.category}</span>
                  </div>
                  <button
                    onClick={() => onDeleteRule(rule.rule_id)}
                    className="text-slate-500 hover:text-red-400 transition-colors p-1"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};