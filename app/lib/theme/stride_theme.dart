import 'package:flutter/material.dart';

/// Centralized Stride mobile theme tokens.
/// Edit this file to apply visual branding without rewriting feature screens.
class StrideTokens {
  static const Color darkCanvas = Color(0xFF080B0F);
  static const Color darkElevated = Color(0xFF0F141B);
  static const Color darkSurface = Color(0xFF141B24);
  static const Color darkTextPrimary = Color(0xFFF3F6FA);
  static const Color darkTextSecondary = Color(0xFFA1AFC2);
  static const Color darkAccent = Color(0xFFFF4D1C);

  static const Color lightCanvas = Color(0xFFF3F5F8);
  static const Color lightSurface = Color(0xFFFFFFFF);
  static const Color lightTextPrimary = Color(0xFF0C1219);
  static const Color lightTextSecondary = Color(0xFF3F4D5E);
  static const Color lightAccent = Color(0xFFD1380E);

  static const Color success = Color(0xFF18B87A);
  static const Color warning = Color(0xFFF59E0B);
  static const Color danger = Color(0xFFEF4444);
}

class StrideTheme {
  static ThemeData dark() {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      scaffoldBackgroundColor: StrideTokens.darkCanvas,
      colorScheme: const ColorScheme.dark(
        primary: StrideTokens.darkAccent,
        surface: StrideTokens.darkSurface,
        onSurface: StrideTokens.darkTextPrimary,
        error: StrideTokens.danger,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: StrideTokens.darkElevated,
        foregroundColor: StrideTokens.darkTextPrimary,
        elevation: 0,
      ),
      cardTheme: CardThemeData(
        color: StrideTokens.darkSurface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: BorderSide(color: Colors.white.withValues(alpha: 0.09)),
        ),
      ),
      navigationBarTheme: const NavigationBarThemeData(
        backgroundColor: StrideTokens.darkElevated,
        indicatorColor: Color(0x28FF4D1C),
      ),
    );
  }

  static ThemeData light() {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      scaffoldBackgroundColor: StrideTokens.lightCanvas,
      colorScheme: const ColorScheme.light(
        primary: StrideTokens.lightAccent,
        surface: StrideTokens.lightSurface,
        onSurface: StrideTokens.lightTextPrimary,
        error: StrideTokens.danger,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: StrideTokens.lightSurface,
        foregroundColor: StrideTokens.lightTextPrimary,
        elevation: 0,
      ),
      cardTheme: CardThemeData(
        color: StrideTokens.lightSurface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: BorderSide(color: Colors.black.withValues(alpha: 0.09)),
        ),
      ),
      navigationBarTheme: const NavigationBarThemeData(
        backgroundColor: StrideTokens.lightSurface,
        indicatorColor: Color(0x1FD1380E),
      ),
    );
  }
}
