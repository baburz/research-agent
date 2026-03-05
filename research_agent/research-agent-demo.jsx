import { useState, useEffect, useRef } from "react";

const GRAPH_NODES = ["plan", "search", "evaluate", "answer"];

const NODE_META = {
  plan: {
    icon: "◈",
    label: "Plan",
    desc: "Craft optimal search query",
    color: "#7DF9C2",
  },
  search: {
    icon: "⟳",
    label: "Search",
    desc: "Execute web search via Tavily",
    color: "#7EC8E3",
  },
  evaluate: {
    icon: "◎",
    label: "Evaluate",
    desc: "Judge result sufficiency",
    color: "#FFD166",
  },
  answer: {
    icon: "◉",
    label: "Answer",
    desc: "Synthesise cited response",
    color: "#FF6B9D",
  },
};

const SAMPLE_TRACES = {
  "What is LangGraph and why use it over plain LangChain?": [
    { node: "plan", query: "LangGraph vs LangChain differences state machine", ms: 340 },
    { node: "search", results: 4, ms: 820 },
    { node: "evaluate", sufficient: true, reason: "Multiple authoritative docs found", ms: 410 },
    { node: "answer", hops: 1, ms: 680 },
  ],
  "What are the latest RAG techniques in 2024?": [
    { node: "plan", query: "RAG retrieval augmented generation latest techniques 2024", ms: 290 },
    { node: "search", results: 4, ms: 910 },
    { node: "evaluate", sufficient: false, reason: "Results too general, need specifics", ms: 380 },
    { node: "search", results: 4, ms: 740, hop: 2, query: "advanced RAG methods HyDE RAPTOR 2024" },
    { node: "evaluate", sufficient: true, reason: "Specific techniques now covered", ms: 420 },
    { node: "answer", hops: 2, ms: 890 },
  ],
  "How does Squirro's AI platform work?": [
    { node: "plan", query: "Squirro AI enterprise insights platform architecture", ms: 310 },
    { node: "search", results: 4, ms: 860 },
    { node: "evaluate", sufficient: false, reason: "Need more technical depth", ms: 350 },
    { node: "search", results: 4, ms: 780, hop: 2, query: "Squirro cognitive search RAG pipeline features" },
    { node: "evaluate", sufficient: false, reason: "Still missing implementation details", ms: 400 },
    { node: "search", results: 4, ms: 650, hop: 3, query: "Squirro LLM integration enterprise search 2024" },
    { node: "evaluate", sufficient: true, reason: "Max hops reached — proceeding with available info", ms: 290 },
    { node: "answer", hops: 3, ms: 1100 },
  ],
};

const SAMPLE_ANSWERS = {
  "What is LangGraph and why use it over plain LangChain?":
    `**LangGraph** is a library built on top of LangChain for building stateful, multi-actor applications using directed graphs. While LangChain excels at linear pipelines (chain A → B → C), LangGraph introduces **cycles, branching, and persistent state** — essential for real agents that need to loop, retry, and make decisions. [1][2]\n\nKey advantages over plain chains:\n- **State persistence** across steps via TypedDict schemas\n- **Conditional edges** for dynamic routing\n- **Loop support** for iterative refinement (like this agent's search→evaluate→re-search cycle)\n- **Human-in-the-loop** checkpointing built in [3]\n\n## Sources\n[1] https://blog.langchain.dev/langgraph/\n[2] https://python.langchain.com/docs/langgraph\n[3] https://langchain-ai.github.io/langgraph/concepts/`,
  "What are the latest RAG techniques in 2024?":
    `Several advanced RAG techniques have emerged in 2024 that go well beyond naive retrieval:\n\n**HyDE** (Hypothetical Document Embeddings) generates a hypothetical answer first, embeds it, then retrieves — dramatically improving semantic matching for complex questions. [1]\n\n**RAPTOR** uses recursive summarisation to build a tree of document abstractions, enabling multi-granularity retrieval that handles both detail and big-picture questions. [2]\n\n**Adaptive RAG** dynamically decides whether to retrieve at all, use a single retrieval, or iterate — reducing unnecessary latency on simple queries. [3]\n\n## Sources\n[1] https://arxiv.org/abs/2212.10496\n[2] https://arxiv.org/abs/2401.18059\n[3] https://arxiv.org/abs/2403.14403`,
  "How does Squirro's AI platform work?":
    `Squirro is an enterprise **Cognitive Search and Insights** platform that combines RAG-style retrieval with structured knowledge graphs. [1]\n\nAt its core, Squirro indexes enterprise data sources (documents, databases, news feeds) and exposes them through a semantic search layer powered by LLMs. Their **Augmented Intelligence** approach layers ML signals on top of retrieval — scoring not just relevance but also recency, authority, and business context. [2]\n\nThe platform integrates with enterprise systems (Salesforce, SharePoint, SAP) and supports custom LLM fine-tuning for domain-specific accuracy. Key differentiator: **explainable recommendations** with traceable source citations, critical for regulated industries. [3]\n\n## Sources\n[1] https://squirro.com/platform\n[2] https://squirro.com/cognitive-search\n[3] https://squirro.com/enterprise-ai`,
};

