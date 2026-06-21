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

  const signup = async (email, password, ref) => {
    setError(null);
    try {
      const data = await apiRequest('/api/auth/signup', {
        method: 'POST',
        body: { email, password, ref }
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
      setUser(data.user);
    } catch (err) {
      console.error('Failed to refresh balance:', err);
    }
  };

  const updateBalance = (newBalance, currency = 'HTG') => {
    setUser(prev => {
      if (!prev) return null;
      if (typeof newBalance === 'object' && newBalance !== null) {
        return {
          ...prev,
          balance: parseFloat(newBalance.newBalance),
          ket_balance: parseFloat(newBalance.newKetBalance ?? prev.ket_balance ?? 0),
          bonus_balance: parseFloat(newBalance.bonusBalance ?? prev.bonus_balance ?? 0),
          locked_winnings: parseFloat(newBalance.lockedWinnings ?? prev.locked_winnings ?? 0)
        };
      }
      if (currency === 'KET') {
        return { ...prev, ket_balance: parseFloat(newBalance) };
      } else {
        return { ...prev, balance: parseFloat(newBalance) };
      }
    });
  };

  const updateProfile = async (firstName, lastName) => {
    try {
      const data = await apiRequest('/api/auth/profile', {
        method: 'PUT',
        body: { firstName, lastName }
      });
      setUser(prev => prev ? { ...prev, first_name: firstName, last_name: lastName } : null);
      return data;
    } catch (err) {
      console.error('Failed to update profile:', err);
      throw err;
    }
  };

  const changeCurrency = async (currency) => {
    try {
      const data = await apiRequest('/api/auth/active-currency', {
        method: 'PUT',
        body: { currency }
      });
      setUser(prev => prev ? { ...prev, active_currency: currency } : null);
      return data;
    } catch (err) {
      console.error('Failed to update active currency:', err);
      throw err;
    }
  };

  const convertKet = async (amount) => {
    try {
      const data = await apiRequest('/api/auth/convert-ket', {
        method: 'POST',
        body: { amount }
      });
      setUser(prev => prev ? { 
        ...prev, 
        balance: data.newBalance, 
        ket_balance: data.newKetBalance 
      } : null);
      return data;
    } catch (err) {
      console.error('Failed to convert KET:', err);
      throw err;
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, error, login, signup, logout, refreshBalance, updateBalance, updateProfile, changeCurrency, convertKet }}>
      {children}
    </AuthContext.Provider>
  );
};
