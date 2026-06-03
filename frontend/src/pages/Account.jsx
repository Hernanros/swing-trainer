import { useState } from "react";
import { useUser } from "../context/UserContext";

function ThemeToggle() {
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "dark");

  function apply(t) {
    setTheme(t);
    localStorage.setItem("theme", t);
    document.documentElement.setAttribute("data-theme", t === "light" ? "light" : "dark");
  }

  return (
    <div style={{ display: "flex", gap: "8px" }}>
      {["dark", "light"].map(t => (
        <button
          key={t}
          onClick={() => apply(t)}
          style={{
            padding: "8px 20px",
            borderRadius: "8px",
            border: `2px solid ${theme === t ? "var(--accent)" : "var(--border2)"}`,
            background: theme === t ? "var(--surface2)" : "transparent",
            color: theme === t ? "var(--text)" : "var(--muted)",
            cursor: "pointer",
            fontFamily: "var(--font)",
            fontSize: "0.88em",
            textTransform: "capitalize",
          }}
        >
          {t === "dark" ? "🌙 Dark" : "☀️ Light"}
        </button>
      ))}
    </div>
  );
}

export default function Account() {
  const { user, email } = useUser();

  return (
    <div className="page" style={{ maxWidth: "500px" }}>
      <h2 style={{ color: "var(--text)", fontSize: "1.15em", fontWeight: 700 }}>Account</h2>

      {/* Profile */}
      <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "10px", padding: "20px", display: "flex", flexDirection: "column", gap: "12px" }}>
        <h3 style={{ fontSize: "0.85em", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Profile</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.88em", color: "var(--muted)" }}>Name</span>
            <span style={{ fontSize: "0.88em", color: "var(--text2)" }}>{user?.name || "—"}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.88em", color: "var(--muted)" }}>Email</span>
            <span style={{ fontSize: "0.88em", color: "var(--text2)" }}>{email || "—"}</span>
          </div>
        </div>
        <p style={{ fontSize: "0.78em", color: "var(--dim)" }}>Profile editing coming soon.</p>
      </section>

      {/* Theme */}
      <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "10px", padding: "20px", display: "flex", flexDirection: "column", gap: "12px" }}>
        <h3 style={{ fontSize: "0.85em", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Theme</h3>
        <ThemeToggle />
      </section>

      {/* Sign out */}
      <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "10px", padding: "20px", display: "flex", flexDirection: "column", gap: "12px" }}>
        <h3 style={{ fontSize: "0.85em", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Account</h3>
        <a
          href="/auth/logout"
          style={{ display: "inline-block", padding: "8px 20px", borderRadius: "8px", border: "1px solid var(--border2)", color: "var(--red)", fontSize: "0.88em", textDecoration: "none", width: "fit-content" }}
        >
          Sign out
        </a>
      </section>
    </div>
  );
}
