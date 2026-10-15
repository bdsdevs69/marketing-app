'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  X, Mail, Lock, UserPlus, Check, AlertCircle, Eye, EyeOff,
  RefreshCw, Copy, DollarSign, User as UserIcon
} from 'lucide-react';

interface PricingFactor {
  id: number;
  name: string;
  description?: string;
}

interface CreatedUser {
  email: string;
  password: string;
  factorName: string;
}

interface CreateUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  userRole: string;
}

const MIN_PASSWORD_LENGTH = 8;

// Ambiguous characters (0/O, 1/l/I) are left out so a password read off the screen
// and typed by hand can't be mistyped.
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

function generatePassword(length = 14): string {
  const bytes = new Uint32Array(length);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => PASSWORD_ALPHABET[b % PASSWORD_ALPHABET.length]).join('');
}

export default function CreateUserModal({ isOpen, onClose, userRole }: CreateUserModalProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  // '' = nothing picked yet, 'none' = deliberately no factor, otherwise the factor id.
  const [factorId, setFactorId] = useState<string>('');

  const [factors, setFactors] = useState<PricingFactor[]>([]);
  const [factorsLoading, setFactorsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<CreatedUser | null>(null);
  const [copied, setCopied] = useState(false);

  const resetForm = useCallback(() => {
    setEmail('');
    setPassword('');
    setFirstName('');
    setLastName('');
    setFactorId('');
    setShowPassword(false);
    setError('');
    setCreated(null);
    setCopied(false);
  }, []);

  // Load the pricing factors each time the modal opens, so a factor added in
  // another tab shows up without a page refresh.
  useEffect(() => {
    if (!isOpen || userRole !== 'admin') return;

    let cancelled = false;
    setFactorsLoading(true);

    fetch('/api/admin/pricing-factors')
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('fetch failed'))))
      .then((data: PricingFactor[]) => {
        if (!cancelled) setFactors(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load pricing factors. Close and reopen to retry.');
      })
      .finally(() => {
        if (!cancelled) setFactorsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, userRole]);

  if (userRole !== 'admin' || !isOpen) return null;

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const selectedFactorName =
    factorId === '' || factorId === 'none'
      ? 'No factor — default pricing'
      : factors.find((f) => String(f.id) === factorId)?.name ?? 'Unknown factor';

  const canSubmit =
    email.includes('@') && password.length >= MIN_PASSWORD_LENGTH && factorId !== '' && !loading;

  const handleCreate = async () => {
    if (!email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }
    if (factorId === '') {
      setError('Please choose which pricing factor this user should see');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/admin/users/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          firstName,
          lastName,
          factorId: factorId === '' || factorId === 'none' ? null : Number(factorId)
        })
      });

      const data = await response.json();

      if (response.ok) {
        setCreated({
          email: data.user?.email ?? email.trim().toLowerCase(),
          password,
          factorName: selectedFactorName
        });
      } else {
        setError(data.message || 'Failed to create user');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const copyCredentials = async () => {
    if (!created) return;
    const text = `Dashboard: ${window.location.origin}/login\nEmail: ${created.email}\nPassword: ${created.password}`;
    try {
      await window.navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError('Could not copy automatically — select the text above and copy it.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn overflow-y-auto">
      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }

        .animate-slideUp {
          animation: slideUp 0.4s ease-out;
        }

        .lime-gradient {
          background: linear-gradient(135deg, #34d399 0%, #10b981 100%);
        }

        .hover-lift:hover {
          transform: translateY(-2px);
          transition: all 0.3s ease;
        }
      `}</style>

      <div className="bg-gray-900 rounded-2xl border border-gray-800 w-full max-w-lg shadow-2xl animate-slideUp my-8">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 lime-gradient rounded-lg flex items-center justify-center">
              <UserPlus size={20} className="text-black" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Create User</h2>
              <p className="text-sm text-gray-400">
                Set their password and pricing factor yourself
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-white transition-colors p-1 hover:bg-gray-800 rounded-lg"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {created ? (
            <div className="space-y-4">
              <div className="text-center">
                <div className="w-16 h-16 lime-gradient rounded-full flex items-center justify-center mx-auto mb-4">
                  <Check size={28} className="text-black" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-1">Account created</h3>
                <p className="text-gray-400 text-sm">
                  Send these credentials to the user — the password is not shown again.
                </p>
              </div>

              <div className="bg-gray-800/60 border border-gray-700 rounded-lg divide-y divide-gray-700">
                <div className="px-4 py-3">
                  <p className="text-xs text-gray-400 mb-1">Email</p>
                  <p className="text-sm text-white font-mono break-all">{created.email}</p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-xs text-gray-400 mb-1">Password</p>
                  <p className="text-sm text-white font-mono break-all">{created.password}</p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-xs text-gray-400 mb-1">Sees pricing</p>
                  <p className="text-sm text-[#34d399] font-medium">{created.factorName}</p>
                </div>
              </div>

              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center space-x-2 text-red-400">
                  <AlertCircle size={16} />
                  <span className="text-sm">{error}</span>
                </div>
              )}

              <button
                onClick={copyCredentials}
                className="w-full flex items-center justify-center space-x-2 px-4 py-3 rounded-lg font-medium lime-gradient text-black transition-all hover-lift"
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                <span>{copied ? 'Copied to clipboard' : 'Copy credentials'}</span>
              </button>

              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={resetForm}
                  className="text-sm text-[#34d399] hover:underline"
                >
                  Create another user
                </button>
                <button
                  onClick={handleClose}
                  className="px-4 py-2 text-gray-400 hover:text-white transition-colors text-sm"
                >
                  Done
                </button>
              </div>
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
                {/* Email */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail
                      size={18}
                      className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                    />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-11 pr-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:ring-2 focus:ring-[#34d399] focus:border-[#34d399] text-white placeholder-gray-400 transition-all"
                      placeholder="client@example.com"
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Password
                  </label>
                  <div className="relative">
                    <Lock
                      size={18}
                      className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                    />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-11 pr-24 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:ring-2 focus:ring-[#34d399] focus:border-[#34d399] text-white placeholder-gray-400 transition-all font-mono"
                      placeholder="At least 8 characters"
                    />
                    <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center space-x-1">
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPassword(generatePassword());
                          setShowPassword(true);
                        }}
                        className="p-1.5 text-gray-400 hover:text-[#34d399] hover:bg-gray-700 rounded transition-colors"
                        aria-label="Generate a password"
                        title="Generate a password"
                      >
                        <RefreshCw size={16} />
                      </button>
                    </div>
                  </div>
                  <p className="mt-1.5 text-xs text-gray-500">
                    Type your own, or hit the refresh icon to generate a strong one.
                  </p>
                </div>

                {/* Pricing factor */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Pricing factor this user sees
                  </label>
                  <div className="relative">
                    <DollarSign
                      size={18}
                      className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none"
                    />
                    <select
                      value={factorId}
                      disabled={factorsLoading}
                      onChange={(e) => setFactorId(e.target.value)}
                      className="w-full pl-11 pr-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:ring-2 focus:ring-[#34d399] focus:border-[#34d399] text-white transition-all appearance-none disabled:opacity-50"
                    >
                      <option value="" disabled>
                        {factorsLoading ? 'Loading factors…' : 'Select a pricing factor…'}
                      </option>
                      {factors.map((factor) => (
                        <option key={factor.id} value={String(factor.id)}>
                          {factor.name}
                        </option>
                      ))}
                      <option value="none">No factor — default pricing</option>
                    </select>
                  </div>
                  {factorId !== '' && (
                    <p className="mt-1.5 text-xs text-gray-500">
                      Prices will be shown using{' '}
                      <span className="text-[#34d399]">{selectedFactorName}</span>. You can change
                      this later under Settings.
                    </p>
                  )}
                </div>

                {/* Optional name */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      First name <span className="text-gray-500 font-normal">(optional)</span>
                    </label>
                    <div className="relative">
                      <UserIcon
                        size={18}
                        className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                      />
                      <input
                        type="text"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="w-full pl-11 pr-3 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:ring-2 focus:ring-[#34d399] focus:border-[#34d399] text-white placeholder-gray-400 transition-all"
                        placeholder="Jane"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Last name <span className="text-gray-500 font-normal">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="w-full px-3 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:ring-2 focus:ring-[#34d399] focus:border-[#34d399] text-white placeholder-gray-400 transition-all"
                      placeholder="Doe"
                    />
                  </div>
                </div>

                <div className="bg-[#34d399]/10 border border-[#34d399]/20 rounded-lg p-4">
                  <div className="flex items-start space-x-3">
                    <Lock size={16} className="text-[#34d399] mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-[#34d399] mb-1">What happens next:</p>
                      <ul className="text-xs text-gray-300 space-y-1">
                        <li>• The account is created and active straight away</li>
                        <li>• No email is sent — you pass on the credentials yourself</li>
                        <li>• Their prices use the factor you picked above</li>
                        <li>• The password is shown once, so copy it before closing</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {!created && (
          <div className="flex items-center justify-end space-x-3 p-6 border-t border-gray-800">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!canSubmit}
              className={`flex items-center space-x-2 px-6 py-3 rounded-lg font-medium transition-all hover-lift ${
                !canSubmit
                  ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                  : 'lime-gradient text-black hover:shadow-lg'
              }`}
            >
              {loading ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-black"></div>
              ) : (
                <UserPlus size={16} />
              )}
              <span>{loading ? 'Creating…' : 'Create User'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
