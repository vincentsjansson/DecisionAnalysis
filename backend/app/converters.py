from backend.treemodel import TreeNode, Outcome



def frontend_to_backend(tree_json):
    """
    Konverterar frontendens JSON till backendens TreeNode-struktur.
    Hanterar:
    - outcomes
    - conditional_p → TreeNode.conditional_tables
    - rekursiva barn
    """

    def build_node(node_json):
        node = TreeNode(node_json["name"])

        cond_tables_json = node_json.get("conditional_tables", {})

        for cond_str, probs in cond_tables_json.items():
            # "" → tomt villkor
            if cond_str == "":
                cond_set = frozenset()
            else:
                cond_set = frozenset(cond_str.split(","))

            # probs är t.ex {"Yes": 0.7, "No": 0.3}
            node.conditional_tables[cond_set] = probs

        for oc_json in node_json.get("outcomes", []):
            oc = Outcome(
                name=oc_json["name"],
                probability=0.0  # sätts senare av apply_conditional_probabilities
            )
            node.outcomes.append(oc)

            child_json = oc_json.get("child")
            if child_json:
                child_node = build_node(child_json)
                oc.child = child_node
                child_node.parent_outcome = oc

        return node

    return build_node(tree_json)

def backend_to_frontend(root: TreeNode):
    """
    Konverterar backendens TreeNode till frontendens JSON-format.
    """

    def build_json(node):
        return {
            "name": node.name,
            "conditional_tables": {
                ",".join(cond): probs
                for cond, probs in node.conditional_tables.items()
            },
            "outcomes": [
                {
                    "name": oc.name,
                    "child": build_json(oc.child) if oc.child else None
                }
                for oc in node.outcomes
            ]
        }

    return build_json(root)
