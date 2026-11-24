import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../core/api/stride_api_client.dart';
import '../../l10n/app_localizations.dart';
import '../../theme/stride_theme.dart';
import '../../widgets/route_visuals.dart';

class ActivityDetailScreen extends StatefulWidget {
  final StrideApiClient api;
  final String activityId;

  const ActivityDetailScreen({
    super.key,
    required this.api,
    required this.activityId,
  });

  @override
  State<ActivityDetailScreen> createState() => _ActivityDetailScreenState();
}

class _ActivityDetailScreenState extends State<ActivityDetailScreen> {
  bool _loading = true;
  Map<String, dynamic>? _activity;
  List<Map<String, dynamic>> _efforts = [];
  List<Map<String, dynamic>> _comments = [];
  double _replayProgress = 0.0;
  final _commentCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _commentCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final res = await widget.api.fetchActivityDetail(widget.activityId);
      setState(() {
        _activity = res['activity'] as Map<String, dynamic>?;
        _efforts = ((res['segmentEfforts'] as List<dynamic>?) ?? []).whereType<Map<String, dynamic>>().toList();
        _comments = ((res['comments'] as List<dynamic>?) ?? []).whereType<Map<String, dynamic>>().toList();
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _shareGpx() async {
    final xml = await widget.api.fetchActivityGpx(widget.activityId);
    if (xml.isEmpty) return;
    final subject = '${_activity?['title'] ?? 'Stride Activity'}.gpx';
    try {
      await const MethodChannel('com.stride.tracker/share').invokeMethod<void>(
        'shareText',
        {'text': xml, 'subject': subject},
      );
    } catch (_) {
      await Clipboard.setData(ClipboardData(text: xml));
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('GPX copied to clipboard')),
        );
      }
    }
  }

  Future<void> _openCreateSegmentDialog(int maxPointIdx) async {
    final l10n = AppLocalizations.of(context)!;
    final nameCtrl = TextEditingController();
    int startIdx = 0;
    int endIdx = maxPointIdx.clamp(3, 100);

    await showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: Text(l10n.createSegment),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: nameCtrl,
                decoration: const InputDecoration(labelText: 'Segment Name', border: OutlineInputBorder()),
              ),
              const SizedBox(height: 12),
              Text('Points range: $startIdx → $endIdx'),
              RangeSlider(
                values: RangeValues(startIdx.toDouble(), endIdx.toDouble()),
                min: 0,
                max: maxPointIdx.toDouble().clamp(4, 10000),
                onChanged: (v) {
                  setDialogState(() {
                    startIdx = v.start.round();
                    endIdx = v.end.round();
                  });
                },
              ),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: Text(l10n.discard)),
            FilledButton(
              onPressed: () async {
                if (nameCtrl.text.trim().isEmpty) return;
                try {
                  await widget.api.createSegment(
                    activityId: widget.activityId,
                    name: nameCtrl.text.trim(),
                    startIndex: startIdx,
                    endIndex: endIdx,
                  );
                  if (ctx.mounted) Navigator.pop(ctx);
                  _load();
                } catch (e) {
                  if (ctx.mounted) {
                    ScaffoldMessenger.of(ctx).showSnackBar(SnackBar(content: Text(e.toString())));
                  }
                }
              },
              child: Text(l10n.createSegment),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    if (_loading || _activity == null) {
      return Scaffold(
        appBar: AppBar(title: Text(l10n.appTitle)),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    final a = _activity!;
    final distKm = (((a['distanceM'] as num?) ?? 0) / 1000).toStringAsFixed(2);
    final movingS = ((a['movingTimeS'] as num?) ?? 0).toInt();
    final elevM = ((a['elevationGainM'] as num?) ?? 0).round();
    final cals = ((a['caloriesEstimate'] as num?) ?? 0).round();
    final canEdit = a['canEdit'] == true;
    final splits = ((a['splitsKm'] as List<dynamic>?) ?? []).whereType<Map<String, dynamic>>().toList();
    final points = ((a['points'] as List<dynamic>?) ?? []).whereType<Map<String, dynamic>>().toList();
    final stream = a['stream'] as Map<String, dynamic>?;
    final elevSeries = ((stream?['elevations'] as List<dynamic>?) ??
            points.map((p) => (p['ele'] as num?)?.toDouble() ?? 0.0).toList())
        .map((e) => (e as num).toDouble())
        .toList();

    return Scaffold(
      appBar: AppBar(
        title: Text((a['title'] ?? 'Activity').toString()),
        actions: [
          IconButton(
            onPressed: _shareGpx,
            icon: const Icon(Icons.ios_share),
            tooltip: l10n.shareGpx,
          ),
          if (canEdit)
            IconButton(
              icon: const Icon(Icons.delete_outline),
              onPressed: () async {
                await widget.api.deleteActivity(widget.activityId);
                if (context.mounted) Navigator.pop(context, true);
              },
              tooltip: l10n.deleteActivity,
            ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          RoutePolylinePreview(
            encodedPolyline: (a['encodedPolyline'] ?? '').toString(),
            height: 200,
            progressRatio: _replayProgress,
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              const Text('Replay', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
              Expanded(
                child: Slider(
                  value: _replayProgress,
                  onChanged: (v) => setState(() => _replayProgress = v),
                ),
              ),
            ],
          ),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      _MetricCell(label: l10n.distanceLabel, value: '$distKm km'),
                      _MetricCell(label: l10n.movingTimeLabel, value: '${movingS ~/ 60}:${(movingS % 60).toString().padLeft(2, '0')}'),
                      _MetricCell(label: l10n.elevationLabel, value: '+$elevM m'),
                      _MetricCell(label: l10n.caloriesLabel, value: '~$cals'),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(l10n.calorieEstimateNote, style: Theme.of(context).textTheme.bodySmall),
                ],
              ),
            ),
          ),
          if (canEdit) ...[
            const SizedBox(height: 12),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(l10n.visibilityLabel, style: const TextStyle(fontWeight: FontWeight.bold)),
                    DropdownButton<String>(
                      value: (a['visibility'] ?? 'followers').toString(),
                      items: [
                        DropdownMenuItem(value: 'public', child: Text(l10n.visibilityPublic)),
                        DropdownMenuItem(value: 'followers', child: Text(l10n.visibilityFollowers)),
                        DropdownMenuItem(value: 'private', child: Text(l10n.visibilityPrivate)),
                      ],
                      onChanged: (val) async {
                        if (val == null) return;
                        await widget.api.updateActivityVisibility(widget.activityId, val);
                        _load();
                      },
                    ),
                  ],
                ),
              ),
            ),
            if (points.length >= 4) ...[
              const SizedBox(height: 10),
              OutlinedButton.icon(
                onPressed: () => _openCreateSegmentDialog(points.length - 1),
                icon: const Icon(Icons.flag_outlined),
                label: Text(l10n.createSegment),
              ),
            ],
          ],
          if (elevSeries.length >= 2) ...[
            const SizedBox(height: 16),
            Text(l10n.elevationProfileTitle, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: ElevationProfileChart(elevations: elevSeries, progressRatio: _replayProgress),
              ),
            ),
          ],
          if (_efforts.isNotEmpty) ...[
            const SizedBox(height: 16),
            Text(l10n.segmentsMatchedTitle, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            ..._efforts.map(
              (ef) => Card(
                child: ListTile(
                  leading: Icon(
                    Icons.emoji_events,
                    color: ef['is_pr'] == true ? StrideTokens.warning : null,
                  ),
                  title: Text((ef['segment_name'] ?? 'Segment').toString()),
                  subtitle: Text('${(((ef['segment_distance_m'] as num?) ?? 0) / 1000).toStringAsFixed(2)} km'),
                  trailing: Text(
                    '${((ef['elapsed_time_s'] as num?) ?? 0).toInt()}s',
                    style: const TextStyle(fontWeight: FontWeight.bold),
                  ),
                ),
              ),
            ),
          ],
          if (splits.isNotEmpty) ...[
            const SizedBox(height: 16),
            Text(l10n.splitsTitle, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  children: splits.map((sp) {
                    final sec = ((sp['durationS'] as num?) ?? 0).round();
                    return Padding(
                      padding: const EdgeInsets.symmetric(vertical: 4),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text('KM ${sp['splitIndex'] ?? ''}'),
                          Text('${sec ~/ 60}:${(sec % 60).toString().padLeft(2, '0')} /km'),
                        ],
                      ),
                    );
                  }).toList(),
                ),
              ),
            ),
          ],
          const SizedBox(height: 16),
          Text(l10n.commentsLabel, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          ..._comments.map(
            (cm) => ListTile(
              dense: true,
              contentPadding: EdgeInsets.zero,
              title: Text((cm['display_name'] ?? cm['handle'] ?? 'Athlete').toString(), style: const TextStyle(fontWeight: FontWeight.bold)),
              subtitle: Text((cm['body'] ?? '').toString()),
            ),
          ),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _commentCtrl,
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
                  final text = _commentCtrl.text.trim();
                  if (text.isEmpty) return;
                  await widget.api.addComment(widget.activityId, text);
                  _commentCtrl.clear();
                  _load();
                },
                child: Text(l10n.sendLabel),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _MetricCell extends StatelessWidget {
  final String label;
  final String value;
  const _MetricCell({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: Theme.of(context).textTheme.bodySmall),
        const SizedBox(height: 2),
        Text(value, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold)),
      ],
    );
  }
}
