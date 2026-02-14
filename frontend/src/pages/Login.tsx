import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import ThemeToggle from '../components/ThemeToggle';

export default function Login() {
  const navigate = useNavigate();
  const { login, register } = useAuth();
  const { resolvedTheme } = useTheme();
  
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<{ title: string; message: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    // Validate required fields
    if (!email || !password) {
      setError({
        title: 'Missing Information',
        message: 'Both email and password are required to continue.',
      });
      return;
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError({
        title: 'Invalid Email',
        message: 'Please enter a valid email address.',
      });
      return;
    }
    
    // Registration-specific validations
    if (isRegister) {
      if (password !== confirmPassword) {
        setError({
          title: 'Passwords Don\'t Match',
          message: 'The password and confirmation password are different. Please re-enter them.',
        });
        return;
      }
      
      if (password.length < 8) {
        setError({
          title: 'Password Too Short',
          message: 'Password must be at least 8 characters for security.',
        });
        return;
      }
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
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError({
        title: isRegister ? 'Registration Failed' : 'Login Failed',
        message: errorMessage,
      });
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const gridColor = resolvedTheme === 'dark' ? '#fff' : '#000';

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      {/* Decorative grid background */}
      <div 
        className="fixed inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `
            linear-gradient(to right, ${gridColor} 1px, transparent 1px),
            linear-gradient(to bottom, ${gridColor} 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
        }}
      />
      
      {/* Theme toggle in corner */}
      <div className="fixed top-6 right-6">
        <ThemeToggle />
      </div>
      
      <div className="relative w-full max-w-md">
        {/* Logo */}
        <Link to="/" className="block text-center mb-12">
          <h1 className="text-2xl text-foreground tracking-tight">OpenBench</h1>
        </Link>
        
        {/* Card */}
        <div className="bg-background-secondary border border-border p-8">
          <h2 className="text-xl text-foreground mb-8 text-center">
            {isRegister ? 'Create Account' : 'Sign In'}
          </h2>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email */}
            <div>
              <label className="block text-[12px] text-muted-foreground uppercase tracking-[0.1em] mb-2">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-background-tertiary border border-border-secondary text-foreground text-[15px] focus:border-muted-foreground focus:outline-none transition-colors"
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>
            
            {/* Password */}
            <div>
              <label className="block text-[12px] text-muted-foreground uppercase tracking-[0.1em] mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-background-tertiary border border-border-secondary text-foreground text-[15px] focus:border-muted-foreground focus:outline-none transition-colors"
                placeholder="••••••••"
                autoComplete={isRegister ? 'new-password' : 'current-password'}
              />
            </div>
            
            {/* Confirm Password (register only) */}
            {isRegister && (
              <div>
                <label className="block text-[12px] text-muted-foreground uppercase tracking-[0.1em] mb-2">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-background-tertiary border border-border-secondary text-foreground text-[15px] focus:border-muted-foreground focus:outline-none transition-colors"
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
              </div>
            )}
            
            {/* Error message */}
            {error && (
              <div className="py-3 px-4 bg-error-bg border border-error-border">
                <p className="text-[14px] text-error font-medium mb-1">{error.title}</p>
                <p className="text-[13px] text-muted-foreground">{error.message}</p>
              </div>
            )}
            
            {/* Submit button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-accent text-accent-foreground text-[14px] font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-accent-foreground/20 border-t-accent-foreground rounded-full animate-spin" />
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
              className="text-[14px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {isRegister ? (
                <>Already have an account? <span className="text-foreground">Sign in</span></>
              ) : (
                <>Don&apos;t have an account? <span className="text-foreground">Create one</span></>
              )}
            </button>
          </div>
        </div>
        
        {/* Back to home */}
        <div className="mt-8 text-center">
          <Link
            to="/"
            className="text-[13px] text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
