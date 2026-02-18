from backend.treemodel import outcome, treenode, treematrix
   
#används för att gå genom trädet och dess möjliga utffall. 
def traverse_tree(tree:'treematrix'):
    results = []

    def recurse(level, currentpath, current_p):
        if level == len(tree.level):
            results.append((currentpath, current_p))
            return
        
        for node in tree.level[level]:
            for oc in node.outcome: 
                p = oc.get_p(currentpath)
                if p is None:
                    raise ValueError( f"There is no register probability for {oc.name} given {currentpath}")
                recurse(level +1, currentpath + [oc.name], current_p*p)
    recurse (0,[],1)
    return results

# används för att inte bara visa vilka sannolikheter som är betingade
# Skapar även parent-child relationer mellan händelser
def build_child_structure(tree:'treematrix'):
    results = traverse_tree(tree)

    # Rensa gamla barn
    for level in tree.level:
        for node in level:
            for oc in node.outcome:
                oc.children = []

    # Bygg parent → child relationer
    for path, _ in results:
        for level in range(len(path) - 1):
            parent_name = path[level]
            child_name = path[level + 1]

            parent_node = tree.level[level][0]
            child_node = tree.level[level + 1][0]

            parent_outcome = next(o for o in parent_node.outcome if o.name == parent_name)
            child_outcome = next(o for o in child_node.outcome if o.name == child_name)

            if child_outcome not in parent_outcome.children:
                parent_outcome.children.append(child_outcome)

