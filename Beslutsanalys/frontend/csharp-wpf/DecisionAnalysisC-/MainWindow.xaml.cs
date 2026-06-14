using System;
using System.Collections.Generic;
using System.Collections.Specialized;
using System.Globalization;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Effects;
using System.Windows.Shapes;
using DecisionAnalysis.Models;
using DecisionAnalysis.Services;
using DecisionAnalysis.ViewModels;
using Microsoft.Win32;

namespace DecisionAnalysis
{
    public partial class MainWindow : Window
    {
        // ── Layout constants ────────────────────────────────────────────────────────
        const double StartX      = 60;
        const double ColGap      = 80;
        const double NodeH       = 44;
        const double VPad        = 48;
        const double EdgeFan     = 32.0;
        const double MinNodeW    = 80;
        const double LeafLabelW    = 150;   // estimated width of leaf label panel (flipped anchor)
        const double MinLeafSpacing = 80.0;  // minimum px between leaf Y centers
        static readonly Color EdgeColor  = Color.FromRgb(0x55, 0x55, 0x55);
        static readonly Color NodeBg     = Color.FromRgb(0x1a, 0x1a, 0x1a);
        static readonly Color NodeBorder = Color.FromRgb(0x1a, 0x1a, 0x1a);

        // ── Render context ──────────────────────────────────────────────────────────
        // All per-tree state lives here; methods take a ctx so both trees share logic.
        private class TreeCtx
        {
            public TreeViewModel                         Vm;
            public Canvas                                Canvas;
            public StackPanel                            SeqPanel;
            public Dictionary<string, FrameworkElement> VisualMap    = new Dictionary<string, FrameworkElement>();
            public List<UIElement>                       EdgeElements = new List<UIElement>();
            public bool                                  IsFlipped;
            public double                                CanvasW;
            public double[]                              ColumnXs     = new double[0];
            public TreeNode                              SelectedNode;
            // Zoom / pan
            public double             ZoomFactor    = 1.0;
            public double             PanX, PanY;
            public ScaleTransform     ScaleXf       = new ScaleTransform(1, 1);
            public TranslateTransform TransXf       = new TranslateTransform(0, 0);
            public bool               IsPanning;
            public Point              PanStart;
            public double             PanStartX, PanStartY;
            // Auto-fit
            public bool               AutoFitPending = true;
        }

        // ── Render node (inner) ─────────────────────────────────────────────────────
        private class RenderNode
        {
            public string       Key;
            public TreeNode     Data;
            public bool         IsLeaf;
            public double       JointProbability = 1.0;
            public Outcome      IncomingOC;
            public double       IncomingEdgeProb = -1; // effective prob for edge label; -1 = use IncomingOC.Probability
            public List<string> PathNames        = new List<string>(); // outcome names from root to here
            public Point        Position;
            public List<(Outcome OC, RenderNode Child)> Children
                = new List<(Outcome, RenderNode)>();
        }

        // ── Leaf tag ────────────────────────────────────────────────────────────────
        private sealed class LeafTag
        {
            public readonly RenderNode Rn;
            public readonly string     PathKey;
            public readonly TreeCtx    Ctx;
            public readonly double     JointProbability;
            public LeafTag(RenderNode rn, string pathKey, TreeCtx ctx, double jointProbability)
            { Rn = rn; PathKey = pathKey; Ctx = ctx; JointProbability = jointProbability; }
        }

        // ── State ──────────────────────────────────────────────────────────────────
        private readonly TreeCtx  _leftCtx  = new TreeCtx { IsFlipped = false };
        private readonly TreeCtx  _rightCtx = new TreeCtx { IsFlipped = true  };
        private readonly ApiClient _api      = new ApiClient();
        private bool           _isSplit;
        private List<TreeNode>              _preFlipSnapshot;    // deep copy of left VM before flip
        private Dictionary<string, double> _preFlipLeafValues;    // snapshot of left LeafValues before flip
        private Dictionary<string, double> _preFlipNodeEvValues;  // snapshot of left NodeEvValues before flip
        private TreeNode       _popupTargetNode;
        private TreeCtx        _popupCtx;
        private bool           _loaded;
        private double         _pxPerDip = 1.0;

        // ── Startup ────────────────────────────────────────────────────────────────
        public MainWindow()
        {
            InitializeComponent();

            _leftCtx.Vm  = new TreeViewModel();
            _rightCtx.Vm = new TreeViewModel();

            _leftCtx.Vm.TreeChanged  += (s, e) => OnVmChanged(_leftCtx);
            _rightCtx.Vm.TreeChanged += (s, e) => OnVmChanged(_rightCtx);

            // Auto-fit fires only on structural changes (add/remove/move), not on data edits
            (_leftCtx.Vm.Sequence  as INotifyCollectionChanged).CollectionChanged += (s, e) =>
                { _leftCtx.AutoFitPending  = true; _leftCtx.Vm.ClearNodeEvValues();  };
            (_rightCtx.Vm.Sequence as INotifyCollectionChanged).CollectionChanged += (s, e) =>
                { _rightCtx.AutoFitPending = true; _rightCtx.Vm.ClearNodeEvValues(); };

            var a = new TreeNode("A", NodeType.Chance);
            a.Outcomes.Add(new Outcome("a1", 0.5) { Value = 100 });
            a.Outcomes.Add(new Outcome("a2", 0.5) { Value = 50  });
            var b = new TreeNode("B", NodeType.Chance);
            b.Outcomes.Add(new Outcome("b1", 0.5) { Value = 200 });
            b.Outcomes.Add(new Outcome("b2", 0.5) { Value = 75  });
            var c = new TreeNode("C", NodeType.Chance);

            _leftCtx.Vm.AddNode(a);
            _leftCtx.Vm.AddNode(b);
            _leftCtx.Vm.AddNode(c);
        }

