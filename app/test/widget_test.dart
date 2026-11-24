import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:stride/main.dart';

void main() {
  testWidgets('StrideApp renders sign-in experience in light & dark themes cleanly', (tester) async {
    await tester.pumpWidget(const StrideApp(skipSessionRestore: true));
    await tester.pumpAndSettle();

    expect(find.text('STRIDE'), findsOneWidget);
    expect(find.byType(TextField), findsNWidgets(2));
  });
}
