import 'package:flutter/material.dart';
import '../../core/api/stride_api_client.dart';
import '../../l10n/app_localizations.dart';
import '../../theme/stride_theme.dart';

class ClubsChallengesScreen extends StatefulWidget {
  final StrideApiClient api;
  const ClubsChallengesScreen({super.key, required this.api});

  @override
  State<ClubsChallengesScreen> createState() => _ClubsChallengesScreenState();
}

class _ClubsChallengesScreenState extends State<ClubsChallengesScreen> with SingleTickerProviderStateMixin {
  late final TabController _tabs = TabController(length: 2, vsync: this);
  bool _loading = true;
  List<Map<String, dynamic>> _clubs = [];
  List<Map<String, dynamic>> _challenges = [];

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
      final c = await widget.api.fetchClubs();
      final ch = await widget.api.fetchChallenges();
      setState(() {
        _clubs = c.whereType<Map<String, dynamic>>().toList();
        _challenges = ch.whereType<Map<String, dynamic>>().toList();
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Column(
      children: [
        TabBar(
          controller: _tabs,
          tabs: [
            Tab(text: l10n.clubsTab),
            Tab(text: l10n.challengesTab),
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
                      child: ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: _clubs.length,
                        itemBuilder: (context, idx) {
                          final club = _clubs[idx];
                          final status = club['membership_status']?.toString();
                          final joined = status == 'accepted' || status == 'pending';
                          return Card(
                            margin: const EdgeInsets.only(bottom: 12),
                            child: ListTile(
                              title: Text((club['name'] ?? 'Club').toString(), style: const TextStyle(fontWeight: FontWeight.bold)),
                              subtitle: Text('${club['city'] ?? 'India'} · ${club['member_count'] ?? 0} members'),
                              trailing: OutlinedButton(
                                onPressed: () async {
                                  await widget.api.toggleClubMembership(club['id'].toString(), joined: joined);
                                  _load();
                                },
                                child: Text(joined ? l10n.leaveLabel : l10n.joinLabel),
                              ),
                              onTap: () {
                                Navigator.push<void>(
                                  context,
                                  MaterialPageRoute(
                                    builder: (_) => ClubDetailScreen(
                                      api: widget.api,
                                      slugOrId: (club['slug'] ?? club['id']).toString(),
                                      title: (club['name'] ?? 'Club').toString(),
                                    ),
                                  ),
                                );
                              },
                            ),
                          );
                        },
                      ),
                    ),
                    RefreshIndicator(
                      onRefresh: _load,
                      child: ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: _challenges.length,
                        itemBuilder: (context, idx) {
                          final ch = _challenges[idx];
                          final joined = ch['viewer_joined'] == true;
                          final target = ((ch['target_value'] as num?) ?? 1).toDouble();
                          final progress = ((ch['viewer_progress'] as num?) ?? 0).toDouble();
                          final pct = (progress / target).clamp(0.0, 1.0);
                          return Card(
                            margin: const EdgeInsets.only(bottom: 12),
                            child: Padding(
                              padding: const EdgeInsets.all(14),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                    children: [
                                      Expanded(
                                        child: Text(
                                          (ch['title'] ?? 'Challenge').toString(),
                                          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                                        ),
                                      ),
                                      FilledButton.tonal(
                                        onPressed: () async {
                                          await widget.api.toggleChallengeMembership(ch['id'].toString(), joined: joined);
                                          _load();
                                        },
                                        child: Text(joined ? l10n.leaveLabel : l10n.joinLabel),
                                      ),
                                    ],
                                  ),
                                  if ((ch['description'] ?? '').toString().isNotEmpty) ...[
                                    const SizedBox(height: 6),
                                    Text((ch['description'] ?? '').toString(), style: Theme.of(context).textTheme.bodySmall),
                                  ],
                                  if (joined) ...[
                                    const SizedBox(height: 10),
                                    LinearProgressIndicator(value: pct, color: StrideTokens.success),
                                    const SizedBox(height: 4),
                                    Text('${(pct * 100).round()}% completed', style: Theme.of(context).textTheme.bodySmall),
                                  ],
                                ],
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                  ],
                ),
        ),
      ],
    );
  }
}

class ClubDetailScreen extends StatefulWidget {
  final StrideApiClient api;
  final String slugOrId;
  final String title;

  const ClubDetailScreen({
    super.key,
    required this.api,
    required this.slugOrId,
    required this.title,
  });

  @override
  State<ClubDetailScreen> createState() => _ClubDetailScreenState();
}

class _ClubDetailScreenState extends State<ClubDetailScreen> {
  bool _loading = true;
  Map<String, dynamic>? _club;
  List<Map<String, dynamic>> _events = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final res = await widget.api.fetchClubDetail(widget.slugOrId);
      setState(() {
        _club = res['club'] as Map<String, dynamic>?;
        _events = ((res['events'] as List<dynamic>?) ?? []).whereType<Map<String, dynamic>>().toList();
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(title: Text(widget.title)),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (_club != null)
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text((_club!['name'] ?? '').toString(), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
                          const SizedBox(height: 6),
                          Text((_club!['description'] ?? '').toString()),
                        ],
                      ),
                    ),
                  ),
                const SizedBox(height: 16),
                Text(l10n.eventsTitle, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                if (_events.isEmpty)
                  Text(l10n.noItemsYet)
                else
                  ..._events.map((ev) {
                    final going = ev['viewer_going'] == true;
                    return Card(
                      margin: const EdgeInsets.only(bottom: 10),
                      child: ListTile(
                        title: Text((ev['title'] ?? 'Event').toString()),
                        subtitle: Text('${ev['location_name'] ?? ev['city'] ?? ''} · ${ev['attendee_count'] ?? 0} going'),
                        trailing: FilledButton(
                          onPressed: () async {
                            await widget.api.rsvpEvent(ev['id'].toString(), going: !going);
                            _load();
                          },
                          child: Text(going ? l10n.goingLabel : l10n.interestedLabel),
                        ),
                      ),
                    );
                  }),
              ],
            ),
    );
  }
}
