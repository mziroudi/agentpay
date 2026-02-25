import Link from 'next/link';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <nav style={{ borderBottom: '1px solid #ccc', paddingBottom: 8, marginBottom: 16 }}>
        <Link href="/dashboard" style={{ marginRight: 16 }}>Transactions</Link>
        <Link href="/dashboard/agents">Agents</Link>
      </nav>
      {children}
    </div>
  );
}
