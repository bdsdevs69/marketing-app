'use client';

import { useState } from 'react';
import { X, Mail, Send, UserPlus, Check, AlertCircle } from 'lucide-react';

interface InvitationModalProps {
  isOpen: boolean;
  onClose: () => void;
  userRole: string;
}

export default function InvitationModal({ isOpen, onClose, userRole }: InvitationModalProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  // Only show modal if user is admin
  if (userRole !== 'admin' || !isOpen) return null;

  const handleSendInvitation = async () => {
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/admin/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(true);
        setEmail('');
        setTimeout(() => {
          setSuccess(false);
          onClose();
        }, 2000);
      } else {
        setError(data.message || 'Failed to send invitation');
      }
    } catch (error) {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSendInvitation();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        @keyframes bounce {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
        
        .animate-slideUp {
          animation: slideUp 0.4s ease-out;
        }
        
        .animate-bounce {
          animation: bounce 0.6s ease-out;
        }
        
        .lime-gradient {
          background: linear-gradient(135deg, #34d399 0%, #10b981 100%);
        }
        
        .hover-lift:hover {
          transform: translateY(-2px);
          transition: all 0.3s ease;
        }
      `}</style>

      <div className="bg-gray-900 rounded-2xl border border-gray-800 w-full max-w-md shadow-2xl animate-slideUp">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 lime-gradient rounded-lg flex items-center justify-center">
              <UserPlus size={20} className="text-black" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Send Invitation</h2>
              <p className="text-sm text-gray-400">Invite a new user to the dashboard</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-1 hover:bg-gray-800 rounded-lg"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {success ? (
            <div className="text-center py-8 animate-bounce">
              <div className="w-16 h-16 lime-gradient rounded-full flex items-center justify-center mx-auto mb-4">
                <Check size={24} className="text-black" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Invitation Sent!</h3>
              <p className="text-gray-400 text-sm">
                The user will receive an email with instructions to create their account.
              </p>
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center space-x-2 text-red-400 animate-fadeIn">
                  <AlertCircle size={16} />
                  <span className="text-sm">{error}</span>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onKeyPress={handleKeyPress}
                      className="w-full pl-11 pr-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:ring-2 focus:ring-[#34d399] focus:border-[#34d399] text-white placeholder-gray-400 transition-all"
                      placeholder="user@example.com"
                    />
                  </div>
                </div>

                <div className="bg-[#34d399]/10 border border-[#34d399]/20 rounded-lg p-4">
                  <div className="flex items-start space-x-3">
                    <Mail size={16} className="text-[#34d399] mt-0.5" />
                    <div>
                      <p className="text-xs font-medium text-[#34d399] mb-1">What happens next:</p>
                      <ul className="text-xs text-gray-300 space-y-1">
                        <li>• User receives an invitation email</li>
                        <li>• They click the link to create their account</li>
                        <li>• Account is activated and they can login</li>
                        <li>• Invitation expires in 24 hours</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {!success && (
          <div className="flex items-center justify-end space-x-3 p-6 border-t border-gray-800">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSendInvitation}
              disabled={loading || !email}
              className={`flex items-center space-x-2 px-6 py-3 rounded-lg font-medium transition-all hover-lift ${
                loading || !email
                  ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                  : 'lime-gradient text-black hover:shadow-lg'
              }`}
            >
              {loading ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-black"></div>
              ) : (
                <Send size={16} />
              )}
              <span>{loading ? 'Sending...' : 'Send Invitation'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}