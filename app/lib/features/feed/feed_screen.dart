import 'package:flutter/material.dart';
import '../../core/api/stride_api_client.dart';
import '../../l10n/app_localizations.dart';
import '../../theme/stride_theme.dart';
import '../../widgets/route_visuals.dart';
import '../activities/activity_detail_screen.dart';

class FeedScreen extends StatefulWidget {
  final StrideApiClient api;
  const FeedScreen({super.key, required this.api});

  @override
  State<FeedScreen> createState() => _FeedScreenState();
}

class _FeedScreenState extends State<FeedScreen> {
  String _scope = 'following';
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _items = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final raw = await widget.api.fetchFeed(scope: _scope);
      setState(() {
        _items = raw.whereType<Map<String, dynamic>>().toList();
      });
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _toggleKudos(int index) async {
    final item = _items[index];
    final id = item['id'].toString();
    final liked = item['viewerHasKudos'] == true;
    try {
      final res = await widget.api.toggleKudos(id, liked: liked);
      setState(() {
        _items[index] = {
          ...item,
          'kudosCount': res['kudosCount'] ?? item['kudosCount'],
          'viewerHasKudos': res['viewerHasKudos'] ?? !liked,
        };
      });
    } catch (_) {}
  }

  Future<void> _openCommentsSheet(int index) async {
    final l10n = AppLocalizations.of(context)!;
    final item = _items[index];
    final id = item['id'].toString();
    final ctrl = TextEditingController();
    List<Map<String, dynamic>> comments = [];
    try {
      final detail = await widget.api.fetchActivityDetail(id);
      comments = ((detail['comments'] as List<dynamic>?) ?? []).whereType<Map<String, dynamic>>().toList();
    } catch (_) {}
    if (!mounted) return;

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheetState) => Padding(
          padding: EdgeInsets.fromLTRB(16, 16, 16, MediaQuery.of(ctx).viewInsets.bottom + 16),
          child: SizedBox(
            height: 360,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(l10n.commentsLabel, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                const SizedBox(height: 10),
                Expanded(
                  child: comments.isEmpty
                      ? Center(child: Text(l10n.noItemsYet))
                      : ListView.separated(
                          itemCount: comments.length,
                          separatorBuilder: (_, __) => const Divider(height: 12),
                          itemBuilder: (_, idx) {
                            final cm = comments[idx];
                            return ListTile(
                              dense: true,
                              contentPadding: EdgeInsets.zero,
                              title: Text(
                                '${cm['display_name'] ?? cm['handle'] ?? 'Athlete'}',
                                style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                              ),
                              subtitle: Text((cm['body'] ?? '').toString()),
                            );
                          },
                        ),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: ctrl,
                        decoration: InputDecoration(
                          hintText: l10n.addCommentHint,
                          border: const OutlineInputBorder(),
                          isDense: true,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    FilledButton(
                      onPressed: () async {
                        final text = ctrl.text.trim();
                        if (text.isEmpty) return;
                        final res = await widget.api.addComment(id, text);
                        final created = res['comment'];
                        ctrl.clear();
                        setSheetState(() {
                          if (created is Map<String, dynamic>) comments.add(created);
                        });
                        setState(() {
                          _items[index] = {
                            ...item,
                            'commentCount': ((item['commentCount'] as num?) ?? 0).toInt() + 1,
                          };
                        });
                      },
                      child: Text(l10n.sendLabel),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  String _formatDuration(int sec) {
    final h = sec ~/ 3600;
    final m = (sec % 3600) ~/ 60;
    final s = sec % 60;
    if (h > 0) return '${h}h ${m.toString().padLeft(2, '0')}m';
    return '$m:${s.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        children: [
          SegmentedButton<String>(
            segments: [
              ButtonSegment(value: 'following', label: Text(l10n.followingScope)),
              ButtonSegment(value: 'public', label: Text(l10n.publicScope)),
              ButtonSegment(value: 'mine', label: Text(l10n.myActivitiesScope)),
            ],
            selected: {_scope},
            onSelectionChanged: (sel) {
              setState(() => _scope = sel.first);
              _load();
            },
          ),
          const SizedBox(height: 14),
          if (_loading)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 48),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (_error != null)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  children: [
                    Text(_error!),
                    const SizedBox(height: 8),
                    FilledButton(onPressed: _load, child: const Text('Retry')),
                  ],
                ),
              ),
            )
          else if (_items.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 48),
              child: Center(child: Text(l10n.noItemsYet)),
            )
          else
            ...List.generate(_items.length, (idx) {
              final item = _items[idx];
              final author = item['author'] as Map<String, dynamic>?;
              final distKm = (((item['distanceM'] as num?) ?? 0) / 1000).toStringAsFixed(2);
              final movingS = ((item['movingTimeS'] as num?) ?? 0).toInt();
              final elevM = ((item['elevationGainM'] as num?) ?? 0).round();
              final liked = item['viewerHasKudos'] == true;
              final kudos = ((item['kudosCount'] as num?) ?? 0).toInt();
              final comments = ((item['commentCount'] as num?) ?? 0).toInt();

              return Card(
                margin: const EdgeInsets.only(bottom: 14),
                child: InkWell(
                  borderRadius: BorderRadius.circular(14),
                  onTap: () async {
                    final changed = await Navigator.push<bool>(
                      context,
                      MaterialPageRoute(
                        builder: (_) => ActivityDetailScreen(
                          api: widget.api,
                          activityId: item['id'].toString(),
                        ),
                      ),
                    );
                    if (changed == true) _load();
                  },
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            CircleAvatar(
                              backgroundColor: Theme.of(context).colorScheme.primary.withValues(alpha: 0.16),
                              foregroundColor: Theme.of(context).colorScheme.primary,
                              child: Icon(
                                item['activityType'] == 'ride'
                                    ? Icons.directions_bike
                                    : item['activityType'] == 'hike'
                                        ? Icons.terrain
                                        : Icons.directions_run,
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    (author?['displayName'] ?? author?['handle'] ?? 'Athlete').toString(),
                                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                                  ),
                                  Text(
                                    '@${author?['handle'] ?? ''} · ${(item['activityType'] ?? 'run').toString().toUpperCase()}',
                                    style: Theme.of(context).textTheme.bodySmall,
                                  ),
                                ],
                              ),
                            ),
                            if (item['privacyClipped'] == true)
                              Chip(
                                label: const Text('Shielded', style: TextStyle(fontSize: 11)),
                                avatar: const Icon(Icons.shield, size: 15, color: StrideTokens.success),
                                visualDensity: VisualDensity.compact,
                              ),
                          ],
                        ),
                        const SizedBox(height: 10),
                        Text(
                          (item['title'] ?? 'Activity').toString(),
                          style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
                        ),
                        const SizedBox(height: 10),
                        RoutePolylinePreview(
                          encodedPolyline: (item['encodedPolyline'] ?? '').toString(),
                          height: 132,
                        ),
                        const SizedBox(height: 12),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            _StatCol(label: l10n.distanceLabel, value: '$distKm km'),
                            _StatCol(label: l10n.movingTimeLabel, value: _formatDuration(movingS)),
                            _StatCol(label: l10n.elevationLabel, value: '+$elevM m'),
                          ],
                        ),
                        const Divider(height: 22),
                        Row(
                          children: [
                            TextButton.icon(
                              onPressed: () => _toggleKudos(idx),
                              icon: Icon(
                                liked ? Icons.favorite : Icons.favorite_border,
                                size: 18,
                                color: liked ? Theme.of(context).colorScheme.primary : null,
                              ),
                              label: Text('$kudos ${l10n.kudosLabel}'),
                            ),
                            const SizedBox(width: 8),
                            TextButton.icon(
                              onPressed: () => _openCommentsSheet(idx),
                              icon: const Icon(Icons.chat_bubble_outline, size: 18),
                              label: Text('$comments ${l10n.commentsLabel}'),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              );
            }),
        ],
      ),
    );
  }
}

class _StatCol extends StatelessWidget {
  final String label;
  final String value;
  const _StatCol({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: Theme.of(context).textTheme.bodySmall),
        const SizedBox(height: 2),
        Text(value, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
      ],
    );
  }
}
