'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { authHeaders } from '../../auth';

type Agent = {
  id: string;
  name: string;
  is_active: boolean;
  daily_limit_cents: number;
  per_tx_limit_cents: number;
  approval_threshold_cents: number;
};

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/v1/dashboard/agents`, { credentials: 'include', headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => setAgents(d.agents || []))
      .catch(() => setAgents([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Loading…</p>;
  return (
    <div>
      <h1>Agents</h1>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>Name</th>
            <th style={{ textAlign: 'left' }}>Daily limit</th>
            <th style={{ textAlign: 'left' }}>Per-tx limit</th>
            <th style={{ textAlign: 'left' }}>Approval threshold</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {agents.map((a) => (
            <tr key={a.id}>
              <td>{a.name}</td>
              <td>${((a.daily_limit_cents || 0) / 100).toFixed(2)}</td>
              <td>${((a.per_tx_limit_cents || 0) / 100).toFixed(2)}</td>
              <td>${((a.approval_threshold_cents || 0) / 100).toFixed(2)}</td>
              <td>
                <Link href={`/dashboard/agents/${a.id}`}>Edit limits</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {agents.length === 0 && <p>No agents. Create one via API POST /v1/dashboard/agents (with session cookie).</p>}
    </div>
  );
}
