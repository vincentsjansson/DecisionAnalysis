using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using DecisionAnalysis.ViewModels;

namespace DecisionAnalysis
{
    internal class EditOutcomesWindow : Window
    {
        private class OutcomeRowData
        {
            public TextBox NameBox;
            public TextBox ProbBox;
            public Grid    Row;
        }

        private readonly TreeNode             _node;
        private readonly StackPanel           _rowsPanel;
        private readonly TextBlock            _warningBlock;
        private readonly List<OutcomeRowData> _rows = new List<OutcomeRowData>();
        private bool _updating;

        public EditOutcomesWindow(TreeNode node)
        {
            _node  = node;
            Title  = "Edit outcomes — " + node.Name;
            Width  = 360;
            SizeToContent         = SizeToContent.Height;
            WindowStartupLocation = WindowStartupLocation.CenterOwner;
            ResizeMode            = ResizeMode.NoResize;
            Background            = Brushes.White;
            Foreground            = new SolidColorBrush(Color.FromRgb(0x1a, 0x1a, 0x1a));
            FontFamily            = new FontFamily("Segoe UI");

            var root = new StackPanel { Margin = new Thickness(18) };

            root.Children.Add(new TextBlock
            {
                Text       = "Outcomes for '" + node.Name + "':",
                Foreground = new SolidColorBrush(Color.FromRgb(0x1a, 0x1a, 0x1a)),
                FontSize   = 13,
                Margin     = new Thickness(0, 0, 0, 10)
            });

            var header = MakeGrid();
            AddHeaderCell(header, "Name", 0);
            AddHeaderCell(header, "Probability", 1);
            root.Children.Add(header);

            _rowsPanel = new StackPanel();
            root.Children.Add(_rowsPanel);

            foreach (var oc in node.Outcomes)
                AppendRow(oc.Name, oc.Probability);

            _warningBlock = new TextBlock
            {
                Text       = "",
                Visibility = Visibility.Collapsed,
                Foreground = new SolidColorBrush(Color.FromRgb(0xcc, 0x44, 0x00)),
                FontSize   = 11,
                Margin     = new Thickness(0, 8, 0, 0)
            };
            root.Children.Add(_warningBlock);

            var addRow = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                Margin      = new Thickness(0, 10, 0, 0)
            };
            var addBtn = OutcomeNameDialog.MakeOutlineButton("+ Add outcome");
            addBtn.Margin = new Thickness(0);
            addBtn.Click += (s, e) => AppendRow("", 0);
            addRow.Children.Add(addBtn);
            root.Children.Add(addRow);

            var btnRow = new StackPanel
            {
                Orientation         = Orientation.Horizontal,
                HorizontalAlignment = HorizontalAlignment.Right,
                Margin              = new Thickness(0, 14, 0, 0)
            };
            var cancelBtn = OutcomeNameDialog.MakeOutlineButton("Cancel");
            cancelBtn.Click += (s, e) => Close();
            var saveBtn = OutcomeNameDialog.MakeOutlineButton("Save");
            saveBtn.Margin = new Thickness(8, 0, 0, 0);
            saveBtn.Click += (s, e) => SaveAndClose();
            btnRow.Children.Add(cancelBtn);
            btnRow.Children.Add(saveBtn);
            root.Children.Add(btnRow);

            Content = root;
        }

        private void AppendRow(string name, double prob)
        {
            var nameBox = MakeBox(name);
            var probBox = MakeBox(prob.ToString("G4"));

            var row = MakeGrid();
            Grid.SetColumn(nameBox, 0);
            row.Children.Add(nameBox);
            Grid.SetColumn(probBox, 1);
            row.Children.Add(probBox);

            var removeTb = new TextBlock
            {
                Text                = "×",
                FontSize            = 14,
                Cursor              = Cursors.Hand,
                Foreground          = new SolidColorBrush(Color.FromRgb(0xbb, 0xbb, 0xbb)),
                VerticalAlignment   = VerticalAlignment.Center,
                HorizontalAlignment = HorizontalAlignment.Center,
                Margin              = new Thickness(2, 0, 2, 0)
            };
            removeTb.MouseEnter += (s, ev) =>
                removeTb.Foreground = new SolidColorBrush(Color.FromRgb(0xcc, 0x33, 0x33));
            removeTb.MouseLeave += (s, ev) =>
                removeTb.Foreground = new SolidColorBrush(Color.FromRgb(0xbb, 0xbb, 0xbb));
            Grid.SetColumn(removeTb, 2);
            row.Children.Add(removeTb);

            var data = new OutcomeRowData { NameBox = nameBox, ProbBox = probBox, Row = row };
            _rows.Add(data);
            _rowsPanel.Children.Add(row);

            var capData = data;
            removeTb.MouseLeftButtonUp += (s, ev) => RemoveRow(capData);

            probBox.LostFocus += (s, ev) => NormalizeOthers(capData, probBox.Text);
            probBox.KeyDown   += (s, ev) =>
            {
                if (ev.Key == Key.Return) NormalizeOthers(capData, probBox.Text);
            };
        }

