from backend.treemodel import TreeNode, Outcome


def calculate_ev(node: TreeNode) -> float:
    """
    Bottom-up EV calculation.
    Chance nodes: weighted average of branch EVs.
    Decision nodes: max of branch EVs.
    Terminal outcome (no child): uses outcome.value as the leaf payoff.
    Result stored as node.ev and returned.
    """
    if not node.outcomes:
        node.ev = 0.0
        return node.ev

    branch_evs = []
    for oc in node.outcomes:
        if oc.child is not None:
            branch_evs.append((oc.probability, calculate_ev(oc.child)))
        else:
            branch_evs.append((oc.probability, oc.value))

    if node.node_type == "decision":
        node.ev = max(ev for _, ev in branch_evs)
    else:  # chance
        node.ev = sum(p * ev for p, ev in branch_evs)

    return node.ev


def traverse_tree(root: TreeNode):
    results = []

    def recurse(node: TreeNode, history: list[str], current_p: float):
        # Bygg history_set
        history_set = set(history)

        # Applicera kombinations-betingning
        node.apply_conditional_probabilities(history_set)

        # Om noden saknar outcomes → blad
        if not node.outcomes:
            results.append((history, current_p))
            return

        # Gå igenom outcomes
        for oc in node.outcomes:
            event = f"{node.name}:{oc.name}"
            new_history = history + [event]
            new_p = current_p * oc.probability

            if oc.child is None:
                results.append((new_history, new_p))
            else:
                recurse(oc.child, new_history, new_p)

    recurse(root, [], 1.0)
    return results

def forward_probability_along_path(root: TreeNode, path: list[str]) -> float:
    """
    MODELL A:
    - Applicera conditional tables på varje nod baserat på history_set
    - Normalisera
    - Multiplicera sannolikheter längs pathen
    """

    node = root
    prob = 1.0
    history = set()

    for outcome_name in path:

        # 1. Applicera conditional tables innan vi väljer outcome
        node.apply_conditional_probabilities(history)

        # 2. Normalisera noden
        total = sum(o.probability for o in node.outcomes)
        if total > 0:
            for o in node.outcomes:
                o.probability /= total

        # 3. Hitta outcome
        match = None
        for o in node.outcomes:
            if o.name == outcome_name:
                match = o
                break

        if match is None:
            raise ValueError(f"Outcome '{outcome_name}' not found in node '{node.name}'")

        # 4. Multiplicera sannolikheten
        prob *= match.probability

        # 5. Uppdatera history_set
        history.add(outcome_name)

        # 6. Gå vidare
        node = match.child

        if node is None:
            break

    return prob

def solve_node_probabilities(node):
    """
    Löser ut okända sannolikheter i en nod om det är möjligt.
    Regler:
      - Om 0 okända: validerar att summan ≈ 1.0
      - Om 1 okänd: löser ut den så att summan blir 1.0
      - Om >1 okända: kastar fel (kräver mer info/constraints)
    """
    known_sum = 0.0
    unknown_outcomes = []

    for o in node.outcomes:
        if o.probability is None:
            unknown_outcomes.append(o)
        else:
            known_sum += o.probability

    if len(unknown_outcomes) == 0:
        # validera
        if abs(known_sum - 1.0) > 1e-6:
            raise ValueError(
                f"Probabilities in node '{node.name}' do not sum to 1 (sum={known_sum})"
            )
        return

    if len(unknown_outcomes) == 1:
        remaining = 1.0 - known_sum
        if remaining < 0:
            raise ValueError(
                f"Negative remaining probability in node '{node.name}' (sum={known_sum})"
            )
        unknown_outcomes[0].probability = remaining
        return

    # fler än en okänd
    raise ValueError(
        f"Node '{node.name}' has multiple unknown probabilities; "
        f"need additional constraints to solve."
    )

def backward_fill_along_path(root: TreeNode, path: list[str], final_probability: float):
    # 1. Walk forward collecting (node, outcome) pairs, applying conditional tables
    chain = []
    node = root
    history = set()

    for outcome_name in path:
        node.apply_conditional_probabilities(history)

        total = sum(o.probability for o in node.outcomes)
        if total > 0:
            for o in node.outcomes:
                o.probability /= total

        match = next((o for o in node.outcomes if o.name == outcome_name), None)
        if match is None:
            raise ValueError(f"Outcome '{outcome_name}' not found in node '{node.name}'")

        chain.append((node, match))
        history.add(outcome_name)
        node = match.child

    # 2. Solve unknowns backward — None or 0.0 both treated as unknown
    for i in reversed(range(len(chain))):
        node, outcome = chain[i]

        product_other = 1.0
        for j, (_, o2) in enumerate(chain):
            if j == i:
                continue
            if o2.probability is None or o2.probability == 0.0:
                raise ValueError("Multiple unknown probabilities along path.")
            product_other *= o2.probability

        if outcome.probability is None or outcome.probability == 0.0:
            if product_other == 0:
                raise ValueError("Cannot solve: product of other probabilities is zero.")
            outcome.probability = final_probability / product_other

        total = sum(o.probability for o in node.outcomes)
        if total > 0:
            for o in node.outcomes:
                o.probability /= total

    # 3. Resolve any remaining single unknowns in each node along the path
    for node, _ in chain:
        solve_node_probabilities(node)

