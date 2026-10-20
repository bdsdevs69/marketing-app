'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, Users, Shield, ShieldOff, Mail, Calendar, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import PageSkeleton from '@/components/PageSkeleton';

interface User {
  id: number;
  email: string;
  role: 'admin' | 'user';
  first_name?: string;
  last_name?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export default function UserManagementPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>('user');
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Check if user is admin
  useEffect(() => {
    const checkAdminAccess = async () => {
      try {
        const response = await fetch('/api/auth/me');
        if (response.ok) {
          const userData = await response.json();
          if (userData.role !== 'admin') {
            window.location.href = '/';
            return;
          }
          setUserRole(userData.role);
        } else {
          window.location.href = '/login';
        }
      } catch (error) {
        console.error('Failed to verify admin access:', error);
        window.location.href = '/';
      }
    };

    checkAdminAccess();
  }, []);

  // Fetch all users
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await fetch('/api/admin/users');
        if (response.ok) {
          const usersData = await response.json();
          setUsers(usersData);
        } else {
          showMessage('error', 'Failed to fetch users');
        }
      } catch (error) {
        console.error('Error fetching users:', error);
        showMessage('error', 'Error loading users');
      } finally {
        setLoading(false);
      }
    };

    if (userRole === 'admin') {
      fetchUsers();
    }
  }, [userRole]);

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const toggleUserStatus = async (userId: number, currentStatus: boolean) => {
    setActionLoading(userId);
    try {
      const response = await fetch('/api/admin/users/toggle-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId, isActive: !currentStatus }),
      });

      if (response.ok) {
        setUsers(users.map(user => 
          user.id === userId 
            ? { ...user, is_active: !currentStatus }
            : user
        ));
        showMessage('success', `User ${!currentStatus ? 'activated' : 'restricted'} successfully`);
      } else {
        const data = await response.json();
        showMessage('error', data.message || 'Failed to update user status');
      }
    } catch (error) {
      console.error('Error toggling user status:', error);
      showMessage('error', 'Error updating user status');
    } finally {
      setActionLoading(null);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
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
        
        @keyframes slideDown {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        .animate-fadeIn {
          animation: fadeIn 0.25s ease-out;
        }
        
        .animate-slideDown {
          animation: fadeIn 0.25s ease-out;
        }
        
        .lime-gradient {
          background: linear-gradient(135deg, #34d399 0%, #10b981 100%);
        }
        
        .hover-lift:hover {
          transform: translateY(-2px);
          transition: all 0.3s ease;
        }
        
        .hover-glow:hover {
          box-shadow: 0 0 20px rgba(52, 211, 153, 0.4);
          transition: all 0.3s ease;
        }
      `}</style>

      {/* Header */}
      <header className="border-b border-gray-800 lime-gradient sticky top-0 z-50 animate-slideDown">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => window.location.href = '/'}
                className="flex items-center space-x-2 px-3 py-1.5 bg-black/20 hover:bg-black/30 rounded-lg transition-all hover-lift"
              >
                <ArrowLeft size={16} className="text-black" />
                <span className="text-sm text-black font-medium">Back to Dashboard</span>
              </button>
              
              <div className="flex items-center space-x-3">
                <Users size={24} className="text-black" />
                <div>
                  <h1 className="text-xl font-bold text-black">User Management</h1>
                  <p className="text-xs text-black/70">Manage user accounts and permissions</p>
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

      {/* Message Alert */}
      {message && (
        <div className={`mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-4 animate-fadeIn`}>
          <div className={`p-4 rounded-lg border flex items-center space-x-2 ${
            message.type === 'success' 
              ? 'bg-green-500/10 border-green-500/20 text-green-400'
              : 'bg-red-500/10 border-red-500/20 text-red-400'
          }`}>
            {message.type === 'success' ? <CheckCircle size={16} /> : <XCircle size={16} />}
            <span>{message.text}</span>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 animate-fadeIn">
          <div className="bg-gray-900/90 backdrop-blur-sm rounded-xl border border-gray-800 p-6 hover-glow">
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
          
          <div className="bg-gray-900/90 backdrop-blur-sm rounded-xl border border-gray-800 p-6 hover-glow">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-green-500/20 rounded-lg flex items-center justify-center">
                <CheckCircle size={24} className="text-green-400" />
              </div>
              <div>
                <p className="text-gray-400 text-sm">Active Users</p>
                <p className="text-2xl font-bold text-white">{users.filter(u => u.is_active).length}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-gray-900/90 backdrop-blur-sm rounded-xl border border-gray-800 p-6 hover-glow">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-red-500/20 rounded-lg flex items-center justify-center">
                <XCircle size={24} className="text-red-400" />
              </div>
              <div>
                <p className="text-gray-400 text-sm">Restricted Users</p>
                <p className="text-2xl font-bold text-white">{users.filter(u => !u.is_active).length}</p>
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
                  <th className="px-6 py-4 text-left text-xs font-bold text-black uppercase tracking-wider">Role</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-black uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-black uppercase tracking-wider">Created</th>
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
                          <Mail size={16} className="text-[#34d399]" />
                        </div>
                        <div>
                          <div className="text-sm font-medium text-white">
                            {user.first_name && user.last_name 
                              ? `${user.first_name} ${user.last_name}`
                              : user.email
                            }
                          </div>
                          <div className="text-sm text-gray-400">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        user.role === 'admin' 
                          ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                          : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                      }`}>
                        {user.role === 'admin' ? <Shield size={12} className="mr-1" /> : null}
                        {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                      </span>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        user.is_active
                          ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                          : 'bg-red-500/20 text-red-400 border border-red-500/30'
                      }`}>
                        {user.is_active ? <CheckCircle size={12} className="mr-1" /> : <XCircle size={12} className="mr-1" />}
                        {user.is_active ? 'Active' : 'Restricted'}
                      </span>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                      <div className="flex items-center space-x-2">
                        <Calendar size={14} className="text-gray-400" />
                        <span>{formatDate(user.created_at)}</span>
                      </div>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap">
                      {user.role !== 'admin' ? (
                        <button
                          onClick={() => toggleUserStatus(user.id, user.is_active)}
                          disabled={actionLoading === user.id}
                          className={`inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-lg transition-all hover-lift ${
                            user.is_active
                              ? 'text-red-400 bg-red-500/10 hover:bg-red-500/20 border-red-500/30'
                              : 'text-green-400 bg-green-500/10 hover:bg-green-500/20 border-green-500/30'
                          } ${actionLoading === user.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          {actionLoading === user.id ? (
                            <div className="animate-spin rounded-full h-3 w-3 border border-current border-t-transparent mr-2"></div>
                          ) : user.is_active ? (
                            <ShieldOff size={14} className="mr-1" />
                          ) : (
                            <CheckCircle size={14} className="mr-1" />
                          )}
                          {user.is_active ? 'Restrict' : 'Activate'}
                        </button>
                      ) : (
                        <span className="text-gray-500 text-xs">Admin Account</span>
                      )}
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
            <p className="text-gray-500">Start by inviting users to your platform.</p>
          </div>
        )}
      </div>
    </div>
  );
}