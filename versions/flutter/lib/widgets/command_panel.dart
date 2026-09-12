import 'package:flutter/material.dart';

class CommandPanel extends StatelessWidget {
  final int selectedTab;
  final ValueChanged<int> onTabChanged;

  const CommandPanel({
    super.key,
    required this.selectedTab,
    required this.onTabChanged,
  });

  static const _tabs = ["Créer", "Modifier", "Matériau", "Pipeline"];

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 240,
      color: const Color(0xFF1a1c1e),
      child: Column(
        children: [
          // Tab bar
          Container(
            height: 32,
            decoration: const BoxDecoration(
              border: Border(bottom: BorderSide(color: Color(0xFF2c3035))),
            ),
            child: Row(
              children: List.generate(_tabs.length, (i) => _tabBtn(_tabs[i], i)),
            ),
          ),
          // Tab content
          Expanded(child: _buildTabContent()),
        ],
      ),
    );
  }

  Widget _tabBtn(String label, int idx) {
    final active = selectedTab == idx;
    return Expanded(
      child: GestureDetector(
        onTap: () => onTabChanged(idx),
        child: Container(
          alignment: Alignment.center,
          decoration: BoxDecoration(
            border: Border(
              bottom: BorderSide(
                color: active ? const Color(0xFF35b49c) : Colors.transparent,
                width: 2,
              ),
            ),
          ),
          child: Text(label,
            style: TextStyle(
              color: active ? const Color(0xFFe8e6df) : const Color(0xFF6f736d),
              fontSize: 10, fontWeight: FontWeight.w700,
            )),
        ),
      ),
    );
  }

  Widget _buildTabContent() {
    switch (selectedTab) {
      case 0: return _createTab();
      case 1: return _modifyTab();
      case 2: return _materialTab();
      case 3: return _pipelineTab();
      default: return const SizedBox();
    }
  }

  Widget _sectionTitle(String title) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 6),
      child: Text(title,
        style: const TextStyle(
          color: Color(0xFF8a8f94), fontSize: 10, fontWeight: FontWeight.w700,
          letterSpacing: 1,
        )),
    );
  }

  Widget _gridBtn(String label, {Color? color}) {
    return Container(
      height: 28,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: const Color(0xFF2c3035),
        borderRadius: BorderRadius.circular(3),
      ),
      child: Text(label,
        style: TextStyle(color: color ?? const Color(0xFFe8e6df), fontSize: 10)),
    );
  }

  Widget _createTab() {
    return ListView(
      children: [
        _sectionTitle("Primitives"),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Wrap(spacing: 4, runSpacing: 4,
            children: ["Cube", "Sphère", "Cône", "Cylindre"].map((l) =>
              SizedBox(width: 100, child: _gridBtn(l))).toList(),
          ),
        ),
        _sectionTitle("Dessin 2D"),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Wrap(spacing: 4, runSpacing: 4,
            children: ["Point", "Ligne", "Rectangle", "Cercle", "Arc", "Profile"].map((l) =>
              SizedBox(width: 100, child: _gridBtn(l))).toList(),
          ),
        ),
        _sectionTitle("Mobilier"),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Wrap(spacing: 4, runSpacing: 4,
            children: ["Canapé", "Table", "Chaise", "Armoire", "Lit", "Étagère"].map((l) =>
              SizedBox(width: 100, child: _gridBtn(l))).toList(),
          ),
        ),
      ],
    );
  }

  Widget _modifyTab() {
    return ListView(
      children: [
        _sectionTitle("Transformations"),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Wrap(spacing: 4, runSpacing: 4,
            children: ["Déplacer", "Rotation", "Échelle"].map((l) =>
              SizedBox(width: 100, child: _gridBtn(l))).toList(),
          ),
        ),
        _sectionTitle("Opérations"),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Wrap(spacing: 4, runSpacing: 4,
            children: ["Booléen", "Connect", "Array", "Mirroir"].map((l) =>
              SizedBox(width: 100, child: _gridBtn(l))).toList(),
          ),
        ),
      ],
    );
  }

  Widget _materialTab() {
    return ListView(
      children: [
        _sectionTitle("Matériaux"),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Wrap(spacing: 4, runSpacing: 4,
            children: ["Bois", "Métal", "Verre", "Tissu", "Pierre", "Céramique"].map((l) =>
              SizedBox(width: 100, child: _gridBtn(l))).toList(),
          ),
        ),
        _sectionTitle("Environnement"),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Wrap(spacing: 4, runSpacing: 4,
            children: ["Studio", "Extérieur", "Coucher", "Nuit"].map((l) =>
              SizedBox(width: 100, child: _gridBtn(l))).toList(),
          ),
        ),
      ],
    );
  }

  Widget _pipelineTab() {
    return ListView(
      children: [
        _sectionTitle("Pipeline"),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Column(
            children: [
              _pipelineStep("📷", "Panorama", "Importer un panorama"),
              const SizedBox(height: 4),
              _pipelineStep("📐", "Plan", "Dessiner le plan"),
              const SizedBox(height: 4),
              _pipelineStep("🏗️", "Construire", "Générer les murs"),
              const SizedBox(height: 4),
              _pipelineStep("🪑", "Meubler", "Ajouter du mobilier"),
              const SizedBox(height: 4),
              _pipelineStep("💾", "Sauvegarder", "Enregistrer"),
              const SizedBox(height: 4),
              _pipelineStep("📤", "Exporter", "GLB / OBJ"),
            ],
          ),
        ),
      ],
    );
  }

  Widget _pipelineStep(String icon, String title, String subtitle) {
    return Container(
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: const Color(0xFF2c3035),
        borderRadius: BorderRadius.circular(3),
      ),
      child: Row(
        children: [
          Text(icon, style: const TextStyle(fontSize: 16)),
          const SizedBox(width: 8),
          Column(crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: const TextStyle(color: Color(0xFFe8e6df), fontSize: 11, fontWeight: FontWeight.w600)),
              Text(subtitle, style: const TextStyle(color: Color(0xFF6f736d), fontSize: 9)),
            ],
          ),
        ],
      ),
    );
  }
}
