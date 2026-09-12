import 'package:flutter/material.dart';

class Toolbar extends StatelessWidget {
  final String transformTool;
  final bool snapEnabled;
  final double snapSize;
  final bool quadView;
  final ValueChanged<String> onTransformChanged;
  final VoidCallback onSnapToggled;
  final ValueChanged<double> onSnapSizeChanged;
  final VoidCallback onQuadToggled;

  const Toolbar({
    super.key,
    required this.transformTool,
    required this.snapEnabled,
    required this.snapSize,
    required this.quadView,
    required this.onTransformChanged,
    required this.onSnapToggled,
    required this.onSnapSizeChanged,
    required this.onQuadToggled,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 44,
      padding: const EdgeInsets.symmetric(horizontal: 12),
      color: const Color(0xFF16191b),
      child: Row(
        children: [
          // Brand
          const Text("I  Inerre Studio",
            style: TextStyle(color: Color(0xFFe8e6df), fontSize: 13, fontWeight: FontWeight.w700)),
          const SizedBox(width: 16),

          // Transform tools
          _toolBtn("Q", "select"),
          _toolBtn("W", "translate"),
          _toolBtn("E", "rotate"),
          _toolBtn("R", "scale"),
          const SizedBox(width: 12),

          // Snap
          _toggleBtn("Snap", snapEnabled, onSnapToggled),
          SizedBox(
            width: 50, height: 24,
            child: DropdownButtonHideUnderline(
              child: DropdownButton<double>(
                value: snapSize,
                dropdownColor: const Color(0xFF1a1c1e),
                style: const TextStyle(color: Color(0xFFe8e6df), fontSize: 11),
                items: [0.1, 0.25, 0.5, 1.0, 2.0].map((v) =>
                  DropdownMenuItem(value: v, child: Text("$v"))).toList(),
                onChanged: (v) { if (v != null) onSnapSizeChanged(v); },
              ),
            ),
          ),
          const SizedBox(width: 12),

          // Quad view
          _toggleBtn("Quad", quadView, onQuadToggled),
        ],
      ),
    );
  }

  Widget _toolBtn(String label, String value) {
    final active = transformTool == value;
    return GestureDetector(
      onTap: () => onTransformChanged(value),
      child: Container(
        width: 30, height: 26,
        alignment: Alignment.center,
        margin: const EdgeInsets.symmetric(horizontal: 1),
        decoration: BoxDecoration(
          color: active ? const Color(0xFF35b49c) : const Color(0xFF2c3035),
          borderRadius: BorderRadius.circular(3),
        ),
        child: Text(label,
          style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700)),
      ),
    );
  }

  Widget _toggleBtn(String label, bool active, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 24,
        padding: const EdgeInsets.symmetric(horizontal: 8),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: active ? const Color(0xFF35b49c).withOpacity(0.2) : Colors.transparent,
          border: Border.all(color: active ? const Color(0xFF35b49c) : const Color(0xFF3d4246)),
          borderRadius: BorderRadius.circular(3),
        ),
        child: Text(label,
          style: TextStyle(
            color: active ? const Color(0xFF35b49c) : const Color(0xFF8a8f94),
            fontSize: 10,
          )),
      ),
    );
  }
}
