import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider, Outlet } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { KeyboardShortcutsProvider } from './context/KeyboardShortcutsContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import KeyboardShortcutsModal from './components/KeyboardShortcutsModal'
import Dashboard from './pages/Dashboard'
import NewRun from './pages/NewRun'
import RunDetail from './pages/RunDetail'
import EvalViewer from './pages/EvalViewer'
import Compare from './pages/Compare'
import Login from './pages/Login'
import Settings from './pages/Settings'
import './index.css'

// Root layout component that wraps all routes with providers
function RootLayout() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <KeyboardShortcutsProvider>
            <KeyboardShortcutsModal />
            <Toaster
              position="bottom-right"
              toastOptions={{
                duration: 4000,
                style: {
                  background: 'var(--toast-bg)',
                  color: 'var(--color-foreground)',
                  border: '1px solid var(--toast-border)',
                  borderRadius: '0',
                  padding: '12px 16px',
                  fontSize: '14px',
                  fontFamily: 'Inter, system-ui, sans-serif',
                },
                success: {
                  iconTheme: {
                    primary: 'var(--color-success)',
                    secondary: 'var(--toast-bg)',
                  },
                  style: {
                    borderColor: 'var(--toast-success-border)',
                  },
                },
                error: {
                  iconTheme: {
                    primary: 'var(--color-error)',
                    secondary: 'var(--toast-bg)',
                  },
                  style: {
                    borderColor: 'var(--toast-error-border)',
                  },
                },
              }}
            />
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          </KeyboardShortcutsProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  )
}

// Create router with RootLayout wrapper
const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: '/', element: <NewRun /> },
      { path: '/history', element: <Dashboard /> },
      { path: '/runs/:id', element: <RunDetail /> },
      { path: '/runs/:id/eval/*', element: <EvalViewer /> },
      { path: '/compare', element: <Compare /> },
      { path: '/login', element: <Login /> },
      { path: '/settings', element: <Settings /> },
    ],
  },
])

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
)
