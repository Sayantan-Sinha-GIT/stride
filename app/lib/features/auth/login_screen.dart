import 'package:flutter/material.dart';
import 'package:google_sign_in/google_sign_in.dart';
import '../../core/api/stride_api_client.dart';
import '../../l10n/app_localizations.dart';

class LoginScreen extends StatefulWidget {
  final StrideApiClient api;
  final VoidCallback onSignedIn;

  const LoginScreen({super.key, required this.api, required this.onSignedIn});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _emailCtrl = TextEditingController();
  final _passCtrl = TextEditingController();
  final _nameCtrl = TextEditingController();
  final _handleCtrl = TextEditingController();

  bool _isSignup = false;
  bool _loading = false;
  String? _error;
  String? _notice;

  @override
  void dispose() {
    _emailCtrl.dispose();
    _passCtrl.dispose();
    _nameCtrl.dispose();
    _handleCtrl.dispose();
    super.dispose();
  }

  Future<void> _submitForm() async {
    setState(() {
      _loading = true;
      _error = null;
      _notice = null;
    });
    try {
      if (_isSignup) {
        await widget.api.signup(
          email: _emailCtrl.text.trim(),
          password: _passCtrl.text,
          displayName: _nameCtrl.text.trim(),
          handle: _handleCtrl.text.trim().toLowerCase(),
          language: Localizations.localeOf(context).languageCode == 'hi' ? 'hi' : 'en',
        );
        setState(() {
          _isSignup = false;
          _notice = 'Account created. Check email verification or sign in now.';
        });
      } else {
        await widget.api.loginWithEmail(_emailCtrl.text.trim(), _passCtrl.text);
        widget.onSignedIn();
      }
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _signInGoogle() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      const envServerClientId = String.fromEnvironment('GOOGLE_SERVER_CLIENT_ID');
      final fetchedClientId = await widget.api.fetchGoogleWebClientId();
      final serverClientId =
          (fetchedClientId != null && fetchedClientId.isNotEmpty)
              ? fetchedClientId
              : (envServerClientId.isNotEmpty ? envServerClientId : null);
      final acct = await GoogleSignIn(
        scopes: ['email', 'profile'],
        serverClientId: serverClientId,
      ).signIn();
      final auth = await acct?.authentication;
      if (auth?.idToken == null) {
        throw Exception('Google sign-in cancelled or missing ID token');
      }
      await widget.api.loginWithGoogleIdToken(auth!.idToken!);
      widget.onSignedIn();
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _openForgotPassword() async {
    final l10n = AppLocalizations.of(context)!;
    final email = _emailCtrl.text.trim();
    if (email.isEmpty) {
      setState(() => _error = 'Enter your email above first to reset password.');
      return;
    }
    await widget.api.requestPasswordReset(email);
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.resetPasswordSent)),
      );
    }
  }

  Future<void> _openServerConfig() async {
    final l10n = AppLocalizations.of(context)!;
    final current = await widget.api.loadConfiguredBaseUrl();
    if (!mounted) return;
    final ctrl = TextEditingController(text: current);
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.serverUrlConfig),
        content: TextField(
          controller: ctrl,
          decoration: const InputDecoration(
            labelText: 'API Base URL',
            hintText: 'http://10.0.2.2:8787',
            border: OutlineInputBorder(),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: Text(l10n.discard)),
          FilledButton(
            onPressed: () async {
              await widget.api.setConfiguredBaseUrl(ctrl.text);
              if (ctx.mounted) Navigator.pop(ctx);
            },
            child: Text(l10n.sendLabel),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.appTitle),
        actions: [
          IconButton(
            onPressed: _openServerConfig,
            icon: const Icon(Icons.dns_outlined),
            tooltip: l10n.serverUrlConfig,
          ),
        ],
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    Theme.of(context).colorScheme.primary.withValues(alpha: 0.2),
                    Theme.of(context).colorScheme.surface,
                  ],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(
                  color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.3),
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      CircleAvatar(
                        backgroundColor: Theme.of(context).colorScheme.primary,
                        foregroundColor: Colors.white,
                        child: const Icon(Icons.route),
                      ),
                      const SizedBox(width: 12),
                      const Expanded(
                        child: Text(
                          'STRIDE',
                          style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, letterSpacing: -0.5),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Text(
                    'Deterministic GPS tracking, Hausdorff segment leaderboards, offline crash recovery & privacy zones.',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 18),
            SegmentedButton<bool>(
              segments: [
                ButtonSegment(value: false, label: Text(l10n.signIn)),
                ButtonSegment(value: true, label: Text(l10n.signUp)),
              ],
              selected: {_isSignup},
              onSelectionChanged: (s) => setState(() {
                _isSignup = s.first;
                _error = null;
                _notice = null;
              }),
            ),
            const SizedBox(height: 16),
            if (_error != null)
              Container(
                padding: const EdgeInsets.all(12),
                margin: const EdgeInsets.only(bottom: 12),
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.error.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
              ),
            if (_notice != null)
              Container(
                padding: const EdgeInsets.all(12),
                margin: const EdgeInsets.only(bottom: 12),
                decoration: BoxDecoration(
                  color: Colors.green.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(_notice!),
              ),
            if (_isSignup) ...[
              TextField(
                controller: _nameCtrl,
                decoration: InputDecoration(labelText: l10n.displayNameLabel, border: const OutlineInputBorder()),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _handleCtrl,
                decoration: InputDecoration(labelText: l10n.handleLabel, border: const OutlineInputBorder()),
              ),
              const SizedBox(height: 12),
            ],
            TextField(
              controller: _emailCtrl,
              keyboardType: TextInputType.emailAddress,
              decoration: InputDecoration(labelText: l10n.emailLabel, border: const OutlineInputBorder()),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _passCtrl,
              obscureText: true,
              decoration: InputDecoration(labelText: l10n.passwordLabel, border: const OutlineInputBorder()),
            ),
            const SizedBox(height: 16),
            SizedBox(
              height: 50,
              child: FilledButton(
                onPressed: _loading ? null : _submitForm,
                child: Text(_loading ? '...' : (_isSignup ? l10n.signUp : l10n.signIn)),
              ),
            ),
            const SizedBox(height: 10),
            if (!_isSignup)
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(
                  onPressed: _loading ? null : _openForgotPassword,
                  child: Text(l10n.forgotPassword),
                ),
              ),
            const SizedBox(height: 6),
            SizedBox(
              height: 50,
              child: OutlinedButton.icon(
                onPressed: _loading ? null : _signInGoogle,
                icon: const Icon(Icons.login),
                label: Text(l10n.continueWithGoogle),
              ),
            ),
            const SizedBox(height: 10),
            SizedBox(
              height: 48,
              child: OutlinedButton.icon(
                key: const Key('demo_login_btn'),
                onPressed: _loading
                    ? null
                    : () {
                        _isSignup = false;
                        _emailCtrl.text = 'arjun@stride.demo';
                        _passCtrl.text = 'StrideDemo123!';
                        _submitForm();
                      },
                icon: const Icon(Icons.flash_on),
                label: Text(
                  l10n.quickDemoAthlete == '1-Tap Demo Athlete'
                      ? 'Demo Athlete Quick Sign-In'
                      : l10n.quickDemoAthlete,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
