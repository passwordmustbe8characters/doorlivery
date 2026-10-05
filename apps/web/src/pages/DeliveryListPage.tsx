import { useEffect, useState } from 'react';
import { en } from '@doorlivery/shared';
import { api, RequestError, type DeliveryPage } from '../api';
import { displayPostcode, ErrorText, formatWhen, StatusBadge } from '../components';
import { linkHandler } from '../router';

const t = en.vendor.list;

export function DeliveryListPage({ page }: { page: number }) {
  const [data, setData] = useState<DeliveryPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setError(null);
    api
      .list(page)
      .then((d) => live && setData(d))
      .catch((e) => live && setError(e instanceof RequestError ? e.message : en.vendor.errorGeneric));
    return () => {
      live = false;
    };
  }, [page]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <>
      <div className="row between">
        <h1>{t.title}</h1>
        <a className="button primary" href="/deliveries/new" onClick={linkHandler('/deliveries/new')}>
          {t.newButton}
        </a>
      </div>
      <ErrorText message={error} />
      {data && data.data.length === 0 && <p className="card muted">{t.empty}</p>}
      <ul className="list">
        {data?.data.map((d) => (
          <li key={d.id}>
            <a className="card item" href={`/deliveries/${d.id}`} onClick={linkHandler(`/deliveries/${d.id}`)}>
              <div className="row between">
                <strong>{d.customer_name}</strong>
                <span className="row">
                  {d.code_locked && <span className="badge badge-failed">{t.codeLocked}</span>}
                  <StatusBadge status={d.status} />
                </span>
              </div>
              <div className="row between muted small">
                <span>{d.dropoff_postcode ? displayPostcode(d.dropoff_postcode) : t.noPostcode}</span>
                <span>{formatWhen(d.created_at)}</span>
              </div>
            </a>
          </li>
        ))}
      </ul>
      {data && pages > 1 && (
        <nav className="row between pager">
          {page > 1 ? (
            <a href={`/?page=${page - 1}`} onClick={linkHandler(`/?page=${page - 1}`)}>
              {t.prev}
            </a>
          ) : (
            <span />
          )}
          <span className="muted small">{t.page(page, pages)}</span>
          {page < pages ? (
            <a href={`/?page=${page + 1}`} onClick={linkHandler(`/?page=${page + 1}`)}>
              {t.next}
            </a>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  );
}