        private void RemoveRow(OutcomeRowData data)
        {
            _rows.Remove(data);
            _rowsPanel.Children.Remove(data.Row);
        }

        private Grid MakeGrid()
        {
            var g = new Grid { Margin = new Thickness(0, 3, 0, 0) };
            g.ColumnDefinitions.Add(new ColumnDefinition
                { Width = new GridLength(1, GridUnitType.Star) });
            g.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(80) });
            g.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(28) });
            return g;
        }

        private void AddHeaderCell(Grid g, string text, int col)
        {
            var tb = new TextBlock
            {
                Text       = text,
                FontSize   = 11,
                Foreground = new SolidColorBrush(Color.FromRgb(0x88, 0x88, 0x88)),
                Margin     = new Thickness(2, 0, 2, 4)
            };
            Grid.SetColumn(tb, col);
            g.Children.Add(tb);
        }

        private TextBox MakeBox(string text) => new TextBox
        {
            Text            = text,
            Background      = Brushes.White,
            Foreground      = new SolidColorBrush(Color.FromRgb(0x1a, 0x1a, 0x1a)),
            CaretBrush      = new SolidColorBrush(Color.FromRgb(0x1a, 0x1a, 0x1a)),
            BorderBrush     = new SolidColorBrush(Color.FromRgb(0x1a, 0x1a, 0x1a)),
            BorderThickness = new Thickness(1),
            Padding         = new Thickness(5, 3, 5, 3),
            FontSize        = 12,
            Margin          = new Thickness(2, 0, 2, 0),
            FontFamily      = new FontFamily("Segoe UI")
        };

        private void NormalizeOthers(OutcomeRowData row, string rawText)
        {
            if (_updating) return;
            if (!_rows.Contains(row)) return;
            if (!double.TryParse(rawText, out double newVal)) return;
            newVal = Math.Max(0, Math.Min(1, newVal));

            _updating = true;

            int    n         = _rows.Count;
            double sumOthers = 0;
            for (int i = 0; i < n; i++)
            {
                if (_rows[i] == row) continue;
                if (double.TryParse(_rows[i].ProbBox.Text, out double p)) sumOthers += p;
            }

            double remaining = 1.0 - newVal;
            if (sumOthers > 1e-10)
            {
                double scale = remaining / sumOthers;
                for (int i = 0; i < n; i++)
                {
                    if (_rows[i] == row) continue;
                    if (double.TryParse(_rows[i].ProbBox.Text, out double p))
                        _rows[i].ProbBox.Text = (p * scale).ToString("G4");
                }
            }
            else if (n > 1)
            {
                double even = remaining / (n - 1);
                for (int i = 0; i < n; i++)
                    if (_rows[i] != row) _rows[i].ProbBox.Text = even.ToString("G4");
            }
            row.ProbBox.Text = newVal.ToString("G4");

            double sum = 0;
            foreach (var r in _rows)
                if (double.TryParse(r.ProbBox.Text, out double v)) sum += v;
            bool ok = Math.Abs(sum - 1.0) < 1e-5;
            _warningBlock.Text       = ok ? "" : string.Format("⚠ Sum = {0:G4}, expected 1.0", sum);
            _warningBlock.Visibility = ok ? Visibility.Collapsed : Visibility.Visible;

            _updating = false;
        }

        private void SaveAndClose()
        {
            double sum = 0;
            foreach (var r in _rows)
                if (double.TryParse(r.ProbBox.Text, out double v)) sum += v;

            if (_rows.Count > 0 && Math.Abs(sum - 1.0) > 0.01)
            {
                MessageBox.Show(
                    string.Format("Probabilities sum to {0:G4}. Fix them before saving.", sum),
                    "Invalid probabilities",
                    MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            _node.Outcomes.Clear();
            foreach (var r in _rows)
            {
                string name = r.NameBox.Text.Trim();
                if (name.Length == 0) name = "outcome";
                double.TryParse(r.ProbBox.Text, out double prob);
                _node.Outcomes.Add(new Outcome(name, prob));
            }
            DialogResult = true;
        }
    }
}
