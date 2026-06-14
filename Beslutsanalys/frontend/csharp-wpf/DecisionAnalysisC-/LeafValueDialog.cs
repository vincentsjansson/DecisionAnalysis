using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;

namespace DecisionAnalysis
{
    internal class LeafValueDialog : Window
    {
        private readonly TextBox _valueBox;
        private readonly TextBox _probBox;
        private readonly string  _initialValue;
        private readonly string  _initialProb;

        public double? NewValue            { get; private set; }
        public double? NewJointProbability { get; private set; }

        public LeafValueDialog(string title, double currentValue, double currentJointProb)
        {
            Title                 = title;
            Width                 = 340;
            SizeToContent         = SizeToContent.Height;
            WindowStartupLocation = WindowStartupLocation.CenterOwner;
            ResizeMode            = ResizeMode.NoResize;
            Background            = Brushes.White;
            FontFamily            = new FontFamily("Segoe UI");

            _initialValue = currentValue.ToString("G4");
            _initialProb  = currentJointProb.ToString("G4");

            var root = new StackPanel { Margin = new Thickness(20) };

            root.Children.Add(MakeLabel("Value:"));
            _valueBox = MakeTextBox(_initialValue);
            root.Children.Add(WrapBorder(_valueBox));

            root.Children.Add(MakeLabel("Joint probability:"));
            _probBox = MakeTextBox(_initialProb);
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

            _valueBox.KeyDown += (s, e) => { if (e.Key == Key.Return) _probBox.Focus(); };
            _probBox.KeyDown  += (s, e) => { if (e.Key == Key.Return) OkClicked(s, e); };

            Content = root;
            Loaded += (s, e) => { _valueBox.Focus(); _valueBox.SelectAll(); };
        }

        private void OkClicked(object sender, RoutedEventArgs e)
        {
            string vText = _valueBox.Text.Trim();
            string pText = _probBox.Text.Trim();

            if (vText != _initialValue)
            {
                if (!double.TryParse(vText, System.Globalization.NumberStyles.Any,
                        System.Globalization.CultureInfo.CurrentCulture, out double v))
                {
                    MessageBox.Show("Value must be a number.", "Validation",
                        MessageBoxButton.OK, MessageBoxImage.Warning);
                    return;
                }
                NewValue = v;
            }

            if (pText != _initialProb)
            {
                if (!double.TryParse(pText, System.Globalization.NumberStyles.Any,
                        System.Globalization.CultureInfo.CurrentCulture, out double p)
                    || p < 0 || p > 1)
                {
                    MessageBox.Show("Joint probability must be a number between 0 and 1.", "Validation",
                        MessageBoxButton.OK, MessageBoxImage.Warning);
                    return;
                }
                NewJointProbability = p;
            }

            DialogResult = true;
        }

        private static TextBlock MakeLabel(string text) => new TextBlock
        {
            Text       = text,
            Foreground = new SolidColorBrush(Color.FromRgb(0x1a, 0x1a, 0x1a)),
            FontSize   = 13,
            Margin     = new Thickness(0, 8, 0, 4)
        };

        private static TextBox MakeTextBox(string initial) => new TextBox
        {
            Text            = initial,
            Background      = Brushes.Transparent,
            Foreground      = new SolidColorBrush(Color.FromRgb(0x1a, 0x1a, 0x1a)),
            CaretBrush      = new SolidColorBrush(Color.FromRgb(0x1a, 0x1a, 0x1a)),
            BorderThickness = new Thickness(0),
            Padding         = new Thickness(8, 6, 8, 6),
            FontFamily      = new FontFamily("Segoe UI"),
            FontSize        = 14
        };

        private static Border WrapBorder(TextBox tb) => new Border
        {
            BorderBrush     = new SolidColorBrush(Color.FromRgb(0x1a, 0x1a, 0x1a)),
            BorderThickness = new Thickness(1),
            CornerRadius    = new CornerRadius(6),
            Background      = Brushes.White,
            Child           = tb
        };
    }
}
