using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Effects;
using System.Windows.Shapes;
using DecisionAnalysis.ViewModels;

namespace DecisionAnalysis
{
    public partial class MainWindow : Window
    {
        // ── Layout constants ─────────────────────────────────────────────────────
        const double NodeW      = 120;
        const double NodeH      = 44;
        const double ColSpacing = 210;
        const double StartX     = 80;
        const double VPad       = 48;
        const double EdgeFan    = 32.0;
        static readonly Color EdgeColor  = Color.FromRgb(0x7c, 0x6a, 0xf7);
        static readonly Color NodeBg     = Color.FromRgb(0x2a, 0x2a, 0x3e);
        static readonly Color NodeBorder = Color.FromRgb(0x7c, 0x6a, 0xf7);

        // ── State ────────────────────────────────────────────────────────────────
        private readonly TreeViewModel _vm = new TreeViewModel();
        private TreeNode _selectedSeqNode;
        private TreeNode _popupTargetNode;
        private bool     _loaded;
        private bool     _isFlipped;
        private double   _canvasW;

        private readonly Dictionary<string, FrameworkElement> _visualMap
            = new Dictionary<string, FrameworkElement>();
        private readonly List<UIElement> _edgeElements = new List<UIElement>();

        // ── Startup ──────────────────────────────────────────────────────────────
        public MainWindow()
        {
            InitializeComponent();
            _vm.TreeChanged += OnTreeChanged;

            var a = new TreeNode("A", NodeType.Chance);
            a.Outcomes.Add(new Outcome("a1", 0.5) { Value = 100 });
            a.Outcomes.Add(new Outcome("a2", 0.5) { Value = 50  });

            var b = new TreeNode("B", NodeType.Chance);
            b.Outcomes.Add(new Outcome("b1", 0.5) { Value = 200 });
            b.Outcomes.Add(new Outcome("b2", 0.5) { Value = 75  });

            var c = new TreeNode("C", NodeType.Chance);   // no outcomes → leaf triangle

            _vm.AddNode(a);
            _vm.AddNode(b);
            _vm.AddNode(c);
        }

        private void Window_Loaded(object sender, RoutedEventArgs e)
        {
            _loaded = true;
            RefreshAll();
        }

        private void TreeCanvas_SizeChanged(object sender, SizeChangedEventArgs e)
        {
            if (_loaded) RefreshAll();
        }

        private void OnTreeChanged(object sender, EventArgs e)
        {
            if (!_loaded) return;
            Dispatcher.BeginInvoke(new Action(RefreshAll),
                System.Windows.Threading.DispatcherPriority.Render);
        }

        private void RefreshAll()
        {
            BuildSequenceBar();
            RenderAll();
        }

        // ── Sequence bar ─────────────────────────────────────────────────────────
        private void BuildSequenceBar()
        {
            SequencePanel.Children.Clear();
            var seq = _vm.Sequence;

            for (int i = 0; i < seq.Count; i++)
            {
                var  node = seq[i];
                bool sel  = node == _selectedSeqNode;

                if (sel && i > 0)
                    SequencePanel.Children.Add(MakeArrowButton("←", node, -1));

                var pill = new Border
                {
                    Style = (Style)Resources[sel ? "PillSelected" : "Pill"],
                    Child = new TextBlock
                    {
                        Text = node.Name, Foreground = Brushes.White,
                        FontSize = 14, FontWeight = FontWeights.Medium,
                        VerticalAlignment = VerticalAlignment.Center
                    }
                };
                var cap = node;
                pill.MouseLeftButtonUp += (s, ev) =>
                {
                    _selectedSeqNode = _selectedSeqNode == cap ? null : cap;
                    BuildSequenceBar();
                };
                SequencePanel.Children.Add(pill);

                if (sel && i < seq.Count - 1)
                    SequencePanel.Children.Add(MakeArrowButton("→", node, +1));

                if (i < seq.Count - 1)
                    SequencePanel.Children.Add(new TextBlock
                    {
                        Text = "—", Foreground = new SolidColorBrush(EdgeColor),
                        FontSize = 16, VerticalAlignment = VerticalAlignment.Center,
                        Margin = new Thickness(6, 0, 6, 0), IsHitTestVisible = false
                    });
            }

            var flip = new Button
            {
                Content = "⇄ Flip",
                Background      = new SolidColorBrush(Color.FromRgb(0x2a, 0x2a, 0x3e)),
                Foreground      = new SolidColorBrush(Color.FromRgb(0xa8, 0x98, 0xff)),
                BorderBrush     = new SolidColorBrush(Color.FromRgb(0x7c, 0x6a, 0xf7)),
                BorderThickness = new Thickness(1),
                Padding         = new Thickness(12, 5, 12, 5),
                FontSize        = 13, Cursor = Cursors.Hand,
                Margin          = new Thickness(20, 0, 0, 0),
                VerticalAlignment = VerticalAlignment.Center
            };
            flip.Click += FlipTree_Click;
            SequencePanel.Children.Add(flip);
        }

