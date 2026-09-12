import 'package:flutter/material.dart';
import '../widgets/viewport_3d.dart';
import '../widgets/toolbar.dart';
import '../widgets/scene_tree.dart';
import '../widgets/command_panel.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _selectedTab = 0; // 0=scene, 1=IA
  int _cmdTab = 0; // 0=créer, 1=modifier, 2=matériau, 3=pipeline
  String _transformTool = "select";
  String _subObjLevel = "object";
  bool _quadView = false;
  bool _snapEnabled = false;
  double _snapSize = 0.5;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          // Top toolbar
          Toolbar(
            transformTool: _transformTool,
            snapEnabled: _snapEnabled,
            snapSize: _snapSize,
            quadView: _quadView,
            onTransformChanged: (t) => setState(() => _transformTool = t),
            onSnapToggled: () => setState(() => _snapEnabled = !_snapEnabled),
            onSnapSizeChanged: (s) => setState(() => _snapSize = s),
            onQuadToggled: () => setState(() => _quadView = !_quadView),
          ),
          // Workspace
          Expanded(
            child: Row(
              children: [
                // Left panel
                _buildLeftPanel(),
                // Center viewport
                Expanded(
                  child: Viewport3D(quadView: _quadView),
                ),
                // Right command panel
                CommandPanel(
                  selectedTab: _cmdTab,
                  onTabChanged: (t) => setState(() => _cmdTab = t),
                ),
              ],
            ),
          ),
          // Status bar
          _buildStatusBar(),
        ],
      ),
    );
  }

  Widget _buildLeftPanel() {
    return Container(
      width: 240,
      color: const Color(0xFF1a1c1e),
      child: Column(
        children: [
          Container(
            height: 32,
            decoration: const BoxDecoration(
              border: Border(bottom: BorderSide(color: Color(0xFF2c3035))),
            ),
            child: Row(
              children: [
                _tabBtn("Scène", 0),
                _tabBtn("IA", 1),
              ],
            ),
          ),
          Expanded(
            child: _selectedTab == 0
                ? const SceneTree()
                : const Center(child: Text("IA Prompter", style: TextStyle(color: Color(0xFF8a8f94), fontSize: 12))),
          ),
          // Sub-object bar
          Container(
            height: 28,
            decoration: const BoxDecoration(
              border: Border(top: BorderSide(color: Color(0xFF2c3035))),
            ),
            child: Row(
              children: [
                _subObjBtn("Obj", "object"),
                _subObjBtn("Vert", "vertex"),
                _subObjBtn("Edge", "edge"),
                _subObjBtn("Face", "face"),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _tabBtn(String label, int idx) {
    final active = _selectedTab == idx;
    return Expanded(
      child: GestureDetector(
        onTap: () => setState(() => _selectedTab = idx),
        child: Container(
          alignment: Alignment.center,
          decoration: BoxDecoration(
            border: Border(bottom: BorderSide(color: active ? const Color(0xFF35b49c) : Colors.transparent, width: 2)),
          ),
          child: Text(label,
            style: TextStyle(
              color: active ? const Color(0xFFe8e6df) : const Color(0xFF6f736d),
              fontSize: 11, fontWeight: FontWeight.w700,
            )),
        ),
      ),
    );
  }

  Widget _subObjBtn(String label, String value) {
    final active = _subObjLevel == value;
    return Expanded(
      child: GestureDetector(
        onTap: () => setState(() => _subObjLevel = value),
        child: Container(
          alignment: Alignment.center,
          margin: const EdgeInsets.all(2),
          decoration: BoxDecoration(
            color: active ? const Color(0xFF35b49c) : Colors.transparent,
            borderRadius: BorderRadius.circular(3),
          ),
          child: Text(label,
            style: TextStyle(
              color: active ? Colors.white : const Color(0xFF8a8f94),
              fontSize: 10, fontWeight: FontWeight.w600,
            )),
        ),
      ),
    );
  }

  Widget _buildStatusBar() {
    return Container(
      height: 30,
      padding: const EdgeInsets.symmetric(horizontal: 12),
      color: const Color(0xFF16191b),
      child: Row(
        children: [
          Text("X: 0.00  Y: 0.00  Z: 0.00",
            style: const TextStyle(color: Color(0xFF6f736d), fontSize: 11)),
          const Spacer(),
          Text("Mode: $_transformTool",
            style: const TextStyle(color: Color(0xFF8a8f94), fontSize: 11)),
          const SizedBox(width: 16),
          Text("0 obj. sélect.",
            style: const TextStyle(color: Color(0xFF3d4246), fontSize: 11)),
        ],
      ),
    );
  }
}
