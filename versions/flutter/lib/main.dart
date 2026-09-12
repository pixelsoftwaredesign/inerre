// PixelSoftwareDesign2026@
import 'package:flutter/material.dart';
import 'screens/home_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const InerreApp());
}

class InerreApp extends StatelessWidget {
  const InerreApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Inerre Studio',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF111315),
        colorScheme: const ColorScheme.dark(
          primary: Color(0xFF35b49c),
          surface: Color(0xFF1a1c1e),
        ),
        appBarTheme: const AppBarTheme(
          backgroundColor: Color(0xFF16191b),
          foregroundColor: Color(0xFFe8e6df),
          elevation: 0,
        ),
      ),
      home: const HomeScreen(),
    );
  }
}
