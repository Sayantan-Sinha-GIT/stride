import 'package:flutter/material.dart';
import '../../core/api/stride_api_client.dart';
import '../../l10n/app_localizations.dart';
import '../../theme/stride_theme.dart';
import '../../widgets/route_visuals.dart';

class ExploreScreen extends StatefulWidget {
  final StrideApiClient api;
  const ExploreScreen({super.key, required this.api});

  @override
  State<ExploreScreen> createState() => _ExploreScreenState();
}

class _ExploreScreenState extends State<ExploreScreen> with SingleTickerProviderStateMixin {
  late final TabController _tabs = TabController(length: 2, vsync: this);
  bool _loading = true;
  List<Map<String, dynamic>> _segments = [];
  List<Map<String, dynamic>> _routes = [];

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
      final segs = await widget.api.fetchSegments();
      final rts = await widget.api.fetchNearbyRoutes();
      final actRts = (rts['activities'] as List<dynamic>? ?? []).whereType<Map<String, dynamic>>();
      final segRts = (rts['segments'] as List<dynamic>? ?? []).whereType<Map<String, dynamic>>();
      setState(() {
        _segments = segs.whereType<Map<String, dynamic>>().toList();
        _routes = [...actRts, ...segRts];
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
            Tab(text: l10n.segmentsTab),
            Tab(text: l10n.routesTab),
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
                        itemCount: _segments.length,
                        itemBuilder: (context, idx) {
                          final seg = _segments[idx];
                          final distKm = (((seg['distance_m'] as num?) ?? 0) / 1000).toStringAsFixed(2);
                          return Card(
                            margin: const EdgeInsets.only(bottom: 12),
                            child: ListTile(
                              leading: CircleAvatar(
                                backgroundColor: StrideTokens.warning.withValues(alpha: 0.16),
                                foregroundColor: StrideTokens.warning,
                                child: const Icon(Icons.emoji_events),
                              ),
                              title: Text((seg['name'] ?? 'Segment').toString(), style: const TextStyle(fontWeight: FontWeight.bold)),
                              subtitle: Text('${seg['city'] ?? 'India'} · $distKm km · ${(seg['activity_type'] ?? 'run').toString().toUpperCase()}'),
                              trailing: const Icon(Icons.chevron_right),
                              onTap: () {
                                Navigator.push<void>(
                                  context,
                                  MaterialPageRoute(
                                    builder: (_) => SegmentDetailScreen(
                                      api: widget.api,
                                      segmentId: seg['id'].toString(),
                                      segmentTitle: (seg['name'] ?? 'Segment').toString(),
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
                        itemCount: _routes.length,
                        itemBuilder: (context, idx) {
                          final rt = _routes[idx];
                          final distKm = (((rt['distanceM'] as num?) ?? 0) / 1000).toStringAsFixed(2);
                          final elevM = ((rt['elevationGainM'] as num?) ?? 0).round();
                          return Card(
                            margin: const EdgeInsets.only(bottom: 12),
                            child: Padding(
                              padding: const EdgeInsets.all(14),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text((rt['name'] ?? 'Route').toString(), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                                  const SizedBox(height: 4),
                                  Text('${rt['city'] ?? ''} · $distKm km · +$elevM m', style: Theme.of(context).textTheme.bodySmall),
                                  const SizedBox(height: 10),
                                  RoutePolylinePreview(
                                    encodedPolyline: (rt['encodedPolyline'] ?? '').toString(),
                                    height: 110,
                                  ),
                                  const SizedBox(height: 10),
                                  Align(
                                    alignment: Alignment.centerRight,
                                    child: OutlinedButton.icon(
                                      onPressed: () async {
                                        await widget.api.saveRoute(
                                          name: (rt['name'] ?? 'Saved Route').toString(),
                                          activityType: (rt['activityType'] ?? 'run').toString(),
                                          distanceM: ((rt['distanceM'] as num?) ?? 0).toDouble(),
                                          elevationGainM: ((rt['elevationGainM'] as num?) ?? 0).toDouble(),
                                          encodedPolyline: (rt['encodedPolyline'] ?? '').toString(),
                                        );
                                        if (context.mounted) {
                                          ScaffoldMessenger.of(context).showSnackBar(
                                            const SnackBar(content: Text('Route saved to your library')),
                                          );
                                        }
                                      },
                                      icon: const Icon(Icons.bookmark_add_outlined, size: 18),
                                      label: Text(l10n.saveRouteLabel),
                                    ),
                                  ),
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

class SegmentDetailScreen extends StatefulWidget {
  final StrideApiClient api;
  final String segmentId;
  final String segmentTitle;

  const SegmentDetailScreen({
    super.key,
    required this.api,
    required this.segmentId,
    required this.segmentTitle,
  });

  @override
  State<SegmentDetailScreen> createState() => _SegmentDetailScreenState();
}

class _SegmentDetailScreenState extends State<SegmentDetailScreen> {
  String _range = 'all';
  bool _loading = true;
  Map<String, dynamic>? _segment;
  List<Map<String, dynamic>> _entries = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final segRes = await widget.api.fetchSegmentDetail(widget.segmentId);
      final lb = await widget.api.fetchSegmentLeaderboard(widget.segmentId, range: _range);
      setState(() {
        _segment = segRes['segment'] as Map<String, dynamic>?;
        _entries = lb.whereType<Map<String, dynamic>>().toList();
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(title: Text(widget.segmentTitle)),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (_segment != null) ...[
            RoutePolylinePreview(
              encodedPolyline: (_segment!['encoded_polyline'] ?? '').toString(),
              height: 160,
            ),
            const SizedBox(height: 12),
          ],
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'all', label: Text('All Time')),
              ButtonSegment(value: 'year', label: Text('Year')),
              ButtonSegment(value: 'month', label: Text('Month')),
              ButtonSegment(value: 'following', label: Text('Following')),
            ],
            selected: {_range},
            onSelectionChanged: (sel) {
              setState(() => _range = sel.first);
              _load();
            },
          ),
          const SizedBox(height: 16),
          Text(l10n.leaderboardTitle, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          if (_loading)
            const Padding(padding: EdgeInsets.all(32), child: Center(child: CircularProgressIndicator()))
          else if (_entries.isEmpty)
            Padding(padding: const EdgeInsets.all(24), child: Center(child: Text(l10n.noItemsYet)))
          else
            ..._entries.map((entry) {
              final sec = ((entry['elapsed_time_s'] as num?) ?? 0).round();
              return Card(
                margin: const EdgeInsets.only(bottom: 8),
                child: ListTile(
                  leading: CircleAvatar(
                    child: Text('#${entry['rank'] ?? ''}'),
                  ),
                  title: Text((entry['display_name'] ?? entry['handle'] ?? '').toString()),
                  subtitle: Text('@${entry['handle'] ?? ''} · ${sec ~/ 60}:${(sec % 60).toString().padLeft(2, '0')}'),
                  trailing: IconButton(
                    icon: const Icon(Icons.flag_outlined),
                    tooltip: l10n.flagEffort,
                    onPressed: () async {
                      await widget.api.flagSegmentEffort(
                        entry['effort_id'].toString(),
                        'Flagged from mobile app leaderboard',
                      );
                      if (context.mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Submitted effort review report')),
                        );
                      }
                    },
                  ),
                ),
              );
            }),
        ],
      ),
    );
  }
}
