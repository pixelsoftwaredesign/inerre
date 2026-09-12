import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

class Viewport3D extends StatefulWidget {
  final bool quadView;

  const Viewport3D({super.key, this.quadView = false});

  @override
  State<Viewport3D> createState() => _Viewport3DState();
}

class _Viewport3DState extends State<Viewport3D> {
  @override
  Widget build(BuildContext context) {
    if (kIsWeb) {
      return _buildWebFallback();
    }
    return _buildNativeWebView();
  }

  Widget _buildNativeWebView() {
    final controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFF0d0f10))
      ..loadRequest(Uri.parse('http://localhost:4173/'));
    return Stack(
      children: [
        WebViewWidget(controller: controller),
        if (widget.quadView) ...[
          Positioned(top: 8, left: 8, child: _label("Front")),
          Positioned(top: 8, right: 8, child: _label("Top")),
          Positioned(bottom: 8, left: 8, child: _label("Left")),
          Positioned(bottom: 8, right: 8, child: _label("Perspective")),
        ],
      ],
    );
  }

  Widget _buildWebFallback() {
    return Stack(
      children: [
        const Center(
          child: Text("Ouvrir dans le navigateur\nhttp://localhost:4173",
            textAlign: TextAlign.center,
            style: TextStyle(color: Color(0xFF3d4246), fontSize: 14)),
        ),
        if (widget.quadView) ...[
          Positioned(top: 8, left: 8, child: _label("Front")),
          Positioned(top: 8, right: 8, child: _label("Top")),
          Positioned(bottom: 8, left: 8, child: _label("Left")),
          Positioned(bottom: 8, right: 8, child: _label("Perspective")),
        ],
      ],
    );
  }

  Widget _label(String text) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: const Color(0xFF1a1c1e),
        borderRadius: BorderRadius.circular(3),
      ),
      child: Text(text, style: const TextStyle(color: Color(0xFF6f736d), fontSize: 10)),
    );
  }
}