        private void Window_Loaded(object sender, RoutedEventArgs e)
        {
            _pxPerDip = VisualTreeHelper.GetDpi(this).PixelsPerDip;
            _leftCtx.Canvas    = TreeCanvas;
            _leftCtx.SeqPanel  = SequencePanel;
            _rightCtx.Canvas   = RightTreeCanvas;
            _rightCtx.SeqPanel = RightSequencePanel;
            SetupCanvasTransform(_leftCtx);
            SetupCanvasTransform(_rightCtx);
            _loaded = true;
            RefreshAll();
        }

        private void SetupCanvasTransform(TreeCtx ctx)
        {
            var tg = new TransformGroup();
            tg.Children.Add(ctx.ScaleXf);
            tg.Children.Add(ctx.TransXf);
            ctx.Canvas.RenderTransform = tg;

            ctx.Canvas.MouseWheel          += (s, e) => OnCanvasWheel(ctx, e);
            ctx.Canvas.MouseLeftButtonDown  += (s, e) => OnCanvasPressDown(ctx, e);
            ctx.Canvas.MouseMove            += (s, e) => OnCanvasPanMove(ctx, e);
            ctx.Canvas.MouseLeftButtonUp    += (s, e) => OnCanvasPanUp(ctx, e);
        }

        private void OnCanvasWheel(TreeCtx ctx, MouseWheelEventArgs e)
        {
            double factor  = e.Delta > 0 ? 1.1 : 1.0 / 1.1;
            double newZoom = Math.Max(0.2, Math.Min(3.0, ctx.ZoomFactor * factor));
            var    pos     = e.GetPosition(ctx.Canvas);
            ctx.PanX      += pos.X * (ctx.ZoomFactor - newZoom);
            ctx.PanY      += pos.Y * (ctx.ZoomFactor - newZoom);
            ctx.ZoomFactor = newZoom;
            ApplyTransform(ctx);
            e.Handled = true;
        }

        private void OnCanvasPressDown(TreeCtx ctx, MouseButtonEventArgs e)
        {
            if (ctx == _rightCtx && !_isSplit) return;
            if (e.ClickCount == 2 && e.OriginalSource == ctx.Canvas)
            {
                ResetZoom(ctx);
                return;
            }
            ctx.IsPanning = true;
            ctx.PanStart  = e.GetPosition(CanvasGrid);
            ctx.PanStartX = ctx.PanX;
            ctx.PanStartY = ctx.PanY;
        }

        private void OnCanvasPanMove(TreeCtx ctx, MouseEventArgs e)
        {
            if (!ctx.IsPanning) return;
            if (e.LeftButton != MouseButtonState.Pressed) { ctx.IsPanning = false; return; }
            var pos  = e.GetPosition(CanvasGrid);
            ctx.PanX = ctx.PanStartX + pos.X - ctx.PanStart.X;
            ctx.PanY = ctx.PanStartY + pos.Y - ctx.PanStart.Y;
            ApplyTransform(ctx);
        }

        private void OnCanvasPanUp(TreeCtx ctx, MouseButtonEventArgs e)
        {
            ctx.IsPanning = false;
        }

        private void ApplyTransform(TreeCtx ctx)
        {
            ctx.ScaleXf.ScaleX = ctx.ZoomFactor;
            ctx.ScaleXf.ScaleY = ctx.ZoomFactor;
            ctx.TransXf.X      = ctx.PanX;
            ctx.TransXf.Y      = ctx.PanY;
        }

        private void ResetZoom(TreeCtx ctx)
        {
            ctx.ZoomFactor = 1.0;
            ctx.PanX = ctx.PanY = 0.0;
            ApplyTransform(ctx);
        }

        private void TreeCanvas_SizeChanged(object sender, SizeChangedEventArgs e)
        {
            if (_loaded) RenderTree(_leftCtx);
        }

        private void RightTreeCanvas_SizeChanged(object sender, SizeChangedEventArgs e)
        {
            if (_loaded && _isSplit) RenderTree(_rightCtx);
        }

        private void OnVmChanged(TreeCtx ctx)
        {
            if (!_loaded) return;
            if (ctx == _rightCtx && !_isSplit) return;
            Dispatcher.BeginInvoke(new Action(() =>
            {
                BuildSequenceBar(ctx);
                RenderTree(ctx);
            }), System.Windows.Threading.DispatcherPriority.Render);
        }

        private void RefreshAll()
        {
            BuildSequenceBar(_leftCtx);
            RenderTree(_leftCtx);
            if (_isSplit)
            {
                BuildSequenceBar(_rightCtx);
                RenderTree(_rightCtx);
            }
        }

