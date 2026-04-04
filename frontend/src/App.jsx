import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Landing from './pages/Landing';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Admin from './pages/Admin';
import { loginAdmin } from './api/rakshaRideApi';

const ADMIN_AUTH_TOKEN_SESSION_STORAGE_KEY = 'raksharide_admin_auth_token';
const ADMIN_AUTH_PROFILE_SESSION_STORAGE_KEY = 'raksharide_admin_auth_profile';

function AdminProtectedRoute() {
  const [emailAddress, setEmailAddress] = useState('arpitsinght25@gmail.com');
  const [password, setPassword] = useState('');
  const [accessError, setAccessError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [adminAccessToken, setAdminAccessToken] = useState('');
  const [adminProfile, setAdminProfile] = useState(null);

  useEffect(() => {
    const storedToken = window.sessionStorage.getItem(ADMIN_AUTH_TOKEN_SESSION_STORAGE_KEY) || '';
    const storedProfileRaw = window.sessionStorage.getItem(ADMIN_AUTH_PROFILE_SESSION_STORAGE_KEY);
    let storedProfile = null;

    if (storedProfileRaw) {
      try {
        storedProfile = JSON.parse(storedProfileRaw);
      } catch {
        storedProfile = null;
      }
    }

    if (storedToken) {
      setAdminAccessToken(storedToken);
      setAdminProfile(storedProfile);
    }
  }, []);

  const handleAdminLogin = async () => {
    setIsLoading(true);
    setAccessError('');

    try {
      const loginResult = await loginAdmin({
        emailAddress,
        password,
      });

      window.sessionStorage.setItem(ADMIN_AUTH_TOKEN_SESSION_STORAGE_KEY, loginResult.accessToken);
      window.sessionStorage.setItem(
        ADMIN_AUTH_PROFILE_SESSION_STORAGE_KEY,
        JSON.stringify(loginResult.adminUser || null)
      );

      setAdminAccessToken(loginResult.accessToken);
      setAdminProfile(loginResult.adminUser || null);
      setPassword('');
    } catch (error) {
      setAccessError(error.message || 'Failed to login as admin.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAdminLogout = () => {
    window.sessionStorage.removeItem(ADMIN_AUTH_TOKEN_SESSION_STORAGE_KEY);
    window.sessionStorage.removeItem(ADMIN_AUTH_PROFILE_SESSION_STORAGE_KEY);
    setAdminAccessToken('');
    setAdminProfile(null);
    setAccessError('');
  };

  if (adminAccessToken) {
    return (
      <Admin
        adminAccessToken={adminAccessToken}
        adminProfile={adminProfile}
        onAdminLogout={handleAdminLogout}
      />
    );
  }

  return (
    <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '5rem 1rem' }}>
      <div className="card" style={{ maxWidth: 460, width: '100%' }}>
        <div style={{ fontWeight: 800, fontSize: '1.2rem', marginBottom: '0.5rem' }}>Admin Login</div>
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: '1rem' }}>
          Login with admin email and password to continue.
        </div>

        {accessError && <div className="alert alert-error" style={{ marginBottom: '0.75rem' }}>{accessError}</div>}

        <div className="form-group">
          <label className="form-label">Email Address</label>
          <input
            className="form-input"
            type="email"
            value={emailAddress}
            onChange={(event) => setEmailAddress(event.target.value)}
            placeholder="arpitsinght25@gmail.com"
          />
        </div>

        <div className="form-group">
          <label className="form-label">Password</label>
          <input
            className="form-input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && handleAdminLogin()}
            placeholder="Enter password"
          />
        </div>

        <button
          className="btn btn-primary"
          style={{ marginTop: '0.75rem', width: '100%' }}
          onClick={handleAdminLogin}
          disabled={isLoading}
        >
          {isLoading ? 'Signing In...' : 'Sign In'}
        </button>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/"          element={<Landing />} />
        <Route path="/register"  element={<Register />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/admin"     element={<AdminProtectedRoute />} />
      </Routes>
    </BrowserRouter>
  );
}

