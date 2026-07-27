using System.Collections.Generic;
using System.IO;
using Newtonsoft.Json;
using DecisionAnalysis.ViewModels;

namespace DecisionAnalysis.Services
{
    public static class TreeSerializer
    {
        private class SavedOutcome
        {
            [JsonProperty("name")]        public string Name        { get; set; }
            [JsonProperty("probability")] public double Probability { get; set; }
        }

        private class SavedNode
        {
            [JsonProperty("name")]               public string Name      { get; set; }
            [JsonProperty("node_type")]          public string NodeType  { get; set; }
            [JsonProperty("outcomes")]           public List<SavedOutcome> Outcomes { get; set; }
            [JsonProperty("conditional_tables")] public Dictionary<string, Dictionary<string, double>> ConditionalTables { get; set; }
        }

        private class SaveFile
        {
            [JsonProperty("nodes")]       public List<SavedNode>           Nodes      { get; set; }
            [JsonProperty("leaf_values")] public Dictionary<string, double> LeafValues { get; set; }
        }

        public static void Save(TreeViewModel vm, string path)
        {
            var nodes = new List<SavedNode>();
            foreach (var node in vm.Sequence)
            {
                var outcomes = new List<SavedOutcome>();
                foreach (var oc in node.Outcomes)
                    outcomes.Add(new SavedOutcome { Name = oc.Name, Probability = oc.Probability });

                var condTables = new Dictionary<string, Dictionary<string, double>>();
                foreach (var cr in node.ConditionalTable)
                    condTables[cr.Condition] = new Dictionary<string, double>(cr.Probs);

                nodes.Add(new SavedNode
                {
                    Name             = node.Name,
                    NodeType         = node.NodeType == NodeType.Decision ? "decision" : "chance",
                    Outcomes         = outcomes,
                    ConditionalTables = condTables
                });
            }

            var saveFile = new SaveFile
            {
                Nodes      = nodes,
                LeafValues = new Dictionary<string, double>(vm.LeafValues)
            };
            File.WriteAllText(path, JsonConvert.SerializeObject(saveFile, Formatting.Indented));
        }

        public static void Load(string path, TreeViewModel vm)
        {
            var json     = File.ReadAllText(path);
            var saveFile = JsonConvert.DeserializeObject<SaveFile>(json);
            if (saveFile == null) return;

            while (vm.Sequence.Count > 0)
                vm.RemoveNode(vm.Sequence[0]);
            vm.LeafValues.Clear();
            vm.ClearNodeEvValues();

            if (saveFile.Nodes != null)
            {
                foreach (var sn in saveFile.Nodes)
                {
                    var nodeType = sn.NodeType == "decision" ? NodeType.Decision : NodeType.Chance;
                    var node     = new TreeNode(sn.Name ?? string.Empty, nodeType);

                    if (sn.Outcomes != null)
                        foreach (var so in sn.Outcomes)
                            node.Outcomes.Add(new Outcome(so.Name ?? string.Empty, so.Probability));

                    if (sn.ConditionalTables != null)
                        foreach (var kv in sn.ConditionalTables)
                        {
                            var cr = new ConditionalRow(kv.Key);
                            foreach (var p in kv.Value) cr.Probs[p.Key] = p.Value;
                            node.ConditionalTable.Add(cr);
                        }

                    vm.AddNode(node);
                }
            }

            if (saveFile.LeafValues != null)
                foreach (var kv in saveFile.LeafValues)
                    vm.LeafValues[kv.Key] = kv.Value;

            vm.ForceNotify();
        }
    }
}