        // ── Sequence bar ───────────────────────────────────────────────────────────
        private void BuildSequenceBar(TreeCtx ctx)
        {
            ctx.SeqPanel.Children.Clear();
            var seq = ctx.Vm.Sequence;

            // For the flipped tree, iterate in reverse so pills appear in the same
            // left-to-right order as nodes appear in the tree canvas.
            bool rev   = ctx.IsFlipped;
            int  start = rev ? seq.Count - 1 : 0;
            int  end   = rev ? -1             : seq.Count;
            int  delta = rev ? -1             : +1;

            for (int i = start; i != end; i += delta)
            {
                var  node = seq[i];
                bool sel  = node == ctx.SelectedNode;

                // Left arrow moves this pill visually left.
                // Reversed: left in bar = higher seq index → MoveRight (+1); condition i < Count-1
                // Forward:  left in bar = lower  seq index → MoveLeft  (-1); condition i > 0
                if (sel && (rev ? i < seq.Count - 1 : i > 0))
                    ctx.SeqPanel.Children.Add(MakeArrowButton("←", ctx, node, rev ? +1 : -1));

                var inner = new StackPanel
                {
                    Orientation = Orientation.Horizontal,
                    VerticalAlignment = VerticalAlignment.Center
                };
                inner.Children.Add(new TextBlock
                {
                    Text = node.Name,
                    Foreground = sel
                        ? Brushes.White
                        : new SolidColorBrush(Color.FromRgb(0x1a, 0x1a, 0x1a)),
                    FontSize = 14, FontWeight = FontWeights.Medium,
                    VerticalAlignment = VerticalAlignment.Center
                });

                var capNode = node;
                var capCtx  = ctx;

                var pill = new Border
                {
                    Style = (Style)Resources[sel ? "PillSelected" : "Pill"],
                    Child = inner
                };
                pill.MouseLeftButtonUp += (s, ev) =>
                {
                    ev.Handled = true;
                    capCtx.SelectedNode = capCtx.SelectedNode == capNode ? null : capNode;
                    BuildSequenceBar(capCtx);
                    OpenNodePopup(capNode, capCtx);
                };
                ctx.SeqPanel.Children.Add(pill);

                // Right arrow moves this pill visually right.
                // Reversed: right in bar = lower  seq index → MoveLeft  (-1); condition i > 0
                // Forward:  right in bar = higher seq index → MoveRight (+1); condition i < Count-1
                if (sel && (rev ? i > 0 : i < seq.Count - 1))
                    ctx.SeqPanel.Children.Add(MakeArrowButton("→", ctx, node, rev ? -1 : +1));

                // Separator after every pill except the last one displayed.
                bool lastDisplayed = rev ? i == 0 : i == seq.Count - 1;
                if (!lastDisplayed)
                    ctx.SeqPanel.Children.Add(new TextBlock
                    {
                        Text = "—",
                        Foreground = new SolidColorBrush(Color.FromRgb(0xbb, 0xbb, 0xbb)),
                        FontSize = 16, VerticalAlignment = VerticalAlignment.Center,
                        Margin = new Thickness(6, 0, 6, 0), IsHitTestVisible = false
                    });
            }

            var addBtn = MakeBarButton("+", "Add node");
            var capCtx2 = ctx;
            addBtn.Click += (s, e) => AddNode_Click(capCtx2);
            ctx.SeqPanel.Children.Add(addBtn);

            if (ctx == _leftCtx)
            {
                var flipBtn = MakeBarButton(_isSplit ? "⇄ Merge" : "⇄ Flip", null);
                flipBtn.Click += FlipTree_Click;
                ctx.SeqPanel.Children.Add(flipBtn);
            }
        }

        private Button MakeBarButton(string content, string tooltip)
        {
            var btn = new Button
            {
                Content = content,
                Background      = Brushes.White,
                Foreground      = new SolidColorBrush(Color.FromRgb(0x1a, 0x1a, 0x1a)),
                BorderBrush     = new SolidColorBrush(Color.FromRgb(0x1a, 0x1a, 0x1a)),
                BorderThickness = new Thickness(1),
                Padding         = new Thickness(12, 5, 12, 5),
                FontSize        = 13, Cursor = Cursors.Hand,
                Margin          = new Thickness(8, 0, 0, 0),
                VerticalAlignment = VerticalAlignment.Center
            };
            if (tooltip != null) btn.ToolTip = tooltip;
            return btn;
        }

        private Button MakeArrowButton(string arrow, TreeCtx ctx, TreeNode node, int dir)
        {
            var btn = new Button
            {
                Content = arrow, Background = Brushes.Transparent,
                Foreground = new SolidColorBrush(Color.FromRgb(0x1a, 0x1a, 0x1a)),
                BorderThickness = new Thickness(0), FontSize = 17,
                Padding = new Thickness(6, 0, 6, 2),
                Cursor = Cursors.Hand, VerticalAlignment = VerticalAlignment.Center
            };
            btn.Click += (s, e) =>
            {
                if (dir < 0) ctx.Vm.MoveLeft(node); else ctx.Vm.MoveRight(node);
                BuildSequenceBar(ctx);
            };
            return btn;
        }

        private void AddNode_Click(TreeCtx ctx)
        {
            var dlg = new OutcomeNameDialog("Node name:", "Add Node") { Owner = this };
            if (dlg.ShowDialog() == true && dlg.OutcomeName.Length > 0)
                ctx.Vm.AddNode(new TreeNode(dlg.OutcomeName, NodeType.Chance));
        }

        private static TreeNode DeepCopyNode(TreeNode src)
        {
            var copy = new TreeNode(src.Name, src.NodeType);
            foreach (var oc in src.Outcomes)
                copy.Outcomes.Add(new Outcome(oc.Name, oc.Probability) { Value = oc.Value });
            foreach (var cr in src.ConditionalTable)
            {
                var crCopy = new ConditionalRow(cr.Condition);
                foreach (var kv in cr.Probs) crCopy.Probs[kv.Key] = kv.Value;
                copy.ConditionalTable.Add(crCopy);
            }
            return copy;
        }

        private void FlipTree_Click(object sender, RoutedEventArgs e)
        {
            _isSplit = !_isSplit;
            if (_isSplit)
            {
                SeqBarGrid.ColumnDefinitions[1].Width = new GridLength(1, GridUnitType.Star);
                CanvasGrid.ColumnDefinitions[1].Width = new GridLength(1, GridUnitType.Star);

                // Snapshot left VM so we can restore it exactly on merge
                _preFlipSnapshot     = _leftCtx.Vm.Sequence.Select(n => DeepCopyNode(n)).ToList();
                _preFlipLeafValues   = new Dictionary<string, double>(_leftCtx.Vm.LeafValues);
                _preFlipNodeEvValues = new Dictionary<string, double>(_leftCtx.Vm.NodeEvValues);

                // Populate right VM with deep copies of left sequence (reversed)
                while (_rightCtx.Vm.Sequence.Count > 0)
                    _rightCtx.Vm.RemoveNode(_rightCtx.Vm.Sequence[0]);
                _rightCtx.VisualMap.Clear();
                _rightCtx.SelectedNode = null;
                ResetZoom(_rightCtx);
                foreach (var node in _leftCtx.Vm.Sequence.Reverse().Select(n => DeepCopyNode(n)).ToList())
                    _rightCtx.Vm.AddNode(node);

                // Copy leaf values with reversed path keys (right sequence is reversed)
                _rightCtx.Vm.LeafValues.Clear();
                foreach (var kv in _leftCtx.Vm.LeafValues)
                {
                    var parts = kv.Key.Split(',');
                    System.Array.Reverse(parts);
                    _rightCtx.Vm.LeafValues[string.Join(",", parts)] = kv.Value;
                }

                // Copy node EV values as-is (right tree starts with no EV until Run EV is called)
                _rightCtx.Vm.NodeEvValues = new Dictionary<string, double>(_leftCtx.Vm.NodeEvValues);
            }
            else
            {
                SeqBarGrid.ColumnDefinitions[1].Width = new GridLength(0);
                CanvasGrid.ColumnDefinitions[1].Width = new GridLength(0);

                RightTreeCanvas.Children.Clear();
                _rightCtx.VisualMap.Clear();
                _rightCtx.EdgeElements.Clear();
                RightSequencePanel.Children.Clear();
                _rightCtx.SelectedNode = null;

                // Restore left VM to its pre-flip state
                if (_preFlipSnapshot != null)
                {
                    while (_leftCtx.Vm.Sequence.Count > 0)
                        _leftCtx.Vm.RemoveNode(_leftCtx.Vm.Sequence[0]);
                    foreach (var node in _preFlipSnapshot)
                        _leftCtx.Vm.AddNode(node);
                    _preFlipSnapshot = null;
                }
                _leftCtx.Vm.LeafValues = _preFlipLeafValues != null
                    ? new Dictionary<string, double>(_preFlipLeafValues)
                    : new Dictionary<string, double>();
                _preFlipLeafValues = null;
                _leftCtx.Vm.NodeEvValues = _preFlipNodeEvValues != null
                    ? new Dictionary<string, double>(_preFlipNodeEvValues)
                    : new Dictionary<string, double>();
                _preFlipNodeEvValues = null;
            }

            _leftCtx.VisualMap.Clear();
            RefreshAll();
        }

