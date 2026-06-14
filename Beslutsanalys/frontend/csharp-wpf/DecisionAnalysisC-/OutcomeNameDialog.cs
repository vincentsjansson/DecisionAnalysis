using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;

namespace DecisionAnalysis
{
    internal class OutcomeNameDialog : Window
    {
        private readonly TextBox _tb;
        private readonly Button  _btn;
        public string OutcomeName => _tb.Text.Trim();

        public OutcomeNameDialog(string prompt = "Outcome name:", string title = "Add Outcome")
        {
            Title                 = title;
            Width                 = 320;
            SizeToContent         = SizeToContent.Height;
            WindowStartupLocation = WindowStartupLocation.CenterOwner;
            ResizeMode            = ResizeMode.NoResize;
            Background            = Brushes.White;
            FontFamily            = new FontFamily("Segoe UI");

            var root = new StackPanel { Margin = new Thickness(20) };

            root.Children.Add(new TextBlock
            {
                Text       = prompt,
                Foreground = new SolidColorBrush(Color.FromRgb(0x1a, 0x1a, 0x1a)),
                FontSize   = 13,
                Margin     = new Thickness(0, 0, 0, 8)
            });

            var tbBorder = new Border
            {
                BorderBrush     = new SolidColorBrush(Color.FromRgb(0x1a, 0x1a, 0x1a)),
                BorderThickness = new Thickness(1),
                CornerRadius    = new CornerRadius(6),
                Background      = Brushes.White
            };
            _tb = new TextBox
            {
                Background      = Brushes.Transparent,
                Foreground      = new SolidColorBrush(Color.FromRgb(0x1a, 0x1a, 0x1a)),
                CaretBrush      = new SolidColorBrush(Color.FromRgb(0x1a, 0x1a, 0x1a)),
                BorderThickness = new Thickness(0),
                Padding         = new Thickness(8, 6, 8, 6),
                FontFamily      = new FontFamily("Segoe UI"),
                FontSize        = 14
            };
            _tb.KeyDown += (s, e) => { if (e.Key == Key.Return && OutcomeName.Length > 0) DialogResult = true; };
            tbBorder.Child = _tb;
            root.Children.Add(tbBorder);

            _btn        = MakeOutlineButton("OK");
            _btn.Margin = new Thickness(0, 12, 0, 0);
            _btn.Click += (s, e) => { if (OutcomeName.Length > 0) DialogResult = true; };
            root.Children.Add(_btn);

            Content =  root;
            Loaded  += (s, e) => { _tb.Focus(); _tb.SelectAll(); };
        }

        public void SetInitialText(string text)
        {
            _tb.Text = text ?? string.Empty;
        }

        internal static Button MakeOutlineButton(string label)
        {
            var btn = new Button
            {
                Foreground = new SolidColorBrush(Color.FromRgb(0x1a, 0x1a, 0x1a)),
                FontFamily = new FontFamily("Segoe UI"),
                FontSize   = 13,
                Cursor     = Cursors.Hand
            };

            var border = new FrameworkElementFactory(typeof(Border));
            border.Name = "Bg";
            border.SetValue(Border.BackgroundProperty,       Brushes.White);
            border.SetValue(Border.BorderBrushProperty,      new SolidColorBrush(Color.FromRgb(0x1a, 0x1a, 0x1a)));
            border.SetValue(Border.BorderThicknessProperty,  new Thickness(1));
            border.SetValue(Border.CornerRadiusProperty,     new CornerRadius(6));
            border.SetValue(Border.PaddingProperty,          new Thickness(16, 8, 16, 8));

            var cp = new FrameworkElementFactory(typeof(ContentPresenter));
            cp.SetValue(ContentPresenter.HorizontalAlignmentProperty, HorizontalAlignment.Center);
            border.AppendChild(cp);

            var template = new ControlTemplate(typeof(Button)) { VisualTree = border };

            var hover = new Trigger { Property = Button.IsMouseOverProperty, Value = true };
            hover.Setters.Add(new Setter(Border.BackgroundProperty,
                new SolidColorBrush(Color.FromRgb(0x1a, 0x1a, 0x1a)), "Bg"));
            hover.Setters.Add(new Setter(Button.ForegroundProperty, Brushes.White));
            template.Triggers.Add(hover);

            btn.Template = template;
            btn.Content  = label;
            return btn;
        }
    }
}