        private Button MakeArrowButton(string arrow, TreeNode node, int dir)
        {
            var btn = new Button
            {
                Content = arrow, Background = Brushes.Transparent,
                Foreground = new SolidColorBrush(Color.FromRgb(0xa8, 0x98, 0xff)),
                BorderThickness = new Thickness(0), FontSize = 17,
                Padding = new Thickness(6, 0, 6, 2),
                Cursor = Cursors.Hand, VerticalAlignment = VerticalAlignment.Center
            };
            btn.Click += (s, e) =>
            {
                if (dir < 0) _vm.MoveLeft(node); else _vm.MoveRight(node);
                BuildSequenceBar();
            };
            return btn;
        }

        private void FlipTree_Click(object sender, RoutedEventArgs e)
        {
            _isFlipped = !_isFlipped;
            RenderAll();
        }

        // ── Render tree ──────────────────────────────────────────────────────────

        private class RenderNode
        {
            public string   Key;
            public TreeNode Data;
            public bool     IsLeaf;
            public double   LeafValue;
            public Point    Position;
            public List<(Outcome OC, RenderNode Child)> Children
                = new List<(Outcome, RenderNode)>();
        }

        // Each outcome of a node spawns a fully independent sub-branch.
        // yStart/yEnd define the vertical slice allocated to this node's subtree.
        private RenderNode BuildRenderNode(int seqIdx, double yStart, double yEnd,
            string pathKey, Outcome incomingOC)
        {
            double x = _isFlipped
                ? (_canvasW - StartX - seqIdx * ColSpacing)
                : (StartX   + seqIdx * ColSpacing);

            var rn = new RenderNode
            {
                Key       = $"{seqIdx}_{pathKey}",
                Position  = new Point(x, (yStart + yEnd) / 2),
                LeafValue = incomingOC?.Value ?? 0
            };

            if (seqIdx >= _vm.Sequence.Count)
            {
                rn.IsLeaf = true;
                return rn;
            }

            rn.Data = _vm.Sequence[seqIdx];
            if (rn.Data.Outcomes.Count == 0)
            {
                rn.IsLeaf = true;
                return rn;
            }

            int    n = rn.Data.Outcomes.Count;
            double h = (yEnd - yStart) / n;
            for (int i = 0; i < n; i++)
            {
                var    oc    = rn.Data.Outcomes[i];
                double cy0   = yStart + i * h;
                string cKey  = pathKey.Length > 0 ? $"{pathKey}.{i}" : $"{i}";
                var    child = BuildRenderNode(seqIdx + 1, cy0, cy0 + h, cKey, oc);
                rn.Children.Add((oc, child));
            }
            return rn;
        }

        private void CollectNodes(RenderNode rn, List<RenderNode> list)
        {
            list.Add(rn);
            foreach (var (_, child) in rn.Children)
                CollectNodes(child, list);
        }

