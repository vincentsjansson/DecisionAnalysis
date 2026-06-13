from backend.treemodel import TreeNode, Outcome
from backend.treelogic import backward_fill_along_path, forward_probability_along_path

# Skapa noder
root = TreeNode("Root")
node1 = TreeNode("Node1")

# Lägg till outcomes i root
a = root.add_outcome("A", probability=0.3)
b = root.add_outcome("B", probability=None)

# Lägg till outcomes i node1
y = node1.add_outcome("Y", probability=None)
z = node1.add_outcome("Z", probability=None)   # <-- FIX: Z är okänd, inte 0.4

# Koppla barn
root.set_child(a, node1)

# Path och slutprobabilitet
path = ["A", "Y"]
final_p = 0.12

print("DEBUG: Root outcomes:")
for o in root.outcomes:
    print(" -", repr(o))

# Kör backward
backward_fill_along_path(root, path, final_p)

print("\nAfter backward fill:")
for o in root.outcomes:
    print("Root outcome:", o)
for o in node1.outcomes:
    print("Node1 outcome:", o)

print("\nForward check:", forward_probability_along_path(root, path))