        // ── Dynamic node width ──────────────────────────────────────────────────────
        private double GetNodeWidth(string name)
        {
            var ft = new FormattedText(
                string.IsNullOrEmpty(name) ? " " : name,
                CultureInfo.CurrentCulture, FlowDirection.LeftToRight,
                new Typeface(new FontFamily("Segoe UI"), FontStyles.Normal,
                    FontWeights.SemiBold, FontStretches.Normal),
                14, Brushes.White, _pxPerDip);
            return Math.Max(MinNodeW, ft.Width + 36);
        }

        private double GetNodeWidth(TreeNode node) => GetNodeWidth(node.Name);

        private void ComputeColumnXs(TreeCtx ctx, double canvasW)
        {
            var seq = ctx.Vm.Sequence;
            ctx.ColumnXs = new double[seq.Count + 1];
            double x = StartX;
            for (int i = 0; i < seq.Count; i++)
            {
                double hw = GetNodeWidth(seq[i]) / 2;
                x += hw; ctx.ColumnXs[i] = x; x += hw + ColGap;
            }
            ctx.ColumnXs[seq.Count] = x + 20;
            if (ctx.IsFlipped)
                for (int i = 0; i <= seq.Count; i++)
                    ctx.ColumnXs[i] = canvasW - ctx.ColumnXs[i];
        }

        private static int CountLeaves(TreeCtx ctx)
        {
            int count = 1;
            foreach (var node in ctx.Vm.Sequence)
            {
                int oc = node.Outcomes.Count;
                if (oc == 0) break;
                count *= oc;
            }
            return Math.Max(1, count);
        }

        // ── Build render tree ──────────────────────────────────────────────────────
        private static double GetEffectiveProb(TreeNode node, Outcome outcome, List<string> pathConds)
        {
            if (node.ConditionalTable.Count == 0) return outcome.Probability;
            ConditionalRow defRow = null, matchRow = null;
            foreach (var row in node.ConditionalTable)
            {
                if (row.Condition == "(default)") { defRow = row; continue; }
                if (pathConds.Contains(row.Condition)) { matchRow = row; break; }
            }
            var use = matchRow ?? defRow;
            if (use != null && use.Probs.TryGetValue(outcome.Name, out double p)) return p;
            return outcome.Probability;
        }

        private RenderNode BuildRenderNode(TreeCtx ctx, int seqIdx,
            double yStart, double yEnd, string pathKey, Outcome incomingOC, double jointProb,
            List<string> pathConds, List<string> pathNames)
        {
            int    n = ctx.Vm.Sequence.Count;
            double x = seqIdx <= n ? ctx.ColumnXs[seqIdx] : ctx.ColumnXs[n];
            double y = (yStart + yEnd) / 2;

            var rn = new RenderNode
            {
                Key              = seqIdx + "_" + pathKey,
                Position         = new Point(x, y),
                JointProbability = jointProb,
                IncomingOC       = incomingOC,
                PathNames        = pathNames
            };

            if (seqIdx >= n) { rn.IsLeaf = true; return rn; }

            rn.Data = ctx.Vm.Sequence[seqIdx];

            if (rn.Data.Outcomes.Count == 0)
            {
                double hw    = GetNodeWidth(rn.Data) / 2;
                double leafX = ctx.IsFlipped
                    ? rn.Position.X - hw - ColGap / 2
                    : rn.Position.X + hw + ColGap / 2;
                rn.Children.Add((null, new RenderNode
                {
                    Key              = "nooc_" + rn.Key,
                    IsLeaf           = true,
                    PathNames        = new List<string>(pathNames),
                    Position         = new Point(leafX, y),
                    JointProbability = jointProb,
                    IncomingOC       = null
                }));
                return rn;
            }

            int    oc         = rn.Data.Outcomes.Count;
            bool   isDecision = rn.Data.NodeType == NodeType.Decision;
            double h          = (yEnd - yStart) / oc;
            for (int i = 0; i < oc; i++)
            {
                var    outcome    = rn.Data.Outcomes[i];
                double cy0        = yStart + i * h;
                string cKey       = pathKey.Length > 0 ? pathKey + "." + i : i.ToString();
                double effP       = GetEffectiveProb(rn.Data, outcome, pathConds);
                double childJoint = isDecision ? jointProb : jointProb * effP;
                var    childConds = new List<string>(pathConds);
                childConds.Add(rn.Data.Name + " = " + outcome.Name);
                var    childNames = new List<string>(pathNames);
                childNames.Add(outcome.Name);
                var    child      = BuildRenderNode(ctx, seqIdx + 1, cy0, cy0 + h, cKey,
                                                    outcome, childJoint, childConds, childNames);
                child.IncomingEdgeProb = effP;
                rn.Children.Add((outcome, child));
            }
            return rn;
        }

