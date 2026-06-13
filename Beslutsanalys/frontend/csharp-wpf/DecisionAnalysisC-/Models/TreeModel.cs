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

        [JsonProperty("child")]
        public TreeNodeDto Child { get; set; }
    }

    public class TreeNodeDto
    {
        [JsonProperty("name")]
        public string Name { get; set; }

        [JsonProperty("outcomes")]
        public List<OutcomeDto> Outcomes { get; set; }

        [JsonProperty("conditionaltables")]
        public Dictionary<string, Dictionary<string, double>> Conditional_Tables { get; set; }
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
}
