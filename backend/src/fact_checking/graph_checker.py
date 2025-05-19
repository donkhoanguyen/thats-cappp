import os

from langchain_core.messages import SystemMessage, HumanMessage, AIMessage, BaseMessage
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langgraph.graph import StateGraph, END

from langchain_core.callbacks import BaseCallbackHandler
from langchain_core.callbacks.base import BaseCallbackManager

from typing import Dict, TypedDict, Annotated, Sequence, List, Optional, Any, Union

Callbacks = Optional[Union[List[BaseCallbackHandler], BaseCallbackManager]]

from dotenv import load_dotenv
load_dotenv()

class VerificationAgentState(TypedDict):
    context: Annotated[str, "The background context of a video, as text"]
    claim: Annotated[str, "A single claim that needs fact checking"]
    # is_verifiable: Annotated[Optional[bool], "Whether the claim can be verified"]
    claim_type: Annotated[Optional[str], "Type of claim"]
    fact_check_result: Annotated[Optional[str], "Fact check result"]
    next: str

def classifier_node(state: VerificationAgentState) -> Dict:
    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.0, 
                     api_key=os.getenv("OPENAI_API_KEY"))
    
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
        "claim_type": claim_type
        # optionally: "next": "verify" if claim_type == "factual" else "end"
    }

# from ..src.fact_checking.checker import FactChecker
from fact_checker import FactChecker

# Fact checker using pplx
def fact_checker_node(state: VerificationAgentState) -> Dict:
    checker = FactChecker()
    # Example claims to check

    claim = state["claim"]

    # Print the fact-checking results
    print("\nFact-checking Results:")

    # Check the claims
    result = checker.check_claims(claim)

    return {"fact_check_result": result}

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
messages = [
    SystemMessage(content="You are a helpful assistant."),
    HumanMessage(content="China has a 65% rice tariff on the US")
]