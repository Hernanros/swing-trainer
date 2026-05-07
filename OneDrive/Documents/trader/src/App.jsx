import { useState, useEffect, useRef, useMemo, useCallback } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────
const EMOTION_OPTIONS = ["Calm", "Confident", "Stressed", "Greedy", "Fearful", "Focused", "Rushed", "Patient"];
const SETUP_TYPES = ["Breakout", "Pullback", "Reversal", "Trend Follow", "Support/Resistance", "Gap Fill", "VWAP Bounce", "Range", "Other"];
const TIMEFRAMES = ["1D", "4H", "1H", "30M", "15M"];
const MARKET_TYPES = ["Stock", "Index", "ETF", "Crypto"];
const MARKET_TRENDS = ["Strong Uptrend", "Uptrend", "Sideways", "Downtrend", "Strong Downtrend", "Volatile"];
const JOURNAL_QUESTIONS = [
  { pre: true,  label: "📸 Why is this a valid setup?",        key: "whyValid" },
  { pre: true,  label: "📋 Trade plan (entry/target/stop)?",  key: "planDetails" },
  { pre: false, label: "✅ Was the plan executed?",            key: "planExecuted" },
  { pre: false, label: "🔩 Was the stop structural?",         key: "structuralStop" },
  { pre: false, label: "🔄 What would I do differently?",     key: "whatElse" },
];
const DISCIPLINE_CRITERIA = [
  "Entered exactly as planned",
  "Stop loss was defined before entry",
  "Position size calculated by risk management",
  "Did not move stop against the position",
  "Exited according to plan (not early/late)",
];

// ─── Morning session steps ────────────────────────────────────────────────────
const MORNING_STEPS = [
  {
    id: "context", time: "0–3 min", icon: "🌍", title: "Market Context",
    prompt: "Check QQQ Daily + VIX and note:",
    fields: [
      { key: "qqq", label: "QQQ — trend and position vs 20MA", placeholder: "e.g. Uptrend, pullback to 20MA" },
      { key: "vix", label: "VIX — level and trend", placeholder: "e.g. 17, flat = favorable environment" },
      { key: "marketNote", label: "One-line summary", placeholder: "e.g. Favorable for swing Long today" },
    ],
  },
  {
    id: "scan", time: "3–10 min", icon: "🔍", title: "Watchlist Scan",
    prompt: "Go through each watchlist stock — 60 seconds each. Pass = 3/3:",
    criteria: ["Clear upward structure?", "Sitting on support zone?", "Potential R:R ≥ 1:2?"],
  },
  {
    id: "setup", time: "10–17 min", icon: "📐", title: "Setup Builder",
    prompt: "Only a stock that passed — and only one. Fill 5 fields:",
    fields: [
      { key: "symbol", label: "Stock", placeholder: "AAPL" },
      { key: "entry", label: "Entry — where to enter?", placeholder: "Price + entry condition" },
      { key: "stop", label: "Structural stop — where are you wrong?", placeholder: "Price + structural reason" },
      { key: "target", label: "First target", placeholder: "Price + calculated R:R" },
      { key: "whyWorks", label: "Why does this work statistically?", placeholder: "If you can't articulate it — no trade" },
    ],
  },
  {
    id: "reflect", time: "17–20 min", icon: "✍️", title: "Reflection",
    prompt: "3 lines only — no more:",
    fields: [
      { key: "saw", label: "What did I see today?", placeholder: "Market structure, sectors, conditions" },
      { key: "missed", label: "What did I almost miss?", placeholder: "Stock I passed on — right/wrong?" },
      { key: "improve", label: "What to improve tomorrow?", placeholder: "One specific skill" },
    ],
  },
];

// ─── Drill questions per weekday ──────────────────────────────────────────────
const DRILL_BY_DAY = {
  0: { day: "Sunday", focus: "HH / HL Identification", questions: [
    "Mark the last Higher High on the chart — what confirms it's a HH and not just a high test?",
    "Is the last HL holding? What happens if it breaks?",
    "What is the primary trend based on HH/HL alone — no indicators?",
  ]},
  1: { day: "Monday", focus: "S/R Zones", questions: [
    "Mark 3 zones on the chart — not lines, zones. What confirms each?",
    "How many times did price react to the strongest zone you marked?",
    "Was the reaction sharp (one candle) or slow (chop)? What does that mean?",
  ]},
  2: { day: "Tuesday", focus: "Channels & Compression", questions: [
    "Is there compression before a breakout? What is tightening?",
    "What is the bias direction inside the compression — up or down?",
    "If you take the breakout — what stop and target make sense?",
  ]},
  3: { day: "Wednesday", focus: "Pullback vs Breakout", questions: [
    "The setup in front of you — Pullback or Breakout? What defines it?",
    "What is the ideal entry for the setup type you identified?",
    "Which typically gives you better R:R — and why?",
  ]},
  4: { day: "Thursday", focus: "R:R Only", questions: [
    "Calculate R:R for the setup — Entry, structural Stop, Target. What's the ratio?",
    "Is R:R ≥ 1:2? If not — the setup doesn't exist, move on.",
    "If R:R = 1:3 and your Win Rate is 40% — what is the Expectancy for this trade?",
  ]},
  5: { day: "Friday", focus: "Multi-Timeframe", questions: [
    "Check Daily then 4H — do they agree on direction?",
    "Is there a 4H support zone confirming the Daily entry?",
    "If 4H contradicts Daily — what do you do? (correct answer: SKIP)",
  ]},
  6: { day: "Saturday", focus: "Replay + Self-Review", questions: [
    "Pick a losing trade from the week — describe what would have been different with a pre-entry review.",
    "What psychological pattern repeated most this week?",
    "Rate yourself 1–10 on discipline this week — what would raise you 2 points?",
  ]},
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const riskPerShare = t => (t.entryPrice && t.stopLoss) ? Math.abs(t.entryPrice - t.stopLoss) : null;
const totalRisk    = t => { const r = riskPerShare(t); return r && t.shares ? r * t.shares : null; };
const calcPnL      = t => (t.entryPrice && t.exitPrice && t.shares)
  ? (t.direction === "Long" ? t.exitPrice - t.entryPrice : t.entryPrice - t.exitPrice) * t.shares : null;
const calcRM       = t => { const p = calcPnL(t); const r = totalRisk(t); return p !== null && r ? (p / r).toFixed(2) : null; };
const plannedRR    = t => { if (!t.entryPrice || !t.stopLoss || !t.target) return null; const risk = Math.abs(t.entryPrice - t.stopLoss); const rew = Math.abs(t.target - t.entryPrice); return risk ? (rew / risk).toFixed(2) : null; };
const discScore    = t => !t.disciplineChecks?.length ? null : Math.round(t.disciplineChecks.filter(Boolean).length / DISCIPLINE_CRITERIA.length * 100);
const winRate      = list => { const c = list.filter(t => t.status === "closed"); return !c.length ? 0 : ((c.filter(t => (calcPnL(t)||0) > 0).length / c.length) * 100).toFixed(1); };
const expectancy   = list => { const c = list.filter(t => t.status === "closed" && calcRM(t) !== null); return !c.length ? null : (c.reduce((s,t) => s + parseFloat(calcRM(t)), 0) / c.length).toFixed(2); };
const skillScore   = list => {
  const c = list.filter(t => t.status === "closed"); if (c.length < 3) return null;
  const wr = parseFloat(winRate(c)) / 100;
  const exp = parseFloat(expectancy(list) || 0);
  const discs = c.map(t => discScore(t)).filter(Boolean);
  const avgDisc = discs.length ? discs.reduce((a,b) => a+b,0) / discs.length / 100 : 0;
  return Math.min(Math.round((wr*0.3 + Math.max(exp+1,0)/4*0.4 + avgDisc*0.3)*100), 100);
};
const getSkillRank = s => {
  if (s === null) return { label: "Unrated", color: "#6b7280", emoji: "🌱" };
  if (s >= 80)    return { label: "מסחר מוכשר", color: "#f59e0b", emoji: "🏆" };
  if (s >= 65)    return { label: "Advanced",       color: "#10b981", emoji: "⚡" };
  if (s >= 50)    return { label: "Developing",       color: "#60a5fa", emoji: "📈" };
  if (s >= 35)    return { label: "Learner",        color: "#a78bfa", emoji: "📚" };
  return { label: "Beginner", color: "#6b7280", emoji: "🌱" };
};

// ─── Claude API ───────────────────────────────────────────────────────────────
const callClaude = async (messages, system, withSearch = false) => {
  const body = { model: "claude-sonnet-4-20250514", max_tokens: 1000, system, messages };
  if (withSearch) body.tools = [{ type: "web_search_20250305", name: "web_search" }];
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return data.content?.map(c => c.text || "").filter(Boolean).join("") || "Error";
};

// ─── SVG Equity Curve ─────────────────────────────────────────────────────────
function EquityCurve({ data }) {
  if (!data.length) return <div style={{ color: "#4b5563", fontSize: 13, padding: "30px", textAlign: "center" }}>No closed trades yet</div>;
  const W=560, H=130, P=28;
  const vals = data.map(d => d.equity);
  const min = Math.min(0,...vals), max = Math.max(0,...vals), range = max-min||1;
  const sx = i => P + (i/(data.length-1||1))*(W-P*2);
  const sy = v => H-P-((v-min)/range)*(H-P*2);
  const pts = data.map((d,i) => `${sx(i)},${sy(d.equity)}`).join(" ");
  const last = vals[vals.length-1]; const isUp = last >= 0;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width:"100%", height:130 }}>
      <defs><linearGradient id="ecg" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stopColor={isUp?"#10b981":"#ef4444"} stopOpacity="0.3"/>
        <stop offset="100%" stopColor={isUp?"#10b981":"#ef4444"} stopOpacity="0"/>
      </linearGradient></defs>
      <line x1={P} y1={sy(0)} x2={W-P} y2={sy(0)} stroke="#1f2937" strokeWidth="1" strokeDasharray="4,3"/>
      <polygon points={`${sx(0)},${sy(0)} ${pts} ${sx(data.length-1)},${sy(0)}`} fill="url(#ecg)"/>
      <polyline points={pts} fill="none" stroke={isUp?"#10b981":"#ef4444"} strokeWidth="2" strokeLinejoin="round"/>
      {[0,data.length-1].map(i=><circle key={i} cx={sx(i)} cy={sy(vals[i])} r="4" fill={isUp?"#10b981":"#ef4444"}/>)}
      <text x={P} y={H-4} fill="#4b5563" fontSize="10">{data[0]?.date}</text>
      <text x={W-P} y={H-4} fill="#4b5563" fontSize="10" textAnchor="end">{data[data.length-1]?.date}</text>
      <text x={W-P} y={sy(last)-6} fill={isUp?"#10b981":"#ef4444"} fontSize="11" textAnchor="end" fontWeight="600">{last>=0?"+":""}${last.toFixed(0)}</text>
    </svg>
  );
}

function SetupChart({ trades }) {
  const stats = {};
  trades.filter(t=>t.status==="closed"&&t.setup).forEach(t=>{
    if(!stats[t.setup]) stats[t.setup]={wins:0,count:0,rSum:0};
    stats[t.setup].count++; stats[t.setup].rSum+=parseFloat(calcRM(t)||0);
    if((calcPnL(t)||0)>0) stats[t.setup].wins++;
  });
  const entries=Object.entries(stats);
  if(!entries.length) return <div style={{color:"#4b5563",fontSize:13,textAlign:"center",padding:"16px 0"}}>אין נתונים</div>;
  return <div>{entries.sort((a,b)=>b[1].rSum-a[1].rSum).map(([setup,s])=>{
    const wr=(s.wins/s.count*100).toFixed(0); const avgR=(s.rSum/s.count).toFixed(2);
    return <div key={setup} style={{marginBottom:14}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:3,fontSize:13}}>
        <span style={{fontWeight:500}}>{setup}</span>
        <span style={{color:"#6b7280",fontSize:11}}>{s.count} · WR {wr}% · Avg {parseFloat(avgR)>=0?"+":""}{avgR}R</span>
      </div>
      <div style={{background:"#1f2937",borderRadius:4,height:5,overflow:"hidden"}}>
        <div style={{height:"100%",width:`${wr}%`,borderRadius:4,background:parseFloat(avgR)>=0?"linear-gradient(90deg,#1e6fff,#10b981)":"linear-gradient(90deg,#ef4444,#f97316)"}}/>
      </div>
    </div>;
  })}</div>;
}

// ─── Morning Session Component ────────────────────────────────────────────────
function MorningSession({ trades, watchlist, onClose, onSaveSetup }) {
  const [step, setStep] = useState(0);
  const [data, setData] = useState({});
  const [scanResults, setScanResults] = useState({});
  const [aiComment, setAiComment] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [done, setDone] = useState(false);

  const current = MORNING_STEPS[step];

  const getAiFeedback = async () => {
    setAiLoading(true);
    const stepData = current.id === "scan" ? scanResults : (data[current.id] || {});
    const ctx = `נתוני טריידר: WR ${winRate(trades)}%, Expectancy ${expectancy(trades)||"—"}R, ${trades.length} עסקאות.`;
    const prompt = `שלב: ${current.title}\nנתונים שהוזנו: ${JSON.stringify(stepData)}\n\n${ctx}\n\nתן פידבק קצר (2-3 משפטים): האם הניתוח נכון? מה חסר? מה כדאי לשים לב אליו? היה ספציפי וישיר.`;
    const reply = await callClaude([{ role:"user", content:prompt }],
      "אתה מאמן סווינג טריידינג מקצועי. עברית בלבד. קצר, ישיר, ספציפי. לא מחמיא על הבנות."
    );
    setAiComment(reply);
    setAiLoading(false);
  };

  const nextStep = () => {
    if (step < MORNING_STEPS.length - 1) { setStep(s=>s+1); setAiComment(""); }
    else setDone(true);
  };

  const setField = (stepId, key, val) => setData(d => ({ ...d, [stepId]: { ...(d[stepId]||{}), [key]: val } }));

  if (done) {
    const setupData = data["setup"];
    return (
      <div style={{ padding: "24px 0" }}>
        <div style={{ textAlign:"center", marginBottom:24 }}>
          <div style={{ fontSize:40, marginBottom:8 }}>✅</div>
          <div style={{ fontSize:18, fontWeight:700, marginBottom:4 }}>שגרת הבוקר הושלמה</div>
          <div style={{ fontSize:13, color:"#6b7280" }}>20 דקות. בוצע.</div>
        </div>
        {setupData?.symbol && (
          <div style={{ background:"#111827", border:"1px solid #1f2937", borderRadius:12, padding:16, marginBottom:16 }}>
            <div style={{ fontSize:11, color:"#4b5563", textTransform:"uppercase", letterSpacing:"1px", marginBottom:8 }}>סטאפ שזוהה היום</div>
            <div style={{ fontFamily:"monospace", fontWeight:700, fontSize:18, marginBottom:6 }}>{setupData.symbol}</div>
            {["entry","stop","target","whyWorks"].map(k => setupData[k] && (
              <div key={k} style={{ fontSize:12, color:"#9ca3af", marginBottom:3 }}>
                <span style={{ color:"#4b5563" }}>{k === "entry" ? "Entry" : k === "stop" ? "Stop" : k === "target" ? "Target" : "Why it works"}: </span>
                {setupData[k]}
              </div>
            ))}
            <button className="bp" style={{ marginTop:12, width:"100%" }} onClick={() => { onSaveSetup(setupData); onClose(); }}>
              + שמור כעסקה ביומן
            </button>
          </div>
        )}
        {!setupData?.symbol && (
          <div style={{ background:"#0f2a0f", border:"1px solid #10b981", borderRadius:10, padding:14, textAlign:"center", marginBottom:16 }}>
            <div style={{ fontSize:16, marginBottom:4 }}>🎯</div>
            <div style={{ fontSize:13, color:"#4ade80", fontWeight:600 }}>No setup today — זה ניצחון</div>
            <div style={{ fontSize:12, color:"#6b7280", marginTop:4 }}>משמעת > אקשן</div>
          </div>
        )}
        <div style={{ background:"#0f172a", borderRadius:10, padding:14, marginBottom:16 }}>
          <div style={{ fontSize:11, color:"#4b5563", marginBottom:8, textTransform:"uppercase", letterSpacing:"1px" }}>רפלקציה</div>
          {["saw","missed","improve"].map((k,i) => data["reflect"]?.[k] && (
            <div key={k} style={{ fontSize:12, color:"#d1d5db", marginBottom:6 }}>
              <span style={{ color:"#6b7280" }}>{["Saw","Almost missed","Improve"][i]}: </span>
              {data["reflect"][k]}
            </div>
          ))}
        </div>
        <button className="bg" style={{ width:"100%" }} onClick={onClose}>סגור</button>
      </div>
    );
  }

  return (
    <div>
      {/* Progress bar */}
      <div style={{ display:"flex", gap:6, marginBottom:20 }}>
        {MORNING_STEPS.map((s,i) => (
          <div key={s.id} style={{ flex:1, height:3, borderRadius:2, background: i <= step ? "#1e6fff" : "#1f2937", transition:"background .3s" }}/>
        ))}
      </div>

      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
        <div style={{ width:36, height:36, background:"#1e3a5f", borderRadius:9, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>{current.icon}</div>
        <div>
          <div style={{ fontSize:15, fontWeight:700 }}>{current.title}</div>
          <div style={{ fontSize:11, color:"#1e6fff" }}>⏱ {current.time}</div>
        </div>
        <div style={{ marginRight:"auto", fontSize:11, color:"#4b5563" }}>{step+1} / {MORNING_STEPS.length}</div>
      </div>

      <div style={{ fontSize:13, color:"#9ca3af", marginBottom:14 }}>{current.prompt}</div>

      {/* Scan step — special UI */}
      {current.id === "scan" && (
        <div>
          {watchlist.length === 0 && <div style={{ color:"#4b5563", fontSize:13 }}>Watchlist is empty — add stocks first</div>}
          {watchlist.map(stock => (
            <div key={stock.symbol} style={{ background:"#0f172a", border:"1px solid #1f2937", borderRadius:9, padding:"12px 14px", marginBottom:8 }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
                <span style={{ fontFamily:"monospace", fontWeight:700, fontSize:15 }}>{stock.symbol}</span>
                <span style={{ fontSize:11, color:"#6b7280" }}>{stock.name}</span>
              </div>
              <div style={{ display:"flex", gap:6 }}>
                {current.criteria.map((c,i) => {
                  const val = scanResults[stock.symbol]?.[i];
                  return (
                    <button key={i} onClick={() => setScanResults(r => ({ ...r, [stock.symbol]: { ...(r[stock.symbol]||{}), [i]: val === true ? false : val === false ? null : true }}))}
                      style={{ flex:1, padding:"5px 4px", borderRadius:6, fontSize:10, cursor:"pointer", border:"1px solid",
                        background: val === true ? "#0f2a0f" : val === false ? "#2d1515" : "#111827",
                        borderColor: val === true ? "#10b981" : val === false ? "#ef4444" : "#1f2937",
                        color: val === true ? "#4ade80" : val === false ? "#f87171" : "#6b7280",
                      }}>
                      {val === true ? "✓ " : val === false ? "✗ " : ""}{c}
                    </button>
                  );
                })}
              </div>
              {current.criteria.every((_, i) => scanResults[stock.symbol]?.[i] === true) && (
                <div style={{ marginTop:7, fontSize:11, color:"#10b981", fontWeight:600 }}>✅ PASS — שקול לבנות סטאפ</div>
              )}
              {current.criteria.some((_, i) => scanResults[stock.symbol]?.[i] === false) && (
                <div style={{ marginTop:7, fontSize:11, color:"#ef4444" }}>✗ FAIL</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Regular fields */}
      {current.fields && current.fields.map(f => (
        <div key={f.key} style={{ marginBottom:12 }}>
          <div style={{ fontSize:11, color:"#9ca3af", marginBottom:4 }}>{f.label}</div>
          <textarea className="inp" rows={f.key === "whyWorks" ? 3 : 2}
            placeholder={f.placeholder}
            value={data[current.id]?.[f.key] || ""}
            onChange={e => setField(current.id, f.key, e.target.value)}/>
        </div>
      ))}

      {/* AI feedback */}
      {aiComment && (
        <div style={{ background:"#0d1f3c", border:"1px solid #1e3a5f", borderRadius:9, padding:12, marginBottom:14 }}>
          <div style={{ fontSize:10, color:"#1e6fff", marginBottom:5, textTransform:"uppercase", letterSpacing:"1px" }}>💬 פידבק מהמאמן</div>
          <div style={{ fontSize:13, color:"#d1d5db", lineHeight:1.65, whiteSpace:"pre-wrap" }}>{aiComment}</div>
        </div>
      )}

      <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:16 }}>
        <button className="bg" onClick={getAiFeedback} disabled={aiLoading}>
          {aiLoading ? <span className="dots"><span>●</span><span>●</span><span>●</span></span> : "💬 Get Feedback"}
        </button>
        <button className="bp" onClick={nextStep}>
          {step < MORNING_STEPS.length - 1 ? "Next ←" : "Finish ✓"}
        </button>
      </div>
    </div>
  );
}

// ─── Dry Training Component (with chart support) ─────────────────────────────
const DRILL_MODES = [
  { id:"chart", icon:"📊", label:"אימון על גרף", desc:"העלה גרף — המאמן ישאל שאלות ספציפיות עליו" },
  { id:"daily", icon:"📅", label:"Daily Drill", desc:"Structured questions by day of week" },
];

const SESSION_SKILLS = [
  { id:"trend",  label:"מגמה / HH-HL",        prompt:"זהה את המגמה הראשית, HH/HL, ונקודת ה-Break of Structure האחרונה. מה מגמת המבנה?" },
  { id:"sr",     label:"S/R Zones",              prompt:"Mark the 3 most important zones. What confirms each? How many times did price react?" },
  { id:"entry",  label:"Entry / Stop / Target", prompt:"תאר את נקודת הכניסה האידיאלית, ה-Stop המבני, וה-Target הראשון. חשב R:R." },
  { id:"rr",     label:"R:R ועיתוי",           prompt:"האם R:R ≥ 1:2? מה הסיכון המרבי? האם זה הזמן הנכון לכניסה או כדאי לחכות?" },
  { id:"psych",  label:"Psychology",             prompt:"What emotion does this chart trigger? FOMO? Fear? Confidence? Does that emotion match the data?" },
];

function DryTraining({ trades }) {
  const today = new Date().getDay();
  const drill = DRILL_BY_DAY[today];

  // Mode: "select" | "chart" | "daily"
  const [mode, setMode] = useState("select");

  // ── Chart mode state ──
  const [chartImg, setChartImg] = useState(null);       // base64 of uploaded image
  const [chartUrl, setChartUrl] = useState("");          // URL input
  const [chartUrlInput, setChartUrlInput] = useState(""); // raw input
  const [chartLoading, setChartLoading] = useState(false);
  const [sessionMsgs, setSessionMsgs] = useState([]);    // chat history with the coach
  const [sessionInput, setSessionInput] = useState("");
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionSkill, setSessionSkill] = useState(null); // selected skill focus
  const [sessionScore, setSessionScore] = useState(null); // end-of-session score
  const [askingScore, setAskingScore] = useState(false);
  const [symbol, setSymbol] = useState("");
  const [timeframe, setTimeframe] = useState("1D");
  const fileInputRef = useRef(null);
  const chatEndRef = useRef(null);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior:"smooth" }); }, [sessionMsgs]);

  // ── Daily drill state ──
  const [qIndex, setQIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);

  // ── Image upload handler ──
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setChartImg(ev.target.result); // full data URL: "data:image/png;base64,..."
      setChartUrl(""); setChartUrlInput("");
    };
    reader.readAsDataURL(file);
  };

  // Build Claude message content with image
  const buildImageContent = (text, imgData, imgUrl) => {
    const parts = [];
    if (imgData) {
      // imgData is a full data URL
      const [header, b64] = imgData.split(",");
      const mediaType = header.match(/:(.*?);/)?.[1] || "image/png";
      parts.push({ type:"image", source:{ type:"base64", media_type:mediaType, data:b64 } });
    } else if (imgUrl) {
      parts.push({ type:"image", source:{ type:"url", url:imgUrl } });
    }
    parts.push({ type:"text", text });
    return parts;
  };

  // ── Start chart session ──
  const startChartSession = async (skill) => {
    if (!chartImg && !chartUrl) return;
    setSessionSkill(skill);
    setSessionLoading(true);
    setSessionMsgs([]);

    const ctx = `נתוני טריידר: WR ${winRate(trades)}%, Expectancy ${expectancy(trades)||"—"}R, ${trades.length} עסקאות.`;
    const symbolStr = symbol ? `מניה: ${symbol.toUpperCase()} | Timeframe: ${timeframe}` : `Timeframe: ${timeframe}`;
    const initPrompt = `${symbolStr}\n${ctx}\n\nאני שולח לך גרף לאימון יבש. פוקוס המפגש: ${skill.label}.\n\nהתחל: ${skill.prompt}\n\nחשוב: שאל שאלה אחת בלבד. המתן לתשובה. אחרי התשובה — תן פידבק קצר ושאל את השאלה הבאה. מנהל session של 3–5 שאלות על הגרף הזה.`;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          model:"claude-sonnet-4-20250514", max_tokens:600,
          system:`אתה מאמן סווינג טריידינג מקצועי. מנהל session אימון על גרף. עברית בלבד. שאל שאלה אחת בכל פעם. קצר וממוקד. אחרי 3-5 שאלות תן ציון session (מבנה/ניתוח/R:R — כל אחד מ-10).`,
          messages:[{ role:"user", content: buildImageContent(initPrompt, chartImg, chartUrl) }],
        }),
      });
      const data = await res.json();
      const reply = data.content?.map(c=>c.text||"").join("") || "Error";
      setSessionMsgs([
        { role:"user",      content:"[גרף הועלה]", isChart:true },
        { role:"assistant", content:reply },
      ]);
    } catch { setSessionMsgs([{ role:"assistant", content:"שגיאה בטעינת הגרף. נסה שנית." }]); }
    setSessionLoading(false);
  };

  // ── Continue chart session ──
  const sendSessionMsg = async () => {
    if (!sessionInput.trim() || sessionLoading) return;
    const userMsg = sessionInput.trim(); setSessionInput("");
    const newMsgs = [...sessionMsgs, { role:"user", content:userMsg }];
    setSessionMsgs(newMsgs); setSessionLoading(true);

    // Build the API messages — first user msg contains the image
    const apiMsgs = newMsgs.map((m, idx) => {
      if (idx === 0 && (chartImg || chartUrl)) {
        return { role:"user", content: buildImageContent("[גרף לאימון]", chartImg, chartUrl) };
      }
      return { role: m.role, content: m.content };
    });

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          model:"claude-sonnet-4-20250514", max_tokens:600,
          system:`אתה מאמן סווינג טריידינג. מנהל session אימון על גרף. עברית בלבד. שאל שאלה אחת בכל פעם. אחרי 3-5 שאלות — תן ציון session בפורמט: 🏆 ציון session:\n📐 מבנה: X/10\n🔍 ניתוח: X/10\n📊 R:R: X/10\n💡 משוב: [משפט אחד]`,
          messages: apiMsgs,
        }),
      });
      const data = await res.json();
      const reply = data.content?.map(c=>c.text||"").join("") || "Error";
      setSessionMsgs(p => [...p, { role:"assistant", content:reply }]);
      // Detect if score was given
      if (reply.includes("ציון session")) setSessionScore(reply);
    } catch { setSessionMsgs(p => [...p, { role:"assistant", content:"שגיאה. נסה שנית." }]); }
    setSessionLoading(false);
  };

  // ── Daily drill handlers ──
  const getFeedback = async () => {
    if (!answer.trim()) return;
    setLoading(true);
    const ctx = `נתוני טריידר: ${trades.length} עסקאות, WR ${winRate(trades)}%, Expectancy ${expectancy(trades)||"—"}R`;
    const q = drill.questions[qIndex];
    const reply = await callClaude(
      [{ role:"user", content:`שאלת אימון: ${q}\nתשובת הטריידר: ${answer}\n\n${ctx}` }],
      `אתה מאמן סווינג טריידינג. ענה בעברית. הפורמט:\n✅ מה נכון בתשובה\n⚠️ מה חסר או שגוי\n💡 הנחיה אחת לשיפור\nהיה ספציפי וקצר. לא יותר מ-5 שורות.`
    );
    setFeedback(reply);
    setHistory(h => [...h, { q, a:answer, fb:reply }]);
    setLoading(false);
  };

  const nextQ = () => {
    setAnswer(""); setFeedback("");
    setQIndex(i => (i < drill.questions.length-1 ? i+1 : 0));
  };

  const resetChart = () => {
    setChartImg(null); setChartUrl(""); setChartUrlInput("");
    setSessionMsgs([]); setSessionSkill(null); setSessionScore(null); setSymbol(""); setTimeframe("1D");
  };

  // ══ RENDER ══

  // Mode selector
  if (mode === "select") return (
    <div>
      <div style={{ marginBottom:18 }}>
        <div style={{ fontSize:15, fontWeight:700, marginBottom:4 }}>🏋️ אימון יבש</div>
        <div style={{ fontSize:13, color:"#6b7280" }}>בחר מצב אימון</div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:20 }}>
        {DRILL_MODES.map(m => (
          <div key={m.id} className="mode-card" onClick={() => setMode(m.id)}>
            <div style={{ fontSize:28, marginBottom:8 }}>{m.icon}</div>
            <div style={{ fontWeight:700, fontSize:14, marginBottom:4 }}>{m.label}</div>
            <div style={{ fontSize:12, color:"#6b7280", lineHeight:1.55 }}>{m.desc}</div>
            <div style={{ marginTop:10, fontSize:12, color:"#1e6fff", fontWeight:600 }}>התחל ←</div>
          </div>
        ))}
      </div>
      {/* Today's drill teaser */}
      <div style={{ background:"#0f172a", border:"1px solid #1f2937", borderRadius:9, padding:"12px 14px" }}>
        <div style={{ fontSize:11, color:"#4b5563", marginBottom:6, textTransform:"uppercase", letterSpacing:"1px" }}>Drill היום — {drill.day}</div>
        <div style={{ fontSize:13, fontWeight:600, color:"#60a5fa", marginBottom:4 }}>{drill.focus}</div>
        <div style={{ fontSize:12, color:"#9ca3af" }}>{drill.questions[0]}</div>
      </div>
    </div>
  );

  // Daily drill mode
  if (mode === "daily") return (
    <div>
      <button className="bg" style={{ marginBottom:16, fontSize:11 }} onClick={() => { setMode("select"); setAnswer(""); setFeedback(""); setQIndex(0); }}>← Back</button>
      <div style={{ background:"#111827", border:"1px solid #1f2937", borderRadius:10, padding:"12px 16px", marginBottom:16, display:"flex", alignItems:"center", gap:10 }}>
        <div style={{ fontSize:22 }}>📅</div>
        <div>
          <div style={{ fontWeight:600, fontSize:14 }}>Drill יומי — {drill.day}</div>
          <div style={{ fontSize:12, color:"#1e6fff" }}>{drill.focus}</div>
        </div>
        <div style={{ marginRight:"auto", fontSize:11, color:"#4b5563" }}>{qIndex+1}/{drill.questions.length}</div>
      </div>
      <div style={{ background:"#0d1f3c", border:"1px solid #1e3a5f", borderRadius:10, padding:16, marginBottom:14 }}>
        <div style={{ fontSize:11, color:"#4b5563", marginBottom:6, textTransform:"uppercase", letterSpacing:"1px" }}>שאלה</div>
        <div style={{ fontSize:15, fontWeight:500, lineHeight:1.65 }}>{drill.questions[qIndex]}</div>
      </div>
      <div style={{ marginBottom:14 }}>
        <div style={{ fontSize:11, color:"#9ca3af", marginBottom:4 }}>התשובה שלך</div>
        <textarea className="inp" rows={4} placeholder="ענה בצורה מפורטת — זה אימון, לא מבחן."
          value={answer} onChange={e => setAnswer(e.target.value)}/>
      </div>
      {feedback && (
        <div style={{ background:"#0f172a", border:"1px solid #1f2937", borderRadius:9, padding:14, marginBottom:14 }}>
          <div style={{ fontSize:10, color:"#a78bfa", marginBottom:6, textTransform:"uppercase", letterSpacing:"1px" }}>פידבק</div>
          <div style={{ fontSize:13, color:"#d1d5db", lineHeight:1.7, whiteSpace:"pre-wrap" }}>{feedback}</div>
        </div>
      )}
      <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
        <button className="bg" onClick={getFeedback} disabled={loading || !answer.trim()}>
          {loading ? <span className="dots"><span>●</span><span>●</span><span>●</span></span> : "💬 Get Feedback"}
        </button>
        {feedback && <button className="bp" onClick={nextQ}>שאלה הבאה →</button>}
      </div>
      {history.length > 0 && (
        <div style={{ borderTop:"1px solid #1f2937", paddingTop:14 }}>
          <div style={{ fontSize:11, color:"#4b5563", marginBottom:8, textTransform:"uppercase", letterSpacing:"1px" }}>היסטוריית session ({history.length})</div>
          {history.slice().reverse().map((h,i) => (
            <div key={i} style={{ background:"#0f172a", borderRadius:8, padding:10, marginBottom:7, fontSize:12 }}>
              <div style={{ color:"#9ca3af", marginBottom:2 }}>ש: {h.q.slice(0,70)}...</div>
              <div style={{ color:"#6b7280", fontStyle:"italic" }}>ת: {h.a.slice(0,60)}{h.a.length>60?"...":""}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // Chart training mode
  return (
    <div>
      <button className="bg" style={{ marginBottom:16, fontSize:11 }} onClick={() => { setMode("select"); resetChart(); }}>← Back</button>

      {/* Step 1: Upload chart */}
      {!chartImg && !chartUrl && (
        <div>
          <div style={{ fontSize:14, fontWeight:700, marginBottom:4 }}>📊 אימון על גרף</div>
          <div style={{ fontSize:12, color:"#6b7280", marginBottom:18 }}>העלה screenshot של גרף מ-TradingView — המאמן ינתח אותו וישאל שאלות ספציפיות</div>

          {/* Upload area */}
          <div onClick={() => fileInputRef.current?.click()}
            style={{ border:"2px dashed #1f2937", borderRadius:12, padding:"32px 20px", textAlign:"center", cursor:"pointer", marginBottom:16, transition:"all .2s" }}
            onMouseEnter={e=>{e.currentTarget.style.borderColor="#1e6fff";e.currentTarget.style.background="#0d1f3c";}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor="#1f2937";e.currentTarget.style.background="transparent";}}>
            <div style={{ fontSize:32, marginBottom:8 }}>📸</div>
            <div style={{ fontSize:14, fontWeight:600, marginBottom:4 }}>לחץ להעלאת Screenshot</div>
            <div style={{ fontSize:12, color:"#4b5563" }}>PNG / JPG / WebP — מ-TradingView או כל פלטפורמה</div>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display:"none" }} onChange={handleFileUpload}/>

          {/* OR URL */}
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
            <div style={{ flex:1, height:1, background:"#1f2937" }}/>
            <span style={{ fontSize:11, color:"#4b5563" }}>או הדבק URL</span>
            <div style={{ flex:1, height:1, background:"#1f2937" }}/>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <input className="inp" style={{ flex:1 }} placeholder="https://i.imgur.com/... או לינק ישיר לתמונה"
              value={chartUrlInput} onChange={e => setChartUrlInput(e.target.value)}/>
            <button className="bp" style={{ whiteSpace:"nowrap" }} onClick={() => { if(chartUrlInput.trim()) { setChartUrl(chartUrlInput.trim()); setChartImg(null); } }}>
              טען
            </button>
          </div>

          {/* Metadata */}
          <div className="g2" style={{ marginTop:16 }}>
            <div>
              <div style={{ fontSize:11, color:"#9ca3af", marginBottom:4 }}>סימול (אופציונלי)</div>
              <input className="inp" placeholder="AAPL" value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())}/>
            </div>
            <div>
              <div style={{ fontSize:11, color:"#9ca3af", marginBottom:4 }}>Timeframe</div>
              <select className="inp" value={timeframe} onChange={e => setTimeframe(e.target.value)}>
                {TIMEFRAMES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Choose skill focus */}
      {(chartImg || chartUrl) && !sessionSkill && (
        <div>
          {/* Chart preview */}
          <div style={{ marginBottom:14, borderRadius:10, overflow:"hidden", border:"1px solid #1f2937", position:"relative" }}>
            <img src={chartImg || chartUrl} alt="chart" style={{ width:"100%", maxHeight:260, objectFit:"contain", background:"#000", display:"block" }}/>
            <button onClick={resetChart} style={{ position:"absolute", top:8, left:8, background:"rgba(0,0,0,.7)", border:"1px solid #374151", borderRadius:6, color:"#9ca3af", padding:"3px 8px", cursor:"pointer", fontSize:11 }}>
              ✕ הסר
            </button>
            {symbol && <div style={{ position:"absolute", top:8, right:8, background:"rgba(0,0,0,.8)", borderRadius:6, padding:"3px 9px", fontSize:12, fontWeight:700, fontFamily:"monospace" }}>{symbol} · {timeframe}</div>}
          </div>

          <div style={{ fontSize:13, fontWeight:600, marginBottom:12 }}>בחר פוקוס אימון:</div>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {SESSION_SKILLS.map(skill => (
              <button key={skill.id} onClick={() => startChartSession(skill)}
                style={{ background:"#0f172a", border:"1px solid #1f2937", borderRadius:9, padding:"11px 14px", cursor:"pointer", textAlign:"right", transition:"all .2s" }}
                onMouseEnter={e=>{e.currentTarget.style.borderColor="#1e6fff";e.currentTarget.style.background="#0d1f3c";}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor="#1f2937";e.currentTarget.style.background="#0f172a";}}>
                <div style={{ fontWeight:600, fontSize:13, color:"#e8eaf0", marginBottom:2 }}>{skill.label}</div>
                <div style={{ fontSize:11, color:"#6b7280" }}>{skill.prompt.slice(0,60)}...</div>
              </button>
            ))}
          </div>
          {sessionLoading && (
            <div style={{ marginTop:16, textAlign:"center", color:"#6b7280", fontSize:13 }}>
              <span className="dots"><span>●</span><span>●</span><span>●</span></span> המאמן מנתח את הגרף...
            </div>
          )}
        </div>
      )}

      {/* Step 3: Active session */}
      {sessionSkill && sessionMsgs.length > 0 && (
        <div>
          {/* Chart thumb + skill badge */}
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14, padding:"10px 12px", background:"#0f172a", borderRadius:9, border:"1px solid #1f2937" }}>
            <img src={chartImg || chartUrl} alt="" style={{ width:60, height:38, objectFit:"cover", borderRadius:5 }}/>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:12, fontWeight:600 }}>{symbol || "Chart"} · {timeframe}</div>
              <div style={{ fontSize:11, color:"#1e6fff" }}>פוקוס: {sessionSkill.label}</div>
            </div>
            <button className="bg" style={{ fontSize:11 }} onClick={resetChart}>גרף חדש</button>
          </div>

          {/* Score banner if session complete */}
          {sessionScore && (
            <div style={{ background:"linear-gradient(135deg,#0f2a0f,#1a3a1a)", border:"1px solid #10b981", borderRadius:10, padding:14, marginBottom:14 }}>
              <div style={{ fontSize:11, color:"#4ade80", fontWeight:700, marginBottom:6, textTransform:"uppercase", letterSpacing:"1px" }}>🏆 Session הסתיים</div>
              <div style={{ fontSize:13, color:"#d1d5db", whiteSpace:"pre-wrap", lineHeight:1.7 }}>{sessionScore}</div>
            </div>
          )}

          {/* Chat */}
          <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:14, maxHeight:340, overflowY:"auto", padding:"4px 0" }}>
            {sessionMsgs.map((m, i) => (
              <div key={i} className={m.role==="user" ? "cbu" : "cba"} style={{ maxWidth:"88%" }}>
                {m.isChart ? (
                  <span style={{ fontSize:12, color:"#60a5fa" }}>📊 גרף הועלה — session החל</span>
                ) : m.content}
              </div>
            ))}
            {sessionLoading && <div className="cba"><span className="dots"><span>●</span><span>●</span><span>●</span></span></div>}
            <div ref={chatEndRef}/>
          </div>

          {/* Quick answer chips */}
          {!sessionScore && (
            <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:8 }}>
              {["אני רואה uptrend עם HH/HL ברור","המחיר יושב על אזור תמיכה","R:R לא מספיק, הסטופ רחוק מדי","אני לא בטוח בכיוון","המבנה לא ברור דיו"].map(c => (
                <button key={c} className="bg" style={{ fontSize:11, padding:"4px 9px" }} onClick={() => setSessionInput(c)}>{c}</button>
              ))}
            </div>
          )}

          <div style={{ display:"flex", gap:7 }}>
            <textarea className="inp" style={{ flex:1, resize:"none", height:48, paddingTop:12 }}
              placeholder={sessionScore ? "session הסתיים — לחץ 'גרף חדש' לסשן נוסף" : "ענה למאמן..."}
              value={sessionInput} disabled={!!sessionScore}
              onChange={e => setSessionInput(e.target.value)}
              onKeyDown={e => { if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendSessionMsg();} }}/>
            <button className="bp" style={{ height:48, padding:"0 16px" }} onClick={sendSessionMsg} disabled={sessionLoading||!!sessionScore||!sessionInput.trim()}>↑</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Setup Scanner Component ──────────────────────────────────────────────────
