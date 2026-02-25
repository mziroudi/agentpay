'use client';

import { useState } from 'react';

const API = typeof window !== 'undefined' ? '' : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000');

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await fetch(`${API || ''}/api/v1/dashboard/login-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    setSent(true);
  }

  if (sent) {
    return (
      <div style={{ maxWidth: 400, margin: '40px auto' }}>
        <h1>AgentPay</h1>
        <p>Check your email for a login link. It expires in 30 minutes.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 400, margin: '40px auto' }}>
      <h1>AgentPay</h1>
      <p>Sign in with your org admin email.</p>
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{ display: 'block', width: '100%', padding: 8, marginBottom: 12 }}
        />
        <button type="submit" style={{ padding: '8px 16px' }}>
          Send login link
        </button>
      </form>
    </div>
  );
}
