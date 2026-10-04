import { useState, type FormEvent } from 'react';
import { en } from '@doorlivery/shared';
import { api, RequestError } from '../api';
import { ErrorText } from '../components';

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
    <main className="page narrow">
      <h1 className="brand-lg">{en.vendor.appName}</h1>
      <form className="card stack" onSubmit={submit}>
        <h2>{t.title}</h2>
        <label>
          {t.email}
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          {t.password}
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <ErrorText message={error} />
        <button className="primary" disabled={busy}>
          {busy ? t.submitting : t.submit}
        </button>
      </form>
    </main>
  );
}