        private void CollectNodes(RenderNode rn, List<RenderNode> list)
        {
            list.Add(rn);
            foreach (var (_, child) in rn.Children) CollectNodes(child, list);
        }

        // ── Render ─────────────────────────────────────────────────────────────────
        private void RenderTree(TreeCtx ctx)
        {
            if (!_loaded || ctx.Canvas == null) return;
            ctx.Canvas.UpdateLayout();
            ctx.CanvasW = ctx.Canvas.ActualWidth  > 0 ? ctx.Canvas.ActualWidth  : 900;
            double canvasH = ctx.Canvas.ActualHeight > 0 ? ctx.Canvas.ActualHeight : 500;

            // Full clear — idempotent; calling twice produces identical canvas state.
            ctx.Canvas.Children.Clear();
            ctx.VisualMap.Clear();
            ctx.EdgeElements.Clear();

            if (ctx.Vm.Sequence.Count == 0) return;

            ComputeColumnXs(ctx, ctx.CanvasW);
            double ySpan = Math.Max(canvasH - 2 * VPad, CountLeaves(ctx) * MinLeafSpacing);
            var root = BuildRenderNode(ctx, 0, VPad, VPad + ySpan, "", null, 1.0, new List<string>(), new List<string>());
            var all  = new List<RenderNode>();
            CollectNodes(root, all);

            var dur  = new Duration(TimeSpan.FromMilliseconds(300));
            var ease = new QuadraticEase { EasingMode = EasingMode.EaseInOut };

            foreach (var rn in all)
            {
                double nodeW = rn.IsLeaf ? 0 : GetNodeWidth(rn.Data);
                double tLeft = rn.IsLeaf
                    ? (ctx.IsFlipped ? rn.Position.X - LeafLabelW : rn.Position.X)
                    : rn.Position.X - nodeW / 2;
                double tTop  = rn.IsLeaf ? rn.Position.Y - 24 : rn.Position.Y - NodeH / 2;

                FrameworkElement el = rn.IsLeaf
                    ? (FrameworkElement)CreateLeafVisual(ctx, rn)
                    : CreateNodeVisual(ctx, rn);
                Canvas.SetLeft(el, tLeft);
                Canvas.SetTop(el, tTop);
                el.Opacity = 0;
                ctx.Canvas.Children.Add(el);
                ctx.VisualMap[rn.Key] = el;
                el.BeginAnimation(OpacityProperty,
                    new DoubleAnimation(0, 1, dur) { EasingFunction = ease });
            }

            RedrawEdges(ctx, all);

            if (ctx.AutoFitPending)
            {
                ctx.AutoFitPending = false;
                AutoFit(ctx, all);
            }
        }

        private void AutoFit(TreeCtx ctx, List<RenderNode> all)
        {
            double minX = double.MaxValue, minY = double.MaxValue;
            double maxX = double.MinValue, maxY = double.MinValue;

            foreach (var rn in all)
            {
                double l, r, t, b;
                if (rn.IsLeaf)
                {
                    double lw = LeafLabelW + 20;
                    l = ctx.IsFlipped ? rn.Position.X - lw : rn.Position.X;
                    r = ctx.IsFlipped ? rn.Position.X      : rn.Position.X + lw;
                    t = rn.Position.Y - 24;
                    b = rn.Position.Y + 24;
                }
                else if (rn.Data != null)
                {
                    double hw = GetNodeWidth(rn.Data) / 2;
                    l = rn.Position.X - hw;
                    r = rn.Position.X + hw;
                    t = rn.Position.Y - NodeH / 2;
                    b = rn.Position.Y + NodeH / 2;
                }
                else continue;

                if (l < minX) minX = l;
                if (r > maxX) maxX = r;
                if (t < minY) minY = t;
                if (b > maxY) maxY = b;
            }

            if (maxX <= minX || maxY <= minY) return;

            double canvasH  = ctx.Canvas.ActualHeight > 0 ? ctx.Canvas.ActualHeight : 500;
            double treeW    = maxX - minX;
            double treeH    = maxY - minY;
            double newScale = Math.Max(0.2, Math.Min(3.0,
                Math.Min(ctx.CanvasW * 0.8 / treeW, canvasH * 0.8 / treeH)));
            ctx.ZoomFactor  = newScale;
            ctx.PanX        = ctx.CanvasW * 0.5 - (minX + maxX) * newScale * 0.5;
            ctx.PanY        = canvasH    * 0.5 - (minY + maxY) * newScale * 0.5;
            ApplyTransform(ctx);
        }

        private Border CreateNodeVisual(TreeCtx ctx, RenderNode rn)
        {
            var b = new Border
            {
                Width  = GetNodeWidth(rn.Data), Height = NodeH,
                Tag    = new object[] { rn.Data, ctx }, Cursor = Cursors.Hand,
                Effect = new DropShadowEffect
                    { Color = Colors.Black, BlurRadius = 6, Opacity = 0.12, ShadowDepth = 2 }
            };
            ApplyNodeStyle(b, rn.Data, string.Join(",", rn.PathNames), ctx);
            b.MouseLeftButtonUp += OnNodeClicked;
            return b;
        }

        private StackPanel CreateLeafVisual(TreeCtx ctx, RenderNode rn)
        {
            string leafKey = string.Join(",", rn.PathNames);
            double value   = rn.IncomingOC != null ? ctx.Vm.GetLeafValue(leafKey) : 0.0;
            double jp      = rn.JointProbability;
            double ev      = value * jp;
            string pathStr = "[" + string.Join(", ", rn.PathNames) + "]";

            var outer = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                Tag = new LeafTag(rn, leafKey, ctx, jp), Cursor = Cursors.Hand
            };

