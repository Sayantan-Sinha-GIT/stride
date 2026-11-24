import 'dart:convert';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:uuid/uuid.dart';
import '../../core/location/recording_controller.dart';
import '../../core/track_processor/track_processor.dart';
import '../../l10n/app_localizations.dart';
import '../../widgets/route_visuals.dart';

class RecordScreen extends StatefulWidget {
  final RecordingController controller;
  const RecordScreen({super.key, required this.controller});

  @override
  State<RecordScreen> createState() => _RecordScreenState();
}

class _RecordScreenState extends State<RecordScreen> {
  final _titleCtrl = TextEditingController();
  bool _checkedDraft = false;
  bool _importing = false;

  @override
  void initState() {
    super.initState();
    _checkRecovery();
  }

  @override
  void dispose() {
    _titleCtrl.dispose();
    super.dispose();
  }

  Future<void> _checkRecovery() async {
    if (_checkedDraft) return;
    _checkedDraft = true;
    final draft = await widget.controller.checkUnfinishedDraft();
    if (draft != null && mounted) {
      final l10n = AppLocalizations.of(context)!;
      showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Text(l10n.recoveryTitle),
          content: Text('${l10n.recoveryBody} (${draft.points.length} GPS pts)'),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.pop(ctx);
                widget.controller.discardDraft(draft.clientId);
              },
              child: Text(l10n.discard),
            ),
            FilledButton(
              onPressed: () {
                Navigator.pop(ctx);
                widget.controller.recoverDraft(draft);
              },
              child: Text(l10n.recover),
            ),
          ],
        ),
      );
    }
  }

  Future<bool> _ensureLocationPermissions() async {
    final l10n = AppLocalizations.of(context)!;
    final fg = await Permission.locationWhenInUse.status;
    if (!fg.isGranted) {
      if (!mounted) return false;
      final proceed = await showModalBottomSheet<bool>(
        context: context,
        builder: (ctx) => Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(l10n.permissionRationaleTitle, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              Text(l10n.permissionRationaleBody),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                height: 48,
                child: FilledButton(
                  onPressed: () => Navigator.pop(ctx, true),
                  child: Text(l10n.grantPermissions),
                ),
              ),
            ],
          ),
        ),
      );
      if (proceed != true) return false;
      final reqFg = await Permission.locationWhenInUse.request();
      if (!reqFg.isGranted) return false;
    }

    if (await Permission.locationAlways.isDenied) {
      await Permission.locationAlways.request();
    }
    if (await Permission.notification.isDenied) {
      await Permission.notification.request();
    }
    return true;
  }

  Future<void> _importGpxFile() async {
    setState(() => _importing = true);
    try {
      final file = await FilePicker.pickFile(
        type: FileType.custom,
        allowedExtensions: ['gpx', 'xml'],
      );
      if (file == null) return;
      final bytes = await file.readAsBytes();
      final xml = utf8.decode(bytes);
      await widget.controller.api.importGpxXml(
        gpxXml: xml,
        activityType: widget.controller.state.activityType.name,
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('GPX imported & matched segments!')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('GPX import failed: $e')));
      }
    } finally {
      if (mounted) setState(() => _importing = false);
    }
  }

  Future<void> _openManualModal() async {
    final l10n = AppLocalizations.of(context)!;
    final titleCtrl = TextEditingController(text: 'Indoor / Manual Workout');
    final distKmCtrl = TextEditingController(text: '5.0');
    final minCtrl = TextEditingController(text: '28');
    final elevCtrl = TextEditingController(text: '45');

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(ctx).viewInsets.bottom + 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(l10n.manualEntry, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 12),
            TextField(controller: titleCtrl, decoration: const InputDecoration(labelText: 'Title', border: OutlineInputBorder())),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(child: TextField(controller: distKmCtrl, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Distance (km)', border: OutlineInputBorder()))),
                const SizedBox(width: 8),
                Expanded(child: TextField(controller: minCtrl, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Duration (min)', border: OutlineInputBorder()))),
                const SizedBox(width: 8),
                Expanded(child: TextField(controller: elevCtrl, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Elev (m)', border: OutlineInputBorder()))),
              ],
            ),
            const SizedBox(height: 14),
            SizedBox(
              height: 48,
              child: FilledButton(
                onPressed: () async {
                  await widget.controller.api.createManualActivity(
                    clientId: const Uuid().v4(),
                    title: titleCtrl.text.trim(),
                    activityType: widget.controller.state.activityType.name,
                    durationS: (int.tryParse(minCtrl.text) ?? 20) * 60,
                    distanceM: (double.tryParse(distKmCtrl.text) ?? 5.0) * 1000,
                    elevationGainM: double.tryParse(elevCtrl.text) ?? 0,
                  );
                  if (ctx.mounted) Navigator.pop(ctx);
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Manual workout saved!')),
                    );
                  }
                },
                child: Text(l10n.stopAndSave),
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return AnimatedBuilder(
      animation: widget.controller,
      builder: (context, _) {
        final s = widget.controller.state;
        final distKm = ((s.processed?.distanceM ?? 0) / 1000).toStringAsFixed(2);
        final durMin = ((s.processed?.movingTimeS ?? 0) ~/ 60).toString().padLeft(2, '0');
        final durSec = ((s.processed?.movingTimeS ?? 0) % 60).toString().padLeft(2, '0');
        final avgMps = s.currentSpeedMps > 0.2 ? s.currentSpeedMps : (s.processed?.avgSpeedMps ?? 0);
        String paceLabel = '--';
        if (avgMps > 0.3) {
          if (s.activityType == ActivityType.ride) {
            paceLabel = '${(avgMps * 3.6).toStringAsFixed(1)} km/h';
          } else {
            final secPerKm = (1000 / avgMps).round();
            paceLabel = '${secPerKm ~/ 60}:${(secPerKm % 60).toString().padLeft(2, '0')} /km';
          }
        }
        final latestPt = s.points.isNotEmpty ? s.points.last : null;
        final phaseLabel = switch (s.phase) {
          RecordingPhase.idle => 'READY',
          RecordingPhase.recording => s.simMode ? 'SIMULATOR LIVE' : 'LIVE GPS',
          RecordingPhase.paused => 'PAUSED',
          RecordingPhase.autoPaused => 'AUTO-PAUSED',
        };
        final phaseColor = switch (s.phase) {
          RecordingPhase.idle => Colors.blueGrey,
          RecordingPhase.recording => const Color(0xFF18B87A),
          RecordingPhase.paused => const Color(0xFFF59E0B),
          RecordingPhase.autoPaused => const Color(0xFFF59E0B),
        };

        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Row(
                  children: [
                    const Icon(Icons.health_and_safety_outlined),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(l10n.safetyTitle, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                          Text(l10n.safetyBody, style: const TextStyle(fontSize: 12)),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            RoutePolylinePreview(rawPoints: s.points, height: 155),
            const SizedBox(height: 12),
            SegmentedButton<ActivityType>(
              segments: const [
                ButtonSegment(value: ActivityType.run, label: Text('Run')),
                ButtonSegment(value: ActivityType.ride, label: Text('Ride')),
                ButtonSegment(value: ActivityType.walk, label: Text('Walk')),
                ButtonSegment(value: ActivityType.hike, label: Text('Hike')),
              ],
              selected: {s.activityType},
              onSelectionChanged: (sel) => widget.controller.setActivityType(sel.first),
            ),
            const SizedBox(height: 8),
            SwitchListTile(
              title: Text(l10n.autoPause),
              value: s.autoPauseEnabled,
              onChanged: widget.controller.toggleAutoPause,
            ),
            SwitchListTile(
              title: Text(l10n.devSimulator),
              subtitle: const Text('Emit realistic Cubbon Park GPS points indoors'),
              value: s.simMode,
              onChanged: widget.controller.toggleSimMode,
            ),
            const SizedBox(height: 8),
            Card(
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 18, horizontal: 16),
                child: Column(
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: phaseColor.withValues(alpha: 0.16),
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(color: phaseColor.withValues(alpha: 0.5)),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.circle, size: 8, color: phaseColor),
                              const SizedBox(width: 6),
                              Text(
                                phaseLabel,
                                style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: phaseColor),
                              ),
                            ],
                          ),
                        ),
                        if (latestPt != null)
                          Text(
                            'GPS ${latestPt.lat.toStringAsFixed(4)}, ${latestPt.lng.toStringAsFixed(4)}',
                            style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600),
                          ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    Text('$distKm km', style: const TextStyle(fontSize: 38, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 10),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                      children: [
                        Column(children: [Text(l10n.movingTimeLabel), Text('$durMin:$durSec', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700))]),
                        Column(children: [const Text('Pace / Speed'), Text(paceLabel, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700))]),
                        Column(children: [Text(l10n.elevationLabel), Text('${(s.processed?.elevationGainM ?? 0).round()} m', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700))]),
                        Column(children: [const Text('Pts'), Text('${s.points.length}', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700))]),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 14),
            if (s.phase == RecordingPhase.idle) ...[
              SizedBox(
                height: 54,
                child: FilledButton.icon(
                  icon: const Icon(Icons.play_arrow),
                  label: Text(l10n.startRecording),
                  onPressed: () async {
                    if (!s.simMode) {
                      final ok = await _ensureLocationPermissions();
                      if (!ok) return;
                    }
                    await widget.controller.start(useSimulator: s.simMode);
                  },
                ),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: SizedBox(
                      height: 46,
                      child: OutlinedButton.icon(
                        onPressed: _importing ? null : _importGpxFile,
                        icon: const Icon(Icons.upload_file, size: 18),
                        label: Text(l10n.importGpx),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: SizedBox(
                      height: 46,
                      child: OutlinedButton.icon(
                        onPressed: _openManualModal,
                        icon: const Icon(Icons.edit_note, size: 18),
                        label: Text(l10n.manualEntry),
                      ),
                    ),
                  ),
                ],
              ),
            ] else ...[
              TextField(
                controller: _titleCtrl,
                decoration: const InputDecoration(labelText: 'Activity Title', border: OutlineInputBorder()),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: SizedBox(
                      height: 52,
                      child: OutlinedButton(
                        onPressed: () => s.phase == RecordingPhase.paused
                            ? widget.controller.resume()
                            : widget.controller.pause(),
                        child: Text(s.phase == RecordingPhase.paused ? l10n.resumeRecording : l10n.pauseRecording),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: SizedBox(
                      height: 52,
                      child: FilledButton(
                        onPressed: s.points.length < 2
                            ? null
                            : () async {
                                final synced = await widget.controller.stopAndSave(title: _titleCtrl.text);
                                if (context.mounted) {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    SnackBar(
                                      content: Text(synced ? 'Saved & synced!' : 'Saved offline; will auto-retry sync.'),
                                    ),
                                  );
                                }
                              },
                        child: Text(l10n.stopAndSave),
                      ),
                    ),
                  ),
                ],
              ),
            ],
            if (s.pendingOfflineCount > 0) ...[
              const SizedBox(height: 12),
              OutlinedButton.icon(
                icon: const Icon(Icons.sync),
                label: Text('Sync ${s.pendingOfflineCount} Offline Activity'),
                onPressed: widget.controller.syncPendingQueue,
              ),
            ],
          ],
        );
      },
    );
  }
}