function LogLine({ entry, index, visible }) {
  const nodeColor = NODE_META[entry.node]?.color || "#fff";
  return (
    <div
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateX(0)" : "translateX(-12px)",
        transition: `opacity 0.3s ease ${index * 0.05}s, transform 0.3s ease ${index * 0.05}s`,
        display: "flex",
        alignItems: "flex-start",
        gap: "10px",
        padding: "6px 0",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
        fontFamily: "'DM Mono', 'Fira Code', monospace",
        fontSize: "12px",
      }}
    >
      <span style={{ color: nodeColor, width: 70, flexShrink: 0 }}>
        [{entry.node}]
      </span>
      <span style={{ color: "rgba(255,255,255,0.55)" }}>
        {entry.node === "plan" && `crafting query → "${entry.query}"`}
        {entry.node === "search" && !entry.hop && `hop 1 — ${entry.results} results retrieved`}
        {entry.node === "search" && entry.hop && `hop ${entry.hop} — re-search: "${entry.query}"`}
        {entry.node === "evaluate" && (
          <>
            <span style={{ color: entry.sufficient ? "#7DF9C2" : "#FFD166" }}>
              {entry.sufficient ? "✓ sufficient" : "✗ need more"}
            </span>
            {" — "}{entry.reason}
          </>
        )}
        {entry.node === "answer" && `synthesising answer after ${entry.hops} search round${entry.hops > 1 ? "s" : ""}...`}
      </span>
      <span style={{ color: "rgba(255,255,255,0.25)", marginLeft: "auto", flexShrink: 0 }}>
        {entry.ms}ms
      </span>
    </div>
  );
}

