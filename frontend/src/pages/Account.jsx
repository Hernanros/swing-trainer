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
  const { user, email, refreshUser } = useUser();
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState(user?.name || "");
  const [nameError, setNameError] = useState("");
  const [saving, setSaving] = useState(false);

  async function saveName() {
    const trimmed = nameInput.trim();
    if (!trimmed) {
      setNameError("Name cannot be empty");
      return;
    }
    setSaving(true);
    setNameError("");
    try {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: trimmed }),
      });
      if (res.status === 409) {
        setNameError("That name is already taken");
        return;
      }
      if (res.status === 400) {
        setNameError("Name cannot be empty");
        return;
      }
      if (!res.ok) {
        setNameError("Something went wrong. Please try again.");
        return;
      }
      await refreshUser();
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page" style={{ maxWidth: "500px" }}>
      <h2 style={{ color: "var(--text)", fontSize: "1.15em", fontWeight: 700 }}>Account</h2>

      {/* Profile */}
      <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "10px", padding: "20px", display: "flex", flexDirection: "column", gap: "12px" }}>
        <h3 style={{ fontSize: "0.85em", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Profile</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <span style={{ fontSize: "0.88em", color: "var(--muted)", paddingTop: "2px" }}>Name</span>
            {editing ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", flex: 1, marginLeft: "16px" }}>
                <input
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  style={{ background: "var(--surface2)", border: "1px solid var(--border2)", borderRadius: "6px", color: "var(--text)", padding: "7px 12px", fontSize: "0.88em", fontFamily: "var(--font)", outline: "none" }}
                  onFocus={e => (e.target.style.borderColor = "var(--accent)")}
                  onBlur={e => (e.target.style.borderColor = "var(--border2)")}
                />
                {nameError && <span style={{ fontSize: "0.78em", color: "var(--red)" }}>{nameError}</span>}
                <div style={{ display: "flex", gap: "8px" }}>
                  <button onClick={saveName} disabled={saving} style={{ padding: "6px 16px", borderRadius: "6px", background: "#238636", color: "#fff", border: "none", cursor: saving ? "not-allowed" : "pointer", fontSize: "0.85em", opacity: saving ? 0.6 : 1 }}>
                    {saving ? "Saving..." : "Save"}
                  </button>
                  <button onClick={() => { setEditing(false); setNameInput(user?.name || ""); setNameError(""); }} style={{ padding: "6px 16px", borderRadius: "6px", background: "transparent", border: "1px solid var(--border2)", color: "var(--muted)", cursor: "pointer", fontSize: "0.85em" }}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flex: 1, marginLeft: "16px" }}>
                <span style={{ fontSize: "0.88em", color: "var(--text2)" }}>{user?.name || "—"}</span>
                <button onClick={() => { setNameInput(user?.name || ""); setEditing(true); }} style={{ background: "none", border: "none", color: "var(--accent)", fontSize: "0.82em", cursor: "pointer", fontFamily: "var(--font)" }}>Edit</button>
              </div>
            )}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.88em", color: "var(--muted)" }}>Email</span>
            <span style={{ fontSize: "0.88em", color: "var(--text2)" }}>{email || "—"}</span>
          </div>
        </div>
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
