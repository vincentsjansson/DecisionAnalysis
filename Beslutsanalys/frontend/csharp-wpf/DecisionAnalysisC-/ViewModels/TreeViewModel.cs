using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;

namespace DecisionAnalysis.ViewModels
{
    public enum NodeType { Chance, Decision }

    public class Outcome
    {
        public string Name { get; set; }
        public double Probability { get; set; }
        public double Value { get; set; }
        public TreeNode Child { get; set; }

        public Outcome(string name, double probability = 0.0)
        {
            Name = name;
            Probability = probability;
        }
    }

    public class TreeNode
    {
        public string Name { get; set; }
        public NodeType NodeType { get; set; }
        public List<Outcome> Outcomes { get; } = new List<Outcome>();

        public TreeNode(string name, NodeType nodeType = NodeType.Chance)
        {
            Name = name;
            NodeType = nodeType;
        }
    }

    public class TreeViewModel
    {
        private readonly ObservableCollection<TreeNode> _sequence
            = new ObservableCollection<TreeNode>();

        public IList<TreeNode> Sequence => _sequence;
        public event EventHandler TreeChanged;

        public TreeViewModel()
        {
            _sequence.CollectionChanged += (s, e) => Notify();
        }

        // Returns a snapshot of the current sequence as a linked chain.
        // Each node's outcome children point to the next node in sequence.
        public TreeNode GetRootNode()
        {
            if (_sequence.Count == 0) return null;
            RebuildLinks();
            return _sequence[0];
        }

        private void RebuildLinks()
        {
            for (int i = 0; i < _sequence.Count - 1; i++)
            {
                var next = _sequence[i + 1];
                if (_sequence[i].Outcomes.Count == 0)
                    _sequence[i].Outcomes.Add(new Outcome("→", 1.0));
                foreach (var oc in _sequence[i].Outcomes)
                    oc.Child = next;
            }
            // Last node is a leaf — clear any stale children
            if (_sequence.Count > 0)
                foreach (var oc in _sequence[_sequence.Count - 1].Outcomes)
                    oc.Child = null;
        }

        public void AddNode(TreeNode node) => _sequence.Add(node);

        public void MoveLeft(TreeNode node)
        {
            int i = _sequence.IndexOf(node);
            if (i > 0) _sequence.Move(i, i - 1);
        }

        public void MoveRight(TreeNode node)
        {
            int i = _sequence.IndexOf(node);
            if (i >= 0 && i < _sequence.Count - 1) _sequence.Move(i, i + 1);
        }

        public void AddOutcome(TreeNode node, string name)
        {
            node.Outcomes.Add(new Outcome(name));
            Notify();
        }

        public void AddOutcomeBalanced(TreeNode node, string name)
        {
            node.Outcomes.Add(new Outcome(name));
            double p = 1.0 / node.Outcomes.Count;
            foreach (var oc in node.Outcomes) oc.Probability = p;
            Notify();
        }

        public void ForceNotify() => Notify();

        public void SetNodeType(TreeNode node, NodeType type)
        {
            node.NodeType = type;
            Notify();
        }

        private void Notify() => TreeChanged?.Invoke(this, EventArgs.Empty);
    }
}
