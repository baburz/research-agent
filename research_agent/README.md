# 🔬 Research Agent

A multi-step AI research agent built with **LangGraph** and **LangChain** that searches the web, evaluates result quality, and re-searches with refined queries until it has enough information to answer confidently.

## Architecture

```
[START]
   │
   ▼
 plan ──── crafts optimal search query
   │
   ▼ (conditional: needs search?)
 search ── executes web search via Tavily
   │
   ▼
evaluate ─ LLM judges if results are sufficient
   │
   ▼ (conditional: sufficient OR max hops reached?)
 answer ── synthesises cited answer from all results
   │
  [END]
```

The `evaluate → search` loop can repeat up to **3 times** with progressively refined queries — just like a human researcher would.

## State

All agent state is typed via `AgentState` (TypedDict):

| Field | Type | Purpose |
|---|---|---|
| `messages` | `list` | Full conversation history |
| `question` | `str` | Original user question |
| `search_queries` | `list[str]` | All queries tried |
| `search_results` | `list[dict]` | Accumulated web results |
| `hop_count` | `int` | Search rounds completed |
| `sufficient` | `bool` | Has enough info been gathered? |
| `final_answer` | `str` | Final synthesised response |

## Quick Start

```bash
# 1. Setup
chmod +x setup.sh && ./setup.sh

# 2. Add API keys
nano .env

# 3. Activate environment
source .venv/bin/activate

# 4. Run
python src/agent.py "What are the latest advancements in RAG systems?"
```

## Example Output

```
Question: What is LangGraph and how does it differ from LangChain?

[plan]    needs_search=True  query='LangGraph vs LangChain differences 2024'
[search]  hop 1 — 4 results retrieved
[eval]    sufficient=True
[answer]  synthesising...

LangGraph is a library built on top of LangChain for creating stateful,
multi-actor applications... [1][2]

## Sources
[1] https://blog.langchain.dev/langgraph/
[2] https://python.langchain.com/docs/langgraph
```

## Design Decisions

**Why LangGraph over a simple LangChain chain?**
Simple chains are linear — they can't loop, branch, or retry. LangGraph gives you a real state machine, which is essential for agents that need to evaluate their own progress and adapt. This mirrors production systems far more accurately.

**Why typed state?**
`TypedDict` makes state transitions explicit and debuggable. Every node receives and returns the full state, making it easy to inspect at any point.

**Why separate evaluate node?**
Separating search from evaluation keeps each node focused on one responsibility. It also makes it trivial to swap in a different evaluator (e.g., a retrieval scoring model) without touching search logic.

## Project Structure

```
research-agent/
├── src/
│   └── agent.py        # core LangGraph agent
├── logs/               # auto-generated run logs
├── requirements.txt
├── setup.sh            # one-shot setup script
├── .env.example
└── README.md
```

## API Keys Needed

| Service | Free Tier | Link |
|---|---|---|
| OpenAI | Pay-per-use (cheap with gpt-4o-mini) | platform.openai.com |
| Tavily | 1,000 searches/month free | app.tavily.com |
