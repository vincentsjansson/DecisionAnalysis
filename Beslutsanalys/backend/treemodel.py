
from itertools import combinations


#outcome ger utfall och sannolikhet för utfall, 
#samt om det betingar vidare från tidigare händelser
class outcome():
    def __init__(self, name,):
        self.name = name
        self.conditional_p = {} #dict: condition,p
        self.children = []
    def set_p(self, condition, p):
        if isinstance(condition, str): 
            condition = (condition,) 
        self.conditional_p[condition] = p

    def get_p(self, history): 
        for L in range(len(history), -1, -1): 
            for combo in combinations(history, L): 
                if combo in self.conditional_p: 
                    return self.conditional_p[combo]
        # Om inget hittas (borde aldrig hända om tom touple finns) 
        raise ValueError("No matching probability found")
    
    def to_dict(self):
        return {"name"          :self.name, 
                "conditional_p" :{",".join(cond): p for cond, p in self.conditional_p.items()}, 
                "Children"      :[child.name for child in self.children]}

#treenode lägger in flertal outcomes i en lista det blir alla möjliga utfall för den specifika händelsen.

class treenode():
    def __init__(self, name):
        self.name = name    
        self.outcome = []
    
    def add_outcomes(self, outcome):
        self.outcome.append(outcome)
    
    def to_dict(self):
        return {
        "name":     self.name,
        "outcomes": [oc.to_dict() for oc in self.outcome]}


#treematrix lägger in alla noder och dess betigningar i en matris.

class treematrix(): 
    def __init__(self):
        self.level = []

    def add_node(self, level_index, node):
        while len(self.level) <= level_index:
            self.level.append([])
        self.level[level_index].append(node)
    
    def to_dict(self):
        return {
        "levels": [[node.to_dict() for node in level] for level in self.level]}


    
