"""
Research Agent built with LangGraph
------------------------------------
1. Takes a user question
2. Decides if it needs to search the web
3. Searches using Tavily
4. Evaluates if results are sufficient
5. Re-searches with a refined query if needed (max 3 hops)
6. Returns a cited, structured answer

State machine nodes:
  [START] → plan → search → evaluate → (answer | re_search) → [END]
"""

import io
import sys
import json
import logging
from typing import TypedDict, Annotated, Literal
from datetime import datetime

from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langchain_community.tools.tavily_search import TavilySearchResults
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langchain_groq import ChatGroq

from dotenv import load_dotenv
load_dotenv()

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

# ── Logging ────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(f"logs/agent_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log", encoding="utf-8"),
    ],
)
log = logging.getLogger(__name__)


# ── State ──────────────────────────────────────────────────────────────────
class AgentState(TypedDict):
    messages: Annotated[list, add_messages]  # full conversation history
    question: str                             # original user question
    search_queries: list[str]                 # all queries tried so far
    search_results: list[dict]                # raw results from search tool
    hop_count: int                            # how many search rounds done
    sufficient: bool                          # get enough info?
    final_answer: str                         # final response


MAX_HOPS = 3  # max search rounds before forcing an answer

def build_llm():
    return ChatGroq(model="llama-3.1-8b-instant", temperature=0)


def build_search_tool() -> TavilySearchResults:
    return TavilySearchResults(max_results=4)


# ── Node: plan ─────────────────────────────────────────────────────────────
def plan_node(state: AgentState) -> AgentState:
    """
    Generate an optimised search query from the user's question.
    Also decides if web search is even needed.
    """
    log.info("PLAN  — crafting search query")
    llm = build_llm()

    system = SystemMessage(content="""You are a research planner.
    Given a user question, output a JSON object with two fields:
    "needs_search": true/false  — does this require real-time web search?
    "query": string             — the best web search query to answer it (concise, keyword-focused)

    Respond with ONLY valid JSON, no markdown, no emoji.""")

    response = llm.invoke([system, HumanMessage(content=state["question"])])
    data = json.loads(response.content)

    log.info(f"   needs_search={data['needs_search']}  query='{data['query']}'")

    return {
        **state,
        "search_queries": [data["query"]],
        "hop_count": 0,
        "sufficient": not data["needs_search"],  # skip search if not needed
    }


# ── Node: search ───────────────────────────────────────────────────────────
def search_node(state: AgentState) -> AgentState:
    query = state["search_queries"][-1]
    log.info(f"SEARCH [hop {state['hop_count'] + 1}] — '{query}'")

    tool = build_search_tool()
    raw = tool.invoke(query)

    if isinstance(raw, str):
        log.warning("Search tool returned a string. Normalizing to list...")
        raw = [{"content": raw, "url": "N/A"}]
    # -----------------------

    new_results = state.get("search_results", []) + list(raw)
    log.info(f"   Retrieved {len(raw)} results  (total: {len(new_results)})")

    return {
        **state,
        "search_results": new_results,
        "hop_count": state["hop_count"] + 1,
    }


# ── Node: evaluate ─────────────────────────────────────────────────────────
def evaluate_node(state: AgentState) -> AgentState:
    """
    Asks the LLM: are the current search results sufficient to answer the question?
    If not, generates a refined query.
    """
    log.info("EVALUATE — checking result sufficiency")
    llm = build_llm()

    snippets = "\n\n".join(
        f"[{i+1}] {r.get('url','')}\n{r.get('content','')[:400]}"
        for i, r in enumerate(state["search_results"])
    )

    system = SystemMessage(content="""You are a research evaluator.
    Given a question and search result snippets, output JSON:
    "sufficient": true/false
    "reason": short explanation
    "refined_query": a better search query (only if sufficient=false)

    Respond with ONLY valid JSON.""")

    prompt = f"Question: {state['question']}\n\nResults:\n{snippets}"
    response = llm.invoke([system, HumanMessage(content=prompt)])
    data = json.loads(response.content)

    log.info(f"   sufficient={data['sufficient']}  reason='{data['reason']}'")

    new_queries = state["search_queries"]
    if not data["sufficient"] and data.get("refined_query"):
        new_queries = new_queries + [data["refined_query"]]

    return {
        **state,
        "sufficient": data["sufficient"],
        "search_queries": new_queries,
    }


