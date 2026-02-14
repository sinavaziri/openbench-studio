import { useState } from 'react';
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { path: '/', label: 'New Run' },
    { path: '/history', label: 'History' },
  ];

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="border-b border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <div className="flex items-center justify-between">
            <Link to="/" className="text-foreground text-lg tracking-tight">
              OpenBench Studio
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-6 lg:gap-8">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`text-sm tracking-wide transition-opacity min-h-[44px] flex items-center ${
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
                className="text-muted-foreground hover:text-foreground transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
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
                  <div className="flex items-center gap-4 border-l border-border-secondary pl-6 lg:pl-8 ml-2">
                    <Link
                      to="/settings"
                      className={`text-sm tracking-wide transition-opacity min-h-[44px] flex items-center ${
                        location.pathname === '/settings'
                          ? 'text-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Settings
                    </Link>
                    <span className="text-[12px] text-muted-foreground truncate max-w-32 hidden lg:block">
                      {user?.email}
                    </span>
                  </div>
                ) : (
                  <Link
                    to="/login"
                    className="text-sm text-muted-foreground hover:text-foreground transition-opacity border-l border-border-secondary pl-6 lg:pl-8 ml-2 min-h-[44px] flex items-center"
                  >
                    Sign In
                  </Link>
                )
              )}
            </div>

            {/* Mobile Menu Button */}
            <div className="flex items-center gap-3 md:hidden">
              <ThemeToggle />
              <button
                onClick={toggleMobileMenu}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center text-foreground"
                aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
                aria-expanded={mobileMenuOpen}
              >
                {mobileMenuOpen ? (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Mobile Menu Dropdown */}
          {mobileMenuOpen && (
            <div className="md:hidden mt-4 pt-4 border-t border-border">
              <div className="flex flex-col gap-1">
                {navItems.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={closeMobileMenu}
                    className={`text-base tracking-wide transition-colors px-2 py-3 min-h-[44px] rounded ${
                      location.pathname === item.path
                        ? 'text-foreground bg-background-secondary'
                        : 'text-muted-foreground hover:text-foreground hover:bg-background-tertiary'
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
                
                {!loading && (
                  isAuthenticated ? (
                    <>
                      <Link
                        to="/settings"
                        onClick={closeMobileMenu}
                        className={`text-base tracking-wide transition-colors px-2 py-3 min-h-[44px] rounded ${
                          location.pathname === '/settings'
                            ? 'text-foreground bg-background-secondary'
                            : 'text-muted-foreground hover:text-foreground hover:bg-background-tertiary'
                        }`}
                      >
                        Settings
                      </Link>
                      <div className="px-2 py-3 text-[12px] text-muted-foreground">
                        Signed in as {user?.email}
                      </div>
                    </>
                  ) : (
                    <Link
                      to="/login"
                      onClick={closeMobileMenu}
                      className="text-base text-muted-foreground hover:text-foreground transition-colors px-2 py-3 min-h-[44px] rounded hover:bg-background-tertiary"
                    >
                      Sign In
                    </Link>
                  )
                )}
                
                <button
                  onClick={() => {
                    openHelp();
                    closeMobileMenu();
                  }}
                  className="text-base text-muted-foreground hover:text-foreground transition-colors px-2 py-3 min-h-[44px] rounded hover:bg-background-tertiary text-left flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
                  </svg>
                  Keyboard Shortcuts
                </button>
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-12">
        {children}
      </main>
    </div>
  );
}
