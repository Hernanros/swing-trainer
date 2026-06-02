import { useState, useEffect } from "react";

export default function Admin() {
  const [requests, setRequests] = useState({ pending: [], approved: [], rejected: [] });
  const [loading, setLoading] = useState(true);

  async function load() {
    const res = await fetch("/api/admin/requests", { credentials: "include" });
    if (res.ok) setRequests(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function approve(id) {
    await fetch(`/api/admin/requests/${id}/approve`, { method: "POST", credentials: "include" });
    load();
  }

  async function reject(id) {
    await fetch(`/api/admin/requests/${id}/reject`, { method: "POST", credentials: "include" });
    load();
  }

  if (loading) return <div style={{ padding: "2rem" }}>Loading...</div>;

  return (
    <div style={{ padding: "2rem", maxWidth: "600px", margin: "0 auto" }}>
      <h2>Access Requests</h2>

      <section>
        <h3>Pending ({requests.pending.length})</h3>
        {requests.pending.length === 0 && <p style={{ color: "#888" }}>No pending requests.</p>}
        {requests.pending.map(r => (
          <div key={r.id} style={{ border: "1px solid #ddd", borderRadius: "8px", padding: "1rem", marginBottom: "0.75rem" }}>
            <div><strong>{r.name || r.email}</strong> {r.name && <span style={{ color: "#888" }}>({r.email})</span>}</div>
            <div style={{ fontSize: "0.85rem", color: "#888", marginBottom: "0.5rem" }}>
              Requested {new Date(r.requested_at).toLocaleDateString()}
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button onClick={() => approve(r.id)} style={{ padding: "0.4rem 1rem", background: "#22c55e", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer" }}>Approve</button>
              <button onClick={() => reject(r.id)} style={{ padding: "0.4rem 1rem", background: "#ef4444", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer" }}>Reject</button>
            </div>
          </div>
        ))}
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h3>Approved ({requests.approved.length})</h3>
        {requests.approved.length === 0 && <p style={{ color: "#888" }}>None yet.</p>}
        {requests.approved.map(r => (
          <div key={r.id} style={{ padding: "0.5rem 0", borderBottom: "1px solid #eee" }}>
            {r.name || r.email} {r.name && <span style={{ color: "#888", fontSize: "0.85rem" }}>({r.email})</span>}
          </div>
        ))}
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h3>Rejected ({requests.rejected.length})</h3>
        {requests.rejected.length === 0 && <p style={{ color: "#888" }}>None yet.</p>}
        {requests.rejected.map(r => (
          <div key={r.id} style={{ padding: "0.5rem 0", borderBottom: "1px solid #eee" }}>
            {r.name || r.email} {r.name && <span style={{ color: "#888", fontSize: "0.85rem" }}>({r.email})</span>}
          </div>
        ))}
      </section>
    </div>
  );
}
