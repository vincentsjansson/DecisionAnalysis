from backend.treemodel import TreeNode, Outcome

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
