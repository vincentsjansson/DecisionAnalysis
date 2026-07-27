# Run from repo root: python -c "..."
from backend.treemodel import TreeNode, Outcome

# --- Test 1: pure chance node ---
root = TreeNode("flip", node_type="chance")
h = Outcome("heads", probability=0.5, value=100.0)
t = Outcome("tails", probability=0.5, value=0.0)
root.outcomes = [h, t]

from backend.treelogic import calculate_ev
ev = calculate_ev(root)
assert ev == 50.0, ev
print(f"Chance EV: {ev}")   # → 50.0

# --- Test 2: decision node picks best branch ---
d = TreeNode("choice", node_type="decision")
d.outcomes = [Outcome("A", value=30.0), Outcome("B", value=80.0)]
ev = calculate_ev(d)
assert ev == 80.0, ev
print(f"Decision EV: {ev}")  # → 80.0

# --- Test 3: two-level tree (chance → chance) ---
child = TreeNode("child", node_type="chance")
child.outcomes = [Outcome("win", probability=0.8, value=200.0),
                  Outcome("lose", probability=0.2, value=0.0)]
parent = TreeNode("parent", node_type="chance")
parent.outcomes = [Outcome("go", probability=1.0, child=child)]
ev = calculate_ev(parent)
assert abs(ev - 160.0) < 1e-9, ev
print(f"Two-level EV: {ev}")  # → 160.0

print("All EV tests passed.")