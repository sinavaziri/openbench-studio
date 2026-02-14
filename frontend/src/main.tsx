import React, { Suspense, lazy } from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider, Outlet } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { KeyboardShortcutsProvider } from './context/KeyboardShortcutsContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import KeyboardShortcutsModal from './components/KeyboardShortcutsModal'
import './index.css'

// Lazy load route components for code splitting
const Dashboard = lazy(() => import('./pages/Dashboard'))
const NewRun = lazy(() => import('./pages/NewRun'))
const RunDetail = lazy(() => import('./pages/RunDetail'))
const EvalViewer = lazy(() => import('./pages/EvalViewer'))
const Compare = lazy(() => import('./pages/Compare'))
const Login = lazy(() => import('./pages/Login'))
const Settings = lazy(() => import('./pages/Settings'))
const Analytics = lazy(() => import('./pages/Analytics'))

// Loading fallback component
function PageLoader() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
        <p className="text-[13px] text-muted-foreground">Loading...</p>
      </div>
    </div>
  )
}

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

// Create router with RootLayout wrapper and lazy loading
const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: '/', element: <Suspense fallback={<PageLoader />}><NewRun /></Suspense> },
      { path: '/history', element: <Suspense fallback={<PageLoader />}><Dashboard /></Suspense> },
      { path: '/analytics', element: <Suspense fallback={<PageLoader />}><Analytics /></Suspense> },
      { path: '/runs/:id', element: <Suspense fallback={<PageLoader />}><RunDetail /></Suspense> },
      { path: '/runs/:id/eval/*', element: <Suspense fallback={<PageLoader />}><EvalViewer /></Suspense> },
      { path: '/compare', element: <Suspense fallback={<PageLoader />}><Compare /></Suspense> },
      { path: '/login', element: <Suspense fallback={<PageLoader />}><Login /></Suspense> },
      { path: '/settings', element: <Suspense fallback={<PageLoader />}><Settings /></Suspense> },
    ],
  },
])

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
)
