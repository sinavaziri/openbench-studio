import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useKeyboardShortcuts } from '../context/KeyboardShortcutsContext';
import ThemeToggle from './ThemeToggle';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const { user, isAuthenticated, loading } = useAuth();
  const { openHelp } = useKeyboardShortcuts();

  const navItems = [
    { path: '/', label: 'New Run' },
    { path: '/history', label: 'History' },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="border-b border-border">
        <div className="max-w-6xl mx-auto px-8 py-6">
          <div className="flex items-center justify-between">
            <Link to="/" className="text-foreground text-lg tracking-tight">
              OpenBench Studio
            </Link>

            <div className="flex items-center gap-8">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`text-sm tracking-wide transition-opacity ${
                    location.pathname === item.path
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
              
              {/* Keyboard Shortcuts Button */}
              <button
                onClick={openHelp}
                className="text-muted-foreground hover:text-foreground transition-colors"
                title="Keyboard shortcuts (?)"
                aria-label="Show keyboard shortcuts"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
                </svg>
              </button>
              
              {/* Theme Toggle */}
              <ThemeToggle />
              
              {/* Auth section */}
              {!loading && (
                isAuthenticated ? (
                  <div className="flex items-center gap-4 border-l border-border-secondary pl-8 ml-2">
                    <Link
                      to="/settings"
                      className={`text-sm tracking-wide transition-opacity ${
                        location.pathname === '/settings'
                          ? 'text-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Settings
                    </Link>
                    <span className="text-[12px] text-muted-foreground truncate max-w-32">
                      {user?.email}
                    </span>
                  </div>
                ) : (
                  <Link
                    to="/login"
                    className="text-sm text-muted-foreground hover:text-foreground transition-opacity border-l border-border-secondary pl-8 ml-2"
                  >
                    Sign In
                  </Link>
                )
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-8 py-12">
        {children}
      </main>
    </div>
  );
}
