using System;
using System.Windows;
using DecisionAnalysis.Models;
using DecisionAnalysis.Services;

namespace DecisionAnalysis
{
    public partial class MainWindow : Window
    {
        private readonly ApiClient _api;

        public MainWindow()
        {
            InitializeComponent();
            _api = new ApiClient();
        }

        private async void Window_Loaded(object sender, RoutedEventArgs e)
        {
            var testRequest = new BackwardRequestDto
            {
                Tree = new TreeNodeDto
                {
                    Name = "Root",
                    ConditionalTables = new System.Collections.Generic.Dictionary<string, System.Collections.Generic.Dictionary<string, double>>(),
                    Outcomes = new System.Collections.Generic.List<OutcomeDto>
                    {
                        new OutcomeDto
                        {
                            Name = "A",
                            Probability = 0.5,
                            Child = new TreeNodeDto
                            {
                                Name = "B",
                                ConditionalTables = new System.Collections.Generic.Dictionary<string, System.Collections.Generic.Dictionary<string, double>>(),
                                Outcomes = new System.Collections.Generic.List<OutcomeDto>
                                {
                                    new OutcomeDto { Name = "X", Probability = 0.3 },
                                    new OutcomeDto { Name = "Y", Probability = 0.7 }
                                }
                            }
                        },
                        new OutcomeDto
                        {
                            Name = "C",
                            Probability = 0.5
                        }
                    }
                },
                Path = new System.Collections.Generic.List<string> { "A", "Y" },
                FinalProbability = 0.12
            };

            var result = await _api.RunBackwardAsync(testRequest);

            MessageBox.Show("ForwardCheck: " + result.ForwardCheck);
        }
    }
}