        private void RenderAll()
        {
            _canvasW = TreeCanvas.ActualWidth  > 0 ? TreeCanvas.ActualWidth  : 900;
            double canvasH = TreeCanvas.ActualHeight > 0 ? TreeCanvas.ActualHeight : 500;

            var root = BuildRenderNode(0, VPad, canvasH - VPad, "", null);
            var all  = new List<RenderNode>();
            CollectNodes(root, all);
            var newKeys = new HashSet<string>(all.Select(n => n.Key));

            var dur  = new Duration(TimeSpan.FromMilliseconds(300));
            var ease = new QuadraticEase { EasingMode = EasingMode.EaseInOut };

            // Remove visuals no longer in the tree
            foreach (var key in _visualMap.Keys.Except(newKeys).ToList())
            {
                TreeCanvas.Children.Remove(_visualMap[key]);
                _visualMap.Remove(key);
            }

            foreach (var rn in all)
            {
                bool existingIsLeaf = _visualMap.ContainsKey(rn.Key)
                    && _visualMap[rn.Key] is StackPanel;
                bool typeMatch = _visualMap.ContainsKey(rn.Key)
                    && (existingIsLeaf == rn.IsLeaf);

                double tLeft = rn.IsLeaf ? rn.Position.X         : rn.Position.X - NodeW / 2;
                double tTop  = rn.IsLeaf ? rn.Position.Y - 12    : rn.Position.Y - NodeH / 2;

                if (typeMatch)
                {
                    var el = _visualMap[rn.Key];
                    if (!rn.IsLeaf) ApplyNodeStyle(el as Border, rn.Data);
                    else            UpdateLeafVisual(el, rn);

                    double cLeft = Canvas.GetLeft(el);
                    double cTop  = Canvas.GetTop(el);
                    if (Math.Abs(cLeft - tLeft) > 0.5 || Math.Abs(cTop - tTop) > 0.5)
                    {
                        double dx = cLeft - tLeft;
                        double dy = cTop  - tTop;
                        Canvas.SetLeft(el, tLeft);
                        Canvas.SetTop(el,  tTop);
                        var xf = new TranslateTransform(dx, dy);
                        el.RenderTransform = xf;
                        xf.BeginAnimation(TranslateTransform.XProperty,
                            new DoubleAnimation(dx, 0, dur) { EasingFunction = ease });
                        xf.BeginAnimation(TranslateTransform.YProperty,
                            new DoubleAnimation(dy, 0, dur) { EasingFunction = ease });
                    }
                }
                else
                {
                    // Type mismatch (leaf ↔ node) or brand-new: replace
                    if (_visualMap.ContainsKey(rn.Key))
                    {
                        TreeCanvas.Children.Remove(_visualMap[rn.Key]);
                        _visualMap.Remove(rn.Key);
                    }
                    FrameworkElement el = rn.IsLeaf
                        ? (FrameworkElement)CreateLeafVisual(rn)
                        : CreateNodeVisual(rn);
                    Canvas.SetLeft(el, tLeft);
                    Canvas.SetTop(el,  tTop);
                    el.Opacity = 0;
                    TreeCanvas.Children.Add(el);
                    _visualMap[rn.Key] = el;
                    el.BeginAnimation(OpacityProperty,
                        new DoubleAnimation(0, 1, dur) { EasingFunction = ease });
                }
            }

            RedrawEdges(all);
        }

        private Border CreateNodeVisual(RenderNode rn)
        {
            var b = new Border
            {
                Width  = NodeW, Height = NodeH,
                Tag    = rn.Data, Cursor = Cursors.Hand,
                Effect = new DropShadowEffect
                {
                    Color = NodeBorder, BlurRadius = 10,
                    Opacity = 0.3, ShadowDepth = 0
                }
            };
            ApplyNodeStyle(b, rn.Data);
            b.MouseLeftButtonUp += OnNodeClicked;
            return b;
        }

        private StackPanel CreateLeafVisual(RenderNode rn)
        {
            var sp = new StackPanel { Orientation = Orientation.Horizontal };
            sp.Children.Add(new TextBlock
            {
                Text = _isFlipped ? "◁" : "▷",
                FontSize = 20, Foreground = new SolidColorBrush(EdgeColor),
                VerticalAlignment = VerticalAlignment.Center
            });
            sp.Children.Add(new TextBlock
            {
                Text = rn.LeafValue.ToString("G4"),
                Foreground = new SolidColorBrush(Color.FromArgb(0xcc, 0xe0, 0xe0, 0xff)),
                FontSize = 12, Margin = new Thickness(5, 0, 0, 0),
                VerticalAlignment = VerticalAlignment.Center
            });
            return sp;
        }

        private void UpdateLeafVisual(FrameworkElement el, RenderNode rn)
        {
            if (!(el is StackPanel sp) || sp.Children.Count < 2) return;
            if (sp.Children[0] is TextBlock arrow) arrow.Text = _isFlipped ? "◁" : "▷";
            if (sp.Children[1] is TextBlock val)   val.Text   = rn.LeafValue.ToString("G4");
        }

        private void ApplyNodeStyle(Border b, TreeNode node)
        {
            if (b == null || node == null) return;
            bool decision     = node.NodeType == NodeType.Decision;
            b.Background      = new SolidColorBrush(NodeBg);
            b.BorderBrush     = new SolidColorBrush(NodeBorder);
            b.BorderThickness = new Thickness(1.5);
            b.CornerRadius    = decision ? new CornerRadius(7) : new CornerRadius(22);
            b.Child = new TextBlock
            {
                Text = node.Name, Foreground = Brushes.White,
                FontSize = 14, FontWeight = FontWeights.SemiBold,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment   = VerticalAlignment.Center
            };
        }

