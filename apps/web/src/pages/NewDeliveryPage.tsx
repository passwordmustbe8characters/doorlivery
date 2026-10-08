import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { en, normalizeNigerianPhone, type IconName } from '@doorlivery/shared';
import { api, RequestError } from '../api';
import { ErrorText, Icon } from '../components';
import { linkHandler, navigate } from '../router';

const t = en.vendor.form;

type Fields = 'customer_name' | 'customer_phone' | 'pickup_note' | 'item_note' | 'rider_phone';
type Errors = Partial<Record<Fields, string>>;

/** Client-side checks that mirror the API, so mistakes show before a round trip. */
function validate(f: Record<Fields, string>): Errors {
  const e: Errors = {};
  if (!f.customer_name.trim()) e.customer_name = t.required(t.customerName);
  if (!f.customer_phone.trim()) e.customer_phone = t.required(t.customerPhone);
  else if (!normalizeNigerianPhone(f.customer_phone)) e.customer_phone = en.errors.invalidPhone;
  if (!f.pickup_note.trim()) e.pickup_note = t.required(t.pickupNote);
  if (f.rider_phone.trim() && !normalizeNigerianPhone(f.rider_phone)) e.rider_phone = en.errors.invalidPhone;
  return e;
}

function Section({ icon, title, children }: { icon: IconName; title: string; children: ReactNode }) {
  return (
    <section className="card form-section">
      <h2>
        <Icon name={icon} />
        {title}
      </h2>
      <div className="stack-200">{children}</div>
    </section>
  );
}

export function NewDeliveryPage() {
  const [form, setForm] = useState<Record<Fields, string>>({ customer_name: '', customer_phone: '', pickup_note: '', item_note: '', rider_phone: '' });
  const [touched, setTouched] = useState<Partial<Record<Fields, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const errors = validate(form);
  const shown = (name: Fields) => (submitted || touched[name] ? errors[name] : undefined);

  /** Props for one labelled input with hint, optional tag, and inline error. */
  function Field(props: { name: Fields; label: string; hint?: string; optional?: boolean; multiline?: boolean; type?: string; maxLength?: number }) {
    const err = shown(props.name);
    const describedBy = [props.hint && `${props.name}-hint`, err && `${props.name}-err`].filter(Boolean).join(' ') || undefined;
    const common = {
      id: props.name,
      name: props.name,
      className: 'input',
      value: form[props.name],
      maxLength: props.maxLength,
      'aria-invalid': err ? true : undefined,
      'aria-describedby': describedBy,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [props.name]: e.target.value })),
      onBlur: () => setTouched((x) => ({ ...x, [props.name]: true })),
    };
    return (
      <div className="field">
        <label className="field-label" htmlFor={props.name}>
          {props.label}
          {props.optional && <span className="optional">{t.optional}</span>}
        </label>
        {props.multiline ? (
          <textarea rows={2} {...common} />
        ) : (
          <input
            type={props.type ?? 'text'}
            inputMode={props.type === 'tel' ? 'tel' : undefined}
            placeholder={props.type === 'tel' ? t.phoneHint : undefined}
            autoComplete="off"
            {...common}
          />
        )}
        {props.hint && !err && (
          <p className="field-hint" id={`${props.name}-hint`}>
            {props.hint}
          </p>
        )}
        {err && (
          <p className="field-error" id={`${props.name}-err`}>
            {err}
          </p>
        )}
      </div>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    const first = (Object.keys(errors) as Fields[])[0];
    if (first) {
      formRef.current?.querySelector<HTMLElement>(`#${first}`)?.focus();
      return;
    }
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
      <a className="back" href="/" onClick={linkHandler('/')}>
        <Icon name="arrowLeft" size={16} />
        {en.vendor.detail.back}
      </a>
      <div className="page-head">
        <div>
          <h1>{t.title}</h1>
          <p>{t.subtitle}</p>
        </div>
      </div>

      <form ref={formRef} onSubmit={submit} noValidate>
        <Section icon="user" title={t.customerSection}>
          {Field({ name: 'customer_name', label: t.customerName, maxLength: 200 })}
          {Field({ name: 'customer_phone', label: t.customerPhone, type: 'tel' })}
        </Section>

        <Section icon="storefront" title={t.pickupSection}>
          {Field({ name: 'pickup_note', label: t.pickupNote, hint: t.pickupHint, multiline: true, maxLength: 500 })}
          {Field({ name: 'item_note', label: t.itemNote, optional: true, maxLength: 500 })}
        </Section>

        <Section icon="moped" title={t.riderSection}>
          {Field({ name: 'rider_phone', label: t.riderPhone, hint: t.riderHint, optional: true, type: 'tel' })}
        </Section>

        <div className="form-actions">
          <ErrorText message={error} />
          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? t.submitting : t.submit}
          </button>
          <a className="btn btn-ghost btn-block" href="/" onClick={linkHandler('/')}>
            {t.cancel}
          </a>
        </div>
      </form>
    </>
  );
}
