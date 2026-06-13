using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using DecisionAnalysis.ViewModels;

namespace DecisionAnalysis
{
    internal class EditOutcomesWindow : Window
    {
        private readonly TreeNode  _node;
        private readonly System.Collections.Generic.List<TextBox> _probBoxes
            = new System.Collections.Generic.List<TextBox>();
        private readonly System.Collections.Generic.List<TextBox> _valueBoxes
            = new System.Collections.Generic.List<TextBox>();
        private readonly TextBlock _warningBlock;
        private bool _updating;

        public EditOutcomesWindow(TreeNode node)
        {
            _node = node;
            Title  = "Edit outcomes — " + node.Name;
            Width  = 390;
            SizeToContent = SizeToContent.Height;
            WindowStartupLocation = WindowStartupLocation.CenterOwner;
            ResizeMode  = ResizeMode.NoResize;
            Background  = new SolidColorBrush(Color.FromRgb(0x1e, 0x1e, 0x2e));
            Foreground  = Brushes.White;
            FontFamily  = new FontFamily("Segoe UI");

            var root = new StackPanel { Margin = new Thickness(18) };

            root.Children.Add(new TextBlock
            {
                Text = "Outcomes for node '" + node.Name + "':",
                Foreground = Brushes.White, FontSize = 13,
                Margin = new Thickness(0, 0, 0, 12)
            });

            // Column headers
            var header = MakeRow();
            AddCell(header, "Name",  0, isHeader: true);
            AddCell(header, "Prob.", 1, isHeader: true);
            AddCell(header, "Value", 2, isHeader: true);
            root.Children.Add(header);

            for (int i = 0; i < node.Outcomes.Count; i++)
            {
                var oc  = node.Outcomes[i];
                var row = MakeRow();

                var nameLabel = new TextBlock
                {
                    Text = oc.Name, Foreground = Brushes.White, FontSize = 13,
                    VerticalAlignment = VerticalAlignment.Center,
                    Margin = new Thickness(2, 0, 8, 0)
                };
                Grid.SetColumn(nameLabel, 0);
                row.Children.Add(nameLabel);

                var probBox  = MakeBox(oc.Probability.ToString("G4"));
                var valueBox = MakeBox(oc.Value.ToString("G4"));
                Grid.SetColumn(probBox,  1);
                Grid.SetColumn(valueBox, 2);
                row.Children.Add(probBox);
                row.Children.Add(valueBox);
                _probBoxes.Add(probBox);
                _valueBoxes.Add(valueBox);

                int captured = i;
                probBox.LostFocus += (s, e) => NormalizeOthers(captured, probBox.Text);
                probBox.KeyDown   += (s, e) =>
                {
                    if (e.Key == Key.Return) NormalizeOthers(captured, probBox.Text);
                };

                root.Children.Add(row);
            }

            // Warning
            _warningBlock = new TextBlock
            {
                Text = "", Visibility = Visibility.Collapsed,
                Foreground = new SolidColorBrush(Color.FromRgb(0xff, 0x88, 0x44)),
                FontSize = 11, Margin = new Thickness(0, 8, 0, 0)
            };
            root.Children.Add(_warningBlock);

            // Buttons
            var btnRow = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                HorizontalAlignment = HorizontalAlignment.Right,
                Margin = new Thickness(0, 16, 0, 0)
            };
            var cancelBtn = ActionButton("Cancel", false);
            cancelBtn.Click += (s, e) => Close();

            var saveBtn = ActionButton("Save", true);
            saveBtn.Margin = new Thickness(8, 0, 0, 0);
            saveBtn.Click += (s, e) => SaveAndClose();

            btnRow.Children.Add(cancelBtn);
            btnRow.Children.Add(saveBtn);
            root.Children.Add(btnRow);

            Content = root;
        }

