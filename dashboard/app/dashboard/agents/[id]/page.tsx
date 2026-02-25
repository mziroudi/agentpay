'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { authHeaders } from '../../auth';

export default function AgentLimitsPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [daily, setDaily] = useState(1000);
  const [perTx, setPerTx] = useState(500);
  const [threshold, setThreshold] = useState(100);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/v1/dashboard/agents`, { credentials: 'include', headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => {
        const a = (d.agents || []).find((x: { id: string }) => x.id === id);
        if (a) {
          setDaily((a.daily_limit_cents || 100000) / 100);
          setPerTx((a.per_tx_limit_cents || 50000) / 100);
          setThreshold((a.approval_threshold_cents || 10000) / 100);
        }
      })
      .catch(() => {});
  }, [id]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch(`/api/v1/dashboard/agents/${id}/limits`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        daily_limit_cents: Math.round(daily * 100),
        per_tx_limit_cents: Math.round(perTx * 100),
        approval_threshold_cents: Math.round(threshold * 100),
      }),
    });
    setSaving(false);
    router.push('/dashboard/agents');
  }

  return (
    <div>
      <h1>Edit budget limits</h1>
      <form onSubmit={save}>
        <label style={{ display: 'block', marginBottom: 8 }}>
          Daily limit ($): <input type="number" min="0" step="0.01" value={daily} onChange={(e) => setDaily(Number(e.target.value))} />
        </label>
        <label style={{ display: 'block', marginBottom: 8 }}>
          Per-transaction limit ($): <input type="number" min="0" step="0.01" value={perTx} onChange={(e) => setPerTx(Number(e.target.value))} />
        </label>
        <label style={{ display: 'block', marginBottom: 8 }}>
          Auto-approve below ($): <input type="number" min="0" step="0.01" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} />
        </label>
        <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      </form>
    </div>
  );
}
