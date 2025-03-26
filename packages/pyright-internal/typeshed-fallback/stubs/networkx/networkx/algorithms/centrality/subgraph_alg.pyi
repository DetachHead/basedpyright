from networkx.classes.graph import Graph, _Node
from networkx.utils.backends import _dispatchable

@_dispatchable
def subgraph_centrality_exp(G: Graph[_Node]): ...
@_dispatchable
def subgraph_centrality(G: Graph[_Node]): ...
@_dispatchable
def communicability_betweenness_centrality(G: Graph[_Node]): ...
@_dispatchable
def estrada_index(G: Graph[_Node]): ...
