import 'package:flutter/material.dart';

class SceneTree extends StatelessWidget {
  const SceneTree({super.key});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.symmetric(vertical: 4),
      children: const [
        _TreeItem("Sofa", visible: true, selected: true),
        _TreeItem("Coffee Table", visible: true),
        _TreeItem("Lamp", visible: false),
        _TreeItem("TV Unit", visible: true),
        _TreeItem("TV", visible: true),
      ],
    );
  }
}

class _TreeItem extends StatelessWidget {
  final String label;
  final bool visible;
  final bool selected;

  const _TreeItem(this.label, {this.visible = true, this.selected = false});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      color: selected ? const Color(0xFF2c3035) : null,
      child: Row(
        children: [
          GestureDetector(
            onTap: () {},
            child: Icon(
              visible ? Icons.visibility : Icons.visibility_off,
              size: 14,
              color: visible ? const Color(0xFF8a8f94) : const Color(0xFF3d4246),
            ),
          ),
          const SizedBox(width: 8),
          const Icon(Icons.view_in_ar, size: 14, color: Color(0xFF6f736d)),
          const SizedBox(width: 6),
          Text(label,
            style: TextStyle(
              color: selected ? const Color(0xFFe8e6df) : const Color(0xFF8a8f94),
              fontSize: 11,
            )),
        ],
      ),
    );
  }
}