# ── Node: answer ───────────────────────────────────────────────────────────
def answer_node(state: AgentState) -> AgentState:
    """Synthesize a final cited answer from all search results."""
    log.info("ANSWER — synthesising final response")
    llm = build_llm()

    snippets = "\n\n".join(
        f"[{i+1}] Source: {r.get('url','N/A')}\n{r.get('content','')[:600]}"
        for i, r in enumerate(state["search_results"])
    )

    system = SystemMessage(content="""You are a helpful research assistant.
    Synthesise the search results into a clear, well-structured answer.
    - Use inline citations like [1], [2] etc. matching the source numbers given.
    - End with a ## Sources section listing all URLs cited.
    - Be concise but complete.""")

    prompt = f"Question: {state['question']}\n\nSources:\n{snippets}"
    response = llm.invoke([system, HumanMessage(content=prompt)])

    log.info("   Answer generated ✓")

    return {
        **state,
        "final_answer": response.content,
        "messages": state["messages"] + [AIMessage(content=response.content)],
    }


# ── Routing logic ───────────────────────────────────────────────────────────
def should_search(state: AgentState) -> Literal["search", "answer"]:
    """After planning: do we need to search at all?"""
    return "search" if not state["sufficient"] else "answer"


def search_or_answer(state: AgentState) -> Literal["search", "answer"]:
    """After evaluating: re-search or answer?"""
    if state["sufficient"] or state["hop_count"] >= MAX_HOPS:
        if state["hop_count"] >= MAX_HOPS:
            log.warning(f"⚠️  Max hops ({MAX_HOPS}) reached — forcing answer")
        return "answer"
    return "search"


# ── Graph assembly ──────────────────────────────────────────────────────────
def build_graph() -> StateGraph:
    graph = StateGraph(AgentState)

    graph.add_node("plan", plan_node)
    graph.add_node("search", search_node)
    graph.add_node("evaluate", evaluate_node)
    graph.add_node("answer", answer_node)

    graph.add_edge(START, "plan")
    graph.add_conditional_edges("plan", should_search)
    graph.add_edge("search", "evaluate")
    graph.add_conditional_edges("evaluate", search_or_answer)
    graph.add_edge("answer", END)

    return graph.compile()


# ── Public API ──────────────────────────────────────────────────────────────
def run_agent(question: str) -> dict:
    """
    Run the research agent on a question.
    Returns a dict with 'answer', 'sources_searched', 'hops'.
    """
    log.info(f"\n{'='*60}")
    log.info(f"Question: {question}")
    log.info(f"{'='*60}")

    agent = build_graph()

    initial_state: AgentState = {
        "messages": [HumanMessage(content=question)],
        "question": question,
        "search_queries": [],
        "search_results": [],
        "hop_count": 0,
        "sufficient": False,
        "final_answer": "",
    }

    final_state = agent.invoke(initial_state)
    
    log.info(
        f"RESULT\n"
        f"Answer: {final_state.get('final_answer', 'No answer generated')}\n"
        f"Queries used: {final_state.get('search_queries', [])}\n"
        f"Hops: {final_state.get('hop_count', 0)}\n"
        f"Sources: {[r.get('url') for r in final_state.get('search_results', [])]}"
    )
    return {
        "answer": final_state["final_answer"],
        "queries_used": final_state["search_queries"],
        "hops": final_state["hop_count"],
        "sources": [r.get("url") for r in final_state.get("search_results", [])],
    }


if __name__ == "__main__":
    import sys

    question = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else input("Ask a question: ")
    result = run_agent(question)

    print("\n" + "="*60)
    print(result["answer"])
    print(f"\nSearched {result['hops']} round(s) with queries:")
    for q in result["queries_used"]:
        print(f"   • {q}")
