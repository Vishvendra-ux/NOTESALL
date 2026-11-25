import { createContext, useState, useEffect } from 'react';
import { api, getAuthToken, setAuthToken, clearAuthToken } from '../services/api';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      const token = getAuthToken();
      if (token) {
        try {
          const res = await api.get('/auth/me', { timeout: 60000 });
          setUser(res.data);
        } catch (error) {
          console.error('Failed to fetch user', error);
          clearAuthToken();
        }
      }
      setLoading(false);
    };
    fetchUser();
  }, []);

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email: email.trim().toLowerCase(), password }, { timeout: 60000 });
    setAuthToken(res.data.token);
    setUser(res.data);
    return res.data;
  };

  const register = async (userData) => {
    const res = await api.post('/auth/register', userData, { timeout: 60000 });
    setAuthToken(res.data.token);
    setUser(res.data);
    return res.data;
  };

  const loginWithGoogle = async (googleData) => {
    const res = await api.post('/auth/google', googleData, { timeout: 60000 });
    setAuthToken(res.data.token);
    setUser(res.data);
    return res.data;
  };

  const loginAsDemo = async () => {
    const res = await api.post('/auth/demo', {}, { timeout: 60000 });
    setAuthToken(res.data.token, { ephemeral: true });
    setUser(res.data);
    return res.data;
  };

  const completeOnboarding = async (onboardingData) => {
    const res = await api.put('/auth/onboarding', onboardingData);
    setUser(res.data);
    return res.data;
  };

  const logout = () => {
    clearAuthToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, setUser, loading, login, register, loginWithGoogle, loginAsDemo, completeOnboarding, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