function GraphViz({ activeNode, completedNodes }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "16px 0" }}>
      {GRAPH_NODES.map((node, i) => {
        const meta = NODE_META[node];
        const isActive = activeNode === node;
        const isDone = completedNodes.includes(node);
        const isLooping = node === "search" && completedNodes.filter(n => n === "search").length > 1;

        return (
          <div key={node} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: isActive
                  ? meta.color
                  : isDone
                  ? `${meta.color}33`
                  : "rgba(255,255,255,0.05)",
                border: `1.5px solid ${isActive ? meta.color : isDone ? `${meta.color}88` : "rgba(255,255,255,0.1)"}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 16,
                color: isActive ? "#0a0a12" : isDone ? meta.color : "rgba(255,255,255,0.3)",
                boxShadow: isActive ? `0 0 16px ${meta.color}66` : "none",
                transition: "all 0.3s ease",
                flexShrink: 0,
              }}
            >
              {meta.icon}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{
                fontSize: 12,
                fontWeight: 600,
                color: isActive ? meta.color : isDone ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.3)",
                fontFamily: "'DM Mono', monospace",
                letterSpacing: "0.05em",
                transition: "color 0.3s ease",
              }}>
                {node.toUpperCase()}
                {isLooping && <span style={{ color: "#FFD166", marginLeft: 6 }}>↻</span>}
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 1 }}>
                {meta.desc}
              </div>
            </div>
            {isActive && (
              <div style={{
                width: 6, height: 6, borderRadius: "50%",
                background: meta.color,
                animation: "pulse 1s ease infinite",
              }} />
            )}
          </div>
        );
      })}
      <style>{`@keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(0.7)} }`}</style>
    </div>
  );
}

export default function ResearchAgentDemo() {
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState("idle"); // idle | running | done
  const [visibleLogs, setVisibleLogs] = useState([]);
  const [activeNode, setActiveNode] = useState(null);
  const [completedNodes, setCompletedNodes] = useState([]);
  const [answer, setAnswer] = useState("");
  const [showAnswer, setShowAnswer] = useState(false);
  const logRef = useRef(null);

  const presets = Object.keys(SAMPLE_TRACES);

  const runAgent = async (q) => {
    const trace = SAMPLE_TRACES[q];
    if (!trace) return;

    setStatus("running");
    setVisibleLogs([]);
    setCompletedNodes([]);
    setActiveNode(null);
    setAnswer("");
    setShowAnswer(false);

    for (let i = 0; i < trace.length; i++) {
      const entry = trace[i];
      setActiveNode(entry.node);
      await new Promise(r => setTimeout(r, entry.ms * 0.6 + 200));
      setVisibleLogs(prev => [...prev, entry]);
      setCompletedNodes(prev => [...prev, entry.node]);
    }

    setActiveNode(null);
    await new Promise(r => setTimeout(r, 300));
    setAnswer(SAMPLE_ANSWERS[q] || "");
    setShowAnswer(true);
    setStatus("done");
  };

  const handleSubmit = () => {
    if (!question.trim() || status === "running") return;
    const q = question.trim();
    const matched = presets.find(p => p.toLowerCase().includes(q.toLowerCase())) || presets[0];
    setQuestion(matched);
    runAgent(matched);
  };

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [visibleLogs]);

  const formatAnswer = (text) => {
    return text.split('\n').map((line, i) => {
      if (line.startsWith('## ')) return <div key={i} style={{ color: "#7DF9C2", fontWeight: 700, fontSize: 13, marginTop: 16, marginBottom: 4, letterSpacing: "0.05em" }}>{line.slice(3)}</div>;
      if (line.startsWith('**') && line.endsWith('**')) return <div key={i} style={{ color: "rgba(255,255,255,0.9)", fontWeight: 700, marginTop: 10 }}>{line.slice(2,-2)}</div>;
      const parts = line.split(/(\*\*[^*]+\*\*)/g).map((p, j) => {
        if (p.startsWith('**') && p.endsWith('**')) return <strong key={j} style={{ color: "#fff" }}>{p.slice(2,-2)}</strong>;
        return p;
      });
      return line ? <p key={i} style={{ margin: "4px 0", lineHeight: 1.6 }}>{parts}</p> : <br key={i} />;
    });
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#09090f",
      fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
      color: "rgba(255,255,255,0.85)",
      padding: "40px 20px",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
        .preset-btn:hover { background: rgba(255,255,255,0.08) !important; }
        .run-btn:hover:not(:disabled) { background: #5ee8a8 !important; }
      `}</style>

      <div style={{ maxWidth: 900, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <div style={{
              width: 10, height: 10, borderRadius: "50%",
              background: "#7DF9C2",
              boxShadow: "0 0 12px #7DF9C2",
            }} />
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "rgba(255,255,255,0.4)", letterSpacing: "0.15em" }}>
              LANGGRAPH · RESEARCH AGENT
            </span>
          </div>
          <h1 style={{
            fontSize: "clamp(28px, 5vw, 48px)",
            fontWeight: 300,
            margin: 0,
            letterSpacing: "-0.02em",
            lineHeight: 1.1,
          }}>
            Multi-hop<br />
            <span style={{ color: "#7DF9C2" }}>Research Agent</span>
          </h1>
          <p style={{ color: "rgba(255,255,255,0.4)", marginTop: 12, fontSize: 14, maxWidth: 500 }}>
            A stateful LangGraph agent that searches, evaluates, and re-searches until it has enough information to answer confidently.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 220px", gap: 20, alignItems: "start" }}>

          {/* Left column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Input */}
            <div style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 12,
              padding: 16,
            }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginBottom: 10, letterSpacing: "0.1em", fontFamily: "'DM Mono', monospace" }}>
                QUESTION
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <input
                  value={question}
                  onChange={e => setQuestion(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleSubmit()}
                  placeholder="Ask anything..."
                  disabled={status === "running"}
                  style={{
                    flex: 1,
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 8,
                    padding: "10px 14px",
                    color: "white",
                    fontSize: 14,
                    outline: "none",
                  }}
                />
                <button
                  className="run-btn"
                  onClick={handleSubmit}
                  disabled={status === "running" || !question.trim()}
                  style={{
                    background: "#7DF9C2",
                    border: "none",
                    borderRadius: 8,
                    padding: "10px 20px",
                    color: "#09090f",
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: status === "running" || !question.trim() ? "not-allowed" : "pointer",
                    opacity: status === "running" || !question.trim() ? 0.4 : 1,
                    transition: "all 0.2s ease",
                  }}
                >
                  {status === "running" ? "Running..." : "Run →"}
                </button>
              </div>

              {/* Presets */}
              <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
                {presets.map(p => (
                  <button
                    key={p}
                    className="preset-btn"
                    onClick={() => { setQuestion(p); runAgent(p); }}
                    disabled={status === "running"}
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 6,
                      padding: "5px 10px",
                      color: "rgba(255,255,255,0.5)",
                      fontSize: 11,
                      cursor: "pointer",
                      transition: "background 0.2s ease",
                    }}
                  >
                    {p.length > 40 ? p.slice(0, 40) + "..." : p}
                  </button>
                ))}
              </div>
            </div>

            {/* Log panel */}
            <div style={{
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 12,
              overflow: "hidden",
            }}>
              <div style={{
                padding: "10px 16px",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
                fontSize: 11,
                color: "rgba(255,255,255,0.3)",
                letterSpacing: "0.1em",
                fontFamily: "'DM Mono', monospace",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}>
                <span>EXECUTION LOG</span>
                {status === "running" && (
                  <span style={{ color: "#7DF9C2", animation: "pulse 1s infinite" }}>● LIVE</span>
                )}
                {status === "done" && (
                  <span style={{ color: "#7DF9C2" }}>✓ COMPLETE</span>
                )}
              </div>
              <div
                ref={logRef}
                style={{
                  padding: 16,
                  minHeight: 160,
                  maxHeight: 260,
                  overflowY: "auto",
                }}
              >
                {visibleLogs.length === 0 && (
                  <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 12, fontFamily: "'DM Mono', monospace" }}>
                    Awaiting execution...
                  </div>
                )}
                {visibleLogs.map((entry, i) => (
                  <LogLine key={i} entry={entry} index={i} visible={true} />
                ))}
              </div>
            </div>

            {/* Answer panel */}
            <div style={{
              background: "rgba(125,249,194,0.04)",
              border: `1px solid ${showAnswer ? "rgba(125,249,194,0.2)" : "rgba(255,255,255,0.06)"}`,
              borderRadius: 12,
              overflow: "hidden",
              transition: "border-color 0.5s ease",
            }}>
              <div style={{
                padding: "10px 16px",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
                fontSize: 11,
                color: showAnswer ? "#7DF9C2" : "rgba(255,255,255,0.3)",
                letterSpacing: "0.1em",
                fontFamily: "'DM Mono', monospace",
                transition: "color 0.3s ease",
              }}>
                SYNTHESISED ANSWER
              </div>
              <div style={{
                padding: 20,
                minHeight: 100,
                fontSize: 13,
                lineHeight: 1.7,
                color: "rgba(255,255,255,0.7)",
                opacity: showAnswer ? 1 : 0,
                transition: "opacity 0.6s ease 0.2s",
              }}>
                {showAnswer ? formatAnswer(answer) : (
                  <span style={{ color: "rgba(255,255,255,0.2)" }}>Answer will appear here...</span>
                )}
              </div>
            </div>
          </div>

          {/* Right: graph viz */}
          <div style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 12,
            padding: "16px",
            position: "sticky",
            top: 20,
          }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginBottom: 4, letterSpacing: "0.1em", fontFamily: "'DM Mono', monospace" }}>
              GRAPH STATE
            </div>
            <GraphViz activeNode={activeNode} completedNodes={completedNodes} />

            {status === "done" && (
              <div style={{
                marginTop: 16,
                padding: "10px 12px",
                background: "rgba(125,249,194,0.08)",
                borderRadius: 8,
                fontSize: 11,
                color: "#7DF9C2",
                fontFamily: "'DM Mono', monospace",
              }}>
                ✓ {visibleLogs.filter(l => l.node === "search").length} search round{visibleLogs.filter(l => l.node === "search").length > 1 ? "s" : ""}<br />
                ✓ {visibleLogs.filter(l => l.node === "search").reduce((a, b) => a + (b.results || 0), 0)} results gathered
              </div>
            )}

            <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", lineHeight: 1.8, fontFamily: "'DM Mono', monospace" }}>
                <div>plan → search</div>
                <div style={{ color: "rgba(255,255,255,0.15)", paddingLeft: 16 }}>↓ (always)</div>
                <div>search → evaluate</div>
                <div style={{ color: "rgba(255,255,255,0.15)", paddingLeft: 16 }}>↓ sufficient?</div>
                <div>evaluate → answer</div>
                <div style={{ color: "#FFD16688", paddingLeft: 16 }}>↺ or re-search</div>
                <div style={{ color: "rgba(255,255,255,0.15)", paddingLeft: 16 }}>(max 3 hops)</div>
              </div>
            </div>
          </div>
        </div>

        {/* Code snippet */}
        <div style={{
          marginTop: 20,
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 12,
          overflow: "hidden",
        }}>
          <div style={{ padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", fontSize: 11, color: "rgba(255,255,255,0.3)", letterSpacing: "0.1em", fontFamily: "'DM Mono', monospace" }}>
            CORE GRAPH — src/agent.py
          </div>
          <pre style={{
            margin: 0,
            padding: 20,
            fontSize: 11.5,
            fontFamily: "'DM Mono', monospace",
            color: "rgba(255,255,255,0.6)",
            overflowX: "auto",
            lineHeight: 1.7,
          }}>
{`graph = StateGraph(AgentState)

graph.add_node("plan",     plan_node)     # craft search query
graph.add_node("search",   search_node)   # call Tavily API
graph.add_node("evaluate", evaluate_node) # judge sufficiency
graph.add_node("answer",   answer_node)   # synthesise + cite

graph.add_edge(START, "plan")
graph.add_conditional_edges("plan",     should_search)   # skip if no search needed
graph.add_edge("search", "evaluate")
graph.add_conditional_edges("evaluate", search_or_answer) # loop or finish

agent = graph.compile()`}
          </pre>
        </div>

      </div>
    </div>
  );
}
