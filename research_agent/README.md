# Research Agent

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

# Setup
chmod +x setup.sh && ./setup.sh

## API Keys Needed
| Service | Free Tier | Link |
|---|---|---|
| Grok | grok.com |
| Tavily | app.tavily.com |

Add your API keys into your environment file!
