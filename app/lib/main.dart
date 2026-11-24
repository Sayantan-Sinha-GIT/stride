import 'dart:async';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'core/api/stride_api_client.dart';
import 'core/location/recording_controller.dart';
import 'core/storage/recording_db.dart';
import 'features/auth/login_screen.dart';
import 'features/community/clubs_challenges_screen.dart';
import 'features/explore/explore_screen.dart';
import 'features/feed/feed_screen.dart';
import 'features/profile/profile_settings_screen.dart';
import 'features/record/record_screen.dart';
import 'l10n/app_localizations.dart';
import 'theme/stride_theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  try {
    await Firebase.initializeApp();
  } catch (_) {
    // Gracefully run when google-services.json / GoogleService-Info.plist is omitted locally.
  }
  runApp(const StrideApp());
}

class StrideApp extends StatefulWidget {
  final bool skipSessionRestore;
  const StrideApp({super.key, this.skipSessionRestore = false});

  @override
  State<StrideApp> createState() => _StrideAppState();
}

class _StrideAppState extends State<StrideApp> {
  final _api = StrideApiClient();
  final _db = RecordingDb();
  late final RecordingController _recorder = RecordingController(_db, _api);

  ThemeMode _themeMode = ThemeMode.system;
  Locale _locale = const Locale('en');
  int _tabIndex = 0;
  bool _authenticated = false;
  bool _checkingAuth = true;

  @override
  void initState() {
    super.initState();
    if (widget.skipSessionRestore) {
      _checkingAuth = false;
    } else {
      _restoreSession();
    }
  }

  Future<void> _registerPushToken() async {
    try {
      if (Firebase.apps.isEmpty) return;
      await FirebaseMessaging.instance.requestPermission();
      final token = await FirebaseMessaging.instance.getToken();
      if (token != null && token.isNotEmpty) {
        await _api.registerDeviceToken(token, 'android');
      }
    } catch (_) {
      // Gracefully ignore when push services are unavailable on emulators/desktop.
    }
  }

  Future<void> _restoreSession() async {
    try {
      final has = await _api.hasSession();
      if (has) {
        final me = await _api.fetchMe();
        final settings = me['settings'] as Map<String, dynamic>?;
        if (mounted) {
          setState(() {
            _authenticated = true;
            final themeStr = settings?['theme']?.toString();
            if (themeStr == 'dark') _themeMode = ThemeMode.dark;
            if (themeStr == 'light') _themeMode = ThemeMode.light;
            if (settings?['language'] == 'hi') _locale = const Locale('hi');
          });
          unawaited(_registerPushToken());
        }
      }
    } catch (_) {
      // Unauthenticated or unreachable API falls back cleanly to LoginScreen
    } finally {
      if (mounted) setState(() => _checkingAuth = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Stride',
      debugShowCheckedModeBanner: false,
      theme: StrideTheme.light(),
      darkTheme: StrideTheme.dark(),
      themeMode: _themeMode,
      locale: _locale,
      supportedLocales: const [Locale('en'), Locale('hi')],
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: _checkingAuth
          ? const Scaffold(body: Center(child: CircularProgressIndicator()))
          : _authenticated
              ? _MainShell(
                  api: _api,
                  recorder: _recorder,
                  tabIndex: _tabIndex,
                  onTabChanged: (i) => setState(() => _tabIndex = i),
                  themeMode: _themeMode,
                  onThemeChanged: (m) => setState(() => _themeMode = m),
                  locale: _locale,
                  onLocaleChanged: (l) => setState(() => _locale = l),
                  onSignOut: () async {
                    await _api.clearSession();
                    if (mounted) setState(() => _authenticated = false);
                  },
                )
              : LoginScreen(
                  api: _api,
                  onSignedIn: () {
                    setState(() => _authenticated = true);
                    unawaited(_registerPushToken());
                  },
                ),
    );
  }
}

class _MainShell extends StatelessWidget {
  final StrideApiClient api;
  final RecordingController recorder;
  final int tabIndex;
  final ValueChanged<int> onTabChanged;
  final ThemeMode themeMode;
  final ValueChanged<ThemeMode> onThemeChanged;
  final Locale locale;
  final ValueChanged<Locale> onLocaleChanged;
  final VoidCallback onSignOut;

  const _MainShell({
    required this.api,
    required this.recorder,
    required this.tabIndex,
    required this.onTabChanged,
    required this.themeMode,
    required this.onThemeChanged,
    required this.locale,
    required this.onLocaleChanged,
    required this.onSignOut,
  });

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final pages = [
      FeedScreen(api: api),
      ExploreScreen(api: api),
      RecordScreen(controller: recorder),
      ClubsChallengesScreen(api: api),
      ProfileSettingsScreen(
        api: api,
        themeMode: themeMode,
        onThemeChanged: onThemeChanged,
        locale: locale,
        onLocaleChanged: onLocaleChanged,
        onSignOut: onSignOut,
      ),
    ];

    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            Container(
              height: 30,
              width: 30,
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.primary,
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.route, color: Colors.white, size: 18),
            ),
            const SizedBox(width: 10),
            Text(l10n.appTitle, style: const TextStyle(fontWeight: FontWeight.w800)),
          ],
        ),
      ),
      body: pages[tabIndex],
      bottomNavigationBar: NavigationBar(
        selectedIndex: tabIndex,
        onDestinationSelected: onTabChanged,
        destinations: [
          NavigationDestination(icon: const Icon(Icons.dynamic_feed_outlined), selectedIcon: const Icon(Icons.dynamic_feed), label: l10n.tabFeed),
          NavigationDestination(icon: const Icon(Icons.explore_outlined), selectedIcon: const Icon(Icons.explore), label: l10n.tabExplore),
          NavigationDestination(
            icon: Icon(Icons.radio_button_checked, color: Theme.of(context).colorScheme.primary),
            label: l10n.tabRecord,
          ),
          NavigationDestination(icon: const Icon(Icons.groups_outlined), selectedIcon: const Icon(Icons.groups), label: l10n.tabClubs),
          NavigationDestination(icon: const Icon(Icons.person_outline), selectedIcon: const Icon(Icons.person), label: l10n.tabProfile),
        ],
      ),
    );
  }
}
