from backend.treemodel import TreeNode
from backend.treelogic import traverse_tree
from frontend.ascii_tree import print_ascii_tree

# -------------------------
# Bygg ett träd med 3 nivåer
# -------------------------

root = TreeNode("Root")

# Level 1 outcomes
A = root.add_outcome("A", 0.5)
B = root.add_outcome("B", 0.5)

# Level 2 node
node2 = TreeNode("Node2")
root.set_child(A, node2)
root.set_child(B, node2)

# Level 2 outcomes
X = node2.add_outcome("X", 0.5)
Y = node2.add_outcome("Y", 0.5)

# Level 3 node
node3 = TreeNode("Node3")
node2.set_child(X, node3)
node2.set_child(Y, node3)

# Level 3 outcomes
L = node3.add_outcome("L", 0.5)
M = node3.add_outcome("M", 0.5)

# -------------------------
# Betingning
# -------------------------

# Node2 påverkas av Root
node2.conditional_tables[frozenset({"Root:A"})] = {"X": 0.8, "Y": 0.2}
node2.conditional_tables[frozenset({"Root:B"})] = {"X": 0.1, "Y": 0.9}

# Node3 påverkas av Node2 events
node3.conditional_tables[frozenset({"Node2:X"})] = {"L": 0.3, "M": 0.7}
node3.conditional_tables[frozenset({"Node2:Y"})] = {"L": 0.9, "M": 0.1}

# -------------------------
# Kör traversal (för att trigga betingning)
# -------------------------

results = traverse_tree(root)

# -------------------------
# Skriv ut ASCII‑trädet
# -------------------------

print("\nASCII‑visualisering av trädet:\n")
print_ascii_tree(root)

print("\nPaths och sannolikheter:\n")
for history, p in results:
    print(f"{history}   p={p:.4f}")
