import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const navigate = useNavigate();
  const { login, register } = useAuth();
  
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    if (!email || !password) {
      const errorMsg = 'Email and password are required';
      setError(errorMsg);
      toast.error(errorMsg);
      return;
    }
    
    if (isRegister && password !== confirmPassword) {
      const errorMsg = 'Passwords do not match';
      setError(errorMsg);
      toast.error(errorMsg);
      return;
    }
    
    if (isRegister && password.length < 8) {
      const errorMsg = 'Password must be at least 8 characters';
      setError(errorMsg);
      toast.error(errorMsg);
      return;
    }
    
    setLoading(true);
    
    try {
      if (isRegister) {
        await register({ email, password });
        toast.success('Account created successfully!', { icon: '🎉' });
      } else {
        await login({ email, password });
        toast.success('Welcome back!');
      }
      navigate('/');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Authentication failed';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0c0c0c] flex items-center justify-center px-4">
      {/* Decorative grid background */}
      <div 
        className="fixed inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `
            linear-gradient(to right, #fff 1px, transparent 1px),
            linear-gradient(to bottom, #fff 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
        }}
      />
      
      <div className="relative w-full max-w-md">
        {/* Logo */}
        <Link to="/" className="block text-center mb-12">
          <h1 className="text-2xl text-white tracking-tight">OpenBench</h1>
        </Link>
        
        {/* Card */}
        <div className="bg-[#0a0a0a] border border-[#1a1a1a] p-8">
          <h2 className="text-xl text-white mb-8 text-center">
            {isRegister ? 'Create Account' : 'Sign In'}
          </h2>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email */}
            <div>
              <label className="block text-[12px] text-[#666] uppercase tracking-[0.1em] mb-2">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-[#111] border border-[#222] text-white text-[15px] focus:border-[#444] focus:outline-none transition-colors"
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>
            
            {/* Password */}
            <div>
              <label className="block text-[12px] text-[#666] uppercase tracking-[0.1em] mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-[#111] border border-[#222] text-white text-[15px] focus:border-[#444] focus:outline-none transition-colors"
                placeholder="••••••••"
                autoComplete={isRegister ? 'new-password' : 'current-password'}
              />
            </div>
            
            {/* Confirm Password (register only) */}
            {isRegister && (
              <div>
                <label className="block text-[12px] text-[#666] uppercase tracking-[0.1em] mb-2">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-[#111] border border-[#222] text-white text-[15px] focus:border-[#444] focus:outline-none transition-colors"
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
              </div>
            )}
            
            {/* Error message */}
            {error && (
              <div className="py-3 px-4 bg-[#1a0a0a] border border-[#3a1a1a] text-[14px] text-[#c44]">
                {error}
              </div>
            )}
            
            {/* Submit button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-white text-black text-[14px] font-medium hover:bg-[#e0e0e0] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                  {isRegister ? 'Creating Account...' : 'Signing In...'}
                </span>
              ) : (
                isRegister ? 'Create Account' : 'Sign In'
              )}
            </button>
          </form>
          
          {/* Toggle */}
          <div className="mt-8 text-center">
            <button
              onClick={() => {
                setIsRegister(!isRegister);
                setError(null);
                setConfirmPassword('');
              }}
              className="text-[14px] text-[#666] hover:text-white transition-colors"
            >
              {isRegister ? (
                <>Already have an account? <span className="text-white">Sign in</span></>
              ) : (
                <>Don&apos;t have an account? <span className="text-white">Create one</span></>
              )}
            </button>
          </div>
        </div>
        
        {/* Back to home */}
        <div className="mt-8 text-center">
          <Link
            to="/"
            className="text-[13px] text-[#555] hover:text-white transition-colors"
          >
            ← Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}



