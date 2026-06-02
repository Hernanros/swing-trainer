import { useUser } from "../context/UserContext";

export default function Pending() {
  const { email } = useUser();
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", gap: "1rem", padding: "2rem", textAlign: "center" }}>
      <h2>Access Requested</h2>
      <p>Your request for <strong>{email}</strong> has been submitted.</p>
      <p>You'll receive an email when your access is approved.</p>
      <a href="/auth/logout">Sign out</a>
    </div>
  );
}
