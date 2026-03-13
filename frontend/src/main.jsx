import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext'
import AuthRouter from './components/AuthRouter'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <AuthRouter>
        <App />
      </AuthRouter>
    </AuthProvider>
  </StrictMode>,
)