            var arrowTb = new TextBlock
            {
                Text = ctx.IsFlipped ? "◁" : "▷", FontSize = 20,
                Foreground = new SolidColorBrush(Color.FromRgb(0x1a, 0x1a, 0x1a)),
                VerticalAlignment = VerticalAlignment.Center
            };
            var info = new StackPanel
            {
                Orientation = Orientation.Vertical,
                Margin = new Thickness(5, 0, 0, 0), VerticalAlignment = VerticalAlignment.Center
            };
            info.Children.Add(new TextBlock   // [0] path
            {
                Text = pathStr,
                Foreground = new SolidColorBrush(Color.FromRgb(0x99, 0x99, 0x99)),
                FontSize = 9
            });
            info.Children.Add(new TextBlock   // [1] value
            {
                Text = value.ToString("G4"),
                Foreground = new SolidColorBrush(Color.FromRgb(0x1a, 0x1a, 0x1a)),
                FontSize = 12, FontWeight = FontWeights.SemiBold
            });
            info.Children.Add(new TextBlock   // [2] p=
            {
                Text = "p=" + jp.ToString("G3"),
                Foreground = new SolidColorBrush(Color.FromRgb(0x66, 0x66, 0x66)),
                FontSize = 10
            });
            info.Children.Add(new TextBlock   // [3] EV=
            {
                Text = "EV=" + ev.ToString("G4"),
                Foreground = new SolidColorBrush(Color.FromRgb(0x66, 0x66, 0x66)),
                FontSize = 10
            });

            if (ctx.IsFlipped)
            {
                // [info | ◁] — labels sit to the left of the triangle
                outer.Children.Add(info);
                outer.Children.Add(arrowTb);
            }
            else
            {
                // [▷ | info] — labels sit to the right of the triangle
                outer.Children.Add(arrowTb);
                outer.Children.Add(info);
            }

            outer.MouseLeftButtonUp += OnLeafClicked;
            return outer;
        }

        private void UpdateLeafVisual(TreeCtx ctx, FrameworkElement el, RenderNode rn)
        {
            if (!(el is StackPanel outer) || outer.Children.Count < 2) return;

            // Layout order: flipped = [info, ◁] (info first); unflipped = [▷, info] (arrow first)
            int arrowIdx = ctx.IsFlipped ? 1 : 0;
            int infoIdx  = ctx.IsFlipped ? 0 : 1;

            if (outer.Children[arrowIdx] is TextBlock arrow)
                arrow.Text = ctx.IsFlipped ? "◁" : "▷";

            string leafKey2 = string.Join(",", rn.PathNames);
            double value    = rn.IncomingOC != null ? ctx.Vm.GetLeafValue(leafKey2) : 0.0;
            double jp       = rn.JointProbability;
            double ev       = value * jp;
            string pathStr  = "[" + string.Join(", ", rn.PathNames) + "]";

            if (outer.Children[infoIdx] is StackPanel info && info.Children.Count >= 4)
            {
                if (info.Children[0] is TextBlock nt) nt.Text = pathStr;
                if (info.Children[1] is TextBlock vt) vt.Text = value.ToString("G4");
                if (info.Children[2] is TextBlock pt) pt.Text = "p=" + jp.ToString("G3");
                if (info.Children[3] is TextBlock et) et.Text = "EV=" + ev.ToString("G4");
            }
            outer.Tag = new LeafTag(rn, string.Join(",", rn.PathNames), ctx, rn.JointProbability);
        }

        private void ApplyNodeStyle(Border b, TreeNode node, string pathKey, TreeCtx ctx)
        {
            if (b == null || node == null) return;
            b.Background      = new SolidColorBrush(NodeBg);
            b.BorderBrush     = new SolidColorBrush(NodeBorder);
            b.BorderThickness = new Thickness(1.5);
            b.CornerRadius    = node.NodeType == NodeType.Decision
                ? new CornerRadius(3) : new CornerRadius(22);

            var ev = ctx.Vm.GetNodeEv(pathKey);
            if (ev.HasValue)
            {
                var sp = new StackPanel
                {
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment   = VerticalAlignment.Center
                };
                sp.Children.Add(new TextBlock
                {
                    Text = node.Name, Foreground = Brushes.White,
                    FontSize = 14, FontWeight = FontWeights.SemiBold,
                    HorizontalAlignment = HorizontalAlignment.Center
                });
                sp.Children.Add(new TextBlock
                {
                    Text = $"EV: {ev.Value:G4}",
                    Foreground = new SolidColorBrush(Color.FromRgb(0xaa, 0xaa, 0xaa)),
                    FontSize = 9, HorizontalAlignment = HorizontalAlignment.Center
                });
                b.Child = sp;
            }
            else
            {
                b.Child = new TextBlock
                {
                    Text = node.Name, Foreground = Brushes.White,
                    FontSize = 14, FontWeight = FontWeights.SemiBold,
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment   = VerticalAlignment.Center
                };
            }
        }

        private void MergeEv(TreeNodeDto source, TreeCtx ctx, List<string> pathSoFar)
        {
            if (source == null) return;
            string key = string.Join(",", pathSoFar);

            if (source.Ev.HasValue)
                ctx.Vm.SetNodeEv(key, source.Ev.Value);

            if (source.Outcomes == null) return;

            // Update probabilities on the shared Outcome objects at this depth
            int depth = pathSoFar.Count;
            if (depth < ctx.Vm.Sequence.Count)
            {
                var node = ctx.Vm.Sequence[depth];
                foreach (var soc in source.Outcomes)
                {
                    var toc = node.Outcomes.FirstOrDefault(o => o.Name == soc.Name);
                    if (toc != null) toc.Probability = soc.Probability;
                }
            }

            foreach (var soc in source.Outcomes)
            {
                if (soc.Child != null)
                {
                    var nextPath = new List<string>(pathSoFar);
                    nextPath.Add(soc.Name);
                    MergeEv(soc.Child, ctx, nextPath);
                }
            }
        }

