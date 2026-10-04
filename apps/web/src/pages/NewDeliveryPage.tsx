import { useState, type FormEvent } from 'react';
import { en } from '@doorlivery/shared';
import { api, RequestError } from '../api';
import { ErrorText } from '../components';
import { linkHandler, navigate } from '../router';

const t = en.vendor.form;

export function NewDeliveryPage() {
  const [form, setForm] = useState({ customer_name: '', customer_phone: '', pickup_note: '', item_note: '', rider_phone: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const field = (name: keyof typeof form) => ({
    value: form[name],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [name]: e.target.value }),
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await api.create(form);
      navigate(`/deliveries/${created.id}`, true);
    } catch (err) {
      setError(err instanceof RequestError ? err.message : en.vendor.errorGeneric);
      setBusy(false);
    }
  }

  return (
    <>
      <h1>{t.title}</h1>
      <form className="card stack" onSubmit={submit}>
        <label>
          {t.customerName}
          <input required maxLength={200} autoComplete="off" {...field('customer_name')} />
        </label>
        <label>
          {t.customerPhone}
          <input required type="tel" inputMode="tel" placeholder={t.phoneHint} autoComplete="off" {...field('customer_phone')} />
        </label>
        <label>
          {t.pickupNote}
          <textarea required maxLength={500} rows={2} {...field('pickup_note')} />
          <span className="hint">{t.pickupHint}</span>
        </label>
        <label>
          {t.itemNote}
          <input maxLength={500} {...field('item_note')} />
        </label>
        <label>
          {t.riderPhone}
          <input type="tel" inputMode="tel" placeholder={t.phoneHint} autoComplete="off" {...field('rider_phone')} />
        </label>
        <ErrorText message={error} />
        <button className="primary" disabled={busy}>
          {busy ? t.submitting : t.submit}
        </button>
        <a className="center" href="/" onClick={linkHandler('/')}>
          {t.cancel}
        </a>
      </form>
    </>
  );
}
