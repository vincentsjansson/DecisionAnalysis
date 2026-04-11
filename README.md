# DecisionAnalysis

DecisionAnalysis is a personal project exploring structured decision analysis, probabilistic modeling, and modular system design. 
The project implements a flexible decision tree engine in Python, featuring a TreeNode structure, Outcome branches, conditional probability tables, JSON conversion utilities, and traversal logic for evaluating probabilistic outcomes. 
The system is designed with a clear separation between data representation, transformation, and computation, making it easy to extend, test, and eventually port to other environments.

## Project Structure
Beslutsanalys/
├── backend/
│   ├── treemodel.py        # TreeNode and Outcome classes
│   ├── converters.py       # JSON ↔ backend converters
│   ├── treelogic.py        # Traversal and probability logic
│   └── init.py
│
├── frontend/               # Placeholder for upcoming JS/HTML version
│
├── testconverters.py       # Round‑trip test for model integrity
├── requirements.txt
└── README.md


## Installation
1. Install Python 3.10 or later.
2. Clone the repository:
3. Install dependencies:   pip install -r requirements.txt


## Running the Converter Test
The project includes a round‑trip test that verifies the integrity of the JSON conversion pipeline.  
Run the test with:   python testconverters.py

Expected output confirms that the internal model and JSON representation are fully synchronized.


## Architecture Overview
**TreeNode**  
Represents a decision point in the tree, containing:
- a name  
- conditional probability tables  
- a list of Outcome branches  

**Outcome**  
Represents a branch from a node, containing:
- a name  
- an optional child TreeNode  

**Converters**  
Ensure lossless transformation between JSON and the internal Python model.

**Traversal Logic**  
Implements probability evaluation and tree navigation based on conditional tables.

## Future Work: JavaScript Port
The long‑term goal is to port the entire backend to JavaScript so the system can run directly in a browser through a simple HTML interface hosted on GitHub Pages.
This will make the project fully installation‑free and accessible as an interactive demonstration.

Planned steps:
1. Re‑implement TreeNode and Outcome in JavaScript  
2. Recreate conditional probability logic  
3. Port traversal functions  
4. Build a lightweight HTML/JS interface  
5. Deploy via GitHub Pages  

## Version Control
To update the repository:



