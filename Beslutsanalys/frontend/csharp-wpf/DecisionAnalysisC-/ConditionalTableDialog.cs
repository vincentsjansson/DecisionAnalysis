using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using DecisionAnalysis.ViewModels;

namespace DecisionAnalysis
{
    internal class ConditionalTableDialog : Window
    {
        private class RowData
        {
            public string   Condition;
            public TextBox[] ProbBoxes;
            public Grid     Row;
        }

        private readonly TreeNode      _node;
        private readonly List<string>  _availableConditions;
        private readonly StackPanel    _rowsPanel;
        private readonly ComboBox      _condCombo;
        private readonly TextBlock     _warningBlock;
        private readonly List<RowData> _rows = new List<RowData>();
        private bool _updating;

        public ConditionalTableDialog(TreeNode node, List<string> availableConditions)
        {
            _node                = node;
            _availableConditions = availableConditions;

            Title  = "Conditional probabilities — " + node.Name;
            Width  = Math.Max(400, 200 + node.Outcomes.Count * 90);
            MaxHeight = 600;
            SizeToContent = SizeToContent.Height;
            WindowStartupLocation = WindowStartupLocation.CenterOwner;
            ResizeMode  = ResizeMode.NoResize;
            Background  = new SolidColorBrush(Color.FromRgb(0x1e, 0x1e, 0x2e));
            Foreground  = Brushes.White;
            FontFamily  = new FontFamily("Segoe UI");

            var root = new StackPanel { Margin = new Thickness(18) };

            // Column headers
            var header = MakeRowGrid();
            var hCond = MakeHeaderCell("Condition"); Grid.SetColumn(hCond, 0); header.Children.Add(hCond);
            for (int i = 0; i < node.Outcomes.Count; i++)
            {
                var hOc = MakeHeaderCell(node.Outcomes[i].Name);
                Grid.SetColumn(hOc, i + 1); header.Children.Add(hOc);
            }
            root.Children.Add(header);

            _rowsPanel = new StackPanel();
            root.Children.Add(_rowsPanel);

            // Populate existing rows
            foreach (var cr in node.ConditionalTable)
                AppendRow(cr.Condition, cr.Probs);

            // Always ensure a (default) row
            if (!_rows.Any(r => r.Condition == "(default)"))
            {
                var defProbs = new Dictionary<string, double>();
                double ep = node.Outcomes.Count > 0 ? 1.0 / node.Outcomes.Count : 0;
                foreach (var oc in node.Outcomes) defProbs[oc.Name] = ep;
                AppendRow("(default)", defProbs);
            }

            _warningBlock = new TextBlock
            {
                Text = "", Visibility = Visibility.Collapsed,
                Foreground = new SolidColorBrush(Color.FromRgb(0xff, 0x88, 0x44)),
                FontSize = 11, Margin = new Thickness(0, 6, 0, 0)
            };
            root.Children.Add(_warningBlock);

            // Add-condition row
            var addRow = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                Margin = new Thickness(0, 10, 0, 0)
            };
            _condCombo = new ComboBox
            {
                Width  = 190, Height = 28,
                Background      = new SolidColorBrush(Color.FromRgb(0x2a, 0x2a, 0x3e)),
                Foreground      = Brushes.White,
                BorderBrush     = new SolidColorBrush(Color.FromRgb(0x7c, 0x6a, 0xf7)),
                BorderThickness = new Thickness(1),
                FontSize = 12, Margin = new Thickness(0, 0, 8, 0)
            };
            RefreshCombo();

            var addBtn = new Button
            {
                Content         = "+ Add condition",
                Background      = new SolidColorBrush(Color.FromRgb(0x2a, 0x2a, 0x3e)),
                Foreground      = new SolidColorBrush(Color.FromRgb(0xa8, 0x98, 0xff)),
                BorderBrush     = new SolidColorBrush(Color.FromRgb(0x7c, 0x6a, 0xf7)),
                BorderThickness = new Thickness(1),
                Padding         = new Thickness(10, 5, 10, 5),
                FontSize = 12, Cursor = Cursors.Hand
            };
            addBtn.Click += (s, e) =>
            {
                if (!(_condCombo.SelectedItem is string cond)) return;
                var probs = new Dictionary<string, double>();
                double ep2 = node.Outcomes.Count > 0 ? 1.0 / node.Outcomes.Count : 0;
                foreach (var oc in node.Outcomes) probs[oc.Name] = ep2;
                AppendRow(cond, probs);
                RefreshCombo();
            };
            addRow.Children.Add(_condCombo);
            addRow.Children.Add(addBtn);
            root.Children.Add(addRow);

