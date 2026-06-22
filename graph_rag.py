import networkx as nx
import spacy
from typing import List, Dict

# Use a lightweight spacy model without heavy pipes
try:
    nlp = spacy.load("en_core_web_sm", disable=["ner", "lemmatizer", "textcat"])
except Exception:
    nlp = None


def build_knowledge_graph(clauses: List[Dict]) -> nx.Graph:
    """
    Dynamically builds a deterministic Knowledge Graph from a list of clauses.
    Nodes: The clauses themselves.
    Edges: Formed when a keyword/noun-chunk in one clause appears in another.
    """
    G = nx.Graph()

    # 1. Add all clauses as nodes
    for i, c in enumerate(clauses):
        text = c.get('original_text', '')
        G.add_node(i, text=text)

    if not nlp:
        return G

    # 2. Extract key phrases (noun chunks) from each clause
    node_keywords = {}
    for i, c in enumerate(clauses):
        text = c.get('original_text', '')
        doc = nlp(text)
        # Extract significant noun chunks (e.g. "late payment fee")
        keywords = set(chunk.text.lower() for chunk in doc.noun_chunks if len(chunk.text) > 4)
        node_keywords[i] = keywords

    # 3. Create edges if two clauses share significant keywords
    for i in range(len(clauses)):
        for j in range(i + 1, len(clauses)):
            shared_keywords = node_keywords[i].intersection(node_keywords[j])
            # Filter out generic banking terms
            shared_keywords = {
                k for k in shared_keywords
                if k not in ['the bank', 'this agreement', 'the customer', 'your account']
            }

            if shared_keywords:
                # Add an edge with the shared keywords as the relationship
                G.add_edge(i, j, relation=list(shared_keywords)[0])

    return G


def traverse_graph(clauses: List[Dict], keyword: str) -> str:
    """
    Traverses the graph starting from nodes containing the keyword.
    Returns a deterministic map of connected clauses to explain a chain reaction.
    """
    G = build_knowledge_graph(clauses)

    keyword = keyword.lower()
    start_nodes = [n for n, data in G.nodes(data=True) if keyword in data['text'].lower()]

    if not start_nodes:
        return f"No clauses found directly mentioning '{keyword}'."

    result_context = []
    visited = set()

    for start_node in start_nodes:
        if start_node in visited:
            continue

        result_context.append(f"► Trigger: {G.nodes[start_node]['text']}")
        visited.add(start_node)

        for neighbor in G.neighbors(start_node):
            if neighbor not in visited:
                relation = G.edges[start_node, neighbor]['relation']
                result_context.append(f"  ↳ Connected by '{relation}': {G.nodes[neighbor]['text']}")
                visited.add(neighbor)

    return "\n".join(result_context)
