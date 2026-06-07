import { useState } from "react";
import { useUser } from "../context/UserContext";

const ALL_SKILLS = [
  { key: 'chart_reading',        label: 'Chart Reading',        desc: 'Key levels, trend structure, setup validity' },
  { key: 'entry_timing',         label: 'Entry Timing',         desc: 'Precision and confirmation of entries' },
  { key: 'risk_sizing',          label: 'Risk & Sizing',        desc: 'Position sizing, stop adherence' },
  { key: 'setup_selection',      label: 'Setup Selection',      desc: 'Avoiding low-quality setups' },
  { key: 'trade_management',     label: 'Trade Management',     desc: 'Holding through noise, managing exits' },
  { key: 'emotional_discipline', label: 'Emotional Discipline', desc: 'FOMO, revenge trading, execution' },
  { key: 'technical_indicators', label: 'Technical Indicators', desc: 'RSI, MACD, Bollinger Bands, VWAP, OBV' },
  { key: 'market_internals',     label: 'Market Internals',     desc: 'Breadth, VIX, sector rotation, follow-through' },
  { key: 'short_selling',        label: 'Short Selling',        desc: 'Failed breakouts, H&S tops, covering rules' },
  { key: 'gap_trading',          label: 'Gap Trading',          desc: 'Gap types, fill probability, earnings gaps' },
]

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
  const [selectedSkills, setSelectedSkills] = useState(user?.active_skills ?? []);
  const [skillsSaving, setSkillsSaving] = useState(false);
  const [skillsError, setSkillsError] = useState("");
  const [skillsSaved, setSkillsSaved] = useState(false);

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

  async function saveSkills() {
    if (selectedSkills.length < 2) {
      setSkillsError("Select at least 2 skills");
      return;
    }
    setSkillsSaving(true);
    setSkillsError("");
    setSkillsSaved(false);
    try {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ active_skills: selectedSkills }),
      });
      if (!res.ok) { setSkillsError("Failed to save skills"); return; }
      await refreshUser();
      setSkillsSaved(true);
    } finally {
      setSkillsSaving(false);
    }
  }

  function toggleSkill(key) {
    setSkillsSaved(false);
    setSelectedSkills(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
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

      {/* Skills */}
      <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "10px", padding: "20px", display: "flex", flexDirection: "column", gap: "12px" }}>
        <h3 style={{ fontSize: "0.85em", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Active Skills</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {ALL_SKILLS.map(s => (
            <button
              key={s.key}
              onClick={() => toggleSkill(s.key)}
              style={{
                display: "flex", alignItems: "center", gap: "12px",
                padding: "10px 14px", borderRadius: "8px",
                border: `2px solid ${selectedSkills.includes(s.key) ? "var(--accent)" : "var(--border2)"}`,
                background: selectedSkills.includes(s.key) ? "var(--surface2)" : "transparent",
                color: "var(--text)", cursor: "pointer", textAlign: "left",
                fontFamily: "var(--font)",
              }}
            >
              <span style={{ fontSize: "0.88em", fontWeight: 600 }}>{s.label}</span>
              <span style={{ fontSize: "0.78em", color: "var(--muted)" }}>{s.desc}</span>
            </button>
          ))}
        </div>
        {skillsError && <p style={{ color: "var(--red)", fontSize: "0.82em", margin: 0 }}>{skillsError}</p>}
        {skillsSaved && <p style={{ color: "var(--green)", fontSize: "0.82em", margin: 0 }}>Skills saved.</p>}
        <button
          onClick={saveSkills}
          disabled={skillsSaving}
          style={{
            padding: "8px 20px", borderRadius: "8px", width: "fit-content",
            background: "var(--accent)", color: "#fff", border: "none",
            cursor: skillsSaving ? "not-allowed" : "pointer",
            fontFamily: "var(--font)", fontSize: "0.88em", opacity: skillsSaving ? 0.6 : 1,
          }}
        >
          {skillsSaving ? "Saving…" : "Save skills"}
        </button>
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
