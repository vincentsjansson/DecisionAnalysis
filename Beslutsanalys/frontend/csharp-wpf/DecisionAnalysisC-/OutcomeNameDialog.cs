using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;

namespace DecisionAnalysis
{
    internal class OutcomeNameDialog : Window
    {
        private readonly TextBox _tb;
        public string OutcomeName => _tb.Text.Trim();

        public OutcomeNameDialog()
        {
            Title = "Add Outcome";
            Width = 300;
            Height = 148;
            WindowStartupLocation = WindowStartupLocation.CenterOwner;
            ResizeMode = ResizeMode.NoResize;
            Background = new SolidColorBrush(Color.FromRgb(0x1e, 0x1e, 0x2e));

            var root = new StackPanel { Margin = new Thickness(18) };

            root.Children.Add(new TextBlock
            {
                Text = "Outcome name:",
                Foreground = Brushes.White,
                FontFamily = new FontFamily("Segoe UI"),
                FontSize = 13,
                Margin = new Thickness(0, 0, 0, 8)
            });

            _tb = new TextBox
            {
                Background = new SolidColorBrush(Color.FromRgb(0x2a, 0x2a, 0x3e)),
                Foreground = Brushes.White,
                CaretBrush = Brushes.White,
                BorderBrush = new SolidColorBrush(Color.FromRgb(0x7c, 0x6a, 0xf7)),
                BorderThickness = new Thickness(1),
                Padding = new Thickness(7, 5, 7, 5),
                FontFamily = new FontFamily("Segoe UI"),
                FontSize = 14
            };
            _tb.KeyDown += (s, e) => { if (e.Key == Key.Return && OutcomeName.Length > 0) DialogResult = true; };
            root.Children.Add(_tb);

            var btn = new Button
            {
                Content = "Add",
                Margin = new Thickness(0, 12, 0, 0),
                Background = new SolidColorBrush(Color.FromRgb(0x7c, 0x6a, 0xf7)),
                Foreground = Brushes.White,
                BorderThickness = new Thickness(0),
                Padding = new Thickness(0, 9, 0, 9),
                FontFamily = new FontFamily("Segoe UI"),
                FontSize = 13,
                Cursor = Cursors.Hand
            };
            btn.Click += (s, e) => { if (OutcomeName.Length > 0) DialogResult = true; };
            root.Children.Add(btn);

            Content = root;
            Loaded += (s, e) => _tb.Focus();
        }
    }
}