        private async Task RunEvAndRedrawAsync(TreeCtx ctx)
        {
            var root = ctx.Vm.GetRootNode();
            if (root == null) return;
            var dto = DtoConverter.ToDto(root, ctx.Vm.LeafValues, new List<string>());
            BtnRunEv.IsEnabled = false;
            BtnRunEv.Content   = "Computing…";
            try
            {
                var resp = await _api.RunEvAsync(new EVRequestDto { Tree = dto });
                ctx.Vm.ClearNodeEvValues();
                MergeEv(resp.Tree, ctx, new List<string>());
                ctx.Vm.ForceNotify();
            }
            catch (Exception ex)
            {
                MessageBox.Show("EV failed: " + ex.Message, "Error",
                    MessageBoxButton.OK, MessageBoxImage.Error);
            }
            finally
            {
                BtnRunEv.IsEnabled = true;
                BtnRunEv.Content   = "▶ Run EV";
            }
        }

        private void BtnRunEv_Click(object sender, RoutedEventArgs e)
        {
            _ = RunEvAndRedrawAsync(_leftCtx);
        }

        private void MergeProbabilities(TreeNodeDto source, TreeCtx ctx)
        {
            void Merge(TreeNodeDto src, int depth)
            {
                if (depth >= ctx.Vm.Sequence.Count) return;
                var node = ctx.Vm.Sequence[depth];
                if (src.Outcomes == null) return;
                foreach (var soc in src.Outcomes)
                {
                    var toc = node.Outcomes.FirstOrDefault(o => o.Name == soc.Name);
                    if (toc != null)
                        toc.Probability = soc.Probability;
                    if (soc.Child != null)
                        Merge(soc.Child, depth + 1);
                }
            }
            Merge(source, 0);
        }

