'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Eye, EyeOff, User, Lock, AlertCircle, ArrowRight, CheckCircle } from 'lucide-react';

export default function SignupPage() {
  const params = useParams();
  const token = useParams()?.token as string;
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    verifyInvitation();
  }, [token]);

  const verifyInvitation = async () => {
    if (!token) {
      setError('Invalid invitation link');
      setVerifying(false);
      return;
    }

    try {
      const response = await fetch('/api/auth/verify-invitation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token }),
      });

      const data = await response.json();

      if (response.ok) {
        setEmail(data.email);
      } else {
        setError(data.message || 'Invalid or expired invitation');
      }
    } catch (error) {
      setError('Something went wrong. Please try again.');
    } finally {
      setVerifying(false);
    }
  };

  const handleSignup = async () => {
    if (!firstName || !lastName || !password || !confirmPassword) {
      setError('Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token,
          password,
          firstName,
          lastName,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(true);
        setTimeout(() => {
          window.location.href = '/';
        }, 2000);
      } else {
        setError(data.message || 'Account creation failed');
      }
    } catch (error) {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSignup();
    }
  };

  return (
    <div className="min-h-screen bg-black text-white font-sans flex items-center justify-center p-4">
      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(40px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        @keyframes bounce {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        
        @keyframes glow {
          0%, 100% { box-shadow: 0 0 20px rgba(52, 211, 153, 0.3); }
          50% { box-shadow: 0 0 30px rgba(52, 211, 153, 0.5); }
        }
        
        .animate-fadeIn {
          animation: fadeIn 0.6s ease-out;
        }
        
        .animate-slideUp {
          animation: slideUp 0.8s ease-out;
        }
        
        .animate-bounce {
          animation: bounce 0.6s ease-out;
        }
        
        .animate-glow {
          animation: glow 2s infinite;
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
        
        .glass-effect {
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .shimmer-effect {
          position: relative;
          overflow: hidden;
        }
        
        .shimmer-effect::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(52, 211, 153, 0.2), transparent);
          animation: shimmer 2s infinite;
        }
      `}</style>

      {/* Background Pattern */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-br from-[#34d399]/5 to-transparent rotate-12 transform"></div>
        <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-to-tl from-[#34d399]/5 to-transparent -rotate-12 transform"></div>
      </div>

      <div className="relative z-10 w-full max-w-md">
        {/* Logo Section */}
        <div className="text-center mb-8 animate-fadeIn">
          <div className="w-36 flex items-center justify-center mx-auto mb-5">
            <img 
              src="/logo-money.png" 
              alt="Digital Marketing Agency Logo"
              className="w-full h-full object-contain"
            />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Digital Marketing Agency</h1>
          <p className="text-gray-400">Create your account to access the dashboard</p>
        </div>

        {/* Signup Form */}
        <div className="glass-effect rounded-2xl p-8 shadow-2xl animate-slideUp hover-glow">
          {verifying ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#34d399] mx-auto mb-4"></div>
              <p className="text-gray-400">Verifying invitation...</p>
            </div>
          ) : success ? (
            <div className="text-center py-8 animate-bounce">
              <div className="w-16 h-16 lime-gradient rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle size={24} className="text-black" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Account Created!</h3>
              <p className="text-gray-400">Redirecting to dashboard...</p>
            </div>
          ) : error && !email ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle size={24} className="text-red-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Invalid Invitation</h3>
              <p className="text-gray-400 mb-4">{error}</p>
              <a href="/login" className="text-[#34d399] hover:text-[#10b981] transition-colors">
                Go to Login
              </a>
            </div>
          ) : (
            <>
              <div className="text-center mb-6">
                <h2 className="text-xl font-semibold text-white mb-2">Complete Your Account</h2>
                <p className="text-gray-400 text-sm">
                  Creating account for: <span className="text-[#34d399] font-medium">{email}</span>
                </p>
              </div>

              {error && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center space-x-2 text-red-400 animate-fadeIn">
                  <AlertCircle size={16} />
                  <span className="text-sm">{error}</span>
                </div>
              )}

              <div className="space-y-4">
                {/* Name Fields */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">First Name</label>
                    <div className="relative">
                      <User size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        required
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        onKeyPress={handleKeyPress}
                        className="w-full pl-11 pr-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:ring-2 focus:ring-[#34d399] focus:border-[#34d399] text-white placeholder-gray-400 transition-all hover-lift"
                        placeholder="First name"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Last Name</label>
                    <div className="relative">
                      <User size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        required
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        onKeyPress={handleKeyPress}
                        className="w-full pl-11 pr-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:ring-2 focus:ring-[#34d399] focus:border-[#34d399] text-white placeholder-gray-400 transition-all hover-lift"
                        placeholder="Last name"
                      />
                    </div>
                  </div>
                </div>

                {/* Password Field */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Password</label>
                  <div className="relative">
                    <Lock size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyPress={handleKeyPress}
                      className="w-full pl-11 pr-12 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:ring-2 focus:ring-[#34d399] focus:border-[#34d399] text-white placeholder-gray-400 transition-all hover-lift"
                      placeholder="Create a password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                {/* Confirm Password Field */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Confirm Password</label>
                  <div className="relative">
                    <Lock size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      onKeyPress={handleKeyPress}
                      className="w-full pl-11 pr-12 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:ring-2 focus:ring-[#34d399] focus:border-[#34d399] text-white placeholder-gray-400 transition-all hover-lift"
                      placeholder="Confirm your password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                    >
                      {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                {/* Password Requirements */}
                <div className="p-3 bg-[#34d399]/10 border border-[#34d399]/20 rounded-lg">
                  <p className="text-xs text-[#34d399] font-medium mb-1">Password Requirements:</p>
                  <ul className="text-xs text-gray-300 space-y-0.5">
                    <li>• At least 6 characters long</li>
                    <li>• Passwords must match</li>
                  </ul>
                </div>

                {/* Create Account Button */}
                <button
                  onClick={handleSignup}
                  disabled={loading}
                  className={`w-full py-3 px-4 rounded-lg font-medium text-black transition-all duration-300 flex items-center justify-center space-x-2 hover-lift ${
                    loading 
                      ? 'bg-gray-600 cursor-not-allowed' 
                      : 'lime-gradient hover-glow shimmer-effect'
                  }`}
                >
                  {loading ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-black"></div>
                  ) : (
                    <>
                      <span>Create Account</span>
                      <ArrowRight size={18} />
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-gray-500 text-xs animate-fadeIn">
          <p>© 2025 Digital Marketing Agency. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}