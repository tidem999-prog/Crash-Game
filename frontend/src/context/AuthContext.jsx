import React, { createContext, useState, useEffect, useContext } from 'react';

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

export const apiRequest = async (endpoint, options = {}) => {
  const token = localStorage.getItem('token');
  const headers = { ...options.headers };
  
  // Set Auth headers
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // If body is not FormData, set content-type to JSON
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }

  const baseUrl = window.location.hostname === 'localhost' ? 'http://localhost:5000' : window.location.origin;
  
  try {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      ...options,
      headers
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Une erreur est survenue lors de la requête.');
    }
    
    return data;
  } catch (err) {
    console.error(`API Error on ${endpoint}:`, err.message);
    throw err;
  }
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchProfile = async () => {
    try {
      const data = await apiRequest('/api/auth/me');
      setUser(data.user);
      setError(null);
    } catch (err) {
      console.warn('Auth: Token invalid or expired. Logging out.');
      logout();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      fetchProfile();
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    setError(null);
    try {
      const data = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: { email, password }
      });
      localStorage.setItem('token', data.token);
      setUser(data.user);
      return data.user;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const signup = async (email, password) => {
    setError(null);
    try {
      const data = await apiRequest('/api/auth/signup', {
        method: 'POST',
        body: { email, password }
      });
      // Backend returns only a message (no token) - user must verify email first
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
    setError(null);
  };

  const refreshBalance = async () => {
    if (!user) return;
    try {
      const data = await apiRequest('/api/auth/me');
      setUser(prev => ({ ...prev, balance: data.user.balance }));
    } catch (err) {
      console.error('Failed to refresh balance:', err);
    }
  };

  const updateBalance = (newBalance) => {
    setUser(prev => prev ? { ...prev, balance: parseFloat(newBalance) } : null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, error, login, signup, logout, refreshBalance, updateBalance }}>
      {children}
    </AuthContext.Provider>
  );
};
