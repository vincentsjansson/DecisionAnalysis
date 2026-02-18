from backend.treemodel import outcome, treenode, treematrix, traverse_tree, build_child_structure

def visualize_tree_ASCII(tree):
    output = []
    output.append("ASCII‑visualisering av trädet:\n")

    for level_index, nodes in enumerate(tree.level):
        output.append(f"Nivå {level_index}:")
        for node in nodes:
            output.append(f"  ├─ Nod: {node.name}")
            for oc in node.outcome:
                output.append(f"  │    ├─ Outcome: {oc.name}")
                for cond, p in oc.conditional_p.items():
                    cond_str = ", ".join(cond) if cond else "DEFAULT"
                    output.append(f"  │    │      └─ P({oc.name} | {cond_str}) = {p}")
        output.append("")

    return "\n".join(output)

#Kräver att du har anropat children structurer.
def draw_symmetric_tree(root_outcomes):
    def recurse(outcomes, prefix=""):
        lines = []
        count = len(outcomes)
        for i, oc in enumerate(outcomes):
            connector = "└── " if i == count - 1 else "├── "
            lines.append(prefix + connector + oc.name)

            if oc.children:
                new_prefix = prefix + ("    " if i == count - 1 else "│   ")
                lines.extend(recurse(oc.children, new_prefix))

        return lines

    return "\n".join(recurse(root_outcomes))

#anrop och börjar från första nod
def visualize_symmetric_A(tree:'treematrix'):
    build_child_structure(tree)
    root_outcomes = tree.level[0][0].outcome
    return draw_symmetric_tree(root_outcomes)


if __name__ == "__main__":
    tree = treematrix()

    # Nivå 0 – 3 outcomes
    A = treenode("A")
    for i in range(1, 4):
        Ai = outcome(f"A{i}")
        Ai.set_p((), 1/3)
        A.add_outcomes(Ai)
    tree.add_node(0, A)

    # Nivå 1 – 2 outcomes
    B = treenode("B")
    for i in range(1, 3):
        Bi = outcome(f"B{i}")
        Bi.set_p(("A1",), 0.6 if i == 1 else 0.4)
        Bi.set_p(("A2",), 0.5)
        Bi.set_p(("A3",), 0.3 if i == 1 else 0.7)
        Bi.set_p((), 0.5)
        B.add_outcomes(Bi)
    tree.add_node(1, B)

    # Nivå 2 – 4 outcomes
    C = treenode("C")
    for i in range(1, 5):
        Ci = outcome(f"C{i}")
        Ci.set_p(("A1","B1"), 0.1 * i)
        Ci.set_p(("A1","B2"), 0.05 * i)
        Ci.set_p(("A2","B1"), 0.08 * i)
        Ci.set_p(("A2","B2"), 0.12 * i)
        Ci.set_p(("A3","B1"), 0.03 * i)
        Ci.set_p(("A3","B2"), 0.07 * i)
        Ci.set_p((), 0.02 * i)
        C.add_outcomes(Ci)
    tree.add_node(2, C)

    # Nivå 3 – 3 outcomes
    D = treenode("D")
    for i in range(1, 4):
        Di = outcome(f"D{i}")
        Di.set_p(("A1","B1","C1"), 0.2 * i)
        Di.set_p(("A2","B2","C3"), 0.1 * i)
        Di.set_p(("A3","B1","C4"), 0.05 * i)
        Di.set_p((), 0.1 * i)
        D.add_outcomes(Di)
    tree.add_node(3, D)

    # Nivå 4 – 2 outcomes
    E = treenode("E")
    for i in range(1, 3):
        Ei = outcome(f"E{i}")
        Ei.set_p((), 0.5)
        E.add_outcomes(Ei)
    tree.add_node(4, E)

    # Skriv ut symmetriskt träd
    print(visualize_symmetric_A(tree))