function SetupScanner({ watchlist, trades }) {
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);

  const analyzeSetup = async () => {
    if (!symbol.trim()) return;
    setLoading(true); setAnalysis(null);
    const ctx = `נתוני טריידר: WR ${winRate(trades)}%, Expectancy ${expectancy(trades)||"—"}R. ${trades.length} עסקאות.`;
    const prompt = `סטאפ לניתוח:\nמניה: ${symbol.toUpperCase()}\nתיאור: ${description || "לא סופק"}\n${ctx}\n\nנתח את הסטאפ לפי הפורמט הבא בדיוק:\n\n**הגדרת הסטאפ:**\n[סוג הסטאפ וההגדרה שלו]\n\n**חוזקות:**\n[מה עובד לטובתך]\n\n**סיכונים:**\n[מה יכול להרוס את הסטאפ]\n\n**Entry:**\n[איפה וכיצד]\n\n**Stop מבני:**\n[איפה ולמה שם]\n\n**Target ראשון:**\n[מחיר/רמה + R:R משוער]\n\n**ציון הגדרה (1–10):**\n[ציון + נימוק]\n\n**שורת סיכום:**\n[האם הסטאפ ראוי לכניסה? כן/לא/ממתין — ולמה]`;
    const reply = await callClaude([{ role:"user", content:prompt }],
      "אתה מאמן סווינג טריידינג בכיר. עברית בלבד. מאוד ספציפי וממוקד. מבין TA לעומק. אין אחיזת עיניים."
    );
    setAnalysis({ symbol: symbol.toUpperCase(), text: reply });
    setLoading(false);
  };

  return (
    <div>
      <div style={{ background:"#111827", border:"1px solid #1f2937", borderRadius:10, padding:14, marginBottom:16 }}>
        <div style={{ fontSize:11, color:"#4b5563", marginBottom:10, textTransform:"uppercase", letterSpacing:"1px" }}>🔍 ניתוח סטאפ</div>
        <div className="g2">
          <div>
            <div style={{ fontSize:11, color:"#9ca3af", marginBottom:4 }}>סימול</div>
            <input className="inp" placeholder="AAPL" value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())}/>
          </div>
          <div style={{ display:"flex", alignItems:"flex-end" }}>
            <button className="bp" style={{ width:"100%" }} onClick={analyzeSetup} disabled={loading||!symbol.trim()}>
              {loading ? <span className="dots"><span>●</span><span>●</span><span>●</span></span> : "Analyze Setup"}
            </button>
          </div>
        </div>
        <div style={{ marginTop:10 }}>
          <div style={{ fontSize:11, color:"#9ca3af", marginBottom:4 }}>תאר את מה שאתה רואה בגרף (אופציונלי)</div>
          <textarea className="inp" rows={3} placeholder="למשל: Pullback ל-20MA לאחר breakout מתעלה, נפח יורד, מבנה HH/HL ב-Daily..." value={description} onChange={e => setDescription(e.target.value)}/>
        </div>
      </div>

      {/* Quick scan from watchlist */}
      {watchlist.length > 0 && (
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:11, color:"#4b5563", marginBottom:8, textTransform:"uppercase", letterSpacing:"1px" }}>מהווטצ'ליסט שלך</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
            {watchlist.map(s => (
              <button key={s.symbol} className="bg" style={{ fontSize:12 }} onClick={() => setSymbol(s.symbol)}>
                {s.symbol}
              </button>
            ))}
          </div>
        </div>
      )}

      {analysis && (
        <div style={{ background:"#0d1526", border:"1px solid #1e3a5f", borderRadius:12, padding:18 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
            <span style={{ fontFamily:"monospace", fontWeight:700, fontSize:18, color:"#60a5fa" }}>{analysis.symbol}</span>
            <span style={{ fontSize:11, color:"#4b5563" }}>ניתוח סטאפ</span>
          </div>
          <div style={{ fontSize:13, color:"#d1d5db", lineHeight:1.75, whiteSpace:"pre-wrap" }}>{analysis.text}</div>
        </div>
      )}
    </div>
  );
}