        private Grid MakeRow()
        {
            var g = new Grid { Margin = new Thickness(0, 3, 0, 0) };
            g.ColumnDefinitions.Add(new ColumnDefinition
                { Width = new GridLength(1, GridUnitType.Star) });
            g.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(90) });
            g.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(90) });
            return g;
        }

        private void AddCell(Grid g, string text, int col, bool isHeader)
        {
            var tb = new TextBlock
            {
                Text = text, FontSize = 11,
                Foreground = isHeader
                    ? new SolidColorBrush(Color.FromArgb(0x99, 0xff, 0xff, 0xff))
                    : Brushes.White,
                Margin = new Thickness(2, 0, 2, 0)
            };
            Grid.SetColumn(tb, col);
            g.Children.Add(tb);
        }

        private TextBox MakeBox(string text) => new TextBox
        {
            Text = text,
            Background      = new SolidColorBrush(Color.FromRgb(0x2a, 0x2a, 0x3e)),
            Foreground      = Brushes.White,
            CaretBrush      = Brushes.White,
            BorderBrush     = new SolidColorBrush(Color.FromRgb(0x7c, 0x6a, 0xf7)),
            BorderThickness = new Thickness(1),
            Padding         = new Thickness(5, 3, 5, 3),
            FontSize        = 12,
            Margin          = new Thickness(2, 0, 2, 0),
            FontFamily      = new FontFamily("Segoe UI")
        };

        private Button ActionButton(string label, bool primary) => new Button
        {
            Content = label,
            Background = primary
                ? new SolidColorBrush(Color.FromRgb(0x7c, 0x6a, 0xf7))
                : new SolidColorBrush(Color.FromRgb(0x2a, 0x2a, 0x3e)),
            Foreground      = Brushes.White,
            BorderBrush     = new SolidColorBrush(Color.FromRgb(0x7c, 0x6a, 0xf7)),
            BorderThickness = new Thickness(1),
            Padding         = new Thickness(16, 7, 16, 7),
            FontSize        = 13, Cursor = Cursors.Hand
        };

        // When probability of index `idx` is changed to `rawText`, rescale others.
        private void NormalizeOthers(int idx, string rawText)
        {
            if (_updating) return;
            if (!double.TryParse(rawText, out double newVal)) return;
            newVal = Math.Max(0, Math.Min(1, newVal));

            _updating = true;

            int    n        = _probBoxes.Count;
            double sumOthers = 0;
            for (int i = 0; i < n; i++)
            {
                if (i == idx) continue;
                if (double.TryParse(_probBoxes[i].Text, out double p)) sumOthers += p;
            }

            double remaining = 1.0 - newVal;
            if (sumOthers > 1e-10)
            {
                double scale = remaining / sumOthers;
                for (int i = 0; i < n; i++)
                {
                    if (i == idx) continue;
                    if (double.TryParse(_probBoxes[i].Text, out double p))
                        _probBoxes[i].Text = (p * scale).ToString("G4");
                }
            }
            else if (n > 1)
            {
                double even = remaining / (n - 1);
                for (int i = 0; i < n; i++)
                    if (i != idx) _probBoxes[i].Text = even.ToString("G4");
            }
            _probBoxes[idx].Text = newVal.ToString("G4");

            double sum = 0;
            foreach (var tb in _probBoxes)
                if (double.TryParse(tb.Text, out double v)) sum += v;
            bool ok = Math.Abs(sum - 1.0) < 1e-5;
            _warningBlock.Text       = ok ? "" : string.Format("⚠ Sum = {0:G4}, expected 1.0", sum);
            _warningBlock.Visibility = ok ? Visibility.Collapsed : Visibility.Visible;

            _updating = false;
        }

        private void SaveAndClose()
        {
            double sum = 0;
            foreach (var tb in _probBoxes)
                if (double.TryParse(tb.Text, out double v)) sum += v;

            if (Math.Abs(sum - 1.0) > 0.01)
            {
                MessageBox.Show(
                    string.Format("Probabilities sum to {0:G4}. Fix them before saving.", sum),
                    "Invalid probabilities",
                    MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            for (int i = 0; i < _node.Outcomes.Count; i++)
            {
                if (double.TryParse(_probBoxes[i].Text,  out double p)) _node.Outcomes[i].Probability = p;
                if (double.TryParse(_valueBoxes[i].Text, out double v)) _node.Outcomes[i].Value       = v;
            }
            DialogResult = true;
        }
    }
}
