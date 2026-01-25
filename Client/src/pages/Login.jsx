import React, { useState, useEffect } from 'react';
import { Link, useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { authService } from '../api/auth';
import Button from '../components/Button';
import styles from './Auth.module.css';

const Login = () => {
  const navigate = useNavigate();
  const { user, login } = useAuth();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingUsers, setCheckingUsers] = useState(true);

  // Check if any users exist - if not, redirect to register
  useEffect(() => {
    const checkUsers = async () => {
      try {
        const { hasUsers } = await authService.hasUsers();
        if (!hasUsers) {
          navigate('/register', { replace: true });
        }
      } catch (err) {
        // If check fails, just show login page
        console.error('Failed to check users:', err);
      } finally {
        setCheckingUsers(false);
      }
    };
    checkUsers();
  }, [navigate]);

  if (user) {
    return <Navigate to="/" replace />;
  }

  if (checkingUsers) {
    return (
      <div className={styles.authContainer}>
        <div className={styles.authBox}>
          <div className={styles.authHeader}>
            <div className={styles.authLogo}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="40" height="40">
                <defs>
                  <linearGradient id="authGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style={{stopColor:'#00d4ff',stopOpacity:1}} />
                    <stop offset="100%" style={{stopColor:'#00a8cc',stopOpacity:1}} />
                  </linearGradient>
                </defs>
                <circle cx="32" cy="32" r="30" fill="url(#authGradient)"/>
                <ellipse cx="32" cy="20" rx="16" ry="5" fill="#ffffff" opacity="0.9"/>
                <ellipse cx="32" cy="32" rx="16" ry="5" fill="#ffffff" opacity="0.9"/>
                <ellipse cx="32" cy="44" rx="16" ry="5" fill="#ffffff" opacity="0.9"/>
                <rect x="16" y="20" width="2" height="24" fill="#ffffff" opacity="0.9"/>
                <rect x="46" y="20" width="2" height="24" fill="#ffffff" opacity="0.9"/>
                <circle cx="32" cy="20" r="2.5" fill="#ffffff"/>
                <circle cx="32" cy="32" r="2.5" fill="#ffffff"/>
                <circle cx="32" cy="44" r="2.5" fill="#ffffff"/>
                <path d="M 40 28 L 44 32 L 40 36 L 36 32 Z" fill="#ffffff" opacity="0.6"/>
              </svg>
              <span>NoBase</span>
            </div>
            <p className={styles.authSubtitle}>Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const result = await login(formData);
    
    setLoading(false);

    if (result.success) {
      navigate('/');
    } else {
      setError(result.error || 'Invalid email or password');
    }
  };

  return (
    <div className={styles.authContainer}>
      <div className={styles.authBox}>
        <div className={styles.authHeader}>
          <div className={styles.authLogo}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="40" height="40">
              <defs>
                <linearGradient id="authGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" style={{stopColor:'#00d4ff',stopOpacity:1}} />
                  <stop offset="100%" style={{stopColor:'#00a8cc',stopOpacity:1}} />
                </linearGradient>
              </defs>
              <circle cx="32" cy="32" r="30" fill="url(#authGradient)"/>
              <ellipse cx="32" cy="20" rx="16" ry="5" fill="#ffffff" opacity="0.9"/>
              <ellipse cx="32" cy="32" rx="16" ry="5" fill="#ffffff" opacity="0.9"/>
              <ellipse cx="32" cy="44" rx="16" ry="5" fill="#ffffff" opacity="0.9"/>
              <rect x="16" y="20" width="2" height="24" fill="#ffffff" opacity="0.9"/>
              <rect x="46" y="20" width="2" height="24" fill="#ffffff" opacity="0.9"/>
              <circle cx="32" cy="20" r="2.5" fill="#ffffff"/>
              <circle cx="32" cy="32" r="2.5" fill="#ffffff"/>
              <circle cx="32" cy="44" r="2.5" fill="#ffffff"/>
              <path d="M 40 28 L 44 32 L 40 36 L 36 32 Z" fill="#ffffff" opacity="0.6"/>
            </svg>
            <span>NoBase</span>
          </div>
          <h1 className={styles.authTitle}>Welcome Back</h1>
          <p className={styles.authSubtitle}>Sign in to your account</p>
        </div>

        <form className={styles.authForm} onSubmit={handleSubmit}>
          {error && <div className={styles.errorMessage}>{error}</div>}

          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="email">
              Email Address
            </label>
            <input
              type="email"
              id="email"
              name="email"
              className={styles.formInput}
              value={formData.email}
              onChange={handleChange}
              required
              autoComplete="email"
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="password">
              Password
            </label>
            <input
              type="password"
              id="password"
              name="password"
              className={styles.formInput}
              value={formData.password}
              onChange={handleChange}
              required
              autoComplete="current-password"
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            className={styles.submitBtn}
            disabled={loading}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </Button>
        </form>

        <div className={styles.authFooter}>
          Don't have an account?{' '}
          <Link to="/register" className={styles.authLink}>
            Sign Up
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Login;
