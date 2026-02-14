import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider, Outlet } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './context/AuthContext'
import Dashboard from './pages/Dashboard'
import NewRun from './pages/NewRun'
import RunDetail from './pages/RunDetail'
import EvalViewer from './pages/EvalViewer'
import Compare from './pages/Compare'
import Login from './pages/Login'
import Settings from './pages/Settings'
import './index.css'

// Root layout component that wraps all routes with AuthProvider
function RootLayout() {
  return (
    <AuthProvider>
      <Toaster
        position="bottom-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#111',
            color: '#fff',
            border: '1px solid #222',
            borderRadius: '0',
            padding: '12px 16px',
            fontSize: '14px',
            fontFamily: 'Inter, system-ui, sans-serif',
          },
          success: {
            iconTheme: {
              primary: '#4a4',
              secondary: '#111',
            },
            style: {
              borderColor: '#1a3a1a',
            },
          },
          error: {
            iconTheme: {
              primary: '#c44',
              secondary: '#111',
            },
            style: {
              borderColor: '#3a1a1a',
            },
          },
        }}
      />
      <Outlet />
    </AuthProvider>
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

