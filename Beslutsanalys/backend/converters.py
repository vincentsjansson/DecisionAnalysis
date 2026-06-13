from backend.treemodel import TreeNode, Outcome

def frontend_to_backend(tree_json):
    """Konverterar frontendens JSON → TreeNode."""

    def build_node(node_json):
        if not node_json:
            return None

        name = node_json.get("name", "")
        node_type = node_json.get("node_type", "chance")
        outcomes_json = node_json.get("outcomes") or []
        cond_tables_json = (
            node_json.get("conditionaltables")
            or node_json.get("conditional_tables")
            or {}
        )

        node = TreeNode(name=name, node_type=node_type)

        # Konvertera conditional_tables: "A,B" → frozenset({"A","B"})
        for cond_str, probs in cond_tables_json.items():
            cond_set = frozenset(cond_str.split(",")) if cond_str else frozenset()
            node.conditional_tables[cond_set] = probs

        # Lägg till outcomes
        for oc_json in outcomes_json:
            oc_name = oc_json.get("name", "")
            oc_prob = oc_json.get("probability", 0.0)
            oc_value = oc_json.get("value", 0.0)

            child_json = oc_json.get("child")
            child_node = build_node(child_json) if child_json else None

            outcome = Outcome(name=oc_name, probability=oc_prob, child=child_node, value=oc_value)
            node.outcomes.append(outcome)

        return node

    return build_node(tree_json)

def backend_to_frontend(root: TreeNode):
    """Konverterar TreeNode → frontendens JSON-format."""

    def build_json(node):
        d = {
            "name": node.name,
            "node_type": node.node_type,
            "conditionaltables": {
                ",".join(sorted(cond)): probs for cond, probs in node.conditional_tables.items()
            },
            "outcomes": [
                {
                    "name": oc.name,
                    "probability": oc.probability,
                    "value": oc.value,
                    "child": build_json(oc.child) if oc.child else None
                }
                for oc in node.outcomes
            ]
        }
        ev = getattr(node, "ev", None)
        if ev is not None:
            d["ev"] = ev
        return d

    return build_json(root)