// ─── Trade Debrief Component ──────────────────────────────────────────────────
function TradeDebrief({ trades, onOpenNewTrade }) {
  const [selectedId, setSelectedId] = useState(null);
  const [debrief, setDebrief] = useState(null);
  const [loading, setLoading] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMsgs, setChatMsgs] = useState([]);
  const [chatLoad, setChatLoad] = useState(false);
  const chatEnd = useRef(null);
  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior:"smooth" }); }, [chatMsgs]);

  const closedTrades = trades.filter(t => t.status === "closed");
  const selectedTrade = trades.find(t => t.id === selectedId);

  const runDebrief = async () => {
    if (!selectedTrade) return;
    setLoading(true); setDebrief(null); setChatMsgs([]);
    const pnl = calcPnL(selectedTrade);
    const rm = calcRM(selectedTrade);
    const ds = discScore(selectedTrade);
    const tradeStr = `
מניה: ${selectedTrade.symbol} | כיוון: ${selectedTrade.direction} | תאריך: ${selectedTrade.date}
Setup: ${selectedTrade.setup} | Timeframe: ${selectedTrade.timeframe} | Market Trend: ${selectedTrade.marketTrend}
Entry: $${selectedTrade.entryPrice} | Stop: $${selectedTrade.stopLoss} | Target: $${selectedTrade.target} | Exit: $${selectedTrade.exitPrice||"—"}
P&L: ${pnl !== null ? `$${pnl.toFixed(2)}` : "—"} | R Actual: ${rm !== null ? `${rm}R` : "—"} | Planned R:R: 1:${plannedRR(selectedTrade)||"—"}
Risk/Share: $${riskPerShare(selectedTrade)?.toFixed(2)||"—"} | Total Risk: $${totalRisk(selectedTrade)?.toFixed(2)||"—"}
Discipline score: ${ds !== null ? `${ds}%` : "—"}
Entry emotion: ${selectedTrade.entryEmotion||"not recorded"} | Exit emotion: ${selectedTrade.exitEmotion||"not recorded"}
${Object.entries(selectedTrade.journalAnswers||{}).map(([k,v])=>`${k}: ${v}`).join("\n")}
    `.trim();

    const reply = await callClaude(
      [{ role:"user", content:`תחקר את העסקה הבאה לעומק:\n\n${tradeStr}\n\nהפורמט:\n\n**תמונת כלל:**\n[מה קרה בעסקה הזו בהיבט גבוה]\n\n**הביצוע:**\n✅ מה עבד\n⚠️ מה לא עבד\n\n**ניהול הסיכון:**\n[האם Entry/Stop/Target היו הגיוניים מבנית?]\n\n**הפסיכולוגיה:**\n[מה הרגשות אומרים על ההחלטות?]\n\n**דפוס שחוזר?**\n[האם זה נראה כמו משהו שאתה עושה שוב ושוב?]\n\n**תרגיל לשבוע הבא:**\n[פעולה ספציפית אחת לשיפור]` }],
      "אתה מאמן סווינג טריידינג בכיר. עברית בלבד. תחקור אמיתי — לא מחמיא, לא מרושע. ספציפי לנתונים שלפניך."
    );
    setDebrief({ trade: selectedTrade, text: reply, tradeStr });
    setLoading(false);
  };

  const sendChat = async () => {
    if (!chatInput.trim() || !debrief) return;
    const userMsg = chatInput.trim(); setChatInput("");
    const updated = [...chatMsgs, { role:"user", content:userMsg }];
    setChatMsgs(updated); setChatLoad(true);
    const reply = await callClaude(
      [{ role:"user", content:`נתוני העסקה:\n${debrief.tradeStr}` }, { role:"assistant", content:debrief.text }, ...updated],
      "אתה מאמן סווינג טריידינג. תחקור עמוק של העסקה. עברית. ספציפי."
    );
    setChatMsgs(p => [...p, { role:"assistant", content:reply }]);
    setChatLoad(false);
  };

  return (
    <div>
      {closedTrades.length === 0 ? (
        <div style={{ textAlign:"center", padding:"40px 20px" }}>
          <div style={{ fontSize:32, marginBottom:10 }}>🔬</div>
          <div style={{ fontSize:15, fontWeight:600, marginBottom:6 }}>No closed trades to review</div>
          <div style={{ fontSize:13, color:"#6b7280", marginBottom:16 }}>Deep review available after closing trades</div>
          <button className="bp" onClick={onOpenNewTrade}>+ הוסף עסקה</button>
        </div>
      ) : (
        <>
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:11, color:"#4b5563", marginBottom:6, textTransform:"uppercase", letterSpacing:"1px" }}>בחר עסקה לתחקור</div>
            <div style={{ display:"flex", flexDirection:"column", gap:6, maxHeight:200, overflowY:"auto" }}>
              {closedTrades.map(t => {
                const pnl = calcPnL(t); const rm = calcRM(t);
                return (
                  <div key={t.id} onClick={() => { setSelectedId(t.id); setDebrief(null); setChatMsgs([]); }}
                    style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"9px 12px", borderRadius:8, cursor:"pointer",
                      background: selectedId === t.id ? "#1e3a5f" : "#0f172a",
                      border: `1px solid ${selectedId === t.id ? "#1e6fff" : "#1f2937"}` }}>
                    <div>
                      <span style={{ fontFamily:"monospace", fontWeight:700, marginLeft:8 }}>{t.symbol}</span>
                      <span className="tag">{t.setup}</span>
                      <span style={{ fontSize:11, color:"#6b7280" }}>{t.date}</span>
                    </div>
                    <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                      <span style={{ fontFamily:"monospace", fontSize:13, fontWeight:600, color: rm !== null ? (parseFloat(rm)>=0?"#10b981":"#ef4444") : "#4b5563" }}>
                        {rm !== null ? `${parseFloat(rm)>=0?"+":""}${rm}R` : "—"}
                      </span>
                      <span style={{ fontFamily:"monospace", fontSize:12, color: pnl !== null ? (pnl>=0?"#10b981":"#ef4444") : "#4b5563" }}>
                        {pnl !== null ? `${pnl>=0?"+":""}$${pnl.toFixed(0)}` : "—"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {selectedId && !debrief && (
            <button className="bp" style={{ width:"100%", marginBottom:14 }} onClick={runDebrief} disabled={loading}>
              {loading ? <span className="dots"><span>●</span><span>●</span><span>●</span></span> : "🔬 הפעל תחקור עמוק"}
            </button>
          )}

          {debrief && (
            <div>
              <div style={{ background:"#0d1526", border:"1px solid #1e3a5f", borderRadius:12, padding:16, marginBottom:14 }}>
                <div style={{ fontSize:10, color:"#1e6fff", marginBottom:8, textTransform:"uppercase", letterSpacing:"1px" }}>תחקור — {debrief.trade.symbol}</div>
                <div style={{ fontSize:13, color:"#d1d5db", lineHeight:1.75, whiteSpace:"pre-wrap" }}>{debrief.text}</div>
              </div>

              {/* Follow-up chat */}
              <div style={{ fontSize:11, color:"#4b5563", marginBottom:8, textTransform:"uppercase", letterSpacing:"1px" }}>💬 שאלות המשך</div>
              {chatMsgs.length > 0 && (
                <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:12, maxHeight:250, overflowY:"auto" }}>
                  {chatMsgs.map((m,i) => (
                    <div key={i} className={m.role==="user"?"cbu":"cba"}>{m.content}</div>
                  ))}
                  {chatLoad && <div className="cba"><div className="dots"><span>●</span><span>●</span><span>●</span></div></div>}
                  <div ref={chatEnd}/>
                </div>
              )}
              <div style={{ display:"flex", gap:6, marginBottom:8, flexWrap:"wrap" }}>
                {["למה הייתי צריך לחכות?","האם ה-Stop היה טוב?","מה הדפוס שחוזר?","תן לי תרגיל ספציפי"].map(p=>(
                  <button key={p} className="bg" style={{ fontSize:11 }} onClick={() => setChatInput(p)}>{p}</button>
                ))}
              </div>
              <div style={{ display:"flex", gap:7 }}>
                <textarea className="inp" style={{ flex:1, resize:"none", height:46, paddingTop:11 }}
                  placeholder="שאל שאלה על העסקה..."
                  value={chatInput} onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendChat();} }}/>
                <button className="bp" style={{ height:46, padding:"0 14px" }} onClick={sendChat} disabled={chatLoad}>↑</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Discord Queue Component ──────────────────────────────────────────────────

const DISCORD_URL = "http://localhost:7433";
const SCORE_COLOR = s => s >= 8 ? "#10b981" : s >= 6 ? "#60a5fa" : s >= 4 ? "#f59e0b" : "#6b7280";
const SETUP_COLORS = {
  "Breakout":     "#10b981",
  "Pullback":     "#60a5fa",
  "Reversal":     "#f59e0b",
  "Trend Follow": "#a78bfa",
  "S&R":          "#06b6d4",
};

function DiscordQueue({ onAddToWatchlist }) {
  const [agentOk,       setAgentOk]       = useState(null);
  const [setups,        setSetups]         = useState([]);
  const [loading,       setLoading]        = useState(false);
  const [scanning,      setScanning]       = useState(false);
  const [scanLog,       setScanLog]        = useState([]);
  const [filter,        setFilter]         = useState("all");
  const [expanded,      setExpanded]       = useState(null);
  const [config,        setConfig]         = useState(null);
  const [showConfig,    setShowConfig]     = useState(false);
  const [cfgForm,       setCfgForm]        = useState({});
  const [autoAdded,     setAutoAdded]      = useState([]);  // symbols auto-added this session
  const autoThreshold = config?.auto_watchlist_score ?? 8;

  // ── Check agent + start polling ──
  useEffect(() => {
    fetch(`${DISCORD_URL}/health`, { signal: AbortSignal.timeout(1500) })
      .then(r => r.json())
      .then(d => { setAgentOk(true); loadQueue(); loadConfig(); })
      .catch(() => setAgentOk(false));
  }, []);

  // ── Poll /watchlist every 30s to auto-add high-score setups ──
  useEffect(() => {
    if (!agentOk) return;
    const poll = async () => {
      try {
        const r = await fetch(`${DISCORD_URL}/watchlist`);
        const d = await r.json();
        if (d.watchlist?.length > 0) {
          d.watchlist.forEach(item => {
            onAddToWatchlist(item.symbol, item.symbol);
            setAutoAdded(p => [...p, { ...item, ts: new Date().toLocaleTimeString("he-IL") }]);
          });
        }
      } catch {}
    };
    poll();
    const id = setInterval(poll, 30000);
    return () => clearInterval(id);
  }, [agentOk]);

  const loadQueue = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${DISCORD_URL}/queue`);
      const d = await r.json();
      setSetups(d.setups || []);
      setScanLog(d.log   || []);
    } catch {}
    setLoading(false);
  };

  const loadConfig = async () => {
    try {
      const r = await fetch(`${DISCORD_URL}/config`);
      const d = await r.json();
      setConfig(d.config);
      setCfgForm(d.config);
    } catch {}
  };

  const triggerScan = async () => {
    setScanning(true);
    try {
      await fetch(`${DISCORD_URL}/scan`);
      // Poll for updates
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 3000));
        await loadQueue();
      }
    } catch {}
    setScanning(false);
  };

  const dismissSetup = async (id) => {
    try {
      await fetch(`${DISCORD_URL}/queue/dismiss`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ id })
      });
      setSetups(p => p.filter(s => s.id !== id));
    } catch {}
  };

  const saveConfig = async () => {
    try {
      await fetch(`${DISCORD_URL}/config`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify(cfgForm)
      });
      setConfig(cfgForm);
      setShowConfig(false);
    } catch {}
  };

  // Filter setups
  const filtered = setups.filter(s => {
    if (filter === "high") return (s.combined_score||0) >= 7;
    if (filter === "fit")  return (s.fit_score||0) >= 7;
    return true;
  });

  // ── Agent not running ──
  if (agentOk === false) {
    return (
      <div>
        <div style={{ fontSize:18, fontWeight:700, marginBottom:4 }}>📡 קהילת Discord</div>
        <div style={{ fontSize:13, color:"#6b7280", marginBottom:20 }}>Automated agent scanning community setups</div>

        <div style={{ background:"#0f172a", border:"1px dashed #374151", borderRadius:12, padding:"24px 20px", marginBottom:16 }}>
          <div style={{ fontSize:28, textAlign:"center", marginBottom:12 }}>🤖</div>
          <div style={{ fontSize:14, fontWeight:600, marginBottom:6, textAlign:"center" }}>הסוכן לא פועל</div>
          <div style={{ fontSize:12, color:"#6b7280", lineHeight:1.7, marginBottom:16 }}>
            הסוכן רץ לוקלית ומתחבר לDiscord דרך Bot Token.
          </div>

          <div style={{ background:"#0a0e1a", borderRadius:8, padding:"12px 14px", marginBottom:12, fontFamily:"monospace", fontSize:12 }}>
            <div style={{ color:"#4b5563", marginBottom:6 }}># התקנה</div>
            <div style={{ color:"#60a5fa" }}>pip install discord.py aiohttp anthropic</div>
            <div style={{ color:"#4b5563", marginTop:8, marginBottom:6 }}># הגדרת Config (ב-discord_config.json)</div>
            <div style={{ color:"#e8eaf0" }}>{"{"}</div>
            <div style={{ color:"#e8eaf0", paddingRight:16 }}>"discord_token": "BOT_TOKEN_HERE",</div>
            <div style={{ color:"#e8eaf0", paddingRight:16 }}>"channel_ids": [CHANNEL_ID_1, CHANNEL_ID_2],</div>
            <div style={{ color:"#e8eaf0", paddingRight:16 }}>"anthropic_api_key": "sk-ant-..."</div>
            <div style={{ color:"#e8eaf0" }}>{"}"}</div>
            <div style={{ color:"#4b5563", marginTop:8, marginBottom:6 }}># הרצה</div>
            <div style={{ color:"#10b981" }}>python discord_agent.py</div>
          </div>

          <div style={{ fontSize:11, color:"#4b5563", lineHeight:1.7 }}>
            <div style={{ marginBottom:3 }}>📌 לקבלת Bot Token:</div>
            <a href="https://discord.com/developers/applications" target="_blank" rel="noopener noreferrer"
              style={{ color:"#60a5fa", fontSize:11 }}>
              discord.com/developers/applications ↗
            </a>
            <div style={{ marginTop:6 }}>צור Application → Bot → Enable "Message Content Intent" → Copy Token</div>
          </div>
        </div>

        <button className="bg" style={{ width:"100%" }} onClick={() => {
          fetch(`${DISCORD_URL}/health`, { signal:AbortSignal.timeout(1500) })
            .then(r=>r.json()).then(()=>{setAgentOk(true);loadQueue();loadConfig();})
            .catch(()=>alert("הסוכן עדיין לא פועל"));
        }}>🔄 בדוק שוב</button>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16, flexWrap:"wrap", gap:8 }}>
        <div>
          <div style={{ fontSize:17, fontWeight:700 }}>📡 Community Setup Queue</div>
          <div style={{ fontSize:12, color:"#6b7280" }}>
            {setups.length} סטאפים · {agentOk===true ? <span style={{color:"#10b981"}}>● Agent פעיל</span> : ""}
          </div>
        </div>
        <div style={{ display:"flex", gap:7 }}>
          <button className="bg" style={{ fontSize:11 }} onClick={() => setShowConfig(s=>!s)}>⚙️ הגדרות</button>
          <button className="bg" onClick={loadQueue} disabled={loading}>{loading?"⏳":"🔄"} רענן</button>
          <button className="bp" onClick={triggerScan} disabled={scanning}>
            {scanning ? <><span className="dots"><span>●</span><span>●</span><span>●</span></span> סורק...</> : "📡 סרוק עכשיו"}
          </button>
        </div>
      </div>

      {/* Config panel */}
      {showConfig && config && (
        <div style={{ background:"#0f172a", border:"1px solid #1f2937", borderRadius:12, padding:"16px 18px", marginBottom:16 }}>
          <div style={{ fontWeight:700, fontSize:14, marginBottom:12 }}>⚙️ הגדרות Discord Agent</div>
          <div className="g2" style={{ marginBottom:10 }}>
            <div>
              <div style={{ fontSize:11, color:"#9ca3af", marginBottom:4 }}>Discord Bot Token</div>
              <input className="inp" type="password" placeholder="הדבק Bot Token..."
                value={cfgForm.discord_token||""} onChange={e=>setCfgForm(p=>({...p,discord_token:e.target.value}))}/>
            </div>
            <div>
              <div style={{ fontSize:11, color:"#9ca3af", marginBottom:4 }}>Anthropic API Key</div>
              <input className="inp" type="password" placeholder="sk-ant-..."
                value={cfgForm.anthropic_api_key||""} onChange={e=>setCfgForm(p=>({...p,anthropic_api_key:e.target.value}))}/>
            </div>
          </div>
          <div style={{ marginBottom:10 }}>
            <div style={{ fontSize:11, color:"#9ca3af", marginBottom:4 }}>Channel IDs (מופרדים בפסיק)</div>
            <input className="inp" placeholder="123456789, 987654321"
              value={(cfgForm.channel_ids||[]).join(", ")}
              onChange={e=>setCfgForm(p=>({...p,channel_ids:e.target.value.split(",").map(x=>x.trim()).filter(Boolean).map(Number)}))}/>
          </div>
          <div className="g2" style={{ marginBottom:10 }}>
            <div>
              <div style={{ fontSize:11, color:"#9ca3af", marginBottom:4 }}>שעות אחורה לסריקה</div>
              <input className="inp" type="number" value={cfgForm.scan_hours_back||24}
                onChange={e=>setCfgForm(p=>({...p,scan_hours_back:+e.target.value}))}/>
            </div>
            <div>
              <div style={{ fontSize:11, color:"#9ca3af", marginBottom:4 }}>ציון מינימום לתור</div>
              <input className="inp" type="number" min="1" max="10" value={cfgForm.min_score_to_queue||5}
                onChange={e=>setCfgForm(p=>({...p,min_score_to_queue:+e.target.value}))}/>
            </div>
          </div>
          <div style={{ marginBottom:10 }}>
            <div style={{ fontSize:11, color:"#9ca3af", marginBottom:4 }}>
              ⭐ Auto-watchlist threshold
              <span style={{ color:"#f59e0b", marginRight:6, fontSize:10 }}>({cfgForm.auto_watchlist_score||8}+  → נכנס אוטומטית)</span>
            </div>
            <input className="inp" type="range" min="6" max="10" step="1"
              value={cfgForm.auto_watchlist_score||8}
              onChange={e=>setCfgForm(p=>({...p,auto_watchlist_score:+e.target.value}))}/>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:"#4b5563", marginTop:2 }}>
              <span>6 — כל סטאפ טוב</span><span>8 — מומלץ</span><span>10 — מושלם בלבד</span>
            </div>
          </div>
          <div style={{ marginBottom:10 }}>
            <div style={{ fontSize:11, color:"#9ca3af", marginBottom:4 }}>מילות מפתח (מופרדות בפסיק)</div>
            <input className="inp" placeholder="setup, breakout, entry..."
              value={(cfgForm.keyword_filter||[]).join(", ")}
              onChange={e=>setCfgForm(p=>({...p,keyword_filter:e.target.value.split(",").map(x=>x.trim()).filter(Boolean)}))}/>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <button className="bg" onClick={()=>setShowConfig(false)}>Cancel</button>
            <button className="bp" onClick={saveConfig}>Save Settings</button>
          </div>
        </div>
      )}

      {/* Auto-added banner */}
      {autoAdded.length > 0 && (
        <div style={{ background:"linear-gradient(135deg,#0f2a0f,#1a3a1a)", border:"1px solid #10b981", borderRadius:10, padding:"10px 14px", marginBottom:14 }}>
          <div style={{ fontSize:11, color:"#4ade80", fontWeight:700, marginBottom:6 }}>
            ⭐ {autoAdded.length} stocks auto-added to watchlist (ציון ≥ {autoThreshold})
          </div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
            {autoAdded.map((a,i) => (
              <div key={i} style={{ background:"#10b98122", border:"1px solid #10b98144", borderRadius:6, padding:"3px 9px", fontSize:11 }}>
                <span style={{ fontFamily:"monospace", fontWeight:700 }}>{a.symbol}</span>
                <span style={{ color:"#4ade80", marginRight:5 }}> {a.score}/10</span>
                <span style={{ color:"#6b7280", fontSize:10 }}>{a.ts}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Auto threshold indicator */}
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14, padding:"7px 12px", background:"#0f172a", borderRadius:7, border:"1px solid #1f2937" }}>
        <span style={{ fontSize:12 }}>⭐</span>
        <span style={{ fontSize:11, color:"#6b7280" }}>סטאפים עם ציון</span>
        <span style={{ fontSize:12, fontWeight:700, color:"#f59e0b", fontFamily:"monospace" }}>≥ {autoThreshold}/10</span>
        <span style={{ fontSize:11, color:"#6b7280" }}>Auto-added to watchlist</span>
        <button className="bg" style={{ fontSize:10, padding:"2px 7px", marginRight:"auto" }} onClick={()=>setShowConfig(true)}>שנה</button>
      </div>

      {/* Scan log */}
      {scanning && scanLog.length > 0 && (
        <div style={{ background:"#0a0e1a", border:"1px solid #1f2937", borderRadius:8, padding:"10px 12px", marginBottom:14, maxHeight:120, overflowY:"auto" }}>
          <div style={{ fontSize:10, color:"#4b5563", marginBottom:5, textTransform:"uppercase", letterSpacing:"1px" }}>לוג סריקה</div>
          {scanLog.slice(-12).map((l,i)=>(
            <div key={i} style={{ fontSize:10, color:"#6b7280", fontFamily:"monospace" }}>{l}</div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div style={{ display:"flex", gap:6, marginBottom:16 }}>
        {[
          {id:"all",  label:`הכל (${setups.length})`},
          {id:"high", label:`ציון ≥ 7 (${setups.filter(s=>s.combined_score>=7).length})`},
          {id:"fit",  label:`מתאים לסגנון (${setups.filter(s=>s.fit_score>=7).length})`},
        ].map(f=>(
          <button key={f.id} className="bg" style={filter===f.id?{borderColor:"#1e6fff",color:"#60a5fa"}:{}} onClick={()=>setFilter(f.id)}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && !loading && (
        <div style={{ textAlign:"center", padding:"48px 20px" }}>
          <div style={{ fontSize:36, marginBottom:10 }}>📭</div>
          <div style={{ fontSize:15, fontWeight:600, marginBottom:6 }}>
            {setups.length === 0 ? "התור ריק" : "אין סטאפים בפילטר הנוכחי"}
          </div>
          <div style={{ fontSize:12, color:"#6b7280" }}>
            {setups.length === 0 ? "Click Scan Now to collect community setups" : "Change filter"}
          </div>
        </div>
      )}

      {/* Setup cards */}
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        {filtered.map(setup => {
          const isExp = expanded === setup.id;
          const sc = setup.combined_score || 0;
          const fc = setup.fit_score || 0;
          const stColor = SETUP_COLORS[setup.setup_type] || "#6b7280";

          return (
            <div key={setup.id} style={{ background:"#111827", border:`1px solid ${isExp?"#1e6fff":"#1f2937"}`, borderRadius:12, overflow:"hidden", transition:"border-color .2s" }}>
              {/* Card header — always visible */}
              <div style={{ padding:"12px 16px", cursor:"pointer", display:"flex", alignItems:"center", gap:10 }}
                onClick={()=>setExpanded(e=>e===setup.id?null:setup.id)}>

                {/* Score badge */}
                <div style={{ width:38, height:38, borderRadius:9, background:`${SCORE_COLOR(sc)}22`,
                  border:`1px solid ${SCORE_COLOR(sc)}55`, display:"flex", flexDirection:"column",
                  alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  <div style={{ fontSize:14, fontWeight:800, color:SCORE_COLOR(sc), lineHeight:1 }}>{sc}</div>
                  <div style={{ fontSize:8, color:"#4b5563" }}>/ 10</div>
                </div>

                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:3 }}>
                    {setup.symbol && (
                      <span style={{ fontFamily:"monospace", fontWeight:800, fontSize:16 }}>{setup.symbol}</span>
                    )}
                    {setup.auto_watchlist && (
                      <span style={{ fontSize:10, padding:"1px 6px", borderRadius:4, background:"#10b98122", border:"1px solid #10b98144", color:"#4ade80", fontWeight:700 }}>⭐ auto</span>
                    )}
                    <span style={{ fontSize:10, padding:"2px 7px", borderRadius:4, background:`${stColor}22`,
                      border:`1px solid ${stColor}44`, color:stColor, fontWeight:600 }}>
                      {setup.setup_type || "?"}
                    </span>
                    <span style={{ fontSize:10, color: setup.direction==="Long"?"#10b981":"#ef4444", fontWeight:600 }}>
                      {setup.direction}
                    </span>
                    {setup.timeframe && (
                      <span style={{ fontSize:10, fontFamily:"monospace", color:"#6b7280" }}>{setup.timeframe}</span>
                    )}
                  </div>
                  <div style={{ fontSize:12, color:"#9ca3af", lineHeight:1.4 }}>
                    {setup.one_line_summary || setup.source?.text?.slice(0,80)}
                  </div>
                </div>

                {/* Fit score + meta */}
                <div style={{ textAlign:"left", flexShrink:0, fontSize:10 }}>
                  <div style={{ color:SCORE_COLOR(fc), fontWeight:700, marginBottom:2 }}>Fit: {fc}/10</div>
                  <div style={{ color:"#4b5563" }}>#{setup.source?.channel}</div>
                  <div style={{ color:"#374151" }}>{new Date(setup.source?.timestamp).toLocaleDateString("he-IL")}</div>
                </div>
              </div>

              {/* Expanded detail */}
              {isExp && (
                <div style={{ borderTop:"1px solid #1f2937", padding:"14px 16px" }}>

                  {/* Chart image if available */}
                  {setup.source?.image_url && (
                    <div style={{ marginBottom:14, borderRadius:8, overflow:"hidden", border:"1px solid #1f2937", position:"relative" }}>
                      <img src={setup.source.image_url} alt="chart" style={{ width:"100%", maxHeight:300, objectFit:"contain", background:"#000", display:"block" }}/>
                      <div style={{ position:"absolute", top:6, left:6, background:"rgba(0,0,0,.75)", borderRadius:5,
                        padding:"2px 8px", fontSize:10, fontFamily:"monospace", fontWeight:700 }}>
                        {setup.symbol} · {setup.timeframe}
                      </div>
                    </div>
                  )}

                  {/* Analysis grid */}
                  <div className="g2" style={{ marginBottom:12 }}>
                    {[
                      ["Entry", setup.entry_zone],
                      ["Stop",  setup.stop_zone],
                      ["Target",setup.target_zone],
                      ["R:R",   setup.rr_estimate],
                    ].map(([l,v])=>v&&(
                      <div key={l} style={{ background:"#0f172a", borderRadius:7, padding:"8px 10px" }}>
                        <div style={{ fontSize:10, color:"#4b5563", marginBottom:2 }}>{l}</div>
                        <div style={{ fontSize:12, color:"#e8eaf0", fontWeight:600 }}>{v}</div>
                      </div>
                    ))}
                  </div>

                  {/* Strengths / Risks */}
                  <div className="g2" style={{ marginBottom:12 }}>
                    {setup.strengths?.length > 0 && (
                      <div>
                        <div style={{ fontSize:10, color:"#10b981", marginBottom:5, textTransform:"uppercase", letterSpacing:"1px" }}>✅ חוזקות</div>
                        {setup.strengths.map((s,i)=>(
                          <div key={i} style={{ fontSize:11, color:"#d1d5db", marginBottom:3 }}>· {s}</div>
                        ))}
                      </div>
                    )}
                    {setup.risks?.length > 0 && (
                      <div>
                        <div style={{ fontSize:10, color:"#ef4444", marginBottom:5, textTransform:"uppercase", letterSpacing:"1px" }}>⚠️ סיכונים</div>
                        {setup.risks.map((r,i)=>(
                          <div key={i} style={{ fontSize:11, color:"#d1d5db", marginBottom:3 }}>· {r}</div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Fit reason */}
                  {setup.my_fit_reason && (
                    <div style={{ background:"#0d1f3c", border:"1px solid #1e3a5f", borderRadius:7, padding:"8px 12px", marginBottom:12, fontSize:12, color:"#9ca3af" }}>
                      🎯 <span style={{ color:"#60a5fa", fontWeight:600 }}>התאמה לסגנון שלי:</span> {setup.my_fit_reason}
                    </div>
                  )}

                  {/* Source */}
                  <div style={{ fontSize:10, color:"#374151", marginBottom:12 }}>
                    מאת {setup.source?.author} · #{setup.source?.channel} · {new Date(setup.source?.timestamp).toLocaleString("he-IL")}
                  </div>

                  {/* Actions */}
                  <div style={{ display:"flex", gap:7 }}>
                    {setup.symbol && (
                      <button className="bp" style={{ flex:1, fontSize:12 }}
                        onClick={() => onAddToWatchlist(setup.symbol, setup.symbol)}>
                        + הוסף לווטצ'ליסט
                      </button>
                    )}
                    <button className="bg" style={{ fontSize:12 }} onClick={() => dismissSetup(setup.id)}>
                      ✕ הסר
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer stats */}
      {setups.length > 0 && (
        <div style={{ marginTop:16, padding:"10px 14px", background:"#0f172a", borderRadius:8, display:"flex", gap:16, fontSize:11, color:"#4b5563" }}>
          <span>סה"כ: <span style={{color:"#e8eaf0"}}>{setups.length}</span></span>
          <span>ממוצע: <span style={{color:SCORE_COLOR(Math.round(setups.reduce((a,s)=>a+(s.combined_score||0),0)/setups.length))}}>
            {(setups.reduce((a,s)=>a+(s.combined_score||0),0)/setups.length).toFixed(1)}/10
          </span></span>
          <span>סטאפ שכיח: <span style={{color:"#9ca3af"}}>
            {Object.entries(setups.reduce((a,s)=>{const k=s.setup_type||"?";a[k]=(a[k]||0)+1;return a;},{})).sort((a,b)=>b[1]-a[1])[0]?.[0]||"—"}
          </span></span>
          <button className="bg" style={{ fontSize:10, padding:"2px 8px", marginRight:"auto" }}
            onClick={async()=>{ await fetch(`${DISCORD_URL}/queue/clear`); setSetups([]); }}>
            🗑 נקה תור
          </button>
        </div>
      )}
    </div>
  );
}



const COURSE_CURRICULUM = [
  { level:"Beginner", color:"#10b981", emoji:"🌱", modules:[
    { id:"c1", title:"נרות יפניים — קריאת גרפים", topics:["Body vs Wick","Bullish/Bearish candles","Doji","Engulfing","Pin bar"], duration:"35 דק'",
      videos:[
        { title:"Candlestick Charts: The ULTIMATE beginners guide", channel:"Rayner Teo", url:"https://www.youtube.com/watch?v=5jEVCmCFCnw", duration:"21:25", why:"הסבר ויזואלי מלא לכל סוגי הנרות — מתאים למתחילים" },
        { title:"Candlestick Patterns Cheat Sheet", channel:"Humbled Trader", url:"https://www.youtube.com/watch?v=M6_n_DM6oNo", duration:"18:44", why:"סיכום מהיר של הדפוסים שחייבים לזכור" },
        { title:"How to Read Japanese Candlestick Charts", channel:"Trading 212", url:"https://www.youtube.com/watch?v=lP1AHjfPXYg", duration:"9:08", why:"קצר ועניני — ידע בסיסי ב-9 דקות" },
      ],
      theoryPrompt:"למד אותי על נרות יפניים בסווינג טריידינג. כסה: מה מייצג כל חלק של נר (Body, Wick, Open/Close), ההבדל בין נר Bullish לנר Bearish, ומה 3 הדפוסים הכי חשובים לזהות: Engulfing, Pin Bar, ו-Doji. תן דוגמה קצרה לכל אחד. תשובה בעברית, 300-400 מילה, עם כותרות ברורות." },
    { id:"c2", title:"Support & Resistance — אזורי מפתח", topics:["מה זה S/R","אזורים vs קווים","Flip zones","אישור כניסה"], duration:"40 דק'",
      videos:[
        { title:"Support and Resistance Explained (For Beginners)", channel:"Rayner Teo", url:"https://www.youtube.com/watch?v=GnXFcpZkprc", duration:"22:01", why:"ההסבר הטוב ביותר של S/R לסווינג — כולל Flip Zones" },
        { title:"How to Draw Support and Resistance Levels Correctly", channel:"Trading With Rayner", url:"https://www.youtube.com/watch?v=3CCtP2ggkuI", duration:"16:32", why:"טכניקת הציור הנכונה — טעויות נפוצות וכיצד להימנע מהן" },
        { title:"The Only Support and Resistance Video You Will Ever Need", channel:"Karen Foo", url:"https://www.youtube.com/watch?v=JGEuYWdFhqo", duration:"28:15", why:"קורס שלם ב-28 דקות — מתחיל עד מתקדם" },
      ],
      theoryPrompt:"למד אותי על Support & Resistance בסווינג טריידינג. כסה: ההבדל בין קו ל-Zone, למה אזורים עדיפים, מה זה Flip Zone (תמיכה שהופכת להתנגדות), וכיצד מספר הפעמים שמחיר נגע באזור משפיע על חוזקו. תשובה בעברית, 300-400 מילה, עם כותרות." },
    { id:"c3", title:"מגמות ומבנה שוק", topics:["HH / HL / LH / LL","Break of Structure","Market Structure Shift","Consolidation"], duration:"45 דק'",
      videos:[
        { title:"Market Structure Trading — The Complete Guide", channel:"Rayner Teo", url:"https://www.youtube.com/watch?v=s2aCnPH0Cws", duration:"25:18", why:"הגדרת HH/HL/LH/LL עם דוגמאות ויזואליות ברורות" },
        { title:"Break of Structure vs Change of Character", channel:"ICT / Inner Circle Trader", url:"https://www.youtube.com/watch?v=IjZ5ClHlT5k", duration:"19:44", why:"ההבדל בין BOS ל-CHoCH — נושא שמבלבל הרבה סוחרים" },
        { title:"How to Trade Market Structure (Step by Step)", channel:"Trading Hub", url:"https://www.youtube.com/watch?v=d6PGvXp4FQU", duration:"17:02", why:"תהליך פרקטי מלא — איך לנתח מבנה שוק לפני כל כניסה" },
      ],
      theoryPrompt:"למד אותי על מבנה שוק (Market Structure) בסווינג טריידינג. כסה: הגדרת Higher High / Higher Low ו-Lower High / Lower Low, מה זה Break of Structure ולמה הוא חשוב, ומה ההבדל בין Pullback לבין שינוי מגמה אמיתי. תשובה בעברית, 300-400 מילה." },
    { id:"c4", title:"ניהול סיכון — בסיס", topics:["R:R ratio","Position sizing","Stop loss types","Max loss per day"], duration:"35 דק'",
      videos:[
        { title:"Risk Management — The #1 Trading Skill", channel:"Rayner Teo", url:"https://www.youtube.com/watch?v=c4LMGKdVB8c", duration:"23:11", why:"הסבר מלא על R:R ו-Position Sizing עם חישובים" },
        { title:"Position Sizing — How to Calculate Your Trade Size", channel:"Trading with Justin Bennett", url:"https://www.youtube.com/watch?v=kx-UGMh0CjM", duration:"13:47", why:"נוסחת ה-Position Sizing המדויקת עם דוגמאות מספריות" },
        { title:"Stop Loss Placement Strategies", channel:"Humbled Trader", url:"https://www.youtube.com/watch?v=W1JAJaHB5QA", duration:"16:20", why:"שלושת סוגי הסטופ — מבני, ATR, ואחוז קבוע" },
      ],
      theoryPrompt:"למד אותי על ניהול סיכון בסווינג טריידינג. כסה: מה זה R:R ולמה צריך לפחות 1:2, כיצד מחשבים גודל פוזיציה (Position Sizing) לפי % סיכון מהחשבון, ומה הסכנה של סיכון יותר מ-1-2% לעסקה. תשובה בעברית, 300-400 מילה." },
  ]},
  { level:"Learner", color:"#60a5fa", emoji:"📚", modules:[
    { id:"c5", title:"Moving Averages — שימוש נכון", topics:["SMA vs EMA","20MA כדינמי S/R","MA crossover","מה לא לעשות"], duration:"40 דק'",
      videos:[
        { title:"Moving Average Trading Strategy (The Complete Guide)", channel:"Rayner Teo", url:"https://www.youtube.com/watch?v=M9OsUX0GHHs", duration:"26:43", why:"כל מה שצריך לדעת על MA לסווינג — כולל הטעויות הנפוצות" },
        { title:"20 EMA Trading Strategy for Swing Traders", channel:"Trading with Justin Bennett", url:"https://www.youtube.com/watch?v=FmVS_9c5n6E", duration:"14:55", why:"שימוש ב-20EMA כ-Dynamic Support — הסטאפ המרכזי" },
        { title:"EMA vs SMA — Which is Better?", channel:"Trading 212", url:"https://www.youtube.com/watch?v=Yk68xkxZlQE", duration:"8:22", why:"השוואה פרקטית — מתי להשתמש בכל אחד" },
      ],
      theoryPrompt:"למד אותי על Moving Averages בסווינג טריידינג. כסה: ההבדל בין SMA לEMA, למה 20MA הוא הכי שימושי לסווינג, כיצד MA משמש כ-Dynamic Support/Resistance, והטעות הנפוצה של להשתמש ב-MA כ-Entry trigger בלבד. תשובה בעברית, 300-400 מילה." },
    { id:"c6", title:"סטאפ Breakout — הגדרה ובצוע", topics:["מה מגדיר Breakout אמיתי","False breakout","Volume confirmation","Entry ו-Stop"], duration:"50 דק'",
      videos:[
        { title:"Breakout Trading Strategy (Works in Bull & Bear Markets)", channel:"Rayner Teo", url:"https://www.youtube.com/watch?v=pcFpAEfZ_tA", duration:"24:57", why:"ההבדל בין Breakout אמיתי ל-False Breakout — עם Volume" },
        { title:"How to Trade Breakouts (Stop Getting Faked Out)", channel:"Humbled Trader", url:"https://www.youtube.com/watch?v=kVhpS4fVvYA", duration:"21:33", why:"למה רוב הBreakouts נכשלים וכיצד לסנן" },
        { title:"Breakout vs Fakeout — The Real Difference", channel:"Trading Hub", url:"https://www.youtube.com/watch?v=eMYpJMhcAoQ", duration:"12:18", why:"זיהוי False Breakout לפני שנכנסים לפוזיציה" },
      ],
      theoryPrompt:"למד אותי על סטאפ Breakout בסווינג טריידינג. כסה: מה ההבדל בין Breakout אמיתי ל-False Breakout, תפקיד הVolume בזיהוי (Volume ≥ 1.5x ממוצע), נקודת Entry האידיאלית (retest vs immediate), ואיפה שמים Stop מבני. תשובה בעברית, 300-400 מילה." },
    { id:"c7", title:"סטאפ Pullback — הכניסה הנכונה", topics:["Pullback to MA","Pullback to S/R","Trend continuation","Patience filter"], duration:"50 דק'",
      videos:[
        { title:"Pullback Trading Strategy — The Complete Guide", channel:"Rayner Teo", url:"https://www.youtube.com/watch?v=SiTf0mIGcGQ", duration:"27:12", why:"מדריך מלא לזיהוי Pullback בריא לעומת reversal" },
        { title:"How to Buy Pullbacks in an Uptrend (Step by Step)", channel:"Trading with Justin Bennett", url:"https://www.youtube.com/watch?v=Bnm7kW9u3Xo", duration:"18:36", why:"תהליך כניסה מדויק — Entry, Stop, Target בPullback" },
        { title:"The Best Pullback Entry Technique", channel:"Trading Hub", url:"https://www.youtube.com/watch?v=0LQtALNHZRk", duration:"15:44", why:"הטכניקה לזיהוי נקודת הכניסה המדויקת בתוך הPullback" },
      ],
      theoryPrompt:"למד אותי על סטאפ Pullback בסווינג טריידינג. כסה: מה מגדיר Pullback בריא (מחיר חוזר ל-MA או לאזור תמיכה בלי לשבור מבנה), ההבדל בין Pullback לבין reversal, מה אומרים הנרות בזמן הPullback (volume יורד, wick rejections), ואיפה Entry ו-Stop. תשובה בעברית, 300-400 מילה." },
    { id:"c8", title:"Volume Analysis — קריאת נפח", topics:["Volume confirmation","Dry-up before breakout","Climax volume","Volume vs Price"], duration:"40 דק'",
      videos:[
        { title:"Volume Trading Strategy — How to Read Volume", channel:"Rayner Teo", url:"https://www.youtube.com/watch?v=uJRO4VkmDNo", duration:"20:45", why:"קריאת Volume Dry-Up, Climax, ואישור תנועה" },
        { title:"How to Use Volume in Trading (Complete Guide)", channel:"Humbled Trader", url:"https://www.youtube.com/watch?v=_7bYGKlpLEs", duration:"25:08", why:"כל סוגי הVolume patterns עם דוגמאות ממשיות" },
        { title:"Volume Spread Analysis — The Basics", channel:"Trading 212", url:"https://www.youtube.com/watch?v=Hkst_2vEdds", duration:"11:32", why:"VSA — איך לקרוא Volume יחד עם Price Action" },
      ],
      theoryPrompt:"למד אותי על Volume Analysis בסווינג טריידינג. כסה: למה Volume מאשר תנועה (תנועה בנפח גבוה = אמינה), מה זה Volume Dry-Up לפני פריצה (מדוע זה חיובי), מה זה Climax Volume וכיצד הוא מסמן סיום תנועה, ואיך לקרוא Volume relative to average. תשובה בעברית, 300-400 מילה." },
  ]},
  { level:"Developing", color:"#a78bfa", emoji:"📈", modules:[
    { id:"c9", title:"Multi-Timeframe Analysis", topics:["Top-down approach","Daily + 4H","Alignment vs Conflict","Entry on 1H"], duration:"55 דק'",
      videos:[
        { title:"Multi-Timeframe Analysis (The Complete Guide)", channel:"Rayner Teo", url:"https://www.youtube.com/watch?v=9JLaHVXpNGk", duration:"29:34", why:"Top-Down מ-Weekly עד Entry ב-1H — תהליך מלא" },
        { title:"How to Use Multiple Time Frames in Trading", channel:"Trading with Justin Bennett", url:"https://www.youtube.com/watch?v=lMGFcLggKV8", duration:"19:22", why:"Daily לכיוון + 4H לאישור + 1H לכניסה — עם דוגמאות" },
        { title:"Multi Timeframe Analysis — Swing Trading", channel:"Humbled Trader", url:"https://www.youtube.com/watch?v=oRXiKuaqVwE", duration:"22:17", why:"מה לעשות כשיש סתירה בין טיים פריימים" },
      ],
      theoryPrompt:"למד אותי על Multi-Timeframe Analysis בסווינג טריידינג. כסה: תהליך Top-Down (Daily → 4H → 1H), מה קורה כשמגמות סותרות (skip the trade), כיצד Daily מגדיר כיוון ו-4H מאשר, ומה Entry ב-1H יכול לספק. תשובה בעברית, 300-400 מילה." },
    { id:"c10", title:"Supply & Demand Zones", topics:["מה זה Supply/Demand","ההבדל מ-S/R","Fresh zones","Institutional footprint"], duration:"60 דק'",
      videos:[
        { title:"Supply and Demand Trading (The Complete Guide)", channel:"Rayner Teo", url:"https://www.youtube.com/watch?v=OxiGEGFpV_Y", duration:"31:05", why:"ההבדל בין S&D ל-S/R קלאסי — Fresh vs Tested Zones" },
        { title:"How to Draw Supply and Demand Zones Correctly", channel:"Trading with Justin Bennett", url:"https://www.youtube.com/watch?v=CWvLmPSRXGU", duration:"17:48", why:"הטכניקה המדויקת לציור Zones עם דוגמאות" },
        { title:"Supply Demand — The Institutional Footprint", channel:"ICT / Inner Circle Trader", url:"https://www.youtube.com/watch?v=OMB7hpnFdoo", duration:"23:16", why:"למה Institutional money יוצר Supply/Demand Zones" },
      ],
      theoryPrompt:"למד אותי על Supply & Demand Zones בסווינג טריידינג. כסה: ההבדל בין S/R קלאסי לבין Supply/Demand Zone, מה עושה zone חזק (explosive move שיצא ממנו, ומעט ביקורים), מה זה Fresh Zone vs Tested Zone, ולמה institutional money יוצר zones. תשובה בעברית, 300-400 מילה." },
    { id:"c11", title:"פסיכולוגיה — FOMO ומשמעת", topics:["FOMO","Revenge trading","Overtrading","Patience as a skill"], duration:"45 דק'",
      videos:[
        { title:"Trading Psychology — How to Master Your Emotions", channel:"Rayner Teo", url:"https://www.youtube.com/watch?v=gfvMlFfVgXk", duration:"28:02", why:"FOMO, Revenge Trading, Overtrading — הסבר מעמיק" },
        { title:"How to Stop Overtrading (The Real Reason You Overtrade)", channel:"Humbled Trader", url:"https://www.youtube.com/watch?v=Rq4_E7nHkxQ", duration:"19:55", why:"הסיבות האמיתיות ל-Overtrading ואיך לשנות הרגלים" },
        { title:"Trading Patience — The Hardest Skill to Learn", channel:"Trading with Justin Bennett", url:"https://www.youtube.com/watch?v=OZEuIMUnHNk", duration:"14:08", why:"Patience כמיומנות שנבנית — לא כתכונת אישיות" },
      ],
      theoryPrompt:"למד אותי על פסיכולוגיית מסחר בסווינג טריידינג. כסה: מה זה FOMO וכיצד הוא גורם לכניסה מאוחרת, מה זה Revenge Trading ולמה הוא הורס חשבונות, מה זה Overtrading וכיצד מזהים אותו, וכיצד Patience היא מיומנות שנבנית ולא אישיות מולדת. תשובה בעברית, 350-400 מילה." },
  ]},
  { level:"Advanced", color:"#f59e0b", emoji:"⚡", modules:[
    { id:"c12", title:"Edge Building — בניית יתרון", topics:["Back-testing","Forward testing","Expectancy","Statistical significance"], duration:"65 דק'",
      videos:[
        { title:"How to Build a Trading Edge (Step by Step)", channel:"Rayner Teo", url:"https://www.youtube.com/watch?v=KZO0TLF3f8Y", duration:"32:14", why:"Back-testing, Expectancy, ו-Statistical Significance — מלא" },
        { title:"How to Backtest a Trading Strategy (The Right Way)", channel:"Trading with Justin Bennett", url:"https://www.youtube.com/watch?v=FxQGrNaVPuY", duration:"21:07", why:"תהליך Back-testing מדויק — מה לבדוק ואיך לרשום" },
        { title:"Trading Expectancy — The Most Important Metric", channel:"Trading Hub", url:"https://www.youtube.com/watch?v=m_WYxvbvOd8", duration:"16:33", why:"חישוב Expectancy וכיצד לפרש את התוצאות" },
      ],
      theoryPrompt:"למד אותי על בניית Edge בסווינג טריידינג. כסה: מה ההבדל בין Back-testing ל-Forward testing, כיצד מחשבים Expectancy (Win Rate × Avg Win − Loss Rate × Avg Loss), כמה עסקאות צריך לסטטיסטיקה אמינה (מינימום 50-100), ומה עושים כשמגלים שה-Edge שלילי. תשובה בעברית, 350-400 מילה." },
    { id:"c13", title:"תחקור עסקאות — תהליך שיפור", topics:["Journal review","Pattern recognition","Grading trades","Continuous improvement"], duration:"45 דק'",
      videos:[
        { title:"How to Review Your Trades (The Right Way)", channel:"Rayner Teo", url:"https://www.youtube.com/watch?v=_q6h2pNFBhI", duration:"24:38", why:"תהליך תחקור שבועי — מה לחפש ואיך להפוך לתוכנית" },
        { title:"Trading Journal Review — How to Actually Improve", channel:"Humbled Trader", url:"https://www.youtube.com/watch?v=tHSy7RKQp_Y", duration:"20:11", why:"זיהוי דפוסי כשל חוזרים ביומן המסחר" },
        { title:"How to Grade Your Trades (A+ Setups Only)", channel:"Trading with Justin Bennett", url:"https://www.youtube.com/watch?v=9kMIbbfM_3o", duration:"17:24", why:"מערכת ציונים לעסקאות — כיצד לבנות standards ברורים" },
      ],
      theoryPrompt:"למד אותי על תחקור עסקאות ושיפור מתמיד בסווינג טריידינג. כסה: כיצד לנהל סקירה שבועית של העסקאות (לא רק Win/Loss אלא גם עסקאות שלא לקחת), מה לחפש בתבניות (דפוסי כשל חוזרים, מצבי שוק שלא מתאימים לסגנון שלך), וכיצד להפוך תחקור לתוכנית פעולה ממשית. תשובה בעברית, 350-400 מילה." },
  ]},
];

// ─── Interactive Chart Exercise ─────────────────────────────────────────────────
// ─── Synthetic Chart Data Generator ─────────────────────────────────────────
// Generates realistic OHLCV data with known structure for scoring

function generateSyntheticChart(seed, numCandles = 120, basePrice = 100) {
  const rng = (s => { let x = s; return () => { x = (x * 16807 + 0) % 2147483647; return (x - 1) / 2147483646; }; })(seed * 9301 + 49297);
  const candles = [];
  let price = basePrice;
  let trend = 1;
  let trendLen = 0;

  for (let i = 0; i < numCandles; i++) {
    if (trendLen > 15 + Math.floor(rng() * 20)) { trend = -trend; trendLen = 0; }
    trendLen++;
    const move   = (rng() - 0.48 + trend * 0.04) * price * 0.018;
    const open   = price;
    const close  = Math.max(price * 0.85, price + move);
    const range  = Math.abs(close - open) * (1 + rng() * 1.5);
    const high   = Math.max(open, close) + range * rng() * 0.6;
    const low    = Math.min(open, close) - range * rng() * 0.6;
    const volume = Math.floor(500000 + rng() * 2000000);
    candles.push({ o: +open.toFixed(2), h: +high.toFixed(2), l: +low.toFixed(2), c: +close.toFixed(2), v: volume });
    price = close;
  }
  return candles;
}

// Known S/R levels for each module's exercise (based on seed)
// Each exercise is a sequence of questions (steps).
// task types: "trend" (3-button choice), "support" (draw zone low cluster),
//             "resistance" (draw zone high cluster), "trade" (3-click entry/stop/target)
function getExerciseMeta(modId) {
  const exercises = {
    c1: { seed: 42, questions: [
      { task:"trend", prompt:"What is the overall market structure in the visible range?", opts:["Uptrend","Downtrend","Range/Consolidation"], correctOpt:0 },
      { task:"trend", prompt:"Look at the last 30 candles only — what structure do you see there?", opts:["Uptrend","Downtrend","Range/Consolidation"], correctOpt:2 },
      { task:"support", prompt:"Mark the support zone where price bounced at least twice." },
    ]},
    c2: { seed: 77, questions: [
      { task:"support", prompt:"Draw the main support zone — where did buyers step in consistently?" },
      { task:"resistance", prompt:"Now draw the resistance zone above — where did sellers push price back down?" },
      { task:"trend", prompt:"Given the support and resistance you identified, what is the overall structure?", opts:["Uptrend","Downtrend","Range between S and R"], correctOpt:2 },
    ]},
    c3: { seed: 13, questions: [
      { task:"trend", prompt:"Identify the market structure based on swing highs and lows.", opts:["Uptrend (HH/HL)","Downtrend (LH/LL)","Ranging"], correctOpt:1 },
      { task:"resistance", prompt:"Mark the most recent Lower High — this is your resistance zone." },
      { task:"support", prompt:"Mark the most recent Higher Low that was broken — now acting as support." },
    ]},
    c4: { seed: 55, questions: [
      { task:"support", prompt:"Step 1 of 3 — Mark the support zone where you would place your stop below." },
      { task:"resistance", prompt:"Step 2 of 3 — Mark the resistance zone where you'd take profit (target area)." },
      { task:"trade", prompt:"Step 3 of 3 — Now place the full trade: entry at structure, stop below support, target at resistance." },
    ]},
    c5: { seed: 31, questions: [
      { task:"support", prompt:"Mark the dynamic support zone where price has bounced off the moving average." },
      { task:"trend", prompt:"With price above a rising MA, what is the dominant bias?", opts:["Bullish — MA acting as support","Bearish — MA acting as resistance","Neutral — MA has no slope"], correctOpt:0 },
      { task:"trade", prompt:"Build the pullback trade: enter near MA support, stop below it, target the prior swing high." },
    ]},
    c6: { seed: 88, questions: [
      { task:"resistance", prompt:"Draw the resistance zone where price has been repeatedly rejected." },
      { task:"support", prompt:"Mark the nearest support below — this is your stop anchor if you trade the breakout." },
      { task:"trend", prompt:"Price is pressing against resistance with higher lows. What does this signal?", opts:["Bullish compression — likely breakout","Bearish — distribution near top","No meaningful signal"], correctOpt:0 },
    ]},
    c7: { seed: 64, questions: [
      { task:"resistance", prompt:"Mark the prior high — this is your breakout target." },
      { task:"support", prompt:"Mark the pullback support zone — this is your entry area." },
      { task:"trade", prompt:"Place the pullback trade: entry at support, stop below the pullback low, target at prior high." },
    ]},
    c8: { seed: 19, questions: [
      { task:"trend", prompt:"Based on price action and candle size, what is the dominant structure?", opts:["Accumulation (uptrend building)","Distribution (downtrend building)","Indecision / Range"], correctOpt:0 },
      { task:"support", prompt:"Mark the accumulation zone — where are big buyers consistently absorbing supply?" },
      { task:"resistance", prompt:"Mark the overhead supply zone — where is selling pressure concentrated?" },
    ]},
    c9: { seed: 47, questions: [
      { task:"support", prompt:"Mark the key support level — the line in the sand for bulls." },
      { task:"resistance", prompt:"Mark the key resistance level — the ceiling bulls need to break." },
      { task:"trend", prompt:"Price is between your support and resistance with no clear direction. This is:", opts:["Ranging / consolidation","Uptrend pausing","Downtrend reversing"], correctOpt:0 },
    ]},
    c10:{ seed: 93, questions: [
      { task:"resistance", prompt:"Draw the supply zone where institutional selling has been visible (large candle bodies rejecting)." },
      { task:"support", prompt:"Mark the demand zone below where institutions are likely accumulating." },
      { task:"trade", prompt:"Fade the resistance: short entry near supply, stop above it, target at demand zone." },
    ]},
    c11:{ seed: 26, questions: [
      { task:"trend", prompt:"A trader entered long after a sharp rally. What emotion likely drove this?", opts:["FOMO — chasing the move","Patience — waiting for pullback","Discipline — pre-planned entry"], correctOpt:0 },
      { task:"resistance", prompt:"Mark where this FOMO trader entered — it's likely near a resistance zone." },
      { task:"support", prompt:"Now mark the nearest support below — this is where a disciplined trader would have waited." },
    ]},
    c12:{ seed: 71, questions: [
      { task:"support", prompt:"Identify the A+ support zone — strong structure, multiple touches, clear level." },
      { task:"resistance", prompt:"Identify the A+ resistance zone — your minimum profit target area." },
      { task:"trade", prompt:"Place the A+ setup: entry at support, stop just below it, target at resistance (must be ≥ 2R)." },
    ]},
    c13:{ seed: 38, questions: [
      { task:"support", prompt:"Mark the support zone from the original trade entry — where did you enter?" },
      { task:"resistance", prompt:"Mark the resistance zone you targeted — did price reach it?" },
      { task:"trend", prompt:"In hindsight, was the trade entry aligned with the trend?", opts:["Yes — with trend (HH/HL)", "No — counter-trend","Sideways — no clear bias"], correctOpt:0 },
    ]},
  };
  return exercises[modId] || exercises["c2"];
}

// ─── Interactive Chart Exercise Component ────────────────────────────────────
// Multi-question sequences. task types:
//   "trend"      — 3-button choice
//   "support"    — drag zone at price lows
//   "resistance" — drag zone at price highs
//   "trade"      — 3-click entry / stop / target

function ChartExercise({ mod, onComplete, onBack }) {
  const BACKEND = "http://localhost:7432";
  const W = 680, H = 280;
  const PAD = { t: 14, r: 18, b: 32, l: 62 };
  const chartW = W - PAD.l - PAD.r;
  const chartH = H - PAD.t - PAD.b;

  const meta  = getExerciseMeta(mod.id);   // { seed, questions:[] }

  // ── Custom generated state (null = use module defaults) ──
  const [customQuestions, setCustomQuestions] = useState(null);
  const [customSeed,      setCustomSeed]      = useState(null);
  const [generating,      setGenerating]      = useState(false);
  const [genError,        setGenError]        = useState(null);

  const activeQuestions = customQuestions || meta.questions;
  const activeSeed      = customSeed      || meta.seed;
  const total = activeQuestions.length;

  // ── Data ──
  const [candles,    setCandles]    = useState(null);
  const [serverOk,   setServerOk]   = useState(null);
  const [attempt,    setAttempt]    = useState(1);

  // ── Viewport ──
  const [viewStart,  setViewStart]  = useState(0);
  const [viewEnd,    setViewEnd]    = useState(119);
  const [isPanning,  setIsPanning]  = useState(false);
  const [panAnchor,  setPanAnchor]  = useState(null);
  const panMode = useRef(false);

  // ── Multi-question progress ──
  const [qIdx,       setQIdx]       = useState(0);
  const [answers,    setAnswers]    = useState([]);   // [{score, summary, task, zone, trade}]
  const [allDone,    setAllDone]    = useState(false);
  const [feedback,   setFeedback]   = useState(null);
  const [fbLoad,     setFbLoad]     = useState(false);

  // ── Per-question drawing state ──
  const [drawing,    setDrawing]    = useState(false);
  const [dragStart,  setDragStart]  = useState(null);
  const [userZone,   setUserZone]   = useState(null);
  const [userTrade,  setUserTrade]  = useState({ entry: null, stop: null, target: null });
  const [tradeStep,  setTradeStep]  = useState("entry");
  const [userTrend,  setUserTrend]  = useState(null);
  const [qSubmitted, setQSubmitted] = useState(false);
  const [qScore,     setQScore]     = useState(null);

  const svgRef = useRef(null);
  const q = activeQuestions[Math.min(qIdx, total - 1)];

  // ── Load chart data ──
  useEffect(() => {
    setCandles(null);
    fetch(`${BACKEND}/health`, { signal: AbortSignal.timeout(1500) })
      .then(r => r.json())
      .then(() => fetch(`${BACKEND}/chart?symbol=AAPL&tf=1D&indicators=`))
      .then(r => r.json())
      .then(d => {
        if (d.candles?.length >= 80) {
          const slice = d.candles.slice(-120).map(c => ({ o: c.open, h: c.high, l: c.low, c: c.close, v: c.volume }));
          setServerOk(true); setCandles(slice);
          setViewStart(0); setViewEnd(slice.length - 1);
        } else throw new Error();
      })
      .catch(() => {
        setServerOk(false);
        const synth = generateSyntheticChart(activeSeed, 120);
        setCandles(synth); setViewStart(0); setViewEnd(synth.length - 1);
      });
  }, [mod.id, attempt, activeSeed]);

  // ── Generate new chart + AI questions ──
  const generateNewChart = async () => {
    setGenerating(true); setGenError(null);
    // 1. New random seed → new synthetic chart
    const newSeed = Math.floor(Math.random() * 999999) + 1;
    const newCandles = generateSyntheticChart(newSeed, 120);

    // 2. Analyze chart structure to give Claude context
    const prices  = newCandles.map(c => c.c);
    const highs   = newCandles.map(c => c.h);
    const lows    = newCandles.map(c => c.l);
    const first10 = prices.slice(0, 10).reduce((a, b) => a + b) / 10;
    const last10  = prices.slice(-10).reduce((a, b) => a + b) / 10;
    const pctChg  = ((last10 - first10) / first10 * 100).toFixed(1);
    const overallTrend = pctChg > 3 ? "uptrend" : pctChg < -3 ? "downtrend" : "range/sideways";

    // Find swing highs/lows for context
    const swingHighs = highs.slice(10, -10).filter((h, i) => h > highs[i+9] && h > highs[i+11]).slice(0, 3);
    const swingLows  = lows.slice(10, -10).filter((l, i) => l < lows[i+9]  && l < lows[i+11]).slice(0, 3);
    const supportLvl = swingLows.length  ? (Math.min(...swingLows) * 1.001).toFixed(2)  : (Math.min(...lows) * 1.005).toFixed(2);
    const resistLvl  = swingHighs.length ? (Math.max(...swingHighs) * 0.999).toFixed(2) : (Math.max(...highs) * 0.995).toFixed(2);
    const midPrice   = ((parseFloat(supportLvl) + parseFloat(resistLvl)) / 2).toFixed(2);
    const priceRange = `${Math.min(...lows).toFixed(2)}–${Math.max(...highs).toFixed(2)}`;

    // 3. Ask Claude to generate 3 questions for this specific chart
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 600,
          system: `You are a swing trading educator building chart exercises. 
Generate EXACTLY 3 practice questions for a chart with these characteristics:
- Overall structure: ${overallTrend}
- Price range: ${priceRange}
- Approximate support level: ${supportLvl}
- Approximate resistance level: ${resistLvl}
- Price change first→last 10 candles: ${pctChg}%

Return ONLY valid JSON, no markdown, no explanation. Format:
{"questions":[
  {"task":"trend","prompt":"...","opts":["...","...","..."],"correctOpt":0},
  {"task":"support","prompt":"..."},
  {"task":"resistance","prompt":"..."}
]}

Rules:
- task must be one of: "trend", "support", "resistance", "trade"
- trend questions need: prompt, opts (array of 3), correctOpt (0/1/2 index)
- support/resistance questions need only: prompt
- trade questions need only: prompt
- Mix at least 2 different task types
- The correct answer for trend must match the actual chart structure: ${overallTrend}
- Prompts should reference what is visually visible (swing highs/lows, zones, structure)
- Keep prompts concise and specific, max 15 words each`,
          messages: [{ role: "user", content: `Generate 3 questions for this chart. Overall: ${overallTrend}. Support ~${supportLvl}, Resistance ~${resistLvl}.` }]
        })
      });
      const d   = await res.json();
      const txt = d.content?.map(c => c.text || "").join("") || "";
      const clean = txt.replace(/```json\n?|```\n?/g, "").trim();
      const parsed = JSON.parse(clean);

      if (!parsed.questions || parsed.questions.length < 2) throw new Error("Invalid questions format");

      // Validate each question has required fields
      const validated = parsed.questions.filter(q => {
        if (!q.task || !q.prompt) return false;
        if (q.task === "trend" && (!q.opts || q.opts.length < 2 || q.correctOpt === undefined)) return false;
        return true;
      });
      if (validated.length < 2) throw new Error("Not enough valid questions");

      setCustomSeed(newSeed);
      setCustomQuestions(validated);
      // Reset all exercise state
      setQIdx(0); setAnswers([]); setAllDone(false);
      setFeedback(null); setFbLoad(false);
      setQSubmitted(false); setQScore(null);
      setUserZone(null); setUserTrend(null);
      setUserTrade({ entry: null, stop: null, target: null }); setTradeStep("entry");
      setAttempt(a => a + 1);
    } catch (e) {
      setGenError("Failed to generate questions — try again");
      console.error("Generate error:", e);
    }
    setGenerating(false);
  };

  // ── Chart math ──
  const visible = candles ? candles.slice(viewStart, viewEnd + 1) : [];
  const vLen    = Math.max(visible.length, 1);
  const prices  = visible.flatMap(c => [c.h, c.l]);
  const minP    = prices.length ? Math.min(...prices) * 0.997 : 90;
  const maxP    = prices.length ? Math.max(...prices) * 1.003 : 120;
  const rangeP  = maxP - minP || 1;
  const xOf     = i => PAD.l + (i / Math.max(vLen - 1, 1)) * chartW;
  const yOf     = p => PAD.t + chartH - ((p - minP) / rangeP) * chartH;
  const barW    = Math.max(1.5, chartW / vLen * 0.72);
  const priceLabels = Array.from({ length: 5 }, (_, i) => {
    const p = minP + (i / 4) * rangeP;
    return { y: yOf(p), label: p.toFixed(2) };
  });

  // ── SVG coordinate conversion (handles responsive scaling) ──
  const svgCoords = (e) => {
    const svg = svgRef.current; if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (W / rect.width),
      y: (e.clientY - rect.top)  * ((H + 8) / rect.height),
    };
  };
  const yToP = y => minP + ((PAD.t + chartH - y) / chartH) * rangeP;

  // ── Compute correct zones from chart data ──
  const computeZones = () => {
    if (!candles || !candles.length) return { support: null, resistance: null };
    const allLows  = candles.map(c => c.l).sort((a, b) => a - b);
    const allHighs = candles.map(c => c.h).sort((a, b) => b - a);
    const sLo = allLows[Math.floor(allLows.length * 0.10)];
    const sHi = allLows[Math.floor(allLows.length * 0.20)];
    const rLo = allHighs[Math.floor(allHighs.length * 0.10)];
    const rHi = allHighs[Math.floor(allHighs.length * 0.20)];
    return {
      support:    { lo: +Math.min(sLo, sHi).toFixed(2), hi: +Math.max(sLo, sHi).toFixed(2) },
      resistance: { lo: +Math.min(rLo, rHi).toFixed(2), hi: +Math.max(rLo, rHi).toFixed(2) },
    };
  };
  const zones       = computeZones();
  const correctZone = q.task === "support" ? zones.support
                    : q.task === "resistance" ? zones.resistance : null;

  // ── Zoom ──
  const zoom = (delta, cx) => {
    if (!candles) return;
    const span    = viewEnd - viewStart;
    const factor  = delta > 0 ? 0.8 : 1.25;
    const newSpan = Math.round(Math.max(20, Math.min(candles.length - 1, span * factor)));
    const ratio   = cx ? (cx - PAD.l) / chartW : 0.5;
    const centerI = viewStart + Math.round(span * ratio);
    let ns = Math.round(centerI - newSpan * ratio);
    let ne = ns + newSpan;
    if (ns < 0)                   { ns = 0; ne = newSpan; }
    if (ne >= candles.length)     { ne = candles.length - 1; ns = ne - newSpan; }
    setViewStart(Math.max(0, ns)); setViewEnd(Math.min(candles.length - 1, ne));
  };
  const onWheel = (e) => { e.preventDefault(); const { x } = svgCoords(e); zoom(e.deltaY < 0 ? 1 : -1, x); };

  // ── Mouse handlers ──
  const onMouseDown = (e) => {
    const { x, y } = svgCoords(e);
    const inChart   = x >= PAD.l && x <= W - PAD.r && y >= PAD.t && y <= PAD.t + chartH;
    if (!inChart) return;
    if (e.altKey || e.button === 1) {
      panMode.current = true; setIsPanning(true);
      setPanAnchor({ clientX: e.clientX, viewStart }); return;
    }
    if (qSubmitted) return;
    const price = yToP(y);
    if (q.task === "support" || q.task === "resistance") {
      setDrawing(true); setDragStart({ price }); setUserZone({ lo: price, hi: price });
    }
    if (q.task === "trade") {
      if      (tradeStep === "entry")  { setUserTrade(t => ({ ...t, entry:  price })); setTradeStep("stop"); }
      else if (tradeStep === "stop")   { setUserTrade(t => ({ ...t, stop:   price })); setTradeStep("target"); }
      else if (tradeStep === "target") { setUserTrade(t => ({ ...t, target: price })); setTradeStep("done"); }
    }
  };

  const onMouseMove = (e) => {
    const { x, y } = svgCoords(e);
    if (isPanning && panAnchor && candles) {
      const rect  = svgRef.current.getBoundingClientRect();
      const dxCand = Math.round((e.clientX - panAnchor.clientX) * (W / rect.width) / chartW * (viewEnd - viewStart));
      const span   = viewEnd - viewStart;
      const ns     = Math.max(0, Math.min(candles.length - 1 - span, panAnchor.viewStart - dxCand));
      setViewStart(ns); setViewEnd(ns + span); return;
    }
    if (!drawing || (q.task !== "support" && q.task !== "resistance") || qSubmitted) return;
    const price = yToP(y);
    setUserZone({ lo: Math.min(dragStart.price, price), hi: Math.max(dragStart.price, price) });
  };

  const onMouseUp = () => {
    setDrawing(false);
    if (isPanning) { setIsPanning(false); panMode.current = false; setPanAnchor(null); }
  };

  // ── Scoring ──
  const calcZoneScore = (user, correct) => {
    if (!user || !correct) return 0;
    const uSpan = user.hi - user.lo, cSpan = correct.hi - correct.lo;
    if (uSpan <= 0 || cSpan <= 0) return 0;
    const overlap   = Math.max(0, Math.min(user.hi, correct.hi) - Math.max(user.lo, correct.lo));
    const coverage  = overlap / cSpan;
    const precision = overlap / uSpan;
    return Math.round(Math.min(100, (coverage * 0.6 + precision * 0.4) * 100));
  };

  const calcTradeScore = (t) => {
    if (!t.entry || !t.stop || !t.target) return 0;
    const rr     = Math.abs(t.target - t.entry) / Math.abs(t.entry - t.stop);
    const rrPts  = rr >= 2 ? 50 : rr >= 1.5 ? 35 : rr >= 1 ? 20 : 5;
    const sOk    = t.stop   < t.entry ? 25 : 0;
    const tOk    = t.target > t.entry ? 25 : 0;
    return Math.min(100, rrPts + sOk + tOk);
  };

  // ── Submit current question ──
  const submitQ = () => {
    let sc = 0, summary = "";
    if (q.task === "trend") {
      sc = userTrend === q.correctOpt ? 100 : 20;
      summary = `Selected: "${q.opts[userTrend]}". Correct: "${q.opts[q.correctOpt]}".`;
    } else if (q.task === "support" || q.task === "resistance") {
      sc = calcZoneScore(userZone, correctZone);
      const lbl = q.task === "support" ? "Support" : "Resistance";
      summary = userZone
        ? `${lbl}: ${userZone.lo.toFixed(2)}–${userZone.hi.toFixed(2)}. Correct: ${correctZone?.lo?.toFixed(2)}–${correctZone?.hi?.toFixed(2)}.`
        : `No ${lbl} zone drawn.`;
    } else if (q.task === "trade") {
      sc = calcTradeScore(userTrade);
      const rr = userTrade.entry && userTrade.stop
        ? (Math.abs(userTrade.target - userTrade.entry) / Math.abs(userTrade.entry - userTrade.stop)).toFixed(2) : "N/A";
      summary = `Entry:${userTrade.entry?.toFixed(2)} Stop:${userTrade.stop?.toFixed(2)} Target:${userTrade.target?.toFixed(2)} R:R=${rr}`;
    }
    setQScore(sc); setQSubmitted(true);
    const newAnswers = [...answers, { score: sc, summary, task: q.task, zone: userZone ? {...userZone} : null, trade: {...userTrade} }];
    setAnswers(newAnswers);
    if (qIdx === total - 1) { setAllDone(true); getFeedback(newAnswers); }
  };

  const getFeedback = async (ans) => {
    setFbLoad(true);
    const avg     = Math.round(ans.reduce((s, a) => s + a.score, 0) / ans.length);
    const details = ans.map((a, i) => `Q${i+1} (${a.task}): ${a.score}/100 — ${a.summary}`).join("\n");
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 350,
          system: "You are a concise swing trading coach. Give sharp practical feedback in Hebrew. 4-5 sentences.",
          messages: [{ role: "user", content:
            `Module: ${mod.title}\nOverall: ${avg}/100\n\n${details}\n\nFeedback: what they identified well, what needs work, one concrete tip.`
          }]
        })
      });
      const d = await res.json();
      setFeedback(d.content?.map(c => c.text || "").join("") || "");
    } catch { setFeedback(""); }
    setFbLoad(false);
  };

  // ── Navigate to next question ──
  const nextQ = () => {
    setQIdx(i => i + 1);
    setQSubmitted(false); setQScore(null);
    setUserZone(null); setUserTrend(null);
    setUserTrade({ entry: null, stop: null, target: null }); setTradeStep("entry");
    setDrawing(false);
  };

  const reset = () => {
    setQIdx(0); setAnswers([]); setAllDone(false);
    setFeedback(null); setFbLoad(false);
    setQSubmitted(false); setQScore(null);
    setUserZone(null); setUserTrend(null);
    setUserTrade({ entry: null, stop: null, target: null }); setTradeStep("entry");
    setDrawing(false); setAttempt(a => a + 1);
    // keep customQuestions/customSeed — same chart, same questions, retry
  };

  const resetToModule = () => {
    setCustomQuestions(null); setCustomSeed(null);
    setQIdx(0); setAnswers([]); setAllDone(false);
    setFeedback(null); setFbLoad(false);
    setQSubmitted(false); setQScore(null);
    setUserZone(null); setUserTrend(null);
    setUserTrade({ entry: null, stop: null, target: null }); setTradeStep("entry");
    setDrawing(false); setAttempt(a => a + 1);
  };

  const canSubmitQ = () => {
    if (qSubmitted) return false;
    if (q.task === "trend")                             return userTrend !== null;
    if (q.task === "support" || q.task === "resistance") return userZone && (userZone.hi - userZone.lo) > 0.05;
    if (q.task === "trade")                             return tradeStep === "done";
    return false;
  };

  const avgScore   = answers.length ? Math.round(answers.reduce((s, a) => s + a.score, 0) / answers.length) : null;
  const scoreColor = s => s >= 80 ? "#10b981" : s >= 60 ? "#f59e0b" : "#ef4444";
  const taskBadge  = t => t === "support" ? { label: "🟢 Support Zone", col: "#22c55e" }
                        : t === "resistance" ? { label: "🔴 Resistance Zone", col: "#f59e0b" }
                        : t === "trade" ? { label: "📐 Trade Setup", col: "#60a5fa" }
                        : { label: "📊 Market Structure", col: "#a78bfa" };
  const badge      = taskBadge(q.task);
  const isZoneTool  = (q.task === "support" || q.task === "resistance") && !qSubmitted;
  const isTradeTool = q.task === "trade" && tradeStep !== "done" && !qSubmitted;
  const cursor      = isPanning ? "grabbing" : isZoneTool || isTradeTool ? "crosshair" : "grab";

  if (!candles) return (
    <div style={{ padding: "40px 0", textAlign: "center", color: "#4b5563" }}>
      <div style={{ fontSize: 28, marginBottom: 10 }}>📊</div>
      <span className="dots"><span>●</span><span>●</span><span>●</span></span>
      <div style={{ fontSize: 12, marginTop: 8 }}>Loading chart...</div>
    </div>
  );

  return (
    <div>
      {/* ── Header: progress + current question ── */}
      <div style={{ marginBottom: 10 }}>
        {/* Progress bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <div style={{ fontSize: 10, color: "#a78bfa", textTransform: "uppercase", letterSpacing: "1px" }}>✍️ Exercise</div>
          <div style={{ display: "flex", gap: 5 }}>
            {activeQuestions.map((qq, i) => {
              const done = i < answers.length;
              const curr = i === qIdx;
              const bCol = done ? scoreColor(answers[i].score) : curr ? "#a78bfa" : "#1f2937";
              return (
                <div key={i} title={`Q${i+1}: ${taskBadge(qq.task).label}`}
                  style={{ width: 10, height: 10, borderRadius: "50%", background: bCol,
                    border: curr ? `2px solid #a78bfa` : `1px solid ${bCol}`, transition: "all .2s" }}/>
              );
            })}
          </div>
          <div style={{ fontSize: 10, color: "#4b5563" }}>
            {allDone ? "All done ✓" : `Question ${qIdx + 1} of ${total}`}
          </div>
          {customQuestions && (
            <div style={{ fontSize: 9, color: "#f59e0b", background: "#1a1200",
              border: "1px solid #f59e0b44", borderRadius: 4, padding: "2px 6px" }}>🎲 generated</div>
          )}
          {serverOk === false && (
            <div style={{ marginLeft: customQuestions ? 0 : "auto", fontSize: 9, color: "#4b5563", background: "#0f172a",
              border: "1px solid #1f2937", borderRadius: 4, padding: "2px 6px" }}>synthetic</div>
          )}
          {/* Generate new chart button */}
          <button
            onClick={generating ? undefined : generateNewChart}
            disabled={generating}
            style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5,
              background: generating ? "#0f172a" : "#1a1a2e", border: "1px solid #7c3aed66",
              borderRadius: 6, color: generating ? "#4b5563" : "#a78bfa",
              padding: "4px 10px", cursor: generating ? "wait" : "pointer",
              fontSize: 11, fontWeight: 600, transition: "all .15s" }}>
            {generating
              ? <><span className="dots" style={{ fontSize: 8 }}><span>●</span><span>●</span><span>●</span></span> Generating...</>
              : <>🎲 New Chart</>}
          </button>
        </div>

        {/* Task badge + prompt */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6,
          background: `${badge.col}18`, border: `1px solid ${badge.col}44`,
          borderRadius: 6, padding: "3px 10px", marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: badge.col, fontWeight: 600 }}>{badge.label}</span>
        </div>
        <div style={{ fontSize: 13, color: "#e8eaf0", fontWeight: 600, lineHeight: 1.5 }}>{q.prompt}</div>
      </div>

      {/* ── Instruction hint ── */}
      {!qSubmitted && (
        <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 8, padding: "5px 10px",
          background: "#0f172a", borderRadius: 6, border: "1px solid #1f2937" }}>
          {q.task === "support"    && "🟢 Click and drag to draw the support zone (price floor)"}
          {q.task === "resistance" && "🔴 Click and drag to draw the resistance zone (price ceiling)"}
          {q.task === "trend"      && "Select the correct market structure below the chart"}
          {q.task === "trade"      && (
            <>
              <span style={{ color: tradeStep === "entry"  ? "#22c55e" : "#4b5563" }}>① Entry</span>
              {" → "}
              <span style={{ color: tradeStep === "stop"   ? "#ef4444" : "#4b5563" }}>② Stop Loss</span>
              {" → "}
              <span style={{ color: tradeStep === "target" ? "#60a5fa" : "#4b5563" }}>③ Target</span>
              {tradeStep === "done" && <span style={{ color: "#f59e0b" }}> · Ready ✓</span>}
            </>
          )}
          <span style={{ float: "right", color: "#374151" }}>scroll=zoom · alt+drag=pan</span>
        </div>
      )}

      {/* ── Zoom controls ── */}
      <div style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
        <button className="bg" style={{ fontSize: 13, padding: "2px 10px", fontWeight: 700 }} onClick={() => zoom(1, W / 2)}>＋</button>
        <button className="bg" style={{ fontSize: 13, padding: "2px 10px", fontWeight: 700 }} onClick={() => zoom(-1, W / 2)}>－</button>
        <div style={{ fontSize: 10, color: "#374151" }}>{visible.length} candles</div>
        <button className="bg" style={{ fontSize: 10, marginLeft: "auto" }}
          onClick={() => { setViewStart(0); setViewEnd(candles.length - 1); }}>Reset View</button>
      </div>

      {/* ── SVG Chart ── */}
      <div style={{ borderRadius: 10, overflow: "hidden", border: "1px solid #1f2937", cursor, userSelect: "none" }}>
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H + 8}`}
          style={{ display: "block", background: "#090d17", width: "100%", height: "auto" }}
          onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp} onWheel={onWheel}>

          {/* Price grid */}
          {priceLabels.map((pl, i) => (
            <g key={i}>
              <line x1={PAD.l} y1={pl.y} x2={W - PAD.r} y2={pl.y} stroke="#1a2035" strokeWidth="0.7"/>
              <text x={PAD.l - 5} y={pl.y + 4} textAnchor="end" fill="#374151" fontSize="9" fontFamily="monospace">{pl.label}</text>
            </g>
          ))}

          {/* Candles */}
          {visible.map((c, i) => {
            const x    = xOf(i), bull = c.c >= c.o, col = bull ? "#22c55e" : "#ef4444";
            const bTop = yOf(Math.max(c.o, c.c)), bBot = yOf(Math.min(c.o, c.c));
            return (
              <g key={i}>
                <line x1={x} y1={yOf(c.h)} x2={x} y2={yOf(c.l)} stroke={col} strokeWidth="0.9" opacity="0.8"/>
                <rect x={x - barW / 2} y={bTop} width={barW} height={Math.max(1, bBot - bTop)} fill={col} opacity="0.9"/>
              </g>
            );
          })}

          {/* Ghost zones from previous answers */}
          {answers.map((ans, ai) => {
            if (!ans.zone) return null;
            const col = ans.task === "support" ? "#22c55e" : "#f59e0b";
            const y1  = yOf(ans.zone.hi), y2 = yOf(ans.zone.lo);
            return (
              <g key={`prev-${ai}`} opacity="0.35">
                <rect x={PAD.l} y={y1} width={chartW} height={Math.max(1, y2 - y1)}
                  fill={`${col}15`} stroke={col} strokeWidth="1" strokeDasharray="3,3"/>
                <text x={PAD.l + 4} y={y1 - 3} fill={col} fontSize="8" fontFamily="monospace">Q{ai+1}</text>
              </g>
            );
          })}

          {/* Current user zone */}
          {userZone && (() => {
            const baseCol = q.task === "support" ? "#22c55e" : "#f59e0b";
            const col     = qSubmitted ? (qScore >= 70 ? "#10b981" : "#ef4444") : baseCol;
            const y1 = yOf(userZone.hi), y2 = yOf(userZone.lo);
            return (
              <g>
                <rect x={PAD.l} y={y1} width={chartW} height={Math.max(2, y2 - y1)}
                  fill={`${col}18`} stroke={col} strokeWidth="1.5" strokeDasharray={qSubmitted ? "0" : "5,3"}/>
                <text x={PAD.l + 5} y={y1 - 4} fill={col} fontSize="9" fontFamily="monospace">
                  {qSubmitted ? `Your zone (${qScore}%)` : `${userZone.lo.toFixed(2)} – ${userZone.hi.toFixed(2)}`}
                </text>
              </g>
            );
          })()}

          {/* Correct zone overlay after submit */}
          {qSubmitted && correctZone && (q.task === "support" || q.task === "resistance") && (() => {
            const col = q.task === "support" ? "#10b981" : "#f59e0b";
            const y1  = yOf(correctZone.hi), y2 = yOf(correctZone.lo);
            return (
              <g>
                <rect x={PAD.l} y={y1} width={chartW} height={Math.max(2, y2 - y1)}
                  fill={`${col}12`} stroke={col} strokeWidth="1.5"/>
                <text x={W - PAD.r - 4} y={y1 - 4} textAnchor="end" fill={col} fontSize="9" fontFamily="monospace">Correct ✓</text>
              </g>
            );
          })()}

          {/* Trade lines */}
          {q.task === "trade" && [
            { price: userTrade.entry,  color: "#22c55e", label: "Entry" },
            { price: userTrade.stop,   color: "#ef4444", label: "Stop" },
            { price: userTrade.target, color: "#60a5fa", label: "Target" },
          ].map(({ price, color, label }) => price && (
            <g key={label}>
              <line x1={PAD.l} y1={yOf(price)} x2={W - PAD.r} y2={yOf(price)}
                stroke={color} strokeWidth="1.5" strokeDasharray="6,3"/>
              <text x={W - PAD.r - 4} y={yOf(price) - 4} textAnchor="end"
                fill={color} fontSize="9" fontFamily="monospace">{label} {price.toFixed(2)}</text>
            </g>
          ))}

          {/* R:R shading */}
          {q.task === "trade" && userTrade.entry && userTrade.target && (
            <rect x={PAD.l} y={yOf(Math.max(userTrade.entry, userTrade.target))} width={chartW}
              height={Math.abs(yOf(userTrade.entry) - yOf(userTrade.target))} fill="#60a5fa09"/>
          )}
        </svg>
      </div>

      {/* ── Trend buttons ── */}
      {q.task === "trend" && !qSubmitted && (
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          {q.opts.map((opt, i) => (
            <button key={i} onClick={() => setUserTrend(i)}
              style={{ flex: 1, padding: "10px 8px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                cursor: "pointer", transition: "all .15s", border: "1px solid",
                borderColor: userTrend === i ? "#1e6fff" : "#1f2937",
                background:  userTrend === i ? "#1e3a5f" : "#0f172a",
                color:       userTrend === i ? "#60a5fa" : "#6b7280" }}>{opt}</button>
          ))}
        </div>
      )}

      {/* Trend result */}
      {q.task === "trend" && qSubmitted && (
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          {q.opts.map((opt, i) => {
            const isC = i === q.correctOpt, isSel = i === userTrend;
            return (
              <div key={i} style={{ flex: 1, padding: "10px 8px", borderRadius: 8, fontSize: 12,
                fontWeight: 600, textAlign: "center", border: "1px solid",
                borderColor: isC ? "#10b981" : isSel ? "#ef4444" : "#1f2937",
                background:  isC ? "#0f2a0f"  : isSel ? "#2d1515"  : "#0f172a",
                color:       isC ? "#4ade80"  : isSel ? "#f87171"  : "#374151" }}>
                {opt}{isC ? " ✓" : isSel && !isC ? " ✗" : ""}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Per-question score (not last) ── */}
      {qSubmitted && !allDone && (
        <div style={{ marginTop: 10, padding: "10px 14px", background: "#0f172a",
          border: `1px solid ${scoreColor(qScore)}44`, borderRadius: 8,
          display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 8, border: `2px solid ${scoreColor(qScore)}`,
            background: `${scoreColor(qScore)}18`, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: scoreColor(qScore), lineHeight: 1 }}>{qScore}</div>
            <div style={{ fontSize: 7, color: "#4b5563" }}>/100</div>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: scoreColor(qScore) }}>
              {qScore >= 80 ? "Great identification!" : qScore >= 60 ? "On the right track" : "Needs work — see correct zone"}
            </div>
            {q.task === "trade" && userTrade.entry && userTrade.stop && (
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                R:R = {(Math.abs(userTrade.target - userTrade.entry) / Math.abs(userTrade.entry - userTrade.stop)).toFixed(2)}x
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Final results (all questions done) ── */}
      {allDone && (
        <div style={{ marginTop: 12, background: "#0f172a",
          border: `1px solid ${scoreColor(avgScore)}44`, borderRadius: 10, padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
            <div style={{ width: 56, height: 56, borderRadius: 10, border: `2px solid ${scoreColor(avgScore)}`,
              background: `${scoreColor(avgScore)}18`, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: scoreColor(avgScore), lineHeight: 1 }}>{avgScore}</div>
              <div style={{ fontSize: 8, color: "#4b5563" }}>avg</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: scoreColor(avgScore), marginBottom: 6 }}>
                {avgScore >= 80 ? "Excellent" : avgScore >= 60 ? "Good work" : "Keep practicing"} — {total} questions
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {answers.map((a, i) => (
                  <div key={i} style={{ fontSize: 10, color: scoreColor(a.score),
                    background: `${scoreColor(a.score)}18`, border: `1px solid ${scoreColor(a.score)}44`,
                    borderRadius: 4, padding: "2px 7px" }}>
                    Q{i+1} {taskBadge(a.task).label.split(" ")[1] || a.task}: {a.score}
                  </div>
                ))}
              </div>
            </div>
            {fbLoad && <span className="dots"><span>●</span><span>●</span><span>●</span></span>}
          </div>
          {feedback && (
            <div style={{ fontSize: 12, color: "#d1d5db", lineHeight: 1.75,
              direction: "rtl", textAlign: "right", borderTop: "1px solid #1f2937", paddingTop: 10 }}>
              {feedback}
            </div>
          )}
        </div>
      )}

      {/* Gen error */}
      {genError && (
        <div style={{ marginTop: 8, padding: "8px 12px", background: "#2d1515",
          border: "1px solid #ef444444", borderRadius: 6, fontSize: 11,
          color: "#f87171", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          {genError}
          <button onClick={() => setGenError(null)}
            style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 12 }}>✕</button>
        </div>
      )}

      {/* ── Action buttons ── */}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button className="bg" onClick={onBack}>← Back</button>
        {customQuestions && !allDone && (
          <button className="bg" style={{ fontSize: 10 }} onClick={resetToModule}>↩ Module</button>
        )}
        {!qSubmitted ? (
          <>
            {(q.task === "support" || q.task === "resistance") && userZone && (
              <button className="bg" style={{ fontSize: 11 }}
                onClick={() => { setUserZone(null); setDrawing(false); }}>✕ Clear zone</button>
            )}
            {q.task === "trade" && tradeStep !== "entry" && (
              <button className="bg" style={{ fontSize: 11 }}
                onClick={() => { setUserTrade({ entry: null, stop: null, target: null }); setTradeStep("entry"); }}>✕ Reset trade</button>
            )}
            <button className="bp" style={{ flex: 1, opacity: canSubmitQ() ? 1 : 0.4 }}
              onClick={canSubmitQ() ? submitQ : undefined} disabled={!canSubmitQ()}>
              Submit ✓
            </button>
          </>
        ) : !allDone ? (
          <button className="bp" style={{ flex: 1 }} onClick={nextQ}>
            Next → ({qIdx + 2}/{total})
          </button>
        ) : (
          <>
            <button className="bg" style={{ fontSize: 11 }} onClick={reset}>🔄 Retry</button>
            <button className="bg" style={{ fontSize: 11 }} onClick={generateNewChart} disabled={generating}>
              {generating ? "..." : "🎲 New Chart"}
            </button>
            <button className="bp" style={{ flex: 1 }} onClick={onComplete}>Continue to Quiz →</button>
          </>
        )}
      </div>
    </div>
  );
}


// ── Module Lesson Component ────────────────────────────────────────────────────
function ModuleLesson({ mod, onComplete, onBack }) {
  // lesson steps: "theory" | "video" | "exercise" | "quiz" | "done"
  const [step, setStep]           = useState("theory");
  const [theory, setTheory]       = useState(null);
  const [theoryLoad, setTheoryLoad] = useState(false);
  const [quiz, setQuiz]           = useState(null);
  const [quizLoad, setQuizLoad]   = useState(false);
  const [quizAnswers, setQuizAnswers] = useState({});
  const [quizResults, setQuizResults] = useState(null);

  const STEPS = ["theory","video","exercise","quiz","done"];
  const stepIdx = STEPS.indexOf(step);

  // ── Cache helpers (persistent artifact storage) ──
  const cacheGet = async (key) => {
    try { const r = await window.storage.get(key); return r ? JSON.parse(r.value) : null; }
    catch { return null; }
  };
  const cacheSet = async (key, val) => {
    try { await window.storage.set(key, JSON.stringify(val)); } catch {}
  };
  // Cache key per module + content type
  const ck = (type) => `course:${mod.id}:${type}`;

  // ── Load theory (cache-first) ──
  useEffect(() => {
    if (step !== "theory" || theory) return;
    setTheoryLoad(true);
    cacheGet(ck("theory")).then(cached => {
      if (cached) { setTheory(cached); setTheoryLoad(false); return; }
      fetch("https://api.anthropic.com/v1/messages", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          model:"claude-sonnet-4-20250514", max_tokens:900,
          system:"אתה מדריך סווינג טריידינג מקצועי. תן הסבר ברור, מובנה ופרקטי. עברית בלבד. השתמש ב- ** לכותרות בלבד.",
          messages:[{role:"user", content: mod.theoryPrompt}]
        })
      }).then(r=>r.json()).then(d=>{
        const text = d.content?.map(c=>c.text||"").join("")||"Error";
        cacheSet(ck("theory"), text);
        setTheory(text); setTheoryLoad(false);
      }).catch(()=>{setTheory("Loading error");setTheoryLoad(false);});
    });
  }, [step, theory, mod]);

  // ── Load videos — from curated list in curriculum (no API call) ──
  const [videos,     setVideos]     = useState(null);
  const [videosLoad, setVideosLoad] = useState(false);

  const loadVideos = (force=false) => {
    if (videos && !force) return;
    setVideos(mod.videos || []);
  };

  // ── Load quiz (cache-first) ──
  const loadQuiz = async () => {
    if (quiz) return;
    setQuizLoad(true);
    const cached = await cacheGet(ck("quiz"));
    if (cached) { setQuiz(cached); setQuizLoad(false); return; }
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          model:"claude-sonnet-4-20250514", max_tokens:700,
          system:"Return ONLY valid JSON, no markdown.",
          messages:[{role:"user", content:`Create 3 multiple-choice quiz questions about: ${mod.title} (topics: ${mod.topics.join(", ")}).\n\nReturn ONLY JSON:\n[{"q":"question in Hebrew","opts":["א) ...","ב) ...","ג) ...","ד) ..."],"ans":0}]\n\nans is index 0-3 of correct answer. Questions in Hebrew, practical.`}]
        })
      });
      const data = await res.json();
      const text = data.content?.map(c=>c.text||"").join("")||"";
      const m = text.match(/\[[\s\S]*\]/);
      const parsed = m ? JSON.parse(m[0]) : [];
      cacheSet(ck("quiz"), parsed);
      setQuiz(parsed);
    } catch { setQuiz([]); }
    setQuizLoad(false);
  };

  const checkQuiz = () => {
    if (!quiz) return;
    let correct = 0;
    const results = quiz.map((q,i) => {
      const isOk = parseInt(quizAnswers[i]) === q.ans;
      if (isOk) correct++;
      return { isOk, correct: q.ans };
    });
    setQuizResults({ results, score: correct, total: quiz.length });
  };

  // ── Step effects ──
  useEffect(() => {
    if (step === "video") loadVideos();
    if (step === "quiz")  loadQuiz();
  }, [step]);

  const renderTheory = (text) => {
    if (!text) return null;
    return text.split('\n').map((line, i) => {
      const boldLine = line.replace(/\*\*(.*?)\*\*/g, (_, t) => `<strong>${t}</strong>`);
      return <div key={i} dangerouslySetInnerHTML={{__html: boldLine}}
        style={{ marginBottom: line.trim() === '' ? 8 : 4, lineHeight:1.75, fontSize:13, color: line.startsWith('**') ? '#60a5fa' : '#d1d5db' }}/>;
    });
  };

  const stepLabels = ["📖 Theory","🎬 Video","✍️ Exercise","❓ Quiz","✅ Complete"];

  return (
    <div>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:18 }}>
        <button className="bg" style={{ fontSize:11 }} onClick={onBack}>← Back to Course</button>
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:700, fontSize:15 }}>{mod.title}</div>
          <div style={{ fontSize:11, color:"#6b7280", marginTop:1 }}>{mod.topics.join(" · ")}</div>
        </div>
        <button title="נקה cache של המודול הזה — יוצר תוכן חדש"
          style={{ fontSize:10, color:"#374151", background:"transparent", border:"1px solid #1f2937",
            borderRadius:5, padding:"2px 7px", cursor:"pointer" }}
          onClick={async()=>{
            await Promise.all(["theory","videos","exercise","quiz"].map(t => {
              try { return window.storage.delete(`course:${mod.id}:${t}`); } catch { return null; }
            }));
            setTheory(null); setVideos(null); setExercise(null); setQuiz(null);
            setQuizAnswers({}); setQuizResults(null); setExerciseFb(null);
            setStep("theory");
          }}>
          🗑 נקה cache
        </button>
      </div>

      {/* Step progress */}
      <div style={{ display:"flex", gap:4, marginBottom:20 }}>
        {stepLabels.map((l, i) => (
          <div key={i} style={{ flex:1, textAlign:"center" }}>
            <div style={{ height:3, borderRadius:2, marginBottom:4,
              background: i < stepIdx ? "#10b981" : i === stepIdx ? "#1e6fff" : "#1f2937" }}/>
            <div style={{ fontSize:9, color: i === stepIdx ? "#60a5fa" : i < stepIdx ? "#10b981" : "#4b5563" }}>{l}</div>
          </div>
        ))}
      </div>

      {/* ── THEORY ── */}
      {step === "theory" && (
        <div>
          <div style={{ background:"#0d1f3c", border:"1px solid #1e3a5f", borderRadius:12, padding:"18px 20px", marginBottom:16, minHeight:120 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
              <div style={{ fontSize:10, color:"#1e6fff", textTransform:"uppercase", letterSpacing:"1px" }}>📖 שיעור תיאורטי</div>
              {theory && !theoryLoad && (
                <div style={{ fontSize:9, color:"#1f4a1f", background:"#0f2a0f", border:"1px solid #10b98133",
                  borderRadius:4, padding:"1px 7px" }}>✓ Cached</div>
              )}
            </div>
            {theoryLoad ? (
              <div style={{ color:"#4b5563", fontSize:13 }}>
                <span className="dots"><span>●</span><span>●</span><span>●</span></span> טוען שיעור...
              </div>
            ) : renderTheory(theory)}
          </div>
          <button className="bp" style={{ width:"100%" }} onClick={()=>setStep("video")} disabled={!theory||theoryLoad}>
            המשך לוידאו ←
          </button>
        </div>
      )}

      {/* ── VIDEO ── */}
      {step === "video" && (
        <div>
          <div style={{ fontSize:11, color:"#4b5563", marginBottom:12, textTransform:"uppercase", letterSpacing:"1px" }}>🎬 סרטוני הדרכה מומלצים</div>

          {/* Video cards from curated list */}
          {videos && !videosLoad && videos.map((v, i) => {
            // Build a channel-specific search URL so even if ID is wrong, user finds the video
            const channelSearch = `https://www.youtube.com/results?search_query=${encodeURIComponent(v.title + " " + v.channel)}`;
            return (
              <a key={i} href={channelSearch} target="_blank" rel="noopener noreferrer"
                style={{ display:"block", textDecoration:"none", background:"#0f172a",
                  border:"1px solid #1f2937", borderRadius:11, padding:"14px 16px",
                  marginBottom:10, color:"inherit", transition:"all .2s" }}
                onMouseEnter={e=>{e.currentTarget.style.borderColor="#ef4444";e.currentTarget.style.background="#140808";}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor="#1f2937";e.currentTarget.style.background="#0f172a";}}>
                <div style={{ display:"flex", alignItems:"flex-start", gap:12 }}>
                  <div style={{ width:44, height:44, background:"#ef4444", borderRadius:9,
                    display:"flex", alignItems:"center", justifyContent:"center",
                    fontSize:20, flexShrink:0 }}>▶</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:600, fontSize:13, color:"#e8eaf0", marginBottom:4, lineHeight:1.45 }}>{v.title}</div>
                    <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:4 }}>
                      <span style={{ fontSize:11, color:"#ef4444", fontWeight:700 }}>{v.channel}</span>
                      {v.duration && <span style={{ fontSize:10, color:"#4b5563" }}>⏱ {v.duration}</span>}
                    </div>
                    {v.why && <div style={{ fontSize:11, color:"#6b7280", lineHeight:1.5 }}>{v.why}</div>}
                  </div>
                  <div style={{ fontSize:10, color:"#ef4444", fontWeight:600, flexShrink:0, paddingTop:2 }}>Search ↗</div>
                </div>
              </a>
            );
          })}

          {/* General search fallback */}
          <div style={{ marginTop: videos?.length ? 10 : 0, padding:"10px 14px", background:"#0a0e1a",
            border:"1px solid #1f2937", borderRadius:8 }}>
            <div style={{ fontSize:10, color:"#4b5563", marginBottom:8 }}>Direct YouTube search:</div>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
              {["Rayner Teo", "Humbled Trader", "Trading 212"].map(ch => (
                <a key={ch}
                  href={`https://www.youtube.com/results?search_query=${encodeURIComponent(mod.title + " " + ch)}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ fontSize:11, padding:"4px 10px", background:"#1f2937", borderRadius:5,
                    textDecoration:"none", color:"#9ca3af", border:"1px solid #374151" }}>
                  {ch} ↗
                </a>
              ))}
            </div>
          </div>

          <div style={{ display:"flex", gap:8, marginTop:12 }}>
            <button className="bg" onClick={()=>setStep("theory")}>← Back to Theory</button>
            <button className="bp" style={{ flex:1 }} onClick={()=>setStep("exercise")}>Continue to Exercise ←</button>
          </div>
        </div>
      )}

      {/* ── EXERCISE ── */}
      {step === "exercise" && (
        <ChartExercise
          mod={mod}
          onComplete={() => setStep("quiz")}
          onBack={() => setStep("video")}
        />
      )}

      {/* ── QUIZ ── */}
      {step === "quiz" && (
        <div>
          <div style={{ fontSize:14, fontWeight:700, marginBottom:14 }}>❓ בחינה — {mod.title}</div>
          {quizLoad && <div style={{ color:"#4b5563", fontSize:13 }}><span className="dots"><span>●</span><span>●</span><span>●</span></span> Building questions...</div>}
          {quiz && quiz.map((q, qi) => (
            <div key={qi} style={{ background:"#0f172a", border:`1px solid ${quizResults ? (quizResults.results[qi].isOk?"#10b981":"#ef4444") : "#1f2937"}`, borderRadius:10, padding:"14px 16px", marginBottom:12 }}>
              <div style={{ fontSize:13, fontWeight:600, marginBottom:10, lineHeight:1.55 }}>{qi+1}. {q.q}</div>
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {q.opts.map((opt, oi) => {
                  const isSelected = parseInt(quizAnswers[qi]) === oi;
                  const isCorrect  = oi === q.ans;
                  const showResult = !!quizResults;
                  let bg = "#0a0e1a", border = "#1f2937", color = "#9ca3af";
                  if (showResult && isCorrect) { bg="#0f2a0f"; border="#10b981"; color="#4ade80"; }
                  else if (showResult && isSelected && !isCorrect) { bg="#2d1515"; border="#ef4444"; color="#f87171"; }
                  else if (!showResult && isSelected) { bg="#1e3a5f"; border="#1e6fff"; color="#60a5fa"; }
                  return (
                    <div key={oi} onClick={()=>!quizResults&&setQuizAnswers(a=>({...a,[qi]:oi}))}
                      style={{ padding:"8px 12px", borderRadius:7, border:`1px solid ${border}`, background:bg, cursor:quizResults?"default":"pointer", color, fontSize:13, transition:"all .15s" }}>
                      {opt} {showResult && isCorrect ? " ✓" : ""}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {quiz && quiz.length > 0 && !quizResults && (
            <button className="bp" style={{ width:"100%", marginBottom:10 }}
              disabled={Object.keys(quizAnswers).length < quiz.length}
              onClick={checkQuiz}>בדוק תשובות</button>
          )}
          {quizResults && (
            <div style={{ background: quizResults.score === quizResults.total ? "#0f2a0f" : "#1a1a0a",
              border:`1px solid ${quizResults.score===quizResults.total?"#10b981":"#f59e0b"}`,
              borderRadius:10, padding:"14px 16px", marginBottom:14, textAlign:"center" }}>
              <div style={{ fontSize:28, marginBottom:6 }}>{quizResults.score===quizResults.total?"🏆":"📝"}</div>
              <div style={{ fontWeight:700, fontSize:16, marginBottom:3 }}>
                {quizResults.score} / {quizResults.total} נכון
              </div>
              <div style={{ fontSize:12, color:"#9ca3af" }}>
                {quizResults.score===quizResults.total ? "מושלם! המשך למודול הבא." : "כדאי לחזור על החומר לפני המשך."}
              </div>
            </div>
          )}
          {quizResults && (
            <div style={{ display:"flex", gap:8 }}>
              {quizResults.score < quizResults.total && (
                <button className="bg" onClick={()=>{setStep("theory");setQuiz(null);setQuizAnswers({});setQuizResults(null);}}>↩ חזור לתיאוריה</button>
              )}
              <button className="bp" style={{ flex:1 }} onClick={()=>setStep("done")}>
                {quizResults.score===quizResults.total ? "✅ סיים מודול" : "המשך בכל זאת →"}
              </button>
            </div>
          )}
          {quiz && !quizResults && (
            <button className="bg" style={{ marginTop:6 }} onClick={()=>setStep("exercise")}>← חזור לתרגיל</button>
          )}
        </div>
      )}

      {/* ── DONE ── */}
      {step === "done" && (
        <div style={{ textAlign:"center", padding:"32px 0" }}>
          <div style={{ fontSize:52, marginBottom:12 }}>🏆</div>
          <div style={{ fontSize:20, fontWeight:700, marginBottom:6 }}>{mod.title}</div>
          <div style={{ fontSize:14, color:"#10b981", fontWeight:600, marginBottom:4 }}>הושלם בהצלחה!</div>
          <div style={{ fontSize:13, color:"#6b7280", marginBottom:24, lineHeight:1.6 }}>
            סיימת תיאוריה, וידאו, תרגיל ובחינה.
          </div>
          <button className="bp" style={{ width:"100%", marginBottom:10, fontSize:14 }} onClick={onComplete}>
            ✅ סמן כהושלם וחזור לקורס
          </button>
          <button className="bg" style={{ width:"100%" }} onClick={onBack}>חזור לרשימה</button>
        </div>
      )}
    </div>
  );
}

function LearningHub({ trades }) {
  const [activeModule, setActiveModule] = useState(null); // mod object | null
  const [completedModules, setCompletedModules] = useState(new Set());
  const allModules = COURSE_CURRICULUM.flatMap(l => l.modules);
  const totalModules = allModules.length;

  const handleComplete = (modId) => {
    setCompletedModules(p => { const n = new Set(p); n.add(modId); return n; });
    setActiveModule(null);
  };

  // ── Active lesson view ──
  if (activeModule) {
    return (
      <ModuleLesson
        mod={activeModule}
        onBack={() => setActiveModule(null)}
        onComplete={() => handleComplete(activeModule.id)}
      />
    );
  }

  // ── Course index ──
  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:18, fontWeight:700, marginBottom:4 }}>📚 קורס סווינג טריידינג</div>
        <div style={{ fontSize:13, color:"#6b7280" }}>כל מודול = שיעור מלא: תיאוריה · וידאו · תרגיל · בחינה</div>
      </div>

      {/* Overall progress */}
      <div style={{ background:"#0f172a", borderRadius:10, padding:"12px 16px", marginBottom:20 }}>
        <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:"#6b7280", marginBottom:6 }}>
          <span>התקדמות כללית</span>
          <span className="mono" style={{ color:"#60a5fa" }}>{completedModules.size} / {totalModules} מודולים</span>
        </div>
        <div className="pb" style={{ height:8, borderRadius:4 }}>
          <div className="pf" style={{ height:8, borderRadius:4, width:`${(completedModules.size/totalModules)*100}%`,
            background:"linear-gradient(90deg,#1e6fff,#10b981)" }}/>
        </div>
        {completedModules.size > 0 && (
          <div style={{ fontSize:11, color:"#10b981", marginTop:6 }}>
            {Math.round((completedModules.size/totalModules)*100)}% הושלם · {totalModules-completedModules.size} מודולים נותרו
          </div>
        )}
      </div>

      {/* Curriculum */}
      {COURSE_CURRICULUM.map(level => (
        <div key={level.level} style={{ marginBottom:24 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
            <span style={{ fontSize:20 }}>{level.emoji}</span>
            <span style={{ fontWeight:700, fontSize:16, color:level.color }}>{level.level}</span>
            <div style={{ flex:1, height:1, background:"#1f2937" }}/>
            <span style={{ fontSize:11, color:"#4b5563" }}>
              {level.modules.filter(m=>completedModules.has(m.id)).length}/{level.modules.length}
            </span>
          </div>

          {level.modules.map((mod, idx) => {
            const isDone = completedModules.has(mod.id);
            // Lock if prev level not started yet (optional UX — we keep it open for now)
            return (
              <div key={mod.id}
                style={{ background: isDone ? "#0a1f0a" : "#111827",
                  border:`1px solid ${isDone?"#10b981":"#1f2937"}`,
                  borderRadius:12, marginBottom:8, padding:"14px 16px",
                  cursor:"pointer", transition:"all .2s" }}
                onClick={() => setActiveModule(mod)}
                onMouseEnter={e=>{if(!isDone){e.currentTarget.style.borderColor="#1e6fff";e.currentTarget.style.background="#0d1f3c";}}}
                onMouseLeave={e=>{if(!isDone){e.currentTarget.style.borderColor="#1f2937";e.currentTarget.style.background="#111827";}}}>
                <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                  {/* Status icon */}
                  <div style={{ width:36, height:36, borderRadius:9, flexShrink:0,
                    background: isDone ? "#10b98122" : "#0f172a",
                    border:`1px solid ${isDone?"#10b981":"#1f2937"}`,
                    display:"flex", alignItems:"center", justifyContent:"center", fontSize:16 }}>
                    {isDone ? "✅" : "▶️"}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:600, fontSize:14, marginBottom:3 }}>{mod.title}</div>
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
                      {mod.topics.slice(0,3).map(t => (
                        <span key={t} style={{ fontSize:10, background:"#0f172a", color:"#6b7280", padding:"2px 7px", borderRadius:10 }}>{t}</span>
                      ))}
                      {mod.topics.length > 3 && <span style={{ fontSize:10, color:"#4b5563" }}>+{mod.topics.length-3}</span>}
                    </div>
                  </div>
                  <div style={{ textAlign:"left", flexShrink:0 }}>
                    <div style={{ fontSize:11, color:"#4b5563", marginBottom:2 }}>⏱ {mod.duration}</div>
                    <div style={{ display:"flex", gap:3 }}>
                      {["📖","🎬","✍️","❓"].map(s=>(
                        <span key={s} style={{ fontSize:11, opacity: isDone ? 1 : 0.3 }}>{s}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {completedModules.size === totalModules && (
        <div style={{ background:"linear-gradient(135deg,#0f2a0f,#1a3a1a)", border:"1px solid #10b981", borderRadius:12, padding:"20px", textAlign:"center" }}>
          <div style={{ fontSize:40, marginBottom:8 }}>🏆</div>
          <div style={{ fontSize:18, fontWeight:700, color:"#4ade80", marginBottom:4 }}>הקורס הושלם!</div>
          <div style={{ fontSize:13, color:"#9ca3af" }}>עברת את כל {totalModules} המודולים. עכשיו תרגל את מה שלמדת ביומן.</div>
        </div>
      )}
    </div>
  );
}

// ─── Local Backend Chart Component ────────────────────────────────────────────

const BACKEND_URL = "http://localhost:7432";
const CHART_TFS   = ["1W","1D","4H","2H","1H","30M","15M","5M"];

const INDICATOR_GROUPS = [
  { id:"trend",    label:"מגמה",     indicators:["ema20","ema50","sma200"],       desc:"EMA 20 · EMA 50 · SMA 200" },
  { id:"momentum", label:"מומנטום",  indicators:["rsi","macd"],                  desc:"RSI 14 · MACD" },
  { id:"volatility",label:"תנודתיות",indicators:["bb","atr"],                    desc:"Bollinger Bands · ATR 14" },
  { id:"volume",   label:"Volume",      indicators:["vwap","volume_ma"],             desc:"VWAP · Volume MA20" },
];

// ── Tiny candlestick chart renderer using SVG ──────────────────────────────
function MiniCandleChart({ candles, indicators, height=220 }) {
  if (!candles || candles.length === 0) return null;

  const W = 700, H = height, PAD = { t:10, r:10, b:30, l:60 };
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;

  const prices = candles.flatMap(c => [c.h, c.l]);

  // Include BB bands if present
  if (indicators?.bb) {
    indicators.bb.upper.forEach(v => v && prices.push(v));
    indicators.bb.lower.forEach(v => v && prices.push(v));
  }

  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const range = maxP - minP || 1;

  const n = candles.length;
  const candleW = Math.max(2, Math.floor(plotW / n) - 1);

  const xOf = i => PAD.l + (i / n) * plotW + candleW / 2;
  const yOf = p => PAD.t + plotH - ((p - minP) / range) * plotH;

  // Price axis labels
  const priceLabels = [];
  for (let i = 0; i <= 4; i++) {
    const p = minP + (range * i) / 4;
    priceLabels.push({ y: yOf(p), label: p.toFixed(2) });
  }

  // Time axis — show every ~30 candles
  const step = Math.max(1, Math.floor(n / 6));
  const timeLabels = candles
    .map((c, i) => ({ i, t: c.t }))
    .filter((_, i) => i % step === 0)
    .map(({ i, t }) => ({ x: xOf(i), label: new Date(t).toLocaleDateString("he-IL", { month:"numeric", day:"numeric" }) }));

  // Line helper for indicator series
  const linePath = (ts, vals, color, opacity=1) => {
    if (!vals) return null;
    const pts = ts.map((t, i) => {
      const ci = candles.findIndex(c => c.t === t);
      return ci >= 0 && vals[i] != null ? `${xOf(ci)},${yOf(vals[i])}` : null;
    }).filter(Boolean);
    if (pts.length < 2) return null;
    return <polyline key={color} points={pts.join(" ")} fill="none" stroke={color} strokeWidth="1.2" opacity={opacity}/>;
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width:"100%", height, display:"block" }}>
      {/* Background */}
      <rect width={W} height={H} fill="#0a0e1a"/>
      {/* Grid lines */}
      {priceLabels.map((pl, i) => (
        <g key={i}>
          <line x1={PAD.l} x2={W-PAD.r} y1={pl.y} y2={pl.y} stroke="#1f2937" strokeWidth="0.5"/>
          <text x={PAD.l-4} y={pl.y+3} textAnchor="end" fill="#4b5563" fontSize="9" fontFamily="monospace">{pl.label}</text>
        </g>
      ))}
      {/* Time labels */}
      {timeLabels.map((tl, i) => (
        <text key={i} x={tl.x} y={H-8} textAnchor="middle" fill="#4b5563" fontSize="9">{tl.label}</text>
      ))}

      {/* BB bands */}
      {indicators?.bb && (() => {
        const ts = indicators.bb.t;
        const upPts = ts.map((t,i) => { const ci=candles.findIndex(c=>c.t===t); return ci>=0&&indicators.bb.upper[i]!=null?`${xOf(ci)},${yOf(indicators.bb.upper[i])}`:null; }).filter(Boolean);
        const loPts = ts.map((t,i) => { const ci=candles.findIndex(c=>c.t===t); return ci>=0&&indicators.bb.lower[i]!=null?`${xOf(ci)},${yOf(indicators.bb.lower[i])}`:null; }).filter(Boolean);
        return <>
          <polyline points={upPts.join(" ")} fill="none" stroke="#6366f1" strokeWidth="0.8" strokeDasharray="3,3" opacity="0.6"/>
          <polyline points={loPts.join(" ")} fill="none" stroke="#6366f1" strokeWidth="0.8" strokeDasharray="3,3" opacity="0.6"/>
        </>;
      })()}

      {/* MA lines */}
      {indicators?.ema20  && linePath(indicators.ema20.t,  indicators.ema20.v,  "#f59e0b")}
      {indicators?.ema50  && linePath(indicators.ema50.t,  indicators.ema50.v,  "#60a5fa")}
      {indicators?.sma200 && linePath(indicators.sma200.t, indicators.sma200.v, "#a78bfa")}
      {indicators?.vwap   && linePath(indicators.vwap.t,   indicators.vwap.v,   "#06b6d4", 0.8)}

      {/* Candles */}
      {candles.map((c, i) => {
        const bull = c.c >= c.o;
        const col  = bull ? "#10b981" : "#ef4444";
        const x    = xOf(i);
        const yHi  = yOf(c.h), yLo = yOf(c.l);
        const yO   = yOf(c.o), yCl = yOf(c.c);
        const bTop = Math.min(yO, yCl), bBot = Math.max(yO, yCl);
        const bH   = Math.max(1, bBot - bTop);
        return (
          <g key={i}>
            <line x1={x} x2={x} y1={yHi} y2={yLo} stroke={col} strokeWidth="1"/>
            <rect x={x - candleW/2} y={bTop} width={candleW} height={bH} fill={bull ? col : col} opacity="0.85"/>
          </g>
        );
      })}
    </svg>
  );
}

// ── RSI sub-chart ──────────────────────────────────────────────────────────
function MiniRsiChart({ candles, rsi, height=80 }) {
  if (!rsi || !candles) return null;
  const W=700, H=height, PAD={t:4,r:10,b:16,l:60};
  const plotW=W-PAD.l-PAD.r, plotH=H-PAD.t-PAD.b;
  const n=candles.length;
  const xOf=i=>PAD.l+(i/n)*plotW;
  const yOf=v=>PAD.t+plotH-((v-0)/100)*plotH;
  const pts=rsi.t.map((t,i)=>{const ci=candles.findIndex(c=>c.t===t);return ci>=0&&rsi.v[i]!=null?`${xOf(ci)},${yOf(rsi.v[i])}`:null;}).filter(Boolean);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height,display:"block",marginTop:2}}>
      <rect width={W} height={H} fill="#0a0e1a"/>
      {[30,50,70].map(l=>(
        <g key={l}>
          <line x1={PAD.l} x2={W-PAD.r} y1={yOf(l)} y2={yOf(l)} stroke={l===50?"#1f2937":"#2d1515"} strokeWidth="0.5" strokeDasharray={l===50?"":"2,2"}/>
          <text x={PAD.l-4} y={yOf(l)+3} textAnchor="end" fill="#4b5563" fontSize="8" fontFamily="monospace">{l}</text>
        </g>
      ))}
      <polyline points={pts.join(" ")} fill="none" stroke="#a78bfa" strokeWidth="1.2"/>
      <text x={PAD.l-4} y={H-4} textAnchor="end" fill="#6b7280" fontSize="8">RSI</text>
    </svg>
  );
}

// ── MACD sub-chart ─────────────────────────────────────────────────────────
function MiniMacdChart({ candles, macd, height=80 }) {
  if (!macd || !candles) return null;
  const W=700, H=height, PAD={t:4,r:10,b:16,l:60};
  const plotW=W-PAD.l-PAD.r, plotH=H-PAD.t-PAD.b;
  const n=candles.length;
  const allVals=[...macd.hist,...macd.macd,...macd.signal].filter(v=>v!=null);
  const minV=Math.min(...allVals), maxV=Math.max(...allVals), range=maxV-minV||1;
  const xOf=i=>PAD.l+(i/n)*plotW;
  const yOf=v=>PAD.t+plotH-((v-minV)/range)*plotH;
  const zeroY=yOf(0);
  const barW=Math.max(1,Math.floor(plotW/n)-1);

  const linePts=(series)=>series.map((t,i)=>{const ci=candles.findIndex(c=>c.t===t);return ci>=0&&macd.macd[i]!=null?`${xOf(ci)},${yOf(macd.macd[i])}`:null;}).filter(Boolean);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height,display:"block",marginTop:2}}>
      <rect width={W} height={H} fill="#0a0e1a"/>
      <line x1={PAD.l} x2={W-PAD.r} y1={zeroY} y2={zeroY} stroke="#1f2937" strokeWidth="0.5"/>
      {macd.t.map((t,i)=>{
        const ci=candles.findIndex(c=>c.t===t);
        if(ci<0||macd.hist[i]==null) return null;
        const v=macd.hist[i]; const y=yOf(v); const col=v>=0?"#10b981":"#ef4444";
        const barH=Math.abs(y-zeroY)||1;
        return <rect key={i} x={xOf(ci)-barW/2} y={Math.min(y,zeroY)} width={barW} height={barH} fill={col} opacity="0.7"/>;
      })}
      <polyline points={macd.t.map((t,i)=>{const ci=candles.findIndex(c=>c.t===t);return ci>=0&&macd.macd[i]!=null?`${xOf(ci)},${yOf(macd.macd[i])}`:null;}).filter(Boolean).join(" ")} fill="none" stroke="#60a5fa" strokeWidth="1"/>
      <polyline points={macd.t.map((t,i)=>{const ci=candles.findIndex(c=>c.t===t);return ci>=0&&macd.signal[i]!=null?`${xOf(ci)},${yOf(macd.signal[i])}`:null;}).filter(Boolean).join(" ")} fill="none" stroke="#f59e0b" strokeWidth="1"/>
      <text x={PAD.l-4} y={H-4} textAnchor="end" fill="#6b7280" fontSize="8">MACD</text>
    </svg>
  );
}

// ── Main Chart Panel ───────────────────────────────────────────────────────
function LocalChartPanel({ symbol, exchange }) {
  const [backendOk, setBackendOk]         = useState(null); // null=checking, true, false
  const [tf,        setTf]                = useState("1D");
  const [activeGroups, setActiveGroups]   = useState(["trend"]);
  const [chartData,    setChartData]      = useState(null);
  const [loading,      setLoading]        = useState(false);
  const [error,        setError]          = useState(null);
  const [expanded,     setExpanded]       = useState(false);

  // ── Check backend availability ──
  useEffect(() => {
    fetch(`${BACKEND_URL}/health`, { signal: AbortSignal.timeout(1500) })
      .then(r => r.json())
      .then(() => setBackendOk(true))
      .catch(() => setBackendOk(false));
  }, []);

  // ── Load chart when tf or groups change (only if backend is up) ──
  useEffect(() => {
    if (!backendOk || !expanded) return;
    loadChart();
  }, [tf, activeGroups, backendOk, expanded]);

  const loadChart = async () => {
    setLoading(true); setError(null);
    const inds = activeGroups.flatMap(g => INDICATOR_GROUPS.find(ig => ig.id === g)?.indicators || []);
    const allInds = [...new Set([...inds, "volume_ma"])];
    try {
      const res  = await fetch(`${BACKEND_URL}/chart?symbol=${symbol}&tf=${tf}&indicators=${allInds.join(",")}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setChartData(data);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const toggleGroup = (id) =>
    setActiveGroups(p => p.includes(id) ? p.filter(g=>g!==id) : [...p, id]);

  const showRsi  = activeGroups.includes("momentum") && chartData?.indicators?.rsi;
  const showMacd = activeGroups.includes("momentum") && chartData?.indicators?.macd;

  // ── Backend unavailable: show TradingView fallback ──
  if (backendOk === false) {
    return (
      <div style={{ marginTop:10, background:"#0f172a", border:"1px dashed #374151", borderRadius:9, padding:"12px 14px" }}>
        <div style={{ fontSize:11, color:"#4b5563", marginBottom:8 }}>
          📊 גרף מקומי — Backend לא פועל
        </div>
        <div style={{ fontSize:11, color:"#6b7280", marginBottom:10, lineHeight:1.6 }}>
          הרץ <code style={{background:"#1f2937",padding:"1px 5px",borderRadius:3,color:"#60a5fa"}}>python server.py</code> כדי לאפשר גרפים עם אינדיקטורים מחושבים.
        </div>
        <div style={{ fontSize:10, color:"#4b5563" }}>בינתיים — TradingView:</div>
        <TvButtons symbol={symbol} exchange={exchange}/>
      </div>
    );
  }

  // ── Checking ──
  if (backendOk === null) {
    return <div style={{ marginTop:8, fontSize:11, color:"#4b5563" }}>בודק חיבור לbackend...</div>;
  }

  // ── Backend up ──
  return (
    <div style={{ marginTop:10 }}>
      {/* Toggle button */}
      <button onClick={() => setExpanded(e => !e)}
        style={{ width:"100%", padding:"7px 0", borderRadius:7, border:"1px solid #1e3a5f",
          background:"#0d1f3c", color:"#60a5fa", cursor:"pointer", fontSize:11, fontWeight:600,
          display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
        <span>📊</span>
        {expanded ? "סגור גרף" : `פתח גרף — ${symbol}`}
        <span style={{ opacity:.6 }}>{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div style={{ marginTop:8, background:"#0a0e1a", border:"1px solid #1f2937", borderRadius:9, padding:"10px 12px" }}>

          {/* TF selector */}
          <div style={{ display:"flex", gap:3, marginBottom:8, flexWrap:"wrap" }}>
            {CHART_TFS.map(t => (
              <button key={t} onClick={() => setTf(t)}
                style={{ padding:"2px 8px", borderRadius:5, border:"1px solid", fontSize:11, fontFamily:"monospace", cursor:"pointer",
                  background:  tf===t ? "#1e3a5f" : "transparent",
                  borderColor: tf===t ? "#1e6fff" : "#1f2937",
                  color:       tf===t ? "#60a5fa" : "#6b7280",
                  fontWeight:  tf===t ? 700 : 400 }}>
                {t}
              </button>
            ))}
            <button onClick={loadChart} style={{ marginRight:"auto", padding:"2px 8px", borderRadius:5, border:"1px solid #1f2937", background:"transparent", color:"#4b5563", fontSize:11, cursor:"pointer" }}>
              🔄
            </button>
          </div>

          {/* Indicator groups */}
          <div style={{ display:"flex", gap:4, marginBottom:8, flexWrap:"wrap" }}>
            {INDICATOR_GROUPS.map(g => (
              <button key={g.id} onClick={() => toggleGroup(g.id)}
                style={{ padding:"3px 9px", borderRadius:5, border:"1px solid", fontSize:10, cursor:"pointer",
                  background:  activeGroups.includes(g.id) ? "#1e3a5f" : "transparent",
                  borderColor: activeGroups.includes(g.id) ? "#1e6fff" : "#1f2937",
                  color:       activeGroups.includes(g.id) ? "#60a5fa" : "#6b7280" }}
                title={g.desc}>
                {g.label}
              </button>
            ))}
          </div>

          {/* Meta row */}
          {chartData?.meta && (
            <div style={{ display:"flex", gap:12, fontSize:10, color:"#4b5563", marginBottom:6 }}>
              <span>מחיר: <span style={{color:"#e8eaf0",fontFamily:"monospace"}}>${chartData.meta.last_price}</span></span>
              <span>ATR: <span style={{color:"#f59e0b",fontFamily:"monospace"}}>{chartData.meta.atr14||"—"}</span></span>
              <span>נרות: <span style={{color:"#6b7280"}}>{chartData.meta.candle_count}</span></span>
              <span style={{marginRight:"auto"}}>{new Date(chartData.meta.fetched_at).toLocaleTimeString("he-IL")}</span>
            </div>
          )}

          {/* Chart */}
          {loading && (
            <div style={{ textAlign:"center", padding:"40px 0", color:"#4b5563" }}>
              <span className="dots"><span>●</span><span>●</span><span>●</span></span>
              <div style={{ fontSize:11, marginTop:6 }}>טוען נתונים...</div>
            </div>
          )}

          {error && (
            <div style={{ color:"#ef4444", fontSize:12, padding:"10px 0" }}>שגיאה: {error}</div>
          )}

          {chartData && !loading && (
            <>
              <MiniCandleChart
                candles={chartData.candles}
                indicators={chartData.indicators}
                height={220}
              />
              {showRsi  && <MiniRsiChart  candles={chartData.candles} rsi={chartData.indicators.rsi}  height={75}/>}
              {showMacd && <MiniMacdChart candles={chartData.candles} macd={chartData.indicators.macd} height={75}/>}

              {/* Legend */}
              <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginTop:6, fontSize:10 }}>
                {chartData.indicators.ema20  && <span><span style={{color:"#f59e0b"}}>━</span> EMA20</span>}
                {chartData.indicators.ema50  && <span><span style={{color:"#60a5fa"}}>━</span> EMA50</span>}
                {chartData.indicators.sma200 && <span><span style={{color:"#a78bfa"}}>━</span> SMA200</span>}
                {chartData.indicators.vwap   && <span><span style={{color:"#06b6d4"}}>━</span> VWAP</span>}
                {chartData.indicators.bb     && <span><span style={{color:"#6366f1"}}>- -</span> BB</span>}
              </div>

              {/* TradingView deep-link */}
              <TvButtons symbol={symbol} exchange={exchange} compact/>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── TradingView deep-link buttons (reusable) ───────────────────────────────
function TvButtons({ symbol, exchange, compact }) {
  const [tf, setTf] = useState("1D");
  const tvTf = {"1W":"W","1D":"D","4H":"240","2H":"120","1H":"60","30M":"30","15M":"15","5M":"5"};
  const open = () => window.open(
    `https://www.tradingview.com/chart/?symbol=${exchange}:${symbol}&interval=${tvTf[tf]||"D"}&theme=dark&style=1&studies=STD%3BEMA%2CSTD%3BEMA%2CSTD%3BVolume`,
    "_blank"
  );

  if (compact) return (
    <div style={{ marginTop:8, display:"flex", gap:4, alignItems:"center" }}>
      <span style={{ fontSize:10, color:"#4b5563" }}>TradingView:</span>
      {["1D","4H","1H"].map(t=>(
        <button key={t} onClick={()=>{setTf(t);setTimeout(open,10);}}
          style={{ padding:"2px 7px", borderRadius:4, border:"1px solid #2962ff44", background:"transparent", color:"#2962ff", fontSize:10, cursor:"pointer" }}>
          {t} ↗
        </button>
      ))}
    </div>
  );

  return (
    <div style={{ marginTop:8 }}>
      <div style={{ display:"flex", gap:3, flexWrap:"wrap", marginBottom:6 }}>
        {Object.keys(tvTf).map(t=>(
          <button key={t} onClick={()=>setTf(t)}
            style={{ padding:"2px 7px", borderRadius:4, border:"1px solid", fontSize:10, cursor:"pointer", fontFamily:"monospace",
              background: tf===t?"#1e2d5a":"transparent", borderColor:tf===t?"#2962ff":"#1f2937",
              color:tf===t?"#5b8cff":"#6b7280" }}>
            {t}
          </button>
        ))}
      </div>
      <button onClick={open}
        style={{ width:"100%", padding:"6px", borderRadius:6, border:"1px solid #2962ff",
          background:"linear-gradient(135deg,#131722,#1e2d5a)", color:"#2962ff",
          cursor:"pointer", fontSize:11, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", gap:5 }}>
        📊 פתח ב-TradingView — {symbol} {tf} ↗
      </button>
    </div>
  );
}

// ─── Chart Launcher (kept for backward compat, now wraps LocalChartPanel) ─────
function ChartLauncher({ symbol, exchange }) {
  return <LocalChartPanel symbol={symbol} exchange={exchange}/>;
}


// ─── Main App ─────────────────────────────────────────────────────────────────
export default function TradingJournal() {
  const [tab, setTab] = useState("dashboard");
  const [trades, setTrades] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [selectedTrade, setSelectedTrade] = useState(null);
  const [filterPeriod, setFilterPeriod] = useState("all");

  // Assistant mode
  const [assistantMode, setAssistantMode] = useState(null); // null | "morning" | "drill" | "scan" | "debrief"
  const [showMorningSession, setShowMorningSession] = useState(false);

  const emptyTrade = () => ({
    date: new Date().toISOString().split("T")[0],
    symbol:"", market:"Stock", direction:"Long",
    setup:"", timeframe:"1D", marketTrend:"",
    entryPrice:"", exitPrice:"", shares:"",
    stopLoss:"", target:"",
    entryEmotion:"", exitEmotion:"",
    screenshotLink:"",
    journalAnswers:{},
    disciplineChecks: Array(DISCIPLINE_CRITERIA.length).fill(false),
    status:"open",
  });
  const [form, setForm] = useState(emptyTrade());

  // Backend
  const [backendOk,    setBackendOk]    = useState(false);
  const [backendCheck, setBackendCheck] = useState(false);
  const [chartOpen,    setChartOpen]    = useState({}); // symbol -> tf | null

  const checkBackend = async () => {
    setBackendCheck(true);
    try {
      const r = await fetch(`${BACKEND_URL}/health`, { signal: AbortSignal.timeout(2000) });
      setBackendOk(r.ok);
    } catch { setBackendOk(false); }
    setBackendCheck(false);
  };

  const openInlineChart = (symbol, tf) =>
    setChartOpen(p => ({ ...p, [symbol]: p[symbol] === tf ? null : tf }));

  // Watchlist
  const [wl, setWl] = useState([
    { symbol:"AAPL", name:"Apple Inc.", exchange:"NASDAQ", notes:"" },
    { symbol:"NVDA", name:"NVIDIA Corp.", exchange:"NASDAQ", notes:"" },
    { symbol:"SPY",  name:"SPDR S&P 500", exchange:"NYSE",   notes:"" },
  ]);
  const [wlPrices, setWlPrices] = useState({});
  const [wlLoad, setWlLoad] = useState({});
  const [wlErr, setWlErr] = useState({});
  const [showAddWl, setShowAddWl] = useState(false);
  const [addSym, setAddSym] = useState(""); const [addName, setAddName] = useState(""); const [addEx, setAddEx] = useState("NASDAQ");
  const [wlFilter, setWlFilter] = useState("all");
  const [fetchingAll, setFetchingAll] = useState(false);
  const [suggestions, setSuggestions] = useState([]); const [sugLoad, setSugLoad] = useState(false);

  // Derived
  const closed = useMemo(() => trades.filter(t=>t.status==="closed"), [trades]);
  const totalPnL = useMemo(() => closed.reduce((s,t)=>s+(calcPnL(t)||0),0), [closed]);
  const exp = useMemo(() => expectancy(trades), [trades]);
  const ss  = useMemo(() => skillScore(trades), [trades]);
  const rank = useMemo(() => getSkillRank(ss), [ss]);
  const avgRM = useMemo(() => { const rs=closed.map(t=>parseFloat(calcRM(t))).filter(v=>!isNaN(v)); return rs.length?(rs.reduce((a,b)=>a+b,0)/rs.length).toFixed(2):null; }, [closed]);
  const equityCurve = useMemo(() => {
    const sorted=[...trades].filter(t=>t.status==="closed"&&calcPnL(t)!==null).sort((a,b)=>new Date(a.date)-new Date(b.date));
    let eq=0; return sorted.map(t=>{eq+=calcPnL(t);return{date:t.date,equity:parseFloat(eq.toFixed(2))};});
  }, [trades]);
  const filtered = useMemo(() => {
    const now=new Date();
    return trades.filter(t=>filterPeriod==="all"||(now-new Date(t.date))/86400000<=(filterPeriod==="week"?7:30));
  }, [trades, filterPeriod]);

  const saveTrade = () => {
    setTrades(p=>[{...form,id:Date.now(),
      entryPrice:parseFloat(form.entryPrice)||0, exitPrice:parseFloat(form.exitPrice)||0,
      shares:parseFloat(form.shares)||0, stopLoss:parseFloat(form.stopLoss)||0, target:parseFloat(form.target)||0,
    },...p]);
    setShowNew(false); setForm(emptyTrade());
  };

  const saveSetupFromMorning = (setupData) => {
    const t = emptyTrade();
    t.symbol = setupData.symbol || "";
    t.journalAnswers = { whyValid: setupData.whyWorks || "", planDetails: `Entry: ${setupData.entry || ""} | Stop: ${setupData.stop || ""} | Target: ${setupData.target || ""}` };
    setForm(t);
    setShowNew(true);
  };

  // Watchlist helpers
  const fetchPrice = async (symbol) => {
    setWlLoad(p=>({...p,[symbol]:true})); setWlErr(p=>({...p,[symbol]:null}));
    try {
      const reply = await callClaude(
        [{role:"user", content:`Search current stock price for ${symbol} from Google Finance or Yahoo Finance. Return ONLY JSON (no markdown): {"symbol":"${symbol}","price":0,"change":0,"changePercent":0,"open":0,"high":0,"low":0,"volume":0,"marketCap":"","week52High":0,"week52Low":0,"pe":null,"avgVolume":0,"lastUpdated":""}`}],
        "", true
      );
      const m=reply.match(/\{[\s\S]*?\}/);
      if(m) setWlPrices(p=>({...p,[symbol]:JSON.parse(m[0])})); else throw new Error();
    } catch { setWlErr(p=>({...p,[symbol]:"Error"})); }
    setWlLoad(p=>({...p,[symbol]:false}));
  };

  const fetchAll = async () => { setFetchingAll(true); for(const s of wl) await fetchPrice(s.symbol); setFetchingAll(false); };

  const searchSym = async (q) => {
    if(!q||q.length<2){setSuggestions([]);return;} setSugLoad(true);
    try {
      const reply = await callClaude([{role:"user",content:`List 5 NYSE/NASDAQ stocks matching "${q}". Return ONLY JSON array: [{"symbol":"","name":"","exchange":""}]. No markdown.`}],"");
      const m=reply.match(/\[[\s\S]*\]/); if(m) setSuggestions(JSON.parse(m[0]));
    } catch {} setSugLoad(false);
  };

  const addToWl = (sym, name, exchange) => {
    if(!sym) return; const s=sym.toUpperCase();
    if(wl.find(w=>w.symbol===s)) return;
    setWl(p=>[...p,{symbol:s,name:name||s,exchange:exchange||"NASDAQ",notes:""}]);
    setAddSym(""); setAddName(""); setSuggestions([]); setShowAddWl(false);
  };

  const wlFiltered = wl.filter(w=>wlFilter==="all"||w.exchange===wlFilter);
  const todayDrill = DRILL_BY_DAY[new Date().getDay()];

  // ─── RENDER ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight:"100vh", background:"#0a0e1a", color:"#e8eaf0", fontFamily:"'IBM Plex Sans','Segoe UI',sans-serif", direction:"rtl" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;600&display=swap');
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:4px;height:4px}::-webkit-scrollbar-track{background:#0a0e1a}::-webkit-scrollbar-thumb{background:#2a3050;border-radius:2px}
        .tab{transition:all .2s;border:none;cursor:pointer;padding:8px 15px;border-radius:7px;font-size:12.5px;font-weight:500;font-family:inherit}
        .tab.on{background:#1e6fff;color:#fff}.tab.off{background:transparent;color:#6b7280}.tab.off:hover{background:#151c30;color:#e8eaf0}
        .card{background:#111827;border:1px solid #1f2937;border-radius:12px;padding:18px}
        .inp{background:#0f172a;border:1px solid #1f2937;border-radius:7px;color:#e8eaf0;padding:8px 11px;font-size:13px;font-family:inherit;transition:border-color .2s;width:100%;outline:none}
        .inp:focus{border-color:#1e6fff}.inp::placeholder{color:#2d3748}
        select.inp option{background:#0f172a}
        .bp{background:#1e6fff;color:#fff;border:none;border-radius:7px;padding:8px 16px;font-weight:600;cursor:pointer;font-family:inherit;font-size:13px;transition:all .2s}
        .bp:hover{background:#1557dd;transform:translateY(-1px)}
        .bp:disabled{opacity:.5;cursor:not-allowed;transform:none}
        .bg{background:transparent;color:#6b7280;border:1px solid #1f2937;border-radius:7px;padding:6px 12px;font-weight:500;cursor:pointer;font-family:inherit;font-size:12px;transition:all .2s}
        .bg:hover{color:#e8eaf0;border-color:#374151}
        .bg:disabled{opacity:.4;cursor:not-allowed}
        .trow{border-bottom:1px solid #0f172a;padding:11px 0;transition:background .15s;cursor:pointer}
        .trow:hover{background:#0d1525;border-radius:6px}
        .chip{display:inline-block;padding:4px 10px;border-radius:14px;font-size:11px;margin:2px;cursor:pointer;border:1px solid #1f2937;transition:all .2s}
        .chip:hover{border-color:#1e6fff}.chip.on{background:#1e3a5f;border-color:#1e6fff;color:#60a5fa}
        .cbu{background:#1e3a5f;border-radius:12px 12px 4px 12px;padding:10px 14px;max-width:78%;align-self:flex-end;font-size:13px;line-height:1.65;white-space:pre-wrap}
        .cba{background:#111827;border:1px solid #1f2937;border-radius:12px 12px 12px 4px;padding:10px 14px;max-width:84%;align-self:flex-start;font-size:13px;line-height:1.65;white-space:pre-wrap}
        .pb{background:#1f2937;border-radius:4px;overflow:hidden}
        .pf{border-radius:4px;transition:width .5s}
        .tag{display:inline-block;background:#1f2937;color:#9ca3af;border-radius:3px;padding:2px 6px;font-size:10px;margin:1px}
        .lbl{font-size:10px;text-transform:uppercase;letter-spacing:1.4px;color:#4b5563;font-weight:600;margin-bottom:5px}
        .mo{position:fixed;inset:0;background:rgba(0,0,0,.87);z-index:100;overflow-y:auto;display:flex;align-items:flex-start;justify-content:center;padding:20px}
        .mb{background:#0d1526;border:1px solid #1f2937;border-radius:14px;width:100%;max-width:750px;padding:26px;margin:auto}
        .g2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
        .g3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:11px}
        .g4{display:grid;grid-template-columns:repeat(4,1fr);gap:13px}
        @media(max-width:640px){.g2,.g3,.g4{grid-template-columns:1fr}}
        .sc{background:#111827;border:1px solid #1f2937;border-radius:11px;padding:16px}
        .dots span{animation:bk 1.4s infinite}.dots span:nth-child(2){animation-delay:.2s}.dots span:nth-child(3){animation-delay:.4s}
        @keyframes bk{0%,80%,100%{opacity:0}40%{opacity:1}}
        .wlc{background:#111827;border:1px solid #1f2937;border-radius:11px;padding:14px;transition:border-color .2s,transform .15s}
        .wlc:hover{border-color:#2d3748;transform:translateY(-1px)}
        .wlg{display:grid;grid-template-columns:repeat(auto-fill,minmax(268px,1fr));gap:11px}
        .sh{background:linear-gradient(90deg,#1f2937 25%,#2d3748 50%,#1f2937 75%);background-size:200% 100%;animation:shim 1.5s infinite;border-radius:4px}
        @keyframes shim{0%{background-position:200% 0}100%{background-position:-200% 0}}
        .sug{padding:8px 11px;cursor:pointer;border-bottom:1px solid #1f2937;transition:background .15s}.sug:hover{background:#1f2937}
        .eb{font-size:10px;padding:2px 6px;border-radius:3px;font-weight:700}
        .nq{background:#1e3a5f;color:#60a5fa}.ny{background:#1a2e1a;color:#4ade80}
        .dc{display:flex;align-items:center;gap:9px;padding:7px 11px;border-radius:7px;margin-bottom:5px;cursor:pointer;border:1px solid #1f2937;transition:all .2s}
        .dc:hover{border-color:#374151}.dc.on{background:#0f2a0f;border-color:#10b981}
        .mono{font-family:'IBM Plex Mono',monospace}
        .mode-card{background:#111827;border:1px solid #1f2937;border-radius:14px;padding:20px;cursor:pointer;transition:all .2s;text-align:right}
        .mode-card:hover{border-color:#1e6fff;transform:translateY(-2px);background:#0d1f3c}
        .mode-card.active{border-color:#1e6fff;background:#0d1f3c}
      `}</style>

      {/* ── HEADER ── */}
      <div style={{ borderBottom:"1px solid #1f2937", padding:"0 18px" }}>
        <div style={{ maxWidth:1130, margin:"0 auto", display:"flex", alignItems:"center", justifyContent:"space-between", height:54 }}>
          <div style={{ display:"flex", alignItems:"center", gap:9 }}>
            <div style={{ width:28, height:28, background:"linear-gradient(135deg,#1e6fff,#06b6d4)", borderRadius:7, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14 }}>📈</div>
            <span style={{ fontWeight:700, fontSize:14, letterSpacing:"-0.3px" }}>TradeLog</span>
            <span style={{ background:"#1f2937", color:"#6b7280", fontSize:9, padding:"2px 7px", borderRadius:4, fontWeight:700 }}>PAPER</span>
          </div>
          <div style={{ display:"flex", gap:3 }}>
            {[
              {id:"dashboard",l:"📊 Dashboard"},
              {id:"trades",l:"📋 Trades"},
              {id:"watchlist",l:"👁 Watchlist"},
              {id:"assistant",l:"🤖 AI Coach"},
              {id:"learn",l:"📚 Learn"},
              {id:"discord",l:"📡 Community"},
            ].map(t=>(
              <button key={t.id} className={`tab ${tab===t.id?"on":"off"}`} onClick={()=>{setTab(t.id);if(t.id!=="assistant")setAssistantMode(null);}}>{t.l}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth:1130, margin:"0 auto", padding:"18px" }}>

        {/* ══ DASHBOARD ══ */}
        {tab==="dashboard" && (
          <div>
            <div className="g4" style={{ marginBottom:18 }}>
              {[
                {label:"P&L כולל",    val:`${totalPnL>=0?"+":""}$${totalPnL.toFixed(0)}`, color:totalPnL>=0?"#10b981":"#ef4444", icon:"💰"},
                {label:"Win Rate",    val:`${winRate(trades)}%`,                            color:"#60a5fa", icon:"🎯"},
                {label:"Expectancy",  val:exp?`${parseFloat(exp)>=0?"+":""}${exp}R`:"—",   color:"#a78bfa", icon:"📐", sub:"ממוצע R לעסקה"},
                {label:"Total Trades",val:`${trades.length}`,                               color:"#f59e0b", icon:"📊", sub:`${closed.length} סגורות`},
              ].map((s,i)=>(
                <div key={i} className="sc">
                  <div style={{fontSize:17,marginBottom:5}}>{s.icon}</div>
                  <div className="lbl">{s.label}</div>
                  <div className="mono" style={{fontSize:25,fontWeight:700,color:s.color}}>{s.val}</div>
                  {s.sub&&<div style={{fontSize:11,color:"#4b5563",marginTop:2}}>{s.sub}</div>}
                </div>
              ))}
            </div>

            <div className="g2" style={{ marginBottom:18 }}>
              <div className="card">
                <div className="lbl">Skill Score {rank.emoji}</div>
                <div style={{display:"flex",gap:20,alignItems:"center"}}>
                  <div>
                    <div className="mono" style={{fontSize:44,fontWeight:700,color:rank.color,lineHeight:1}}>{ss!==null?ss:"—"}</div>
                    <div style={{fontSize:12,color:rank.color,marginTop:3,fontWeight:600}}>{rank.label}</div>
                    {ss===null&&<div style={{fontSize:11,color:"#4b5563",marginTop:3}}>Requires 3+ closed trades</div>}
                  </div>
                  <div style={{flex:1}}>
                    {[
                      {l:"Win Rate",v:`${winRate(trades)}%`,w:parseFloat(winRate(trades))},
                      {l:"Avg R",v:avgRM!==null?`${avgRM}R`:"—",w:Math.min(Math.max(((parseFloat(avgRM||0)+2)/5)*100,0),100)},
                      {l:"Discipline",v:(()=>{const a=closed.map(t=>discScore(t)).filter(Boolean);return a.length?Math.round(a.reduce((s,v)=>s+v,0)/a.length)+"%":"—";})(),w:(()=>{const a=closed.map(t=>discScore(t)).filter(Boolean);return a.length?a.reduce((s,v)=>s+v,0)/a.length:0;})()},
                    ].map(r=>(
                      <div key={r.l} style={{marginBottom:7}}>
                        <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#9ca3af",marginBottom:2}}>
                          <span>{r.l}</span><span className="mono">{r.v}</span>
                        </div>
                        <div className="pb" style={{height:4}}>
                          <div className="pf" style={{height:4,width:`${r.w}%`,background:"linear-gradient(90deg,#1e6fff,#06b6d4)"}}/>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                {closed.length>0&&(
                  <div style={{marginTop:10,fontSize:11,color:"#4b5563",borderTop:"1px solid #1f2937",paddingTop:9}}>
                    {(()=>{const best=closed.reduce((b,t)=>(calcPnL(t)||-Infinity)>(calcPnL(b)||-Infinity)?t:b,closed[0]);return<span>🏆 Best: <span style={{color:"#10b981"}} className="mono">+${(calcPnL(best)||0).toFixed(0)} ({best.symbol})</span></span>;})()}
                    {" · "}
                    {(()=>{const worst=closed.reduce((b,t)=>(calcPnL(t)||Infinity)<(calcPnL(b)||Infinity)?t:b,closed[0]);return<span>💀 Worst: <span style={{color:"#ef4444"}} className="mono">${(calcPnL(worst)||0).toFixed(0)} ({worst.symbol})</span></span>;})()}
                  </div>
                )}
              </div>
              <div className="card">
                <div className="lbl">Equity Curve</div>
                <EquityCurve data={equityCurve}/>
              </div>
            </div>

            <div className="g2" style={{ marginBottom:18 }}>
              <div className="card">
                <div className="lbl">ביצועים לפי סטאפ</div>
                <SetupChart trades={trades}/>
              </div>
              <div className="card">
                <div className="lbl">ביצועים לפי רגש כניסה</div>
                {(()=>{
                  const stats={};
                  trades.forEach(t=>{if(!t.entryEmotion)return;if(!stats[t.entryEmotion])stats[t.entryEmotion]={count:0,rSum:0};stats[t.entryEmotion].count++;stats[t.entryEmotion].rSum+=parseFloat(calcRM(t)||0);});
                  const entries=Object.entries(stats);
                  if(!entries.length) return <div style={{color:"#4b5563",fontSize:13,textAlign:"center",padding:"16px 0"}}>אין נתונים</div>;
                  return entries.sort((a,b)=>b[1].rSum-a[1].rSum).map(([emo,s])=>(
                    <div key={emo} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                      <span style={{fontSize:13}}>{emo} <span style={{color:"#4b5563",fontSize:11}}>({s.count})</span></span>
                      <span className="mono" style={{fontSize:13,fontWeight:600,color:s.rSum/s.count>=0?"#10b981":"#ef4444"}}>{s.rSum/s.count>=0?"+":""}{(s.rSum/s.count).toFixed(2)}R avg</span>
                    </div>
                  ));
                })()}
              </div>
            </div>

            <div className="card">
              <div className="lbl">Performance Summary</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10}}>
                {[
                  {l:"Total Trades",v:trades.length},
                  {l:"Wins",v:closed.filter(t=>(calcPnL(t)||0)>0).length,c:"#10b981"},
                  {l:"Losses",v:closed.filter(t=>(calcPnL(t)||0)<=0).length,c:"#ef4444"},
                  {l:"Avg R Multiple",v:avgRM!==null?`${avgRM}R`:"—",c:"#a78bfa"},
                  {l:"Expectancy",v:exp?`${exp}R`:"—",c:parseFloat(exp||0)>=0?"#10b981":"#ef4444"},
                ].map(s=>(
                  <div key={s.l} style={{textAlign:"center",padding:"12px 0",borderRadius:8,background:"#0f172a"}}>
                    <div className="mono" style={{fontSize:20,fontWeight:700,color:s.c||"#e8eaf0"}}>{s.v}</div>
                    <div style={{fontSize:10,color:"#4b5563",marginTop:4,textTransform:"uppercase",letterSpacing:"0.6px"}}>{s.l}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══ TRADES ══ */}
        {tab==="trades" && (
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div style={{display:"flex",gap:6}}>
                {["all","week","month"].map(p=>(
                  <button key={p} className="bg" style={filterPeriod===p?{borderColor:"#1e6fff",color:"#60a5fa"}:{}} onClick={()=>setFilterPeriod(p)}>
                    {p==="all"?"All":p==="week"?"שבוע":"חודש"}
                  </button>
                ))}
              </div>
              <button className="bp" onClick={()=>setShowNew(true)}>+ עסקה חדשה</button>
            </div>
            {filtered.length===0?(
              <div className="card" style={{textAlign:"center",padding:"48px 20px"}}>
                <div style={{fontSize:34,marginBottom:10}}>📋</div>
                <div style={{fontSize:16,fontWeight:600,marginBottom:6}}>אין עסקאות</div>
                <button className="bp" style={{marginTop:12}} onClick={()=>setShowNew(true)}>הוסף עסקה ראשונה</button>
              </div>
            ):(
              <div className="card" style={{padding:"0 14px"}}>
                <div style={{display:"grid",gridTemplateColumns:"68px 95px 1fr 65px 65px 65px 75px 80px 60px",gap:7,padding:"9px 0",borderBottom:"1px solid #1f2937"}}>
                  {["Date","Symbol","סטאפ / מגמה","Direction","Entry","Exit","P&L","R-Multiple","ציון"].map(h=>(
                    <div key={h} style={{fontSize:9.5,color:"#4b5563",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.5px"}}>{h}</div>
                  ))}
                </div>
                {filtered.map(t=>{
                  const pnl=calcPnL(t),rm=calcRM(t),ds=discScore(t);
                  return(
                    <div key={t.id} className="trow" style={{display:"grid",gridTemplateColumns:"68px 95px 1fr 65px 65px 65px 75px 80px 60px",gap:7,alignItems:"center"}}
                      onClick={()=>setSelectedTrade(t)}>
                      <div style={{fontSize:11,color:"#6b7280"}}>{t.date}</div>
                      <div>
                        <div className="mono" style={{fontWeight:700,fontSize:14}}>{t.symbol||"—"}</div>
                        <div style={{fontSize:10,color:"#4b5563"}}>{t.market} · {t.timeframe}</div>
                      </div>
                      <div style={{overflow:"hidden"}}>
                        {t.setup&&<span className="tag">{t.setup}</span>}
                        {t.marketTrend&&<span className="tag">{t.marketTrend}</span>}
                      </div>
                      <div style={{fontSize:12,color:t.direction==="Long"?"#10b981":"#ef4444",fontWeight:600}}>{t.direction}</div>
                      <div className="mono" style={{fontSize:12}}>{t.entryPrice?`$${t.entryPrice}`:"—"}</div>
                      <div className="mono" style={{fontSize:12,color:t.status==="open"?"#f59e0b":"#e8eaf0"}}>{t.status==="open"?"Open":t.exitPrice?`$${t.exitPrice}`:"—"}</div>
                      <div className="mono" style={{fontSize:13,fontWeight:700,color:pnl===null?"#4b5563":pnl>=0?"#10b981":"#ef4444"}}>
                        {pnl===null?"—":`${pnl>=0?"+":""}$${pnl.toFixed(0)}`}
                      </div>
                      <div className="mono" style={{fontSize:13,fontWeight:700,color:rm===null?"#4b5563":parseFloat(rm)>=0?"#10b981":"#ef4444"}}>
                        {rm===null?"—":`${parseFloat(rm)>=0?"+":""}${rm}R`}
                      </div>
                      <div style={{fontSize:12,fontWeight:600,color:ds===null?"#4b5563":ds>=80?"#10b981":ds>=60?"#f59e0b":"#ef4444"}}>
                        {ds!==null?`${ds}%`:"—"}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ══ WATCHLIST ══ */}
        {tab==="watchlist" && (
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:8}}>
              <div style={{display:"flex",gap:6}}>
                {["all","NASDAQ","NYSE"].map(f=>(
                  <button key={f} className="bg" style={wlFilter===f?{borderColor:"#1e6fff",color:"#60a5fa"}:{}} onClick={()=>setWlFilter(f)}>
                    {f==="all"?"All":f}
                  </button>
                ))}
              </div>
              <div style={{display:"flex",gap:7}}>
                <button className="bg" onClick={fetchAll} disabled={fetchingAll}>{fetchingAll?"⏳ טוען...":"🔄 רענן הכל"}</button>
                <button className="bp" onClick={()=>setShowAddWl(true)}>+ הוסף מניה</button>
              </div>
            </div>
            {wlFiltered.length===0?(
              <div className="card" style={{textAlign:"center",padding:"48px 20px"}}>
                <div style={{fontSize:34,marginBottom:10}}>👁</div>
                <div style={{fontSize:16,fontWeight:600,marginBottom:6}}>Watchlist is empty</div>
                <button className="bp" style={{marginTop:12}} onClick={()=>setShowAddWl(true)}>הוסף מניה ראשונה</button>
              </div>
            ):(
              <div className="wlg">
                {wlFiltered.map(stock=>{
                  const pr=wlPrices[stock.symbol],ld=wlLoad[stock.symbol],er=wlErr[stock.symbol],up=pr&&pr.changePercent>=0;
                  return(
                    <div key={stock.symbol} className="wlc">
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:9}}>
                        <div>
                          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:1}}>
                            <span className="mono" style={{fontWeight:700,fontSize:16}}>{stock.symbol}</span>
                            <span className={`eb ${stock.exchange==="NASDAQ"?"nq":"ny"}`}>{stock.exchange}</span>
                          </div>
                          <div style={{fontSize:11,color:"#6b7280"}}>{stock.name}</div>
                        </div>
                        <div style={{display:"flex",gap:4}}>
                          <button className="bg" style={{padding:"2px 6px"}} onClick={()=>fetchPrice(stock.symbol)} disabled={ld}>{ld?"⏳":"🔄"}</button>
                          <button className="bg" style={{padding:"2px 6px",color:"#ef4444",borderColor:"#2d1515"}} onClick={()=>setWl(p=>p.filter(w=>w.symbol!==stock.symbol))}>✕</button>
                        </div>
                      </div>
                      {ld&&!pr&&<div className="sh" style={{height:26,width:"55%",marginBottom:7}}/>}
                      {er&&!pr&&<div style={{fontSize:11,color:"#ef4444",padding:"4px 0"}}>{er} — <span style={{cursor:"pointer",textDecoration:"underline"}} onClick={()=>fetchPrice(stock.symbol)}>נסה שוב</span></div>}
                      {!pr&&!ld&&!er&&<div style={{fontSize:11,color:"#4b5563",padding:"5px 0"}}>לחץ 🔄 לטעינת נתונים</div>}
                      {pr&&(
                        <>
                          <div style={{display:"flex",alignItems:"baseline",gap:7,marginBottom:1}}>
                            <span className="mono" style={{fontSize:22,fontWeight:700}}>${pr.price?.toFixed(2)}</span>
                            <span style={{fontSize:12,fontWeight:600,color:up?"#10b981":"#ef4444"}}>{up?"▲":"▼"} {pr.changePercent?.toFixed(2)}%</span>
                          </div>
                          <div style={{fontSize:11,color:up?"#10b981":"#ef4444",marginBottom:9}}>{up?"+":""}{pr.change?.toFixed(2)} היום</div>
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:5,borderTop:"1px solid #1f2937",paddingTop:9,marginBottom:7}}>
                            {[["פתיחה",pr.open?`$${pr.open.toFixed(2)}`:"—"],["גבוה",pr.high?`$${pr.high.toFixed(2)}`:"—"],["נמוך",pr.low?`$${pr.low.toFixed(2)}`:"—"],["52W↑",pr.week52High?`$${pr.week52High.toFixed(0)}`:"—"],["52W↓",pr.week52Low?`$${pr.week52Low.toFixed(0)}`:"—"],["P/E",pr.pe?pr.pe.toFixed(1):"—"]].map(([l,v])=>(
                              <div key={l} style={{textAlign:"center"}}>
                                <div className="mono" style={{fontSize:12,fontWeight:600}}>{v}</div>
                                <div style={{fontSize:9,color:"#4b5563",textTransform:"uppercase",marginTop:1}}>{l}</div>
                              </div>
                            ))}
                          </div>
                          {pr.volume&&pr.avgVolume&&(
                            <div style={{marginBottom:7}}>
                              <div style={{display:"flex",justifyContent:"space-between",fontSize:9.5,color:"#4b5563",marginBottom:2}}>
                                <span>נפח: {(pr.volume/1e6).toFixed(1)}M</span><span>ממוצע: {(pr.avgVolume/1e6).toFixed(1)}M</span>
                              </div>
                              <div className="pb" style={{height:4}}>
                                <div className="pf" style={{height:4,width:`${Math.min((pr.volume/pr.avgVolume)*50,100)}%`,background:pr.volume>pr.avgVolume?"linear-gradient(90deg,#f59e0b,#ef4444)":"linear-gradient(90deg,#1e6fff,#06b6d4)"}}/>
                              </div>
                            </div>
                          )}
                          <div style={{display:"flex",justifyContent:"space-between",fontSize:9.5,color:"#4b5563",marginBottom:7}}>
                            <span>Mkt Cap: <span style={{color:"#9ca3af"}}>{pr.marketCap||"—"}</span></span>
                            <span>{pr.lastUpdated}</span>
                          </div>
                          {/* TradingView launcher */}
                          <ChartLauncher symbol={stock.symbol} exchange={stock.exchange}/>
                        </>
                      )}
                      <input className="inp" style={{fontSize:11,padding:"5px 8px",marginTop:7}} placeholder="הערות / סטאפ שאני עוקב..."
                        value={stock.notes} onChange={e=>setWl(p=>p.map(w=>w.symbol===stock.symbol?{...w,notes:e.target.value}:w))}/>
                    </div>
                  );
                })}
              </div>
            )}
            {showAddWl&&(
              <div className="mo" onClick={e=>e.target===e.currentTarget&&setShowAddWl(false)}>
                <div className="mb" style={{maxWidth:440}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
                    <h2 style={{margin:0,fontSize:16,fontWeight:700}}>הוסף מניה לווטצ'ליסט</h2>
                    <button className="bg" onClick={()=>{setShowAddWl(false);setSuggestions([]);}}>✕</button>
                  </div>
                  <div style={{position:"relative",marginBottom:11}}>
                    <div className="lbl">חיפוש (NYSE / NASDAQ)</div>
                    <input className="inp" placeholder="Type name or symbol..." value={addSym} onChange={e=>{setAddSym(e.target.value);searchSym(e.target.value);}}/>
                    {sugLoad&&<div style={{fontSize:11,color:"#6b7280",marginTop:4}}>מחפש...</div>}
                    {suggestions.length>0&&(
                      <div style={{position:"absolute",top:"100%",right:0,left:0,background:"#0f172a",border:"1px solid #1f2937",borderRadius:7,zIndex:10,overflow:"hidden",marginTop:3}}>
                        {suggestions.map(s=>(
                          <div key={s.symbol} className="sug" onClick={()=>addToWl(s.symbol,s.name,s.exchange)}>
                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                              <div><span className="mono" style={{fontWeight:600,fontSize:13}}>{s.symbol}</span> <span style={{fontSize:12,color:"#9ca3af"}}>{s.name}</span></div>
                              <span className={`eb ${s.exchange==="NASDAQ"?"nq":"ny"}`}>{s.exchange}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="g2" style={{marginBottom:11}}>
                    <div><div className="lbl">שם חברה</div><input className="inp" placeholder="Apple Inc." value={addName} onChange={e=>setAddName(e.target.value)}/></div>
                    <div><div className="lbl">בורסה</div>
                      <select className="inp" value={addEx} onChange={e=>setAddEx(e.target.value)}>
                        <option>NASDAQ</option><option>NYSE</option>
                      </select>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:14}}>
                    <button className="bg" onClick={()=>{setShowAddWl(false);setSuggestions([]);}}>Cancel</button>
                    <button className="bp" onClick={()=>addToWl(addSym,addName,addEx)}>Add</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ LEARN ══ */}
        {tab==="learn" && <LearningHub trades={trades}/>}

        {/* ══ DISCORD QUEUE ══ */}
        {tab==="discord" && <DiscordQueue onAddToWatchlist={(sym,name)=>{ setWl(p=>[...p.filter(w=>w.symbol!==sym),{symbol:sym,name:name||sym,exchange:"NASDAQ",notes:"מקהילת Discord"}]); setTab("watchlist"); }}/>}


        {tab==="assistant" && (
          <div>
            {!assistantMode ? (
              // Mode selector
              <div>
                <div style={{ marginBottom:20 }}>
                  <div style={{ fontSize:18, fontWeight:700, marginBottom:4 }}>עוזר המסחר שלך 🤖</div>
                  <div style={{ fontSize:13, color:"#6b7280" }}>בחר מצב עבודה — כל מצב הוא flow מובנה, לא שיחה חופשית</div>
                </div>

                {/* Today's drill banner */}
                <div style={{ background:"linear-gradient(135deg,#0d1f3c,#1e3a5f)", border:"1px solid #1e6fff", borderRadius:12, padding:"14px 18px", marginBottom:20, display:"flex", alignItems:"center", gap:12 }}>
                  <div style={{ fontSize:24 }}>🏋️</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:12, color:"#60a5fa", fontWeight:600 }}>Drill היום — {todayDrill.day}</div>
                    <div style={{ fontSize:14, fontWeight:600 }}>{todayDrill.focus}</div>
                    <div style={{ fontSize:12, color:"#9ca3af", marginTop:2 }}>{todayDrill.questions[0].slice(0,60)}...</div>
                  </div>
                  <button className="bp" onClick={()=>setAssistantMode("drill")}>התחל →</button>
                </div>

                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
                  {[
                    { id:"morning", icon:"🌅", title:"Morning Routine", sub:"20 דקות מובנות — צעד אחרי צעד", color:"#0d9488",
                      desc:"מוביל אותך דרך Top-Down → סריקת ווטצ'ליסט → בניית סטאפ → רפלקציה. כולל פידבק AI בכל שלב." },
                    { id:"scan", icon:"🔍", title:"Setup Analysis", sub:"הגדרה + חוזקות + סיכונים + Entry/Stop/Target", color:"#1e6fff",
                      desc:"הכנס סימול ותיאור מה שאתה רואה בגרף — העוזר ינתח את הסטאפ לפי כל הקריטריונים ויתן ציון הגדרה." },
                    { id:"drill", icon:"🏋️", title:"Dry Practice", sub:`Drill: ${todayDrill.focus}`, color:"#7c3aed",
                      desc:"Focused questions by day — answer, get feedback, improve. Includes custom question option." },
                    { id:"debrief", icon:"🔬", title:"Trade Review", sub:"ניתוח עמוק של עסקה סגורה", color:"#dc2626",
                      desc:"בחר עסקה מהיומן — העוזר ינתח ביצוע, ניהול סיכון, פסיכולוגיה, ודפוסים חוזרים. כולל שיחת המשך." },
                  ].map(m=>(
                    <div key={m.id} className="mode-card" onClick={()=>setAssistantMode(m.id)}>
                      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                        <div style={{ width:40, height:40, background:`${m.color}22`, border:`1px solid ${m.color}44`, borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20 }}>{m.icon}</div>
                        <div>
                          <div style={{ fontWeight:700, fontSize:15 }}>{m.title}</div>
                          <div style={{ fontSize:11, color:m.color }}>{m.sub}</div>
                        </div>
                      </div>
                      <div style={{ fontSize:12, color:"#6b7280", lineHeight:1.6 }}>{m.desc}</div>
                      <div style={{ marginTop:12, fontSize:12, color:"#1e6fff", fontWeight:600 }}>התחל ←</div>
                    </div>
                  ))}
                </div>

                {/* Stats row */}
                <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginTop:20 }}>
                  {[
                    { l:"Skill Score", v:ss!==null?`${ss}/100`:"—", c:rank.color, sub:rank.label },
                    { l:"Expectancy", v:exp?`${exp}R`:"—", c:parseFloat(exp||0)>=0?"#10b981":"#ef4444", sub:"ממוצע R לעסקה" },
                    { l:"עסקאות ביומן", v:`${trades.length}`, c:"#f59e0b", sub:`${closed.length} סגורות` },
                  ].map(s=>(
                    <div key={s.l} style={{ background:"#0f172a", borderRadius:9, padding:"12px 14px", textAlign:"center" }}>
                      <div className="mono" style={{ fontSize:20, fontWeight:700, color:s.c }}>{s.v}</div>
                      <div style={{ fontSize:10, color:"#4b5563", textTransform:"uppercase", letterSpacing:"0.8px", marginTop:2 }}>{s.l}</div>
                      <div style={{ fontSize:11, color:s.c, marginTop:2 }}>{s.sub}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              // Active mode
              <div>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:18 }}>
                  <button className="bg" onClick={()=>setAssistantMode(null)}>← Back</button>
                  <div style={{ fontWeight:700, fontSize:15 }}>
                    {assistantMode==="morning"?"🌅 שגרת בוקר":
                     assistantMode==="scan"?"🔍 ניתוח סטאפ":
                     assistantMode==="drill"?"🏋️ אימון יבש":
                     "🔬 תחקור עסקה"}
                  </div>
                </div>

                <div className="card" style={{ padding:"20px 22px" }}>
                  {assistantMode==="morning" && (
                    <MorningSession
                      trades={trades}
                      watchlist={wl}
                      onClose={()=>setAssistantMode(null)}
                      onSaveSetup={saveSetupFromMorning}
                    />
                  )}
                  {assistantMode==="scan" && <SetupScanner watchlist={wl} trades={trades}/>}
                  {assistantMode==="drill" && <DryTraining trades={trades}/>}
                  {assistantMode==="debrief" && <TradeDebrief trades={trades} onOpenNewTrade={()=>{setAssistantMode(null);setTab("trades");setShowNew(true);}}/>}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ══ NEW TRADE MODAL ══ */}
      {showNew&&(
        <div className="mo" onClick={e=>e.target===e.currentTarget&&setShowNew(false)}>
          <div className="mb">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:22}}>
              <h2 style={{margin:0,fontSize:17,fontWeight:700}}>תיעוד עסקה חדשה</h2>
              <button className="bg" onClick={()=>setShowNew(false)}>✕</button>
            </div>
            <div className="lbl" style={{marginBottom:9}}>📋 פרטי עסקה</div>
            <div className="g3" style={{marginBottom:14}}>
              <div><div className="lbl">תאריך</div><input type="date" className="inp" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></div>
              <div><div className="lbl">Ticker</div><input className="inp" placeholder="AAPL" value={form.symbol} onChange={e=>setForm({...form,symbol:e.target.value.toUpperCase()})}/></div>
              <div><div className="lbl">Market</div>
                <select className="inp" value={form.market} onChange={e=>setForm({...form,market:e.target.value})}>
                  {MARKET_TYPES.map(m=><option key={m}>{m}</option>)}
                </select>
              </div>
              <div><div className="lbl">כיוון</div>
                <select className="inp" value={form.direction} onChange={e=>setForm({...form,direction:e.target.value})}>
                  <option>Long</option><option>Short</option>
                </select>
              </div>
              <div><div className="lbl">Setup Type</div>
                <select className="inp" value={form.setup} onChange={e=>setForm({...form,setup:e.target.value})}>
                  <option value="">בחר סטאפ</option>
                  {SETUP_TYPES.map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
              <div><div className="lbl">Timeframe</div>
                <select className="inp" value={form.timeframe} onChange={e=>setForm({...form,timeframe:e.target.value})}>
                  {TIMEFRAMES.map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
              <div><div className="lbl">Market Trend</div>
                <select className="inp" value={form.marketTrend} onChange={e=>setForm({...form,marketTrend:e.target.value})}>
                  <option value="">בחר מגמה</option>
                  {MARKET_TRENDS.map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
              <div><div className="lbl">סטטוס</div>
                <select className="inp" value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>
                  <option value="open">פתוחה</option><option value="closed">סגורה</option>
                </select>
              </div>
              <div><div className="lbl">Screenshot Link</div><input className="inp" placeholder="https://..." value={form.screenshotLink} onChange={e=>setForm({...form,screenshotLink:e.target.value})}/></div>
            </div>
            <div className="lbl" style={{marginBottom:9}}>💰 מחירים וסיכון</div>
            <div className="g3" style={{marginBottom:14}}>
              {[["Entry Price","entryPrice"],["Stop Price","stopLoss"],["Target Price","target"],["Exit Price","exitPrice"],["Position Size (מניות)","shares"]].map(([l,k])=>(
                <div key={k}><div className="lbl">{l}</div><input type="number" className="inp" placeholder="0.00" value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})}/></div>
              ))}
              <div style={{background:"#0a0e1a",borderRadius:7,padding:"9px 11px",border:"1px solid #1f2937"}}>
                <div className="lbl">מחושב</div>
                {(()=>{const t={...form,entryPrice:parseFloat(form.entryPrice)||0,stopLoss:parseFloat(form.stopLoss)||0,target:parseFloat(form.target)||0,shares:parseFloat(form.shares)||0};
                const rps=riskPerShare(t),tr=totalRisk(t),prr=plannedRR(t);
                return<div style={{fontSize:11.5}}>
                  <div style={{marginBottom:3}}>Risk/Share: <span className="mono" style={{color:"#f59e0b"}}>{rps?`$${rps.toFixed(2)}`:"—"}</span></div>
                  <div style={{marginBottom:3}}>Total Risk: <span className="mono" style={{color:"#ef4444"}}>{tr?`$${tr.toFixed(2)}`:"—"}</span></div>
                  <div>Planned R:R: <span className="mono" style={{color:"#a78bfa"}}>{prr?`1:${prr}`:"—"}</span></div>
                </div>;})()}
              </div>
            </div>
            <div className="lbl" style={{marginBottom:9}}>🧠 פסיכולוגיה</div>
            <div className="g2" style={{marginBottom:14}}>
              <div><div className="lbl">רגש בכניסה</div><div>{EMOTION_OPTIONS.map(e=><span key={e} className={`chip ${form.entryEmotion===e?"on":""}`} onClick={()=>setForm({...form,entryEmotion:e})}>{e}</span>)}</div></div>
              <div><div className="lbl">רגש ביציאה</div><div>{EMOTION_OPTIONS.map(e=><span key={e} className={`chip ${form.exitEmotion===e?"on":""}`} onClick={()=>setForm({...form,exitEmotion:e})}>{e}</span>)}</div></div>
            </div>
            <div className="lbl" style={{marginBottom:9}}>🎯 ציון משמעת</div>
            <div style={{marginBottom:14}}>
              {DISCIPLINE_CRITERIA.map((c,i)=>(
                <div key={i} className={`dc ${form.disciplineChecks[i]?"on":""}`}
                  onClick={()=>{const dc=[...form.disciplineChecks];dc[i]=!dc[i];setForm({...form,disciplineChecks:dc});}}>
                  <span style={{fontSize:15}}>{form.disciplineChecks[i]?"✅":"⬜"}</span>
                  <span style={{fontSize:12.5}}>{c}</span>
                </div>
              ))}
              <div style={{fontSize:12,color:"#9ca3af",marginTop:7}}>
                ציון: <span className="mono" style={{fontWeight:600,color:"#60a5fa"}}>{Math.round(form.disciplineChecks.filter(Boolean).length/DISCIPLINE_CRITERIA.length*100)}%</span>
              </div>
            </div>
            <div className="lbl" style={{marginBottom:9}}>📓 יומן טריידר</div>
            {JOURNAL_QUESTIONS.map(q=>(
              <div key={q.key} style={{marginBottom:11}}>
                <div style={{fontSize:12,color:"#9ca3af",marginBottom:3}}>
                  {q.label} <span style={{fontSize:9.5,color:q.pre?"#1e6fff":"#6b7280"}}>{q.pre?"(לפני)":"(אחרי)"}</span>
                </div>
                <textarea className="inp" rows={2} value={form.journalAnswers[q.key]||""}
                  onChange={e=>setForm({...form,journalAnswers:{...form.journalAnswers,[q.key]:e.target.value}})}/>
              </div>
            ))}
            <div style={{display:"flex",gap:9,justifyContent:"flex-end",marginTop:18}}>
              <button className="bg" onClick={()=>setShowNew(false)}>Cancel</button>
              <button className="bp" onClick={saveTrade}>שמור עסקה</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ TRADE DETAIL MODAL ══ */}
      {selectedTrade&&(
        <div className="mo" onClick={e=>e.target===e.currentTarget&&setSelectedTrade(null)}>
          <div className="mb">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:18}}>
              <div>
                <div style={{display:"flex",alignItems:"center",gap:9}}>
                  <h2 className="mono" style={{margin:0,fontSize:20,fontWeight:700}}>{selectedTrade.symbol}</h2>
                  {[selectedTrade.market,selectedTrade.direction,selectedTrade.setup].filter(Boolean).map(t=><span key={t} className="tag">{t}</span>)}
                </div>
                <div style={{fontSize:11,color:"#6b7280",marginTop:3}}>{selectedTrade.date} · {selectedTrade.timeframe} · {selectedTrade.marketTrend}</div>
              </div>
              <div style={{display:"flex",gap:7}}>
                <button className="bg" style={{fontSize:11}} onClick={()=>{setSelectedTrade(null);setTab("assistant");setAssistantMode("debrief");}}>🔬 תחקר</button>
                <button className="bg" onClick={()=>setSelectedTrade(null)}>✕</button>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:9,marginBottom:16}}>
              {[
                {l:"P&L",v:calcPnL(selectedTrade)!==null?`${calcPnL(selectedTrade)>=0?"+":""}$${calcPnL(selectedTrade).toFixed(2)}`:"—",c:(calcPnL(selectedTrade)||0)>=0?"#10b981":"#ef4444"},
                {l:"R Multiple",v:calcRM(selectedTrade)?`${parseFloat(calcRM(selectedTrade))>=0?"+":""}${calcRM(selectedTrade)}R`:"—",c:parseFloat(calcRM(selectedTrade)||0)>=0?"#10b981":"#ef4444"},
                {l:"Risk/Share",v:riskPerShare(selectedTrade)?`$${riskPerShare(selectedTrade).toFixed(2)}`:"—",c:"#f59e0b"},
                {l:"Total Risk",v:totalRisk(selectedTrade)?`$${totalRisk(selectedTrade).toFixed(2)}`:"—",c:"#ef4444"},
                {l:"Planned R:R",v:plannedRR(selectedTrade)?`1:${plannedRR(selectedTrade)}`:"—",c:"#a78bfa"},
              ].map(s=>(
                <div key={s.l} style={{background:"#0f172a",borderRadius:7,padding:"9px 11px",textAlign:"center"}}>
                  <div className="mono" style={{fontSize:15,fontWeight:700,color:s.c}}>{s.v}</div>
                  <div style={{fontSize:9.5,color:"#4b5563",marginTop:2,textTransform:"uppercase"}}>{s.l}</div>
                </div>
              ))}
            </div>
            <div className="g3" style={{marginBottom:14}}>
              {[["Entry",`$${selectedTrade.entryPrice}`],["Stop",`$${selectedTrade.stopLoss}`],["Target",`$${selectedTrade.target}`],["Exit",selectedTrade.exitPrice?`$${selectedTrade.exitPrice}`:"Open"],["Shares",selectedTrade.shares],["Discipline",discScore(selectedTrade)!==null?`${discScore(selectedTrade)}%`:"—"]].map(([l,v])=>(
                <div key={l} style={{background:"#0f172a",borderRadius:7,padding:"9px 11px"}}>
                  <div style={{fontSize:9.5,color:"#4b5563",textTransform:"uppercase",marginBottom:2}}>{l}</div>
                  <div className="mono" style={{fontWeight:600,fontSize:13}}>{v}</div>
                </div>
              ))}
            </div>
            {selectedTrade.disciplineChecks?.some(Boolean)&&(
              <div style={{marginBottom:14}}>
                <div className="lbl">ציון משמעת: <span style={{color:"#60a5fa"}}>{discScore(selectedTrade)}%</span></div>
                {DISCIPLINE_CRITERIA.map((c,i)=>(
                  <div key={i} style={{fontSize:12,color:selectedTrade.disciplineChecks[i]?"#10b981":"#4b5563",marginBottom:2}}>
                    {selectedTrade.disciplineChecks[i]?"✅":"☐"} {c}
                  </div>
                ))}
              </div>
            )}
            <div style={{display:"flex",gap:7,marginBottom:14,flexWrap:"wrap"}}>
              {selectedTrade.entryEmotion&&<span style={{background:"#1e3a5f",color:"#60a5fa",padding:"3px 10px",borderRadius:14,fontSize:12}}>כניסה: {selectedTrade.entryEmotion}</span>}
              {selectedTrade.exitEmotion&&<span style={{background:"#1a2a1a",color:"#4ade80",padding:"3px 10px",borderRadius:14,fontSize:12}}>יציאה: {selectedTrade.exitEmotion}</span>}
            </div>
            {Object.values(selectedTrade.journalAnswers||{}).some(Boolean)&&(
              <div>
                <div className="lbl">יומן</div>
                {JOURNAL_QUESTIONS.map(q=>selectedTrade.journalAnswers[q.key]?(
                  <div key={q.key} style={{marginBottom:10}}>
                    <div style={{fontSize:11,color:"#4b5563",marginBottom:2}}>{q.label}</div>
                    <div style={{fontSize:13,color:"#d1d5db",lineHeight:1.6}}>{selectedTrade.journalAnswers[q.key]}</div>
                  </div>
                ):null)}
              </div>
            )}
            {selectedTrade.screenshotLink&&(
              <div style={{marginTop:10}}>
                <a href={selectedTrade.screenshotLink} target="_blank" rel="noopener noreferrer" style={{fontSize:12,color:"#60a5fa"}}>📸 פתח Screenshot ↗</a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
