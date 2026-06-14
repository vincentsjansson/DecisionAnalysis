using System.Collections.Generic;
using Newtonsoft.Json;

namespace DecisionAnalysis.Models
{
    public class OutcomeDto
    {
        [JsonProperty("name")]
        public string Name { get; set; }

        [JsonProperty("probability")]
        public double Probability { get; set; }

        [JsonProperty("value")]
        public double Value { get; set; }

        [JsonProperty("child")]
        public TreeNodeDto Child { get; set; }
    }

    public class TreeNodeDto
    {
        [JsonProperty("name")]
        public string Name { get; set; }

        [JsonProperty("node_type")]
        public string NodeType { get; set; }

        [JsonProperty("outcomes")]
        public List<OutcomeDto> Outcomes { get; set; }

        [JsonProperty("conditionaltables")]
        public Dictionary<string, Dictionary<string, double>> Conditional_Tables { get; set; }

        [JsonProperty("ev")]
        public double? Ev { get; set; }
    }

    public class BackwardRequestDto
    {
        [JsonProperty("tree")]
        public TreeNodeDto Tree { get; set; }

        [JsonProperty("path")]
        public List<string> Path { get; set; }

        [JsonProperty("final_probability")]
        public double FinalProbability { get; set; }
    }

    public class BackwardResponseDto
    {
        [JsonProperty("tree")]
        public TreeNodeDto Tree { get; set; }

        [JsonProperty("forward_check")]
        public double ForwardCheck { get; set; }
    }

    public class EVRequestDto
    {
        [JsonProperty("tree")]
        public TreeNodeDto Tree;
    }

    public class EVResponseDto
    {
        [JsonProperty("tree")]
        public TreeNodeDto Tree;

        [JsonProperty("root_ev")]
        public double RootEv;
    }

    public static class DtoConverter
    {
        public static TreeNodeDto ToDto(
            ViewModels.TreeNode node,
            Dictionary<string, double> leafValues = null,
            List<string> pathSoFar = null)
        {
            if (node == null) return null;
            var dto = new TreeNodeDto
            {
                Name     = node.Name,
                NodeType = node.NodeType == ViewModels.NodeType.Decision ? "decision" : "chance",
                Outcomes = new List<OutcomeDto>(),
                Conditional_Tables = new Dictionary<string, Dictionary<string, double>>()
            };
            foreach (var oc in node.Outcomes)
            {
                List<string> childPath = null;
                if (pathSoFar != null)
                {
                    childPath = new List<string>(pathSoFar);
                    childPath.Add(oc.Name);
                }
                double leafValue = oc.Value;
                if (oc.Child == null && leafValues != null && childPath != null)
                {
                    string key = string.Join(",", childPath);
                    if (leafValues.TryGetValue(key, out double lv)) leafValue = lv;
                }
                dto.Outcomes.Add(new OutcomeDto {
                    Name        = oc.Name,
                    Probability = oc.Probability,
                    Value       = leafValue,
                    Child       = ToDto(oc.Child, leafValues, childPath)
                });
            }
            foreach (var cr in node.ConditionalTable)
                dto.Conditional_Tables[cr.Condition] = new Dictionary<string, double>(cr.Probs);
            return dto;
        }

        public static ViewModels.TreeNode FromDto(TreeNodeDto dto)
        {
            if (dto == null) return null;
            var node = new ViewModels.TreeNode(dto.Name,
                dto.NodeType == "decision" ? ViewModels.NodeType.Decision : ViewModels.NodeType.Chance);
            if (dto.Outcomes != null)
                foreach (var oc in dto.Outcomes)
                    node.Outcomes.Add(new ViewModels.Outcome(oc.Name, oc.Probability) {
                        Value = oc.Value,
                        Child = FromDto(oc.Child)
                    });
            if (dto.Conditional_Tables != null)
                foreach (var kv in dto.Conditional_Tables)
                {
                    var cr = new ViewModels.ConditionalRow(kv.Key);
                    foreach (var p in kv.Value) cr.Probs[p.Key] = p.Value;
                    node.ConditionalTable.Add(cr);
                }
            return node;
        }
    }
}
