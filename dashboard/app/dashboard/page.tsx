'use client';

import { useEffect, useState } from 'react';
import { authHeaders } from '../auth';

export default function TransactionsPage() {
  const [list, setList] = useState<{ id: string; agent_id: string; amount_cents: number; status: string; purpose: string | null; created_at: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/v1/dashboard/transactions`, { credentials: 'include', headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => setList(d.transactions || []))
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Loading…</p>;
  return (
    <div>
      <h1>Transactions</h1>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>ID</th>
            <th style={{ textAlign: 'left' }}>Amount</th>
            <th style={{ textAlign: 'left' }}>Status</th>
            <th style={{ textAlign: 'left' }}>Purpose</th>
            <th style={{ textAlign: 'left' }}>Date</th>
          </tr>
        </thead>
        <tbody>
          {list.map((t) => (
            <tr key={t.id}>
              <td>{t.id.slice(0, 8)}</td>
              <td>${(t.amount_cents / 100).toFixed(2)}</td>
              <td>{t.status}</td>
              <td>{t.purpose || '—'}</td>
              <td>{new Date(t.created_at).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {list.length === 0 && <p>No transactions yet.</p>}
    </div>
  );
}
