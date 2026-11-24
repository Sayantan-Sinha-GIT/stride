import 'package:flutter/material.dart';
import '../../core/api/stride_api_client.dart';
import '../../l10n/app_localizations.dart';
import '../../theme/stride_theme.dart';

class ProfileSettingsScreen extends StatefulWidget {
  final StrideApiClient api;
  final ThemeMode themeMode;
  final ValueChanged<ThemeMode> onThemeChanged;
  final Locale locale;
  final ValueChanged<Locale> onLocaleChanged;
  final VoidCallback onSignOut;

  const ProfileSettingsScreen({
    super.key,
    required this.api,
    required this.themeMode,
    required this.onThemeChanged,
    required this.locale,
    required this.onLocaleChanged,
    required this.onSignOut,
  });

  @override
  State<ProfileSettingsScreen> createState() => _ProfileSettingsScreenState();
}

class _ProfileSettingsScreenState extends State<ProfileSettingsScreen> with SingleTickerProviderStateMixin {
  late final TabController _tabs = TabController(length: 2, vsync: this);
  bool _loading = true;
  Map<String, dynamic> _me = {};
  Map<String, dynamic> _dashboard = {};
  List<Map<String, dynamic>> _zones = [];
  List<Map<String, dynamic>> _sessions = [];
  List<Map<String, dynamic>> _notifications = [];
  String _units = 'metric';

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final me = await widget.api.fetchMe();
      final dash = await widget.api.fetchDashboard();
      final zones = await widget.api.fetchPrivacyZones();
      final sessions = await widget.api.fetchSessions();
      final notifs = await widget.api.fetchNotifications();
      final settings = me['settings'] as Map<String, dynamic>?;
      setState(() {
        _me = me;
        _dashboard = dash;
        _zones = zones.whereType<Map<String, dynamic>>().toList();
        _sessions = sessions.whereType<Map<String, dynamic>>().toList();
        _notifications = notifs.whereType<Map<String, dynamic>>().toList();
        _units = (settings?['units'] ?? 'metric').toString();
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _addPrivacyZoneDialog() async {
    final l10n = AppLocalizations.of(context)!;
    final nameCtrl = TextEditingController(text: 'Home');
    final latCtrl = TextEditingController(text: '12.9762');
    final lngCtrl = TextEditingController(text: '77.5929');
    final radCtrl = TextEditingController(text: '300');

    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.addPrivacyZone),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: nameCtrl, decoration: const InputDecoration(labelText: 'Zone Name')),
            TextField(controller: latCtrl, decoration: const InputDecoration(labelText: 'Latitude')),
            TextField(controller: lngCtrl, decoration: const InputDecoration(labelText: 'Longitude')),
            TextField(controller: radCtrl, decoration: const InputDecoration(labelText: 'Radius (meters)')),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: Text(l10n.discard)),
          FilledButton(
            onPressed: () async {
              await widget.api.createPrivacyZone(
                name: nameCtrl.text.trim(),
                lat: double.tryParse(latCtrl.text) ?? 12.9762,
                lng: double.tryParse(lngCtrl.text) ?? 77.5929,
                radiusMeters: int.tryParse(radCtrl.text) ?? 300,
              );
              if (ctx.mounted) Navigator.pop(ctx);
              _load();
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
    final user = _me['user'] as Map<String, dynamic>?;
    final prs = ((_dashboard['records'] as List<dynamic>?) ?? []).whereType<Map<String, dynamic>>().toList();
    final goals = ((_dashboard['goals'] as List<dynamic>?) ?? []).whereType<Map<String, dynamic>>().toList();
    final gear = ((_dashboard['gear'] as List<dynamic>?) ?? []).whereType<Map<String, dynamic>>().toList();
    final badges = ((_dashboard['badges'] as List<dynamic>?) ?? []).whereType<Map<String, dynamic>>().toList();

    return Column(
      children: [
        TabBar(
          controller: _tabs,
          tabs: [
            Tab(text: l10n.dashboardTab),
            Tab(text: l10n.settingsTab),
          ],
        ),
        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : TabBarView(
                  controller: _tabs,
                  children: [
                    RefreshIndicator(
                      onRefresh: _load,
                      child: ListView(
                        padding: const EdgeInsets.all(16),
                        children: [
                          if (user != null)
                            Card(
                              child: ListTile(
                                leading: CircleAvatar(
                                  backgroundColor: Theme.of(context).colorScheme.primary,
                                  foregroundColor: Colors.white,
                                  child: Text((user['displayName'] ?? 'S').toString().substring(0, 1).toUpperCase()),
                                ),
                                title: Text((user['displayName'] ?? 'Athlete').toString(), style: const TextStyle(fontWeight: FontWeight.bold)),
                                subtitle: Text('@${user['handle'] ?? ''} · ${(user['homeCity'] ?? 'India')}'),
                                trailing: Chip(
                                  label: Text('${_dashboard['streakDays'] ?? 0}d streak'),
                                  avatar: const Icon(Icons.local_fire_department, size: 16, color: StrideTokens.warning),
                                ),
                              ),
                            ),
                          const SizedBox(height: 16),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(l10n.goalsTitle, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                              TextButton.icon(
                                onPressed: () async {
                                  await widget.api.createGoal(period: 'weekly', targetMeters: 25000);
                                  _load();
                                },
                                icon: const Icon(Icons.add, size: 18),
                                label: Text(l10n.addGoal),
                              ),
                            ],
                          ),
                          ...goals.map((g) {
                            final cur = ((g['current_value'] as num?) ?? 0).toDouble();
                            final tgt = ((g['target_value'] as num?) ?? 1).toDouble();
                            return Card(
                              margin: const EdgeInsets.only(bottom: 8),
                              child: Padding(
                                padding: const EdgeInsets.all(12),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text('${g['period']} ${g['activity_type']} · ${(cur / 1000).toStringAsFixed(1)} / ${(tgt / 1000).toStringAsFixed(0)} km'),
                                    const SizedBox(height: 6),
                                    LinearProgressIndicator(value: (cur / tgt).clamp(0.0, 1.0)),
                                  ],
                                ),
                              ),
                            );
                          }),
                          const SizedBox(height: 14),
                          Text(l10n.personalRecordsTitle, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                          const SizedBox(height: 8),
                          ...prs.map((pr) => Card(
                                child: ListTile(
                                  dense: true,
                                  title: Text((pr['metric_key'] ?? '').toString().replaceAll('_', ' ').toUpperCase()),
                                  subtitle: Text((pr['activity_title'] ?? '').toString()),
                                  trailing: Text('${pr['value_num'] ?? ''}', style: const TextStyle(fontWeight: FontWeight.bold)),
                                ),
                              )),
                          const SizedBox(height: 14),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(l10n.gearTitle, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                              TextButton.icon(
                                onPressed: () async {
                                  await widget.api.createGear(name: 'Daily Trainers', gearType: 'shoes', initialDistanceM: 0);
                                  _load();
                                },
                                icon: const Icon(Icons.add, size: 18),
                                label: Text(l10n.addGear),
                              ),
                            ],
                          ),
                          ...gear.map((g) => Card(
                                child: ListTile(
                                  title: Text((g['name'] ?? '').toString()),
                                  subtitle: Text('${(((g['logged_distance_m'] as num?) ?? 0) / 1000).toStringAsFixed(1)} km logged'),
                                ),
                              )),
                          const SizedBox(height: 14),
                          Text('${l10n.badgesTitle} (${badges.length})', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                          Wrap(
                            spacing: 8,
                            children: badges
                                .map((b) => Chip(label: Text((b[widget.locale.languageCode == 'hi' ? 'title_hi' : 'title_en'] ?? '').toString())))
                                .toList(),
                          ),
                          const SizedBox(height: 14),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(l10n.notificationsTitle, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                              TextButton(
                                onPressed: () async {
                                  await widget.api.markAllNotificationsRead();
                                  _load();
                                },
                                child: Text(l10n.markAllRead),
                              ),
                            ],
                          ),
                          ..._notifications.take(8).map((n) => ListTile(
                                dense: true,
                                contentPadding: EdgeInsets.zero,
                                title: Text((n['title'] ?? '').toString()),
                                subtitle: Text((n['body'] ?? '').toString()),
                              )),
                        ],
                      ),
                    ),
                    ListView(
                      padding: const EdgeInsets.all(16),
                      children: [
                        Text(l10n.appearanceTitle, style: const TextStyle(fontWeight: FontWeight.bold)),
                        const SizedBox(height: 8),
                        SegmentedButton<ThemeMode>(
                          segments: [
                            ButtonSegment(value: ThemeMode.system, label: Text(l10n.themeSystem)),
                            ButtonSegment(value: ThemeMode.light, label: Text(l10n.themeLight)),
                            ButtonSegment(value: ThemeMode.dark, label: Text(l10n.themeDark)),
                          ],
                          selected: {widget.themeMode},
                          onSelectionChanged: (s) {
                            widget.onThemeChanged(s.first);
                            widget.api.updateSettings(theme: s.first.name);
                          },
                        ),
                        const SizedBox(height: 16),
                        Text(l10n.languageTitle, style: const TextStyle(fontWeight: FontWeight.bold)),
                        const SizedBox(height: 8),
                        SegmentedButton<Locale>(
                          segments: const [
                            ButtonSegment(value: Locale('en'), label: Text('English')),
                            ButtonSegment(value: Locale('hi'), label: Text('हिन्दी')),
                          ],
                          selected: {widget.locale},
                          onSelectionChanged: (s) {
                            widget.onLocaleChanged(s.first);
                            widget.api.updateSettings(language: s.first.languageCode);
                          },
                        ),
                        const SizedBox(height: 16),
                        Text(l10n.unitsTitle, style: const TextStyle(fontWeight: FontWeight.bold)),
                        const SizedBox(height: 8),
                        SegmentedButton<String>(
                          segments: [
                            ButtonSegment(value: 'metric', label: Text(l10n.unitsMetric)),
                            ButtonSegment(value: 'imperial', label: Text(l10n.unitsImperial)),
                          ],
                          selected: {_units},
                          onSelectionChanged: (s) {
                            setState(() => _units = s.first);
                            widget.api.updateSettings(units: s.first);
                          },
                        ),
                        const SizedBox(height: 18),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(l10n.privacyZonesTitle, style: const TextStyle(fontWeight: FontWeight.bold)),
                            TextButton.icon(
                              onPressed: _addPrivacyZoneDialog,
                              icon: const Icon(Icons.add, size: 18),
                              label: Text(l10n.addPrivacyZone),
                            ),
                          ],
                        ),
                        ..._zones.map((z) => Card(
                              child: ListTile(
                                title: Text((z['name'] ?? '').toString()),
                                subtitle: Text('${z['radiusMeters'] ?? 250} m radius'),
                                trailing: IconButton(
                                  icon: const Icon(Icons.delete_outline),
                                  onPressed: () async {
                                    await widget.api.deletePrivacyZone(z['id'].toString());
                                    _load();
                                  },
                                ),
                              ),
                            )),
                        const SizedBox(height: 16),
                        Text(l10n.devicesTitle, style: const TextStyle(fontWeight: FontWeight.bold)),
                        ..._sessions.map((s) => ListTile(
                              contentPadding: EdgeInsets.zero,
                              title: Text((s['deviceName'] ?? 'Device').toString()),
                              subtitle: Text((s['ipHint'] ?? '').toString()),
                              trailing: s['isCurrent'] == true
                                  ? const Chip(label: Text('This device'))
                                  : TextButton(
                                      onPressed: () async {
                                        await widget.api.revokeSession(s['id'].toString());
                                        _load();
                                      },
                                      child: Text(l10n.revokeLabel),
                                    ),
                            )),
                        const SizedBox(height: 16),
                        OutlinedButton(
                          onPressed: () async {
                            final data = await widget.api.exportMyData();
                            if (context.mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(content: Text('Exported ${(data['activities'] as List?)?.length ?? 0} activities safely.')),
                              );
                            }
                          },
                          child: Text(l10n.exportDataLabel),
                        ),
                        const SizedBox(height: 10),
                        OutlinedButton(
                          style: OutlinedButton.styleFrom(foregroundColor: StrideTokens.danger),
                          onPressed: widget.onSignOut,
                          child: Text(l10n.signOutLabel),
                        ),
                        const SizedBox(height: 10),
                        TextButton(
                          style: TextButton.styleFrom(foregroundColor: StrideTokens.danger),
                          onPressed: () async {
                            final ok = await showDialog<bool>(
                              context: context,
                              builder: (ctx) => AlertDialog(
                                title: Text(l10n.deleteAccountLabel),
                                content: const Text('All activities, PRs, privacy zones, and tokens will be deleted permanently.'),
                                actions: [
                                  TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(l10n.discard)),
                                  FilledButton(
                                    onPressed: () => Navigator.pop(ctx, true),
                                    child: Text(l10n.deleteAccountLabel),
                                  ),
                                ],
                              ),
                            );
                            if (ok == true) {
                              await widget.api.deleteAccount();
                              widget.onSignOut();
                            }
                          },
                          child: Text(l10n.deleteAccountLabel),
                        ),
                      ],
                    ),
                  ],
                ),
        ),
      ],
    );
  }
}
