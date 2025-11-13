import { useState } from 'react';
import { api } from '../services/api';
import '../App.css';

function AuthView({ onSuccess, status }) {
  const demoModeEnabled = import.meta.env.VITE_DEMO_MODE === 'true';
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({ email: '', password: '', displayName: '' });
  const [authMessage, setAuthMessage] = useState('');
  const [error, setError] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetMessage, setResetMessage] = useState('');

  const handleAuthSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setAuthMessage('');
    try {
      const payload = authMode === 'register'
        ? await api.register(authForm)
        : await api.login(authForm);
      onSuccess(payload);
      setAuthMessage('Authenticated successfully.');
    } catch (err) {
      setError(err.message);
    }
  };

  const handlePasswordResetRequest = async (event) => {
    event.preventDefault();
    setError('');
    try {
      const response = await api.requestPasswordReset(resetEmail);
      setResetMessage(response.message);
      if (response.resetToken) {
        setResetToken(response.resetToken);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handlePasswordResetSubmit = async (event) => {
    event.preventDefault();
    setError('');
    try {
      const payload = await api.resetPassword({
        token: resetToken,
        password: resetPassword
      });
      onSuccess(payload);
      setResetMessage('Password reset successfully.');
      setResetPassword('');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-hero">
        <p className="eyebrow">Spotify-like MVP</p>
        <h1>登录体验拆分，保持主界面聚焦内容。</h1>
        <p className="subtitle">
          完整的邮箱注册 / JWT 登录 / 密码重置流程，连接到同一套 Express + Postgres API。
        </p>
        <div className="hero-status">
          <span className={`status-dot ${status?.status === 'ok' ? 'online' : 'offline'}`} />
          API {status?.status === 'ok' ? 'online' : 'offline'}
        </div>
        <ul className="auth-benefits">
          <li>• 邮箱 + 密码注册/登录，使用 bcrypt + JWT</li>
          <li>• 30 分钟有效的密码重置令牌</li>
          <li>• 登录后自动跳转到内容主界面</li>
          {demoModeEnabled && <li>• Demo 模式可直接使用 demo@listener.fm / password123</li>}
        </ul>
      </div>

      <div className="auth-card">
        <div className="auth-grid">
          <form onSubmit={handleAuthSubmit} className="auth-form">
            <div className="toggle-row">
              <button
                type="button"
                className={authMode === 'login' ? 'active' : ''}
                onClick={() => setAuthMode('login')}
              >
                登录
              </button>
              <button
                type="button"
                className={authMode === 'register' ? 'active' : ''}
                onClick={() => setAuthMode('register')}
              >
                注册
              </button>
            </div>
            <label>
              邮箱
              <input
                type="email"
                value={authForm.email}
                onChange={(event) => setAuthForm((prev) => ({ ...prev, email: event.target.value }))}
                required
              />
            </label>
            <label>
              密码
              <input
                type="password"
                value={authForm.password}
                onChange={(event) => setAuthForm((prev) => ({ ...prev, password: event.target.value }))}
                required
              />
            </label>
            {authMode === 'register' && (
              <label>
                昵称
                <input
                  value={authForm.displayName}
                  onChange={(event) => setAuthForm((prev) => ({ ...prev, displayName: event.target.value }))}
                  required
                />
              </label>
            )}
            <button type="submit">
              {authMode === 'register' ? '创建账号' : '立即登录'}
            </button>
            {demoModeEnabled && authMode === 'login' && (
              <p className="hint">Demo 模式：demo@listener.fm / password123</p>
            )}
            {authMessage && <p className="success">{authMessage}</p>}
            {error && <p className="error">{error}</p>}
          </form>

          <div className="reset-block">
            <h3>忘记密码？</h3>
            <form onSubmit={handlePasswordResetRequest}>
              <label>
                账号邮箱
                <input
                  type="email"
                  value={resetEmail}
                  onChange={(event) => setResetEmail(event.target.value)}
                />
              </label>
              <button type="submit">生成重置令牌</button>
            </form>
            {resetMessage && <p className="hint">{resetMessage}</p>}
            {resetToken && (
              <form onSubmit={handlePasswordResetSubmit} className="reset-form">
                <label>
                  Reset Token
                  <input
                    value={resetToken}
                    onChange={(event) => setResetToken(event.target.value)}
                  />
                </label>
                <label>
                  新密码
                  <input
                    type="password"
                    value={resetPassword}
                    onChange={(event) => setResetPassword(event.target.value)}
                  />
                </label>
                <button type="submit">提交新密码</button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default AuthView;
