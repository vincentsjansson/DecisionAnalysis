
class Outcome:
    def __init__(self, name: str, probability: float = 0.0, child: "TreeNode" = None, value: float = 0.0):
        self.name = name
        self.probability = probability
        self.child = child
        self.value = value  # terminal payoff when child is None

    def __repr__(self):
        return f"Outcome(name={self.name}, p={self.probability}, child={self.child is not None})"

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "probability": self.probability,
            "value": self.value,
            "child": self.child.to_dict() if self.child else None
        }


class TreeNode:
    def __init__(self, name: str, parent_outcome: Outcome = None, node_type: str = "chance"):
        self.name = name
        self.node_type = node_type  # "chance" or "decision"
        self.outcomes: list[Outcome] = []
        self.parent_outcome = parent_outcome

        # Kombinations-betingning: nyckel = frozenset av events
        # värde = dict outcome_name -> probability
        self.conditional_tables: dict[frozenset[str], dict[str, float]] = {}

    def __repr__(self):
        return f"TreeNode(name={self.name}, outcomes={len(self.outcomes)})"
    
    def add_outcome(self, name: str, probability: float = 0.0) -> Outcome:
        oc = Outcome(name=name, probability=probability)
        self.outcomes.append(oc)
        return oc

    def set_child(self, outcome: Outcome, child_node: "TreeNode") -> None:
        outcome.child = child_node
        child_node.parent_outcome = outcome

    def apply_conditional_probabilities(self, history_set: set[str]) -> None:
        """Matchar conditional tables baserat på subset-logik."""

        best_match = None
        best_size = -1

        for condition, probs in self.conditional_tables.items():
            if condition.issubset(history_set):
                if len(condition) > best_size:
                    best_match = probs
                    best_size = len(condition)

        if best_match is not None:
            # Sätt sannolikheter
            for oc in self.outcomes:
                if oc.name in best_match:
                    oc.probability = best_match[oc.name]

            # Normalisera
            total = sum(oc.probability for oc in self.outcomes)
            if total > 0:
                for oc in self.outcomes:
                    oc.probability /= total

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "node_type": self.node_type,
            "outcomes": [oc.to_dict() for oc in self.outcomes],
            "conditional_tables": {
                ",".join(sorted(cond)): probs for cond, probs in self.conditional_tables.items()
            }
        }
