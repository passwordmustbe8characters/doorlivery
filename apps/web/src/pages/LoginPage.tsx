import { useState, type FormEvent } from 'react';
import { en } from '@doorlivery/shared';
import { api, RequestError } from '../api';
import { BrandMark, ErrorText } from '../components';

const t = en.vendor.login;

export function LoginPage({ onLoggedIn }: { onLoggedIn: () => Promise<void> }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(email, password);
      setPassword('');
      await onLoggedIn();
    } catch (err) {
      setError(err instanceof RequestError ? err.message : en.vendor.errorGeneric);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth" id="main">
      <div className="auth-card appear">
        <BrandMark />
        <h1>{t.title}</h1>
        <p className="lead">{t.subtitle}</p>
        <form className="stack-200" onSubmit={submit} noValidate={false}>
          <div className="field">
            <label className="field-label" htmlFor="email">
              {t.email}
            </label>
            <input
              id="email"
              className="input"
              type="email"
              autoComplete="username"
              inputMode="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="password">
              {t.password}
            </label>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <ErrorText message={error} />
          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? t.submitting : t.submit}
          </button>
        </form>
        <p className="auth-foot">{t.inviteOnly}</p>
      </div>
    </main>
  );
}