        // ── Edges ────────────────────────────────────────────────────────────────
        private void RedrawEdges(List<RenderNode> all)
        {
            foreach (var el in _edgeElements) TreeCanvas.Children.Remove(el);
            _edgeElements.Clear();

            foreach (var rn in all.Where(n => !n.IsLeaf))
            {
                int total = rn.Children.Count;
                for (int i = 0; i < total; i++)
                {
                    var (oc, child) = rn.Children[i];

                    double spread = (total - 1) * EdgeFan;
                    double srcX   = _isFlipped ? rn.Position.X - NodeW / 2
                                               : rn.Position.X + NodeW / 2;
                    double srcY   = rn.Position.Y - spread / 2 + i * EdgeFan;

                    double dstX = child.IsLeaf
                        ? child.Position.X
                        : (_isFlipped ? child.Position.X + NodeW / 2
                                      : child.Position.X - NodeW / 2);
                    double dstY = child.Position.Y;

                    DrawBezier(srcX, srcY, dstX, dstY);
                    DrawEdgeLabel(oc.Name, oc.Probability, srcX, srcY, dstX, dstY);
                }
            }
        }

        private void DrawBezier(double x1, double y1, double x2, double y2)
        {
            double cp  = (x2 - x1) * 0.45;
            var    fig = new PathFigure { StartPoint = new Point(x1, y1) };
            fig.Segments.Add(new BezierSegment(
                new Point(x1 + cp, y1), new Point(x2 - cp, y2),
                new Point(x2, y2), isStroked: true));
            var geo = new PathGeometry();
            geo.Figures.Add(fig);
            var path = new Path
            {
                Data = geo, Stroke = new SolidColorBrush(EdgeColor),
                StrokeThickness = 1.8, Opacity = 0.8, IsHitTestVisible = false
            };
            Panel.SetZIndex(path, -1);
            TreeCanvas.Children.Add(path);
            _edgeElements.Add(path);
        }

        private void DrawEdgeLabel(string name, double prob,
            double x1, double y1, double x2, double y2)
        {
            var tb = new TextBlock
            {
                Text             = name + "\n" + prob.ToString("P0"),
                TextAlignment    = TextAlignment.Center,
                Foreground       = new SolidColorBrush(Color.FromArgb(0xbb, 0xcc, 0xcc, 0xff)),
                FontSize         = 10,
                IsHitTestVisible = false,
                LineHeight       = 13
            };
            Canvas.SetLeft(tb, (x1 + x2) / 2 - 18);
            Canvas.SetTop(tb,  (y1 + y2) / 2 - 20);
            TreeCanvas.Children.Add(tb);
            _edgeElements.Add(tb);
        }

        // ── Node popup ───────────────────────────────────────────────────────────
        private void OnNodeClicked(object sender, MouseButtonEventArgs e)
        {
            if (!(sender is Border b) || !(b.Tag is TreeNode node)) return;
            _popupTargetNode      = node;
            BtnToggleType.Content = node.NodeType == NodeType.Chance
                ? "⇄  Set as Decision" : "⇄  Set as Chance";
            NodePopup.IsOpen      = true;
            e.Handled             = true;
        }

        private void BtnAddOutcome_Click(object sender, RoutedEventArgs e)
        {
            NodePopup.IsOpen = false;
            if (_popupTargetNode == null) return;
            var dlg = new OutcomeNameDialog { Owner = this };
            if (dlg.ShowDialog() == true && dlg.OutcomeName.Length > 0)
                _vm.AddOutcomeBalanced(_popupTargetNode, dlg.OutcomeName);
        }

        private void BtnToggleType_Click(object sender, RoutedEventArgs e)
        {
            NodePopup.IsOpen = false;
            if (_popupTargetNode == null) return;
            _vm.SetNodeType(_popupTargetNode,
                _popupTargetNode.NodeType == NodeType.Chance
                    ? NodeType.Decision : NodeType.Chance);
        }

        private void BtnEditOutcomes_Click(object sender, RoutedEventArgs e)
        {
            NodePopup.IsOpen = false;
            if (_popupTargetNode == null) return;
            var win = new EditOutcomesWindow(_popupTargetNode) { Owner = this };
            if (win.ShowDialog() == true)
                _vm.ForceNotify();
        }
    }
}
