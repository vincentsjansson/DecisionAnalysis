def print_ascii_tree(root):
    def recurse(node, prefix=""):
        print(prefix + node.name)

        # Visa outcomes
        for i, oc in enumerate(node.outcomes):
            is_last = (i == len(node.outcomes) - 1)
            branch = "└─ " if is_last else "├─ "
            next_prefix = prefix + ("   " if is_last else "│  ")

            print(f"{prefix}{branch}{oc.name} (p={oc.probability:.3f})")

            # Om outcome har barnnod
            if oc.child:
                recurse(oc.child, next_prefix)

    recurse(root)