        private async Task RunBackwardForLeaf(LeafTag tag, double jointProb, TreeCtx ctx)
        {
            var root = ctx.Vm.GetRootNode();
            if (root == null) return;
            var pathList = tag.PathKey.Split(',').Select(s => s.Trim()).ToList();
            var req = new BackwardRequestDto
            {
                Tree             = DtoConverter.ToDto(root, ctx.Vm.LeafValues, new List<string>()),
                Path             = pathList,
                FinalProbability = jointProb
            };
            try
            {
                var resp = await _api.RunBackwardAsync(req);
                System.Diagnostics.Debug.WriteLine(
                    "=== Raw backward response ===\n" +
                    Newtonsoft.Json.JsonConvert.SerializeObject(resp.Tree,
                        Newtonsoft.Json.Formatting.Indented));
                MergeProbabilities(resp.Tree, ctx);
                var sb = new System.Text.StringBuilder();
                sb.AppendLine("=== MergeProbabilities result ===");
                foreach (var node in ctx.Vm.Sequence)
                {
                    sb.AppendLine($"Node: {node.Name}");
                    foreach (var oc in node.Outcomes)
                        sb.AppendLine($"  {oc.Name}: {oc.Probability:G4}");
                }
                System.Diagnostics.Debug.WriteLine(sb.ToString());
            }
            catch (Exception ex)
            {
                MessageBox.Show("Backward fill failed: " + ex.Message, "Error",
                    MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

private void BtnSave_Click(object sender, RoutedEventArgs e)
        {
            var dlg = new SaveFileDialog { Filter = "Decision Tree (*.json)|*.json" };
            if (dlg.ShowDialog() == true)
            {
                try   { TreeSerializer.Save(_leftCtx.Vm, dlg.FileName); }
                catch (Exception ex)
                {
                    MessageBox.Show("Save failed: " + ex.Message, "Error",
                        MessageBoxButton.OK, MessageBoxImage.Error);
                }
            }
        }

        private void BtnLoad_Click(object sender, RoutedEventArgs e)
        {
            var dlg = new OpenFileDialog { Filter = "Decision Tree (*.json)|*.json" };
            if (dlg.ShowDialog() == true)
            {
                try
                {
                    TreeSerializer.Load(dlg.FileName, _leftCtx.Vm);
                    _leftCtx.Vm.ClearNodeEvValues();
                }
                catch (Exception ex)
                {
                    MessageBox.Show("Load failed: " + ex.Message, "Error",
                        MessageBoxButton.OK, MessageBoxImage.Error);
                }
            }
        }

        // ── Edges ──────────────────────────────────────────────────────────────────
        private void RedrawEdges(TreeCtx ctx, List<RenderNode> all)
        {
            foreach (var el in ctx.EdgeElements) ctx.Canvas.Children.Remove(el);
            ctx.EdgeElements.Clear();

            foreach (var rn in all.Where(n => !n.IsLeaf && n.Data != null && n.Children.Count > 0))
            {
                int    total      = rn.Children.Count;
                double hw         = GetNodeWidth(rn.Data) / 2;
                bool   isDecision = rn.Data.NodeType == NodeType.Decision;

                for (int i = 0; i < total; i++)
                {
                    var (oc, child) = rn.Children[i];
                    if (oc == null) continue;

                    double spread = (total - 1) * EdgeFan;
                    double srcX   = ctx.IsFlipped ? rn.Position.X - hw : rn.Position.X + hw;
                    double srcY   = rn.Position.Y - spread / 2 + i * EdgeFan;

                    double childHw = child.IsLeaf ? 0 : GetNodeWidth(child.Data) / 2;
                    double dstX    = child.IsLeaf
                        ? (ctx.IsFlipped ? child.Position.X + 20 : child.Position.X - 20)
                        : (ctx.IsFlipped ? child.Position.X + childHw : child.Position.X - childHw);
                    double dstY = child.Position.Y;

                    double edgeProb = child.IncomingEdgeProb >= 0
                        ? child.IncomingEdgeProb : oc.Probability;
                    DrawBezier(ctx, srcX, srcY, dstX, dstY);
                    DrawEdgeLabel(ctx, oc.Name, edgeProb, srcX, srcY, dstX, dstY, isDecision);
                }
            }
        }

        private void DrawBezier(TreeCtx ctx, double x1, double y1, double x2, double y2)
        {
            double cp  = (x2 - x1) * 0.45;
            var    fig = new PathFigure { StartPoint = new Point(x1, y1) };
            fig.Segments.Add(new BezierSegment(
                new Point(x1 + cp, y1), new Point(x2 - cp, y2),
                new Point(x2, y2), isStroked: true));
            var geo  = new PathGeometry(); geo.Figures.Add(fig);
            var path = new Path
            {
                Data = geo, Stroke = new SolidColorBrush(EdgeColor),
                StrokeThickness = 1.5, Opacity = 1.0, IsHitTestVisible = false
            };
            Panel.SetZIndex(path, -1);
            ctx.Canvas.Children.Add(path);
            ctx.EdgeElements.Add(path);
        }

        private void DrawEdgeLabel(TreeCtx ctx, string name, double prob,
            double x1, double y1, double x2, double y2, bool isDecision)
        {
            string text = isDecision ? name : name + "\n" + prob.ToString("P0");
            var tb = new TextBlock
            {
                Text = text, TextAlignment = TextAlignment.Center,
                Foreground = new SolidColorBrush(Color.FromRgb(0x88, 0x88, 0x88)),
                FontSize = 10, IsHitTestVisible = false
            };
            if (text.Contains("\n")) tb.LineHeight = 13;
            Canvas.SetLeft(tb, (x1 + x2) / 2 - 18);
            Canvas.SetTop(tb,  (y1 + y2) / 2 - 20);
            ctx.Canvas.Children.Add(tb);
            ctx.EdgeElements.Add(tb);
        }

        // ── Click handlers ──────────────────────────────────────────────────────────
        private async void OnLeafClicked(object sender, MouseButtonEventArgs e)
        {
            if (!(sender is StackPanel sp)) return;
            if (!(sp.Tag is LeafTag tag)) return;
            if (tag.Rn.IncomingOC == null) return;
            e.Handled = true;

            string title        = "[" + string.Join(", ", tag.Rn.PathNames) + "]";
            double currentValue = tag.Ctx.Vm.GetLeafValue(tag.PathKey);
            var dlg = new LeafValueDialog(title, currentValue, tag.JointProbability)
                { Owner = this };
            if (dlg.ShowDialog() != true) return;

            if (dlg.NewValue.HasValue)
                tag.Ctx.Vm.SetLeafValue(tag.PathKey, dlg.NewValue.Value);

            if (dlg.NewJointProbability.HasValue)
                await RunBackwardForLeaf(tag, dlg.NewJointProbability.Value, tag.Ctx);

            tag.Ctx.Vm.ForceNotify();
            RenderTree(tag.Ctx);
        }

        private void OpenNodePopup(TreeNode node, TreeCtx ctx)
        {
            _popupTargetNode      = node;
            _popupCtx             = ctx;
            BtnToggleType.Content = node.NodeType == NodeType.Chance
                ? "⇄  Set as Decision" : "⇄  Set as Chance";
            NodePopup.IsOpen      = true;
        }

        private void OnNodeClicked(object sender, MouseButtonEventArgs e)
        {
            if (!(sender is Border b)) return;
            if (!(b.Tag is object[] tag) || tag.Length < 2) return;
            if (!(tag[0] is TreeNode node) || !(tag[1] is TreeCtx ctx)) return;
            e.Handled = true;
            OpenNodePopup(node, ctx);
        }

        private void BtnEditName_Click(object sender, RoutedEventArgs e)
        {
            NodePopup.IsOpen = false;
            if (_popupTargetNode == null || _popupCtx == null) return;
            var dlg = new OutcomeNameDialog("Node name:", "Edit Name") { Owner = this };
            dlg.SetInitialText(_popupTargetNode.Name);
            if (dlg.ShowDialog() == true && dlg.OutcomeName.Length > 0)
                _popupCtx.Vm.RenameNode(_popupTargetNode, dlg.OutcomeName);
        }

        private void BtnToggleType_Click(object sender, RoutedEventArgs e)
        {
            NodePopup.IsOpen = false;
            if (_popupTargetNode == null || _popupCtx == null) return;
            _popupCtx.Vm.ClearNodeEvValues();
            _popupCtx.Vm.SetNodeType(_popupTargetNode,
                _popupTargetNode.NodeType == NodeType.Chance
                    ? NodeType.Decision : NodeType.Chance);
        }

        private void BtnEditOutcomes_Click(object sender, RoutedEventArgs e)
        {
            NodePopup.IsOpen = false;
            if (_popupTargetNode == null || _popupCtx == null) return;
            var win = new EditOutcomesWindow(_popupTargetNode) { Owner = this };
            if (win.ShowDialog() == true)
            {
                _popupCtx.Vm.ClearNodeEvValues();
                _popupCtx.Vm.ForceNotify();
            }
        }

        private void BtnEditConditionals_Click(object sender, RoutedEventArgs e)
        {
            NodePopup.IsOpen = false;
            if (_popupTargetNode == null || _popupCtx == null) return;

            var seq  = _popupCtx.Vm.Sequence;
            int idx  = -1;
            for (int i = 0; i < seq.Count; i++)
                if (seq[i] == _popupTargetNode) { idx = i; break; }

            var available = new List<string>();
            for (int i = 0; i < idx; i++)
                foreach (var oc in seq[i].Outcomes)
                    available.Add(seq[i].Name + " = " + oc.Name);

            var dlg = new ConditionalTableDialog(_popupTargetNode, available) { Owner = this };
            if (dlg.ShowDialog() == true)
                _popupCtx.Vm.ForceNotify();
        }

        private void BtnRemoveNode_Click(object sender, RoutedEventArgs e)
        {
            NodePopup.IsOpen = false;
            if (_popupTargetNode == null || _popupCtx == null) return;

            if (_popupTargetNode.ConditionalTable.Count > 0)
            {
                MessageBox.Show(
                    "Cannot remove — this node has conditional tables defined.\nClear the conditional table first.",
                    "Cannot remove", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            _popupCtx.Vm.RemoveNode(_popupTargetNode);
            if (_popupCtx.SelectedNode == _popupTargetNode) _popupCtx.SelectedNode = null;
            _popupTargetNode = null;
            _popupCtx        = null;
        }
    }
}
