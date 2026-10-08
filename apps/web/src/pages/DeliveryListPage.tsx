import { useCallback, useEffect, useRef, useState } from 'react';
import { en } from '@doorlivery/shared';
import { api, RequestError, type Delivery, type DeliveryPage } from '../api';
import { CardSkeleton, displayPostcode, ErrorText, formatWhen, Icon, StatusBadge, Toast } from '../components';
import { describeListChange } from '../live-changes';
import { linkHandler } from '../router';
import { usePolling } from '../usePolling';

const t = en.vendor.list;

export function DeliveryListPage({ page, business }: { page: number; business: string }) {
  const [data, setData] = useState<DeliveryPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const closeToast = useCallback(() => setToast(null), []);
  const current = useRef<Delivery[] | null>(null);
  const pageRef = useRef(page);
  pageRef.current = page;

  const load = useCallback(
    async (background = false) => {
      try {
        const d = await api.list(page);
        if (pageRef.current !== page) return; // vendor moved to another page meanwhile
        if (background && current.current) {
          const change = describeListChange(current.current, d.data, business);
          if (change) setToast(change);
        }
        current.current = d.data;
        setData(d);
      } catch (e) {
        if (!background) setError(e instanceof RequestError ? e.message : en.vendor.errorGeneric);
      }
    },
    [page, business],
  );

  useEffect(() => {
    current.current = null;
    setError(null);
    void load();
  }, [load]);

  // Live updates: refresh every 15 s while the list is on screen.
  usePolling(() => load(true), 15_000);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  const newButton = (
    <a className="btn btn-primary" href="/deliveries/new" onClick={linkHandler('/deliveries/new')}>
      <Icon name="plus" />
      <span>{t.newButton}</span>
    </a>
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t.title}</h1>
          {data && data.total > 0 && <p>{t.subtitle(data.total)}</p>}
        </div>
        {data && data.total > 0 && newButton}
      </div>

      <ErrorText message={error} />

      {!data && !error && (
        <div className="list" aria-busy="true">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      )}

      {data && data.data.length === 0 && (
        <section className="card empty">
          <div className="hero-icon">
            <Icon name="package" size={28} />
          </div>
          <h2>{t.emptyTitle}</h2>
          <p>{t.empty}</p>
          {newButton}
        </section>
      )}

      {data && data.data.length > 0 && (
        <ul className="list">
          {data.data.map((d) => (
            <li key={d.id}>
              <a className="card item" href={`/deliveries/${d.id}`} onClick={linkHandler(`/deliveries/${d.id}`)}>
                <div className="item-top">
                  <span className="item-name">{d.customer_name ?? <span className="subtle">{t.nameRemoved}</span>}</span>
                  <span className="badges">
                    {d.code_locked && <span className="badge badge-danger">{t.codeLocked}</span>}
                    <StatusBadge status={d.status} />
                  </span>
                </div>
                <div className="item-meta">
                  {d.dropoff_postcode ? (
                    <span className="postcode">
                      <Icon name="mapPin" size={16} />
                      {displayPostcode(d.dropoff_postcode)}
                    </span>
                  ) : (
                    <span className="postcode none">{t.noPostcode}</span>
                  )}
                  <span>{formatWhen(d.created_at)}</span>
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}

      {data && pages > 1 && (
        <nav className="pager" aria-label={t.page(page, pages)}>
          {page > 1 ? (
            <a className="btn btn-secondary btn-sm" href={`/?page=${page - 1}`} onClick={linkHandler(`/?page=${page - 1}`)}>
              <Icon name="arrowLeft" size={16} />
              {t.prev}
            </a>
          ) : (
            <span />
          )}
          <span className="text-sm subtle">{t.page(page, pages)}</span>
          {page < pages ? (
            <a className="btn btn-secondary btn-sm" href={`/?page=${page + 1}`} onClick={linkHandler(`/?page=${page + 1}`)}>
              {t.next}
              <Icon name="caretRight" size={16} />
            </a>
          ) : (
            <span />
          )}
        </nav>
      )}
      <Toast message={toast} onClose={closeToast} />
    </>
  );
}
