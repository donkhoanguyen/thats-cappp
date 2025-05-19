import os
from typing import Dict, TypedDict, Annotated, Sequence, List, Optional, Any, Union
import asyncio

from langchain_core.messages import SystemMessage, HumanMessage, AIMessage, BaseMessage
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langgraph.graph import StateGraph, END
from langchain_core.callbacks import BaseCallbackHandler, CallbackManager
from langchain_core.callbacks.base import BaseCallbackManager

from dotenv import load_dotenv
load_dotenv()

# Define Callbacks type
Callbacks = Optional[Union[List[BaseCallbackHandler], BaseCallbackManager]]

class VerificationAgentState(TypedDict):
    context: Annotated[Optional[str], "The background context of a video, as text"]
    claim: Annotated[str, "A single claim that needs fact checking"]
    # is_verifiable: Annotated[Optional[bool], "Whether the claim can be verified"]
    claim_type: Annotated[Optional[str], "Type of claim"]
    fact_check_result: Annotated[Optional[str], "Fact check result"]
    next: Annotated[Optional[str], "Next node to go to"]

def classifier_node(state: VerificationAgentState) -> Dict:
    llm = ChatOpenAI(
        model="gpt-4o-mini", 
        temperature=0.0, 
        api_key=os.getenv("OPENAI_API_KEY"),
        callbacks=None
    )
    
    claim = state["claim"]

    prompt = f"""
Help me classify the following claim into one of 3 types:
1. factual – something that can be verified via reliable sources
2. opinion – a subjective or personal judgment
3. unverifiable – something that is ambiguous or too vague to verify

Claim: "{claim}"

Respond with only the label: factual, opinion, or unverifiable.
"""

    response = llm.invoke(prompt)

    claim_type = response.content.strip().lower()

    return {
        "claim_type": claim_type,
        "next": "fact_checker" if claim_type == "factual" else "end"
    }

# from ..src.fact_checking.checker import FactChecker
# from fact_checker import FactChecker
from ..fact_checking.fact_checker import FactChecker

async def fact_checker_node(state: VerificationAgentState) -> Dict:
    checker = FactChecker()
    claim = state["claim"]
    print("\nFact-checking Results:")

    # Check the claims
    result = await checker.check_claims(claim)

    return {"fact_check_result": result,
            "next": "end"}

def build_graph():
    # Initialize the graph
    graph = StateGraph(VerificationAgentState)
    
    # Add nodes
    graph.add_node("classifier", classifier_node)
    graph.add_node("fact_checker", fact_checker_node)
    
    # Add conditional edges from classifier
    graph.add_conditional_edges(
        "classifier",
        lambda state: state["next"],
        {
            "fact_checker": "fact_checker",  # Route to fact-checking if verifiable
            "end": END                       # Route to end if not verifiable
        }
    )
    
    # Add edge from fact_checker to end
    graph.add_edge("fact_checker", END)
    
    # Set the entry point
    graph.set_entry_point("classifier")
    
    # Compile the graph
    return graph.compile()

# Create and test the graph
graph = build_graph()

# Test the graph with a sample input
test_input = {
    "context": "Video transcript about scientific discoveries",
    "claim": "Albert Einstein developed the theory of relativity",
    "claim_type": None,
    "fact_check_result": None,
    "next": "classifier"
}