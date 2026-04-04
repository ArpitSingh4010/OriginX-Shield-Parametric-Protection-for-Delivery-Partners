import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import Navbar from './components/Navbar';
import Landing from './pages/Landing';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Admin from './pages/Admin';
import {
  loginAdmin,
  loginDeliveryPartner,
  requestPartnerPasswordResetOtp,
  resetPartnerPasswordWithOtp,
} from './api/rakshaRideApi';

const ADMIN_AUTH_TOKEN_SESSION_STORAGE_KEY = 'raksharide_admin_auth_token';
const ADMIN_AUTH_PROFILE_SESSION_STORAGE_KEY = 'raksharide_admin_auth_profile';
const PARTNER_AUTH_TOKEN_SESSION_STORAGE_KEY = 'raksharide_partner_auth_token';
const PARTNER_AUTH_PROFILE_SESSION_STORAGE_KEY = 'raksharide_partner_auth_profile';

function PartnerProtectedRoute() {
  const [emailAddress, setEmailAddress] = useState('');
  const [password, setPassword] = useState('');
  const [accessError, setAccessError] = useState('');
  const [accessInfo, setAccessInfo] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [partnerAccessToken, setPartnerAccessToken] = useState('');
  const [partnerProfile, setPartnerProfile] = useState(null);
  const [authMode, setAuthMode] = useState('login'); // login | forgot
  const [forgotEmailAddress, setForgotEmailAddress] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    const storedToken = window.sessionStorage.getItem(PARTNER_AUTH_TOKEN_SESSION_STORAGE_KEY) || '';
    const storedProfileRaw = window.sessionStorage.getItem(PARTNER_AUTH_PROFILE_SESSION_STORAGE_KEY);
    if (!storedToken || !storedProfileRaw) {
      return;
    }

    try {
      const storedProfile = JSON.parse(storedProfileRaw);
      if (storedProfile?.partnerId) {
        setPartnerAccessToken(storedToken);
        setPartnerProfile(storedProfile);
      }
    } catch {
      window.sessionStorage.removeItem(PARTNER_AUTH_TOKEN_SESSION_STORAGE_KEY);
      window.sessionStorage.removeItem(PARTNER_AUTH_PROFILE_SESSION_STORAGE_KEY);
    }
  }, []);

  const handlePartnerLogin = async () => {
    setIsLoading(true);
    setAccessError('');
    setAccessInfo('');

    try {
      const loginResult = await loginDeliveryPartner({
        emailAddress,
        password,
      });

      window.sessionStorage.setItem(PARTNER_AUTH_TOKEN_SESSION_STORAGE_KEY, loginResult.accessToken || '');

      window.sessionStorage.setItem(
        PARTNER_AUTH_PROFILE_SESSION_STORAGE_KEY,
        JSON.stringify(loginResult.deliveryPartner)
      );

      setPartnerAccessToken(loginResult.accessToken || '');
      setPartnerProfile(loginResult.deliveryPartner);
      setPassword('');
    } catch (error) {
      setAccessError(error.message || 'Failed to login.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequestPasswordResetOtp = async () => {
    setIsLoading(true);
    setAccessError('');
    setAccessInfo('');

    try {
      const response = await requestPartnerPasswordResetOtp({
        emailAddress: forgotEmailAddress,
      });
      setAccessInfo(response?.emailDelivery?.message || response?.message || 'Password reset code sent.');
    } catch (error) {
      setAccessError(error.message || 'Failed to send password reset code.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async () => {
    setIsLoading(true);
    setAccessError('');
    setAccessInfo('');

    try {
      const response = await resetPartnerPasswordWithOtp({
        emailAddress: forgotEmailAddress,
        resetCode,
        newPassword,
      });

      setAccessInfo(response?.message || 'Password reset successful. Please login.');
      setAuthMode('login');
      setEmailAddress(forgotEmailAddress);
      setPassword('');
      setResetCode('');
      setNewPassword('');
    } catch (error) {
      setAccessError(error.message || 'Failed to reset password.');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePartnerLogout = () => {
    window.sessionStorage.removeItem(PARTNER_AUTH_TOKEN_SESSION_STORAGE_KEY);
    window.sessionStorage.removeItem(PARTNER_AUTH_PROFILE_SESSION_STORAGE_KEY);
    setPartnerAccessToken('');
    setPartnerProfile(null);
    setAccessError('');
    setAccessInfo('');
  };

  if (partnerAccessToken && partnerProfile?.partnerId) {
    return (
      <Dashboard
        authenticatedPartnerId={partnerProfile.partnerId}
        authenticatedPartnerProfile={partnerProfile}
        onPartnerLogout={handlePartnerLogout}
      />
    );
  }

  return (
    <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '5rem 1rem' }}>
      <div className="card" style={{ maxWidth: 460, width: '100%' }}>
        <div style={{ fontWeight: 800, fontSize: '1.2rem', marginBottom: '0.5rem' }}>Partner Login</div>
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: '1rem' }}>
          Login first to open your dashboard.
        </div>

        {accessError && <div className="alert alert-error" style={{ marginBottom: '0.75rem' }}>{accessError}</div>}

        {accessInfo && <div className="alert alert-success" style={{ marginBottom: '0.75rem' }}>{accessInfo}</div>}

        {authMode === 'login' ? (
          <>
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input
                className="form-input"
                type="email"
                value={emailAddress}
                onChange={(event) => setEmailAddress(event.target.value)}
                placeholder="you@example.com"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                className="form-input"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && handlePartnerLogin()}
                placeholder="Enter password"
              />
            </div>

            <button
              className="btn btn-primary"
              style={{ marginTop: '0.75rem', width: '100%' }}
              onClick={handlePartnerLogin}
              disabled={isLoading}
            >
              {isLoading ? 'Signing In...' : 'Sign In'}
            </button>

            <button
              className="btn btn-secondary"
              style={{ marginTop: '0.6rem', width: '100%' }}
              onClick={() => {
                setAuthMode('forgot');
                setForgotEmailAddress(emailAddress);
                setAccessError('');
                setAccessInfo('');
              }}
            >
              Forgot Password?
            </button>
          </>
        ) : (
          <>
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input
                className="form-input"
                type="email"
                value={forgotEmailAddress}
                onChange={(event) => setForgotEmailAddress(event.target.value)}
                placeholder="you@example.com"
              />
            </div>

            <button
              className="btn btn-secondary"
              style={{ marginTop: '0.25rem', width: '100%' }}
              onClick={handleRequestPasswordResetOtp}
              disabled={isLoading}
            >
              {isLoading ? 'Sending...' : 'Send Reset OTP'}
            </button>

            <div className="form-group" style={{ marginTop: '0.8rem' }}>
              <label className="form-label">Reset OTP</label>
              <input
                className="form-input"
                value={resetCode}
                maxLength={6}
                onChange={(event) => setResetCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Enter 6-digit code"
              />
            </div>

            <div className="form-group">
              <label className="form-label">New Password</label>
              <input
                className="form-input"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="At least 6 characters"
              />
            </div>

            <button
              className="btn btn-primary"
              style={{ marginTop: '0.25rem', width: '100%' }}
              onClick={handleResetPassword}
              disabled={isLoading}
            >
              {isLoading ? 'Resetting...' : 'Reset Password'}
            </button>

            <button
              className="btn btn-secondary"
              style={{ marginTop: '0.6rem', width: '100%' }}
              onClick={() => {
                setAuthMode('login');
                setAccessError('');
                setAccessInfo('');
              }}
            >
              Back to Login
            </button>
          </>
        )}

        <div style={{ marginTop: '0.9rem', fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
          New partner? <Link to="/register" style={{ color: 'var(--amber)' }}>Register first</Link>
        </div>
      </div>
    </div>
  );
}

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
        <Route path="/dashboard" element={<PartnerProtectedRoute />} />
        <Route path="/admin"     element={<AdminProtectedRoute />} />
      </Routes>
    </BrowserRouter>
  );
}

