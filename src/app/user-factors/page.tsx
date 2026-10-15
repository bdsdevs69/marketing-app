'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, Users, DollarSign, UserCheck, UserX, Settings } from 'lucide-react';

interface User {
  id: number;
  email: string;
  first_name?: string;
  last_name?: string;
  role: string;
  factor_id?: number;
  factor_name?: string;
  assigned_at?: string;
  assigned_by_email?: string;
}

interface PricingFactor {
  id: number;
  name: string;
  description?: string;
}

export default function UserFactorsPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [factors, setFactors] = useState<PricingFactor[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigningUserId, setAssigningUserId] = useState<number | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [usersResponse, factorsResponse] = await Promise.all([
        fetch('/api/admin/user-factors'),
        fetch('/api/admin/pricing-factors')
      ]);

      if (usersResponse.ok && factorsResponse.ok) {
        const usersData = await usersResponse.json();
        const factorsData = await factorsResponse.json();
        setUsers(usersData);
        setFactors(factorsData);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const assignFactor = async (userId: number, factorId: number) => {
    setAssigningUserId(userId);
    try {
      const response = await fetch('/api/admin/user-factors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, factorId })
      });

      if (response.ok) {
        await fetchData();
      }
    } catch (error) {
      console.error('Error assigning factor:', error);
    } finally {
      setAssigningUserId(null);
    }
  };

  const removeFactor = async (userId: number) => {
    setAssigningUserId(userId);
    try {
      const response = await fetch('/api/admin/user-factors', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });

      if (response.ok) {
        await fetchData();
      }
    } catch (error) {
      console.error('Error removing factor:', error);
    } finally {
      setAssigningUserId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#34d399]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white font-sans">
      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        .animate-fadeIn {
          animation: fadeIn 0.6s ease-out;
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
                onClick={() => window.location.href = '/pricing-factors'}
                className="flex items-center space-x-2 px-3 py-1.5 bg-black/20 hover:bg-black/30 rounded-lg transition-all hover-lift"
              >
                <ArrowLeft size={16} className="text-black" />
                <span className="text-sm text-black font-medium">Back</span>
              </button>
              
              <div className="flex items-center space-x-3">
                <UserCheck size={24} className="text-black" />
                <div>
                  <h1 className="text-xl font-bold text-black">User Factor Assignments</h1>
                  <p className="text-xs text-black/70">Assign pricing factors to users</p>
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="text-sm">
                <span className="text-black/70">Total Users:</span>
                <span className="ml-1 text-black font-bold">{users.length}</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 animate-fadeIn">
          <div className="bg-gray-900/90 backdrop-blur-sm rounded-xl border border-gray-800 p-6">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-[#34d399]/20 rounded-lg flex items-center justify-center">
                <Users size={24} className="text-[#34d399]" />
              </div>
              <div>
                <p className="text-gray-400 text-sm">Total Users</p>
                <p className="text-2xl font-bold text-white">{users.length}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-gray-900/90 backdrop-blur-sm rounded-xl border border-gray-800 p-6">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-green-500/20 rounded-lg flex items-center justify-center">
                <UserCheck size={24} className="text-green-400" />
              </div>
              <div>
                <p className="text-gray-400 text-sm">Assigned Users</p>
                <p className="text-2xl font-bold text-white">{users.filter(u => u.factor_id).length}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-gray-900/90 backdrop-blur-sm rounded-xl border border-gray-800 p-6">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-orange-500/20 rounded-lg flex items-center justify-center">
                <UserX size={24} className="text-orange-400" />
              </div>
              <div>
                <p className="text-gray-400 text-sm">Unassigned Users</p>
                <p className="text-2xl font-bold text-white">{users.filter(u => !u.factor_id).length}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Users Table */}
        <div className="bg-gray-900/90 backdrop-blur-sm rounded-xl border border-gray-800 overflow-hidden shadow-2xl animate-fadeIn">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800 lime-gradient">
                  <th className="px-6 py-4 text-left text-xs font-bold text-black uppercase tracking-wider">User</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-black uppercase tracking-wider">Current Factor</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-black uppercase tracking-wider">Assigned By</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-black uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {users.map((user, index) => (
                  <tr 
                    key={user.id}
                    style={{ animationDelay: `${index * 0.1}s` }}
                    className="hover:bg-gray-800/50 transition-all duration-300 animate-fadeIn"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-[#34d399]/20 rounded-full flex items-center justify-center">
                          <Users size={16} className="text-[#34d399]" />
                        </div>
                        <div>
                          <div className="text-sm font-medium text-white">
                            {user.first_name && user.last_name 
                              ? `${user.first_name} ${user.last_name}`
                              : user.email
                            }
                          </div>
                          <div className="text-sm text-gray-400">{user.email}</div>
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            user.role === 'admin' 
                              ? 'bg-purple-500/20 text-purple-400'
                              : 'bg-blue-500/20 text-blue-400'
                          }`}>
                            {user.role}
                          </span>
                        </div>
                      </div>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap">
                      {user.factor_name ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-400 border border-green-500/30">
                          <DollarSign size={12} className="mr-1" />
                          {user.factor_name}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-500/20 text-gray-400 border border-gray-500/30">
                          Default Pricing
                        </span>
                      )}
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                      {user.assigned_by_email ? (
                        <div>
                          <div>{user.assigned_by_email}</div>
                          <div className="text-xs text-gray-500">
                            {user.assigned_at ? new Date(user.assigned_at).toLocaleDateString() : ''}
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-500">-</span>
                      )}
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <select
                          value={user.factor_id || ''}
                          onChange={(e) => {
                            const factorId = parseInt(e.target.value);
                            if (factorId) {
                              assignFactor(user.id, factorId);
                            } else {
                              // If empty value selected, remove factor assignment
                              removeFactor(user.id);
                            }
                          }}
                          disabled={assigningUserId === user.id}
                          className="px-3 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:ring-2 focus:ring-[#34d399] focus:border-[#34d399]"
                        >
                          <option value="">No Factor (Default Pricing)</option>
                          {factors.map(factor => (
                            <option key={factor.id} value={factor.id}>
                              {factor.name}
                            </option>
                          ))}
                        </select>
                        
                        {user.factor_id && (
                          <button
                            onClick={() => removeFactor(user.id)}
                            disabled={assigningUserId === user.id}
                            className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded transition-all"
                            title="Remove factor assignment"
                          >
                            <UserX size={16} />
                          </button>
                        )}
                        
                        {assigningUserId === user.id && (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[#34d399]"></div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {users.length === 0 && (
          <div className="text-center py-12">
            <Users size={48} className="mx-auto text-gray-600 mb-4" />
            <h3 className="text-lg font-medium text-gray-300 mb-2">No users found</h3>
            <p className="text-gray-500">Users will appear here once they are created.</p>
          </div>
        )}
      </div>
    </div>
  );
}