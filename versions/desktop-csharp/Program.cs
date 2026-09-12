using System;
using System.Drawing;
using System.Windows.Forms;
using OpenTK;
using OpenTK.Graphics;
using OpenTK.Graphics.OpenGL;

namespace InerreStudio;

public class MainForm : Form {
    private GLControl glControl;

    public MainForm() {
        Text = "Inerre Studio — C# Edition";
        Size = new Size(1280, 780);
        BackColor = Color.FromArgb(13, 15, 16);
        StartPosition = FormStartPosition.CenterScreen;

        var split = new SplitContainer { Dock = DockStyle.Fill, Panel1MinSize = 200 };
        split.FixedPanel = FixedStyles.Panel1;
        split.SplitterDistance = 220;
        split.BackColor = Color.FromArgb(27, 30, 33);

        // Panneau gauche
        var side = new FlowLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(12), AutoScroll = true };
        side.BackColor = Color.FromArgb(27, 30, 33);

        side.Controls.Add(TitleLabel("PRIMITIVES"));
        foreach (var (name, _) in new[] { ("Cube", "#888"), ("Sphere", "#4da3ff"), ("Cylindre", "#888") })
            side.Controls.Add(MakeBtn(name));

        side.Controls.Add(TitleLabel("MEUBLES"));
        foreach (var (name, _) in new[] { ("Canapé", "#bb7d5a"), ("Table", "#c7a55a"), ("Lampe", "#ffe7a3") })
            side.Controls.Add(MakeBtn(name));

        split.Panel1.Controls.Add(side);

        // Viewport 3D
        glControl = new GLControl(new GraphicsMode(32, 24, 0, 4), 3, 3, GraphicsContextFlags.Default);
        glControl.Dock = DockStyle.Fill;
        glControl.Load += (_, _) => {
            GL.ClearColor(0.067f, 0.074f, 0.082f, 1f);
            GL.Enable(EnableCap.DepthTest);
        };
        glControl.Paint += (_, _) => {
            GL.Clear(ClearBufferMask.ColorBufferBit | ClearBufferMask.DepthBufferBit);
            glControl.SwapBuffers();
        };
        split.Panel2.Controls.Add(glControl);

        Controls.Add(split);
    }

    private Label TitleLabel(string text) {
        var l = new Label { Text = text, ForeColor = Color.FromArgb(138, 143, 148), Font = new Font("Segoe UI", 9, FontStyle.Bold), Padding = new Padding(0, 10, 0, 4), Width = 190 };
        return l;
    }

    private Button MakeBtn(string text) {
        var b = new Button { Text = text, Width = 85, Height = 28, FlatStyle = FlatStyle.Flat, BackColor = Color.FromArgb(34, 38, 42), ForeColor = Color.FromArgb(232, 230, 223), Font = new Font("Segoe UI", 10) };
        b.FlatAppearance.BorderColor = Color.FromArgb(44, 48, 53);
        return b;
    }
}

class Program {
    [STAThread]
    static void Main() {
        Application.EnableVisualStyles();
        Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);
        Application.Run(new MainForm());
    }
}
