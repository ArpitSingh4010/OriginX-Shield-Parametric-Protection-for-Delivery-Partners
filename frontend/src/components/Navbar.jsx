import React, { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';

export default function Navbar() {
  const navigate = useNavigate();
  const [theme, setTheme] = useState(() => window.localStorage.getItem('raksharide-theme') || 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    window.localStorage.setItem('raksharide-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((previousTheme) => (previousTheme === 'dark' ? 'light' : 'dark'));
  };

  return (
    <nav className="navbar">
      <div className="navbar-brand" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
        <span className="logo-icon">🛡️</span>
        Raksha<span>Ride</span>
      </div>

      <div className="navbar-links">
        <button className="theme-toggle" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
          {theme === 'dark' ? 'Light' : 'Dark'}
        </button>
        <NavLink to="/"          className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>Home</NavLink>
        <NavLink to="/dashboard" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>Dashboard</NavLink>
        <NavLink to="/admin"     className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>Admin</NavLink>
        <NavLink to="/register">
          <button className="nav-btn" style={{ marginLeft: '0.5rem' }}>Get Protected</button>
        </NavLink>
      </div>
    </nav>
  );
}
