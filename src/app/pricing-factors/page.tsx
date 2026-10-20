'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, Plus, Edit, Trash2, DollarSign, Settings, Percent } from 'lucide-react';
import PageSkeleton from '@/components/PageSkeleton';

interface PricingFactorRule {
  min_price: number;
  max_price?: number;
  addition_type: 'fixed' | 'percentage';
  addition_value: number;
}

interface PricingFactor {
  id: number;
  name: string;
  description?: string;
  is_active: boolean;
  created_at: string;
}

interface FormRule {
  min_price: string;
  max_price: string;
  addition_type: 'fixed' | 'percentage';
  addition_value: string;
}

export default function PricingFactorsPage() {
  const [factors, setFactors] = useState<PricingFactor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingFactor, setEditingFactor] = useState<PricingFactor | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    rules: [
      { min_price: '0', max_price: '199.99', addition_type: 'fixed' as const, addition_value: '75' },
      { min_price: '200', max_price: '499.99', addition_type: 'fixed' as const, addition_value: '150' },
      { min_price: '500', max_price: '999.99', addition_type: 'fixed' as const, addition_value: '200' },
      { min_price: '1000', max_price: '1999.99', addition_type: 'fixed' as const, addition_value: '350' },
      { min_price: '2000', max_price: '2999.99', addition_type: 'fixed' as const, addition_value: '500' },
      { min_price: '3000', max_price: '5999.99', addition_type: 'fixed' as const, addition_value: '750' },
      { min_price: '6000', max_price: '', addition_type: 'percentage' as const, addition_value: '25' }
    ] as FormRule[]
  });

  useEffect(() => {
    fetchFactors();
  }, []);

  const fetchFactors = async () => {
    try {
      const response = await fetch('/api/admin/pricing-factors');
      if (response.ok) {
        const data = await response.json();
        setFactors(data);
      }
    } catch (error) {
      console.error('Error fetching factors:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const rules = formData.rules.map(rule => ({
      min_price: parseFloat(rule.min_price),
      max_price: rule.max_price ? parseFloat(rule.max_price) : null,
      addition_type: rule.addition_type,
      addition_value: parseFloat(rule.addition_value)
    }));

    try {
      const url = editingFactor 
        ? `/api/admin/pricing-factors/${editingFactor.id}`
        : '/api/admin/pricing-factors';
      
      const method = editingFactor ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description,
          rules
        })
      });

      if (response.ok) {
        await fetchFactors();
        resetForm();
      }
    } catch (error) {
      console.error('Error saving factor:', error);
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingFactor(null);
    setFormData({
      name: '',
      description: '',
      rules: [
        { min_price: '0', max_price: '199.99', addition_type: 'fixed', addition_value: '75' },
        { min_price: '200', max_price: '499.99', addition_type: 'fixed', addition_value: '150' },
        { min_price: '500', max_price: '999.99', addition_type: 'fixed', addition_value: '200' },
        { min_price: '1000', max_price: '1999.99', addition_type: 'fixed', addition_value: '350' },
        { min_price: '2000', max_price: '2999.99', addition_type: 'fixed', addition_value: '500' },
        { min_price: '3000', max_price: '5999.99', addition_type: 'fixed', addition_value: '750' },
        { min_price: '6000', max_price: '', addition_type: 'percentage', addition_value: '25' }
      ]
    });
  };

  const addRule = () => {
    setFormData({
      ...formData,
      rules: [...formData.rules, { min_price: '', max_price: '', addition_type: 'fixed', addition_value: '' }]
    });
  };

  const removeRule = (index: number) => {
    setFormData({
      ...formData,
      rules: formData.rules.filter((_, i) => i !== index)
    });
  };

  const updateRule = (index: number, field: keyof FormRule, value: string) => {
    const newRules = [...formData.rules];
    newRules[index] = { ...newRules[index], [field]: value };
    setFormData({ ...formData, rules: newRules });
  };

  const handleEdit = async (factor: PricingFactor) => {
    try {
      const response = await fetch(`/api/admin/pricing-factors/${factor.id}`);
      if (response.ok) {
        const data = await response.json();
        setEditingFactor(factor);
        setFormData({
          name: data.factor.name,
          description: data.factor.description || '',
          rules: data.rules.map((rule: PricingFactorRule) => ({
            min_price: rule.min_price.toString(),
            max_price: rule.max_price ? rule.max_price.toString() : '',
            addition_type: rule.addition_type,
            addition_value: rule.addition_value.toString()
          }))
        });
        setShowForm(true);
      }
    } catch (error) {
      console.error('Error fetching factor details:', error);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this pricing factor?')) return;
    
    try {
      const response = await fetch(`/api/admin/pricing-factors/${id}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        await fetchFactors();
      }
    } catch (error) {
      console.error('Error deleting factor:', error);
    }
  };

  if (loading) {
    return <PageSkeleton />;
  }

  return (
    <div className="min-h-screen bg-black text-white font-sans">
      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        .animate-fadeIn {
          animation: fadeIn 0.25s ease-out;
        }
        
        .lime-gradient {
          background: linear-gradient(135deg, #34d399 0%, #10b981 100%);
        }
        
        .hover-lift:hover {
          transform: translateY(-2px);
          transition: all 0.3s ease;
        }
      `}</style>

      {/* Header */}
      <header className="border-b border-gray-800 lime-gradient sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => window.location.href = '/'}
                className="flex items-center space-x-2 px-3 py-1.5 bg-black/20 hover:bg-black/30 rounded-lg transition-all hover-lift"
              >
                <ArrowLeft size={16} className="text-black" />
                <span className="text-sm text-black font-medium">Dashboard</span>
              </button>
              
              <div className="flex items-center space-x-3">
                <DollarSign size={24} className="text-black" />
                <div>
                  <h1 className="text-xl font-bold text-black">Pricing Factors</h1>
                  <p className="text-xs text-black/70">Manage pricing rules</p>
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setShowForm(true)}
                className="flex items-center space-x-2 px-3 py-1.5 bg-black/20 hover:bg-black/30 rounded-lg transition-all hover-lift"
              >
                <Plus size={16} className="text-black" />
                <span className="text-sm text-black font-medium">New Factor</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Factors List */}
        {!showForm && (
          <div className="animate-fadeIn">
            <div className="grid gap-6">
              {factors.map((factor, index) => (
                <div 
                  key={factor.id} 
                  style={{ animationDelay: `${index * 0.1}s` }}
                  className="bg-gray-900/90 backdrop-blur-sm rounded-xl border border-gray-800 p-6 animate-fadeIn hover-lift"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-white mb-2">{factor.name}</h3>
                      {factor.description && (
                        <p className="text-gray-400 text-sm mb-4">{factor.description}</p>
                      )}
                      <div className="flex items-center space-x-4 text-sm text-gray-500">
                        <span>Created: {new Date(factor.created_at).toLocaleDateString()}</span>
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          factor.is_active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                        }`}>
                          {factor.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleEdit(factor)}
                        className="p-2 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-all"
                      >
                        <Edit size={16} />
                      </button>
                      
                      {factor.id !== 1 && (
                        <button
                          onClick={() => handleDelete(factor.id)}
                          className="p-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-all"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Form */}
        {showForm && (
          <div className="animate-fadeIn">
            <form onSubmit={handleSubmit} className="bg-gray-900/90 backdrop-blur-sm rounded-xl border border-gray-800 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white">
                  {editingFactor ? 'Edit Pricing Factor' : 'Create New Pricing Factor'}
                </h2>
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-gray-400 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Name</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-[#34d399] focus:border-[#34d399] text-white"
                    placeholder="e.g., Premium Pricing"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Description</label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-[#34d399] focus:border-[#34d399] text-white"
                    placeholder="Optional description"
                  />
                </div>
              </div>

              <div className="mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-white">Pricing Rules</h3>
                  <button
                    type="button"
                    onClick={addRule}
                    className="flex items-center space-x-2 px-3 py-1.5 bg-[#34d399] text-black rounded-lg hover:bg-[#10b981] transition-all"
                  >
                    <Plus size={16} />
                    <span>Add Rule</span>
                  </button>
                </div>

                <div className="space-y-4">
                  {formData.rules.map((rule, index) => (
                    <div key={index} className="grid grid-cols-1 md:grid-cols-5 gap-4 p-4 bg-gray-800/50 rounded-lg">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Min Price ($)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={rule.min_price}
                          onChange={(e) => updateRule(index, 'min_price', e.target.value)}
                          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Max Price ($)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={rule.max_price}
                          onChange={(e) => updateRule(index, 'max_price', e.target.value)}
                          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm"
                          placeholder="Leave empty for no limit"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Type</label>
                        <select
                          value={rule.addition_type}
                          onChange={(e) => updateRule(index, 'addition_type', e.target.value)}
                          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm"
                        >
                          <option value="fixed">Fixed ($)</option>
                          <option value="percentage">Percentage (%)</option>
                        </select>
                      </div>
                      
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">
                          {rule.addition_type === 'fixed' ? 'Amount ($)' : 'Percentage (%)'}
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={rule.addition_value}
                          onChange={(e) => updateRule(index, 'addition_value', e.target.value)}
                          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm"
                        />
                      </div>
                      
                      <div className="flex items-end">
                        <button
                          type="button"
                          onClick={() => removeRule(index)}
                          className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded transition-all"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center space-x-4">
                <button
                  type="submit"
                  className="px-6 py-2 bg-[#34d399] text-black font-medium rounded-lg hover:bg-[#10b981] transition-all"
                >
                  {editingFactor ? 'Update Factor' : 'Create Factor'}
                </button>
                
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-6 py-2 bg-gray-700 text-white font-medium rounded-lg hover:bg-gray-600 transition-all"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}