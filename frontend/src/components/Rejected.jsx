export default function Rejected() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", gap: "1rem", padding: "2rem", textAlign: "center" }}>
      <h2>Access Not Approved</h2>
      <p>Your request for access was not approved.</p>
      <p>Contact the administrator if you believe this is an error.</p>
      <a href="/auth/logout">Sign out</a>
    </div>
  );
}