            var btnRow = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                HorizontalAlignment = HorizontalAlignment.Right,
                Margin = new Thickness(0, 14, 0, 0)
            };
            var cancelBtn = MakeActionButton("Cancel", false);
            cancelBtn.Click += (s, e) => Close();
            var saveBtn = MakeActionButton("Save", true);
            saveBtn.Margin = new Thickness(8, 0, 0, 0);
            saveBtn.Click  += (s, e) => SaveAndClose();
            btnRow.Children.Add(cancelBtn);
            btnRow.Children.Add(saveBtn);
            root.Children.Add(btnRow);

            Content = new ScrollViewer
            {
                Content = root,
                VerticalScrollBarVisibility = ScrollBarVisibility.Auto
            };
        }

        private void AppendRow(string condition, Dictionary<string, double> probs)
        {
            bool isDefault = condition == "(default)";
            var  rowGrid   = MakeRowGrid();

            var condLabel = new TextBlock
            {
                Text = condition,
                Foreground = isDefault
                    ? new SolidColorBrush(Color.FromArgb(0xaa, 0xff, 0xff, 0xff))
                    : Brushes.White,
                FontSize  = 12,
                FontStyle = isDefault ? FontStyles.Italic : FontStyles.Normal,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(2, 0, 8, 0)
            };
            Grid.SetColumn(condLabel, 0);
            rowGrid.Children.Add(condLabel);

            var boxes = new TextBox[_node.Outcomes.Count];
            for (int i = 0; i < _node.Outcomes.Count; i++)
            {
                string ocName = _node.Outcomes[i].Name;
                double p      = probs.ContainsKey(ocName) ? probs[ocName] : 0;
                var    box    = MakeBox(p.ToString("G4"));
                Grid.SetColumn(box, i + 1);
                rowGrid.Children.Add(box);
                boxes[i] = box;

                int      capI   = i;
                TextBox[] capBx = boxes;
                box.LostFocus += (s, ev) => Normalize(capI, capBx);
                box.KeyDown   += (s, ev) => { if (ev.Key == Key.Return) Normalize(capI, capBx); };
            }

            var removeTb = new TextBlock
            {
                Text = isDefault ? "" : "×",
                FontSize = 14,
                Cursor = isDefault ? Cursors.Arrow : Cursors.Hand,
                Foreground = new SolidColorBrush(
                    Color.FromArgb(isDefault ? (byte)0 : (byte)0x66, 0xff, 0x88, 0x88)),
                VerticalAlignment   = VerticalAlignment.Center,
                HorizontalAlignment = HorizontalAlignment.Center
            };
            if (!isDefault)
            {
                removeTb.MouseEnter += (s, ev) => removeTb.Foreground
                    = new SolidColorBrush(Color.FromArgb(0xff, 0xff, 0x88, 0x88));
                removeTb.MouseLeave += (s, ev) => removeTb.Foreground
                    = new SolidColorBrush(Color.FromArgb(0x66, 0xff, 0x88, 0x88));
            }
            Grid.SetColumn(removeTb, _node.Outcomes.Count + 1);
            rowGrid.Children.Add(removeTb);

            var data = new RowData { Condition = condition, ProbBoxes = boxes, Row = rowGrid };
            _rows.Add(data);
            _rowsPanel.Children.Add(rowGrid);

            if (!isDefault)
            {
                var capData = data;
                removeTb.MouseLeftButtonUp += (s, ev) =>
                {
                    _rows.Remove(capData);
                    _rowsPanel.Children.Remove(capData.Row);
                    RefreshCombo();
                };
            }
        }

        private void Normalize(int changedIdx, TextBox[] boxes)
        {
            if (_updating) return;
            if (!double.TryParse(boxes[changedIdx].Text, out double newVal)) return;
            newVal = Math.Max(0, Math.Min(1, newVal));
            _updating = true;

            int    n         = boxes.Length;
            double sumOthers = 0;
            for (int i = 0; i < n; i++)
                if (i != changedIdx && double.TryParse(boxes[i].Text, out double p)) sumOthers += p;

            double remaining = 1.0 - newVal;
            if (sumOthers > 1e-10)
            {
                double scale = remaining / sumOthers;
                for (int i = 0; i < n; i++)
                    if (i != changedIdx && double.TryParse(boxes[i].Text, out double p))
                        boxes[i].Text = (p * scale).ToString("G4");
            }
            else if (n > 1)
            {
                double even = remaining / (n - 1);
                for (int i = 0; i < n; i++)
                    if (i != changedIdx) boxes[i].Text = even.ToString("G4");
            }
            boxes[changedIdx].Text = newVal.ToString("G4");

            double sum = 0;
            foreach (var b in boxes) if (double.TryParse(b.Text, out double v)) sum += v;
            bool ok = Math.Abs(sum - 1.0) < 1e-5;
            _warningBlock.Text       = ok ? "" : string.Format("⚠ Row sums to {0:G4}", sum);
            _warningBlock.Visibility = ok ? Visibility.Collapsed : Visibility.Visible;

            _updating = false;
        }

        private void RefreshCombo()
        {
            var used = new HashSet<string>(_rows.Select(r => r.Condition));
            _condCombo.ItemsSource   = _availableConditions.Where(c => !used.Contains(c)).ToList();
            _condCombo.SelectedIndex = -1;
        }

        private void SaveAndClose()
        {
            foreach (var row in _rows)
            {
                double sum = 0;
                foreach (var b in row.ProbBoxes)
                    if (double.TryParse(b.Text, out double v)) sum += v;
                if (Math.Abs(sum - 1.0) > 0.01)
                {
                    MessageBox.Show(
                        string.Format("Row '{0}': probabilities sum to {1:G4}. Fix before saving.",
                            row.Condition, sum),
                        "Invalid probabilities", MessageBoxButton.OK, MessageBoxImage.Warning);
                    return;
                }
            }

            _node.ConditionalTable.Clear();
            foreach (var row in _rows)
            {
                var cr = new ConditionalRow(row.Condition);
                for (int i = 0; i < _node.Outcomes.Count; i++)
                {
                    if (double.TryParse(row.ProbBoxes[i].Text, out double p))
                        cr.Probs[_node.Outcomes[i].Name] = p;
                }
                _node.ConditionalTable.Add(cr);
            }
            DialogResult = true;
        }

        private Grid MakeRowGrid()
        {
            var g = new Grid { Margin = new Thickness(0, 2, 0, 0) };
            g.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(160) });
            for (int i = 0; i < _node.Outcomes.Count; i++)
                g.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(80) });
            g.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(28) });
            return g;
        }

        private TextBlock MakeHeaderCell(string text) => new TextBlock
        {
            Text = text, FontSize = 11,
            Foreground = new SolidColorBrush(Color.FromArgb(0x99, 0xff, 0xff, 0xff)),
            Margin = new Thickness(2, 0, 2, 6)
        };

        private TextBox MakeBox(string text) => new TextBox
        {
            Text            = text,
            Background      = new SolidColorBrush(Color.FromRgb(0x2a, 0x2a, 0x3e)),
            Foreground      = Brushes.White, CaretBrush = Brushes.White,
            BorderBrush     = new SolidColorBrush(Color.FromRgb(0x7c, 0x6a, 0xf7)),
            BorderThickness = new Thickness(1),
            Padding         = new Thickness(5, 3, 5, 3),
            FontSize        = 12, Margin = new Thickness(2, 0, 2, 0),
            FontFamily      = new FontFamily("Segoe UI")
        };

        private Button MakeActionButton(string label, bool primary) => new Button
        {
            Content         = label,
            Background      = primary
                ? new SolidColorBrush(Color.FromRgb(0x7c, 0x6a, 0xf7))
                : new SolidColorBrush(Color.FromRgb(0x2a, 0x2a, 0x3e)),
            Foreground      = Brushes.White,
            BorderBrush     = new SolidColorBrush(Color.FromRgb(0x7c, 0x6a, 0xf7)),
            BorderThickness = new Thickness(1),
            Padding         = new Thickness(16, 7, 16, 7),
            FontSize        = 13, Cursor = Cursors.Hand
        };
    }
}
