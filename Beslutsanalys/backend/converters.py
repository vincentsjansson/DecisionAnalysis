from treemodel import outcome, treenode, treematrix

#Tar frontendens JSON-struktur och bygger backendens Python-objekt.
def frontend_to_backend(tree_json): 
    tm = treematrix()

    for level_index, event in enumerate(tree_json["events"]):
        node = treenode(event["name"])

        for oc_json in event["outcomes"]:
            oc = outcome(oc_json["name"])

            # Lägg in sannolikheter
            for cond_str, p in oc_json["p"].items():
                cond = tuple(cond_str.split(",")) if cond_str else ()
                oc.set_p(cond, p)

            # Lägg in barn (som ID:n)
            oc.children = oc_json.get("children", [])

            node.add_outcomes(oc)

        tm.add_node(level_index, node)

    return tm

#Tar backend och bygger JSON-struktur samma som  loop av alla to_dict commandon 
def backend_to_frontend(tree):
    tree.to_dict()
