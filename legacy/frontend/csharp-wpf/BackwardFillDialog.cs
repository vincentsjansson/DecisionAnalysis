using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;

namespace DecisionAnalysis
{
    internal class BackwardFillDialog : Window
    {
        private readonly TextBox _pathBox;
        private readonly TextBox _probBox;

        public string Path            => _pathBox.Text.Trim();
        public double FinalProbability { get; private set; }

        public BackwardFillDialog()
        {
            Title                 = "Backward Fill";
            Width                 = 340;
            SizeToContent         = SizeToContent.Height;
            WindowStartupLocation = WindowStartupLocation.CenterOwner;
            ResizeMode            = ResizeMode.NoResize;
            Background            = Brushes.White;
            FontFamily            = new FontFamily("Segoe UI");

            var root = new StackPanel { Margin = new Thickness(20) };

            root.Children.Add(MakeLabel("Path (comma-separated outcome names):"));
            _pathBox = MakeTextBox();
            _pathBox.ToolTip = "e.g. a1,b1,outcome";
            root.Children.Add(WrapBorder(_pathBox));

            root.Children.Add(MakeLabel("Joint probability:"));
            _probBox = MakeTextBox();
            _probBox.ToolTip = "e.g. 0.25";
            root.Children.Add(WrapBorder(_probBox));

            var btnRow = new StackPanel
            {
                Orientation         = Orientation.Horizontal,
                HorizontalAlignment = HorizontalAlignment.Right,
                Margin              = new Thickness(0, 14, 0, 0)
            };
            var cancelBtn = OutcomeNameDialog.MakeOutlineButton("Cancel");
            cancelBtn.Click += (s, e) => Close();
            var okBtn = OutcomeNameDialog.MakeOutlineButton("OK");
            okBtn.Margin = new Thickness(8, 0, 0, 0);
            okBtn.Click  += OkClicked;
            btnRow.Children.Add(cancelBtn);
            btnRow.Children.Add(okBtn);
            root.Children.Add(btnRow);

            _pathBox.KeyDown += (s, e) => { if (e.Key == Key.Return) _probBox.Focus(); };
            _probBox.KeyDown += (s, e) => { if (e.Key == Key.Return) OkClicked(s, e); };

            Content =  root;
            Loaded  += (s, e) => _pathBox.Focus();
        }

        private void OkClicked(object sender, RoutedEventArgs e)
        {
            if (Path.Length == 0)
            {
                MessageBox.Show("Enter a path.", "Validation", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }
            if (!double.TryParse(_probBox.Text.Trim(), out double prob) || prob < 0 || prob > 1)
            {
                MessageBox.Show("Enter a probability between 0 and 1.", "Validation",
                    MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }
            FinalProbability = prob;
            DialogResult = true;
        }

        private static TextBlock MakeLabel(string text) => new TextBlock
        {
            Text       = text,
            Foreground = new SolidColorBrush(Color.FromRgb(0x1a, 0x1a, 0x1a)),
            FontSize   = 13,
            Margin     = new Thickness(0, 8, 0, 4)
        };

        private static TextBox MakeTextBox() => new TextBox
        {
            Background      = Brushes.Transparent,
            Foreground      = new SolidColorBrush(Color.FromRgb(0x1a, 0x1a, 0x1a)),
            CaretBrush      = new SolidColorBrush(Color.FromRgb(0x1a, 0x1a, 0x1a)),
            BorderThickness = new Thickness(0),
            Padding         = new Thickness(8, 6, 8, 6),
            FontFamily      = new FontFamily("Segoe UI"),
            FontSize        = 14
        };

        private static Border WrapBorder(TextBox tb)
        {
            var b = new Border
            {
                BorderBrush     = new SolidColorBrush(Color.FromRgb(0x1a, 0x1a, 0x1a)),
                BorderThickness = new Thickness(1),
                CornerRadius    = new CornerRadius(6),
                Background      = Brushes.White,
                Child           = tb
            };
            return b;
        }
    }
}
