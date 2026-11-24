import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_en.dart';
import 'app_localizations_hi.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'l10n/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale)
      : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations? of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations);
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
    delegate,
    GlobalMaterialLocalizations.delegate,
    GlobalCupertinoLocalizations.delegate,
    GlobalWidgetsLocalizations.delegate,
  ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('en'),
    Locale('hi')
  ];

  /// No description provided for @appTitle.
  ///
  /// In en, this message translates to:
  /// **'Stride'**
  String get appTitle;

  /// No description provided for @tabFeed.
  ///
  /// In en, this message translates to:
  /// **'Feed'**
  String get tabFeed;

  /// No description provided for @tabExplore.
  ///
  /// In en, this message translates to:
  /// **'Explore'**
  String get tabExplore;

  /// No description provided for @tabRecord.
  ///
  /// In en, this message translates to:
  /// **'Record'**
  String get tabRecord;

  /// No description provided for @tabClubs.
  ///
  /// In en, this message translates to:
  /// **'Clubs'**
  String get tabClubs;

  /// No description provided for @tabProfile.
  ///
  /// In en, this message translates to:
  /// **'Profile'**
  String get tabProfile;

  /// No description provided for @startRecording.
  ///
  /// In en, this message translates to:
  /// **'Start Recording'**
  String get startRecording;

  /// No description provided for @pauseRecording.
  ///
  /// In en, this message translates to:
  /// **'Pause'**
  String get pauseRecording;

  /// No description provided for @resumeRecording.
  ///
  /// In en, this message translates to:
  /// **'Resume'**
  String get resumeRecording;

  /// No description provided for @stopAndSave.
  ///
  /// In en, this message translates to:
  /// **'Stop & Save'**
  String get stopAndSave;

  /// No description provided for @discard.
  ///
  /// In en, this message translates to:
  /// **'Discard'**
  String get discard;

  /// No description provided for @autoPause.
  ///
  /// In en, this message translates to:
  /// **'Auto-Pause'**
  String get autoPause;

  /// No description provided for @devSimulator.
  ///
  /// In en, this message translates to:
  /// **'GPS Simulator (Dev)'**
  String get devSimulator;

  /// No description provided for @safetyTitle.
  ///
  /// In en, this message translates to:
  /// **'Stay Aware Outdoors'**
  String get safetyTitle;

  /// No description provided for @safetyBody.
  ///
  /// In en, this message translates to:
  /// **'Obey traffic signals, watch road crossings, and wear visible gear in low light.'**
  String get safetyBody;

  /// No description provided for @recoveryTitle.
  ///
  /// In en, this message translates to:
  /// **'Unfinished Activity Detected'**
  String get recoveryTitle;

  /// No description provided for @recoveryBody.
  ///
  /// In en, this message translates to:
  /// **'We found an unsaved recording from before the app closed. Would you like to recover it?'**
  String get recoveryBody;

  /// No description provided for @recover.
  ///
  /// In en, this message translates to:
  /// **'Recover'**
  String get recover;

  /// No description provided for @permissionRationaleTitle.
  ///
  /// In en, this message translates to:
  /// **'Background Location & Notification Access'**
  String get permissionRationaleTitle;

  /// No description provided for @permissionRationaleBody.
  ///
  /// In en, this message translates to:
  /// **'Stride needs background GPS permission and a foreground notification so your distance and pace stay accurate even when your phone screen turns off.'**
  String get permissionRationaleBody;

  /// No description provided for @grantPermissions.
  ///
  /// In en, this message translates to:
  /// **'Continue'**
  String get grantPermissions;

  /// No description provided for @calorieEstimateNote.
  ///
  /// In en, this message translates to:
  /// **'Estimated using MET formula (for reference only).'**
  String get calorieEstimateNote;

  /// No description provided for @signIn.
  ///
  /// In en, this message translates to:
  /// **'Sign In'**
  String get signIn;

  /// No description provided for @signUp.
  ///
  /// In en, this message translates to:
  /// **'Create Account'**
  String get signUp;

  /// No description provided for @emailLabel.
  ///
  /// In en, this message translates to:
  /// **'Email'**
  String get emailLabel;

  /// No description provided for @passwordLabel.
  ///
  /// In en, this message translates to:
  /// **'Password'**
  String get passwordLabel;

  /// No description provided for @displayNameLabel.
  ///
  /// In en, this message translates to:
  /// **'Display Name'**
  String get displayNameLabel;

  /// No description provided for @handleLabel.
  ///
  /// In en, this message translates to:
  /// **'Handle (username)'**
  String get handleLabel;

  /// No description provided for @continueWithGoogle.
  ///
  /// In en, this message translates to:
  /// **'Continue with Google'**
  String get continueWithGoogle;

  /// No description provided for @quickDemoAthlete.
  ///
  /// In en, this message translates to:
  /// **'Demo Athlete Login'**
  String get quickDemoAthlete;

  /// No description provided for @forgotPassword.
  ///
  /// In en, this message translates to:
  /// **'Forgot Password?'**
  String get forgotPassword;

  /// No description provided for @resetPasswordSent.
  ///
  /// In en, this message translates to:
  /// **'Password reset instructions sent if the account exists.'**
  String get resetPasswordSent;

  /// No description provided for @serverUrlConfig.
  ///
  /// In en, this message translates to:
  /// **'Server URL Settings'**
  String get serverUrlConfig;

  /// No description provided for @followingScope.
  ///
  /// In en, this message translates to:
  /// **'Following'**
  String get followingScope;

  /// No description provided for @publicScope.
  ///
  /// In en, this message translates to:
  /// **'Explore'**
  String get publicScope;

  /// No description provided for @myActivitiesScope.
  ///
  /// In en, this message translates to:
  /// **'My Activities'**
  String get myActivitiesScope;

  /// No description provided for @kudosLabel.
  ///
  /// In en, this message translates to:
  /// **'Kudos'**
  String get kudosLabel;

  /// No description provided for @commentsLabel.
  ///
  /// In en, this message translates to:
  /// **'Comments'**
  String get commentsLabel;

  /// No description provided for @addCommentHint.
  ///
  /// In en, this message translates to:
  /// **'Add encouragement or split feedback...'**
  String get addCommentHint;

  /// No description provided for @sendLabel.
  ///
  /// In en, this message translates to:
  /// **'Post'**
  String get sendLabel;

  /// No description provided for @noItemsYet.
  ///
  /// In en, this message translates to:
  /// **'Nothing here yet.'**
  String get noItemsYet;

  /// No description provided for @distanceLabel.
  ///
  /// In en, this message translates to:
  /// **'Distance'**
  String get distanceLabel;

  /// No description provided for @movingTimeLabel.
  ///
  /// In en, this message translates to:
  /// **'Moving Time'**
  String get movingTimeLabel;

  /// No description provided for @paceSpeedLabel.
  ///
  /// In en, this message translates to:
  /// **'Pace / Speed'**
  String get paceSpeedLabel;

  /// No description provided for @elevationLabel.
  ///
  /// In en, this message translates to:
  /// **'Elev Gain'**
  String get elevationLabel;

  /// No description provided for @caloriesLabel.
  ///
  /// In en, this message translates to:
  /// **'Calories'**
  String get caloriesLabel;

  /// No description provided for @splitsTitle.
  ///
  /// In en, this message translates to:
  /// **'Per-km Splits'**
  String get splitsTitle;

  /// No description provided for @elevationProfileTitle.
  ///
  /// In en, this message translates to:
  /// **'Elevation Profile'**
  String get elevationProfileTitle;

  /// No description provided for @segmentsMatchedTitle.
  ///
  /// In en, this message translates to:
  /// **'Matched Segments'**
  String get segmentsMatchedTitle;

  /// No description provided for @visibilityLabel.
  ///
  /// In en, this message translates to:
  /// **'Visibility'**
  String get visibilityLabel;

  /// No description provided for @visibilityPublic.
  ///
  /// In en, this message translates to:
  /// **'Public'**
  String get visibilityPublic;

  /// No description provided for @visibilityFollowers.
  ///
  /// In en, this message translates to:
  /// **'Followers'**
  String get visibilityFollowers;

  /// No description provided for @visibilityPrivate.
  ///
  /// In en, this message translates to:
  /// **'Private'**
  String get visibilityPrivate;

  /// No description provided for @shareGpx.
  ///
  /// In en, this message translates to:
  /// **'Export & Share GPX'**
  String get shareGpx;

  /// No description provided for @createSegment.
  ///
  /// In en, this message translates to:
  /// **'Create Segment'**
  String get createSegment;

  /// No description provided for @deleteActivity.
  ///
  /// In en, this message translates to:
  /// **'Delete Activity'**
  String get deleteActivity;

  /// No description provided for @importGpx.
  ///
  /// In en, this message translates to:
  /// **'Import GPX'**
  String get importGpx;

  /// No description provided for @manualEntry.
  ///
  /// In en, this message translates to:
  /// **'Manual Entry'**
  String get manualEntry;

  /// No description provided for @segmentsTab.
  ///
  /// In en, this message translates to:
  /// **'Segments'**
  String get segmentsTab;

  /// No description provided for @routesTab.
  ///
  /// In en, this message translates to:
  /// **'Routes'**
  String get routesTab;

  /// No description provided for @clubsTab.
  ///
  /// In en, this message translates to:
  /// **'Clubs'**
  String get clubsTab;

  /// No description provided for @challengesTab.
  ///
  /// In en, this message translates to:
  /// **'Challenges'**
  String get challengesTab;

  /// No description provided for @leaderboardTitle.
  ///
  /// In en, this message translates to:
  /// **'Leaderboard'**
  String get leaderboardTitle;

  /// No description provided for @flagEffort.
  ///
  /// In en, this message translates to:
  /// **'Flag Effort'**
  String get flagEffort;

  /// No description provided for @joinLabel.
  ///
  /// In en, this message translates to:
  /// **'Join'**
  String get joinLabel;

  /// No description provided for @leaveLabel.
  ///
  /// In en, this message translates to:
  /// **'Leave'**
  String get leaveLabel;

  /// No description provided for @eventsTitle.
  ///
  /// In en, this message translates to:
  /// **'Club Events'**
  String get eventsTitle;

  /// No description provided for @goingLabel.
  ///
  /// In en, this message translates to:
  /// **'Going'**
  String get goingLabel;

  /// No description provided for @interestedLabel.
  ///
  /// In en, this message translates to:
  /// **'Interested'**
  String get interestedLabel;

  /// No description provided for @saveRouteLabel.
  ///
  /// In en, this message translates to:
  /// **'Save Route'**
  String get saveRouteLabel;

  /// No description provided for @dashboardTab.
  ///
  /// In en, this message translates to:
  /// **'Stats & PRs'**
  String get dashboardTab;

  /// No description provided for @settingsTab.
  ///
  /// In en, this message translates to:
  /// **'Settings'**
  String get settingsTab;

  /// No description provided for @personalRecordsTitle.
  ///
  /// In en, this message translates to:
  /// **'Personal Records'**
  String get personalRecordsTitle;

  /// No description provided for @goalsTitle.
  ///
  /// In en, this message translates to:
  /// **'Training Goals'**
  String get goalsTitle;

  /// No description provided for @addGoal.
  ///
  /// In en, this message translates to:
  /// **'Add Goal'**
  String get addGoal;

  /// No description provided for @gearTitle.
  ///
  /// In en, this message translates to:
  /// **'Shoes & Bikes'**
  String get gearTitle;

  /// No description provided for @addGear.
  ///
  /// In en, this message translates to:
  /// **'Add Gear'**
  String get addGear;

  /// No description provided for @badgesTitle.
  ///
  /// In en, this message translates to:
  /// **'Badges'**
  String get badgesTitle;

  /// No description provided for @notificationsTitle.
  ///
  /// In en, this message translates to:
  /// **'Notifications'**
  String get notificationsTitle;

  /// No description provided for @markAllRead.
  ///
  /// In en, this message translates to:
  /// **'Mark All Read'**
  String get markAllRead;

  /// No description provided for @appearanceTitle.
  ///
  /// In en, this message translates to:
  /// **'Appearance'**
  String get appearanceTitle;

  /// No description provided for @themeSystem.
  ///
  /// In en, this message translates to:
  /// **'System'**
  String get themeSystem;

  /// No description provided for @themeLight.
  ///
  /// In en, this message translates to:
  /// **'Light'**
  String get themeLight;

  /// No description provided for @themeDark.
  ///
  /// In en, this message translates to:
  /// **'Dark'**
  String get themeDark;

  /// No description provided for @languageTitle.
  ///
  /// In en, this message translates to:
  /// **'Language'**
  String get languageTitle;

  /// No description provided for @unitsTitle.
  ///
  /// In en, this message translates to:
  /// **'Units'**
  String get unitsTitle;

  /// No description provided for @unitsMetric.
  ///
  /// In en, this message translates to:
  /// **'Metric (km/m)'**
  String get unitsMetric;

  /// No description provided for @unitsImperial.
  ///
  /// In en, this message translates to:
  /// **'Imperial (mi/ft)'**
  String get unitsImperial;

  /// No description provided for @privacyZonesTitle.
  ///
  /// In en, this message translates to:
  /// **'Privacy Zones'**
  String get privacyZonesTitle;

  /// No description provided for @addPrivacyZone.
  ///
  /// In en, this message translates to:
  /// **'Add Privacy Zone'**
  String get addPrivacyZone;

  /// No description provided for @devicesTitle.
  ///
  /// In en, this message translates to:
  /// **'Signed-in Devices'**
  String get devicesTitle;

  /// No description provided for @revokeLabel.
  ///
  /// In en, this message translates to:
  /// **'Revoke'**
  String get revokeLabel;

  /// No description provided for @exportDataLabel.
  ///
  /// In en, this message translates to:
  /// **'Export All My Data (JSON)'**
  String get exportDataLabel;

  /// No description provided for @deleteAccountLabel.
  ///
  /// In en, this message translates to:
  /// **'Delete Account Permanently'**
  String get deleteAccountLabel;

  /// No description provided for @signOutLabel.
  ///
  /// In en, this message translates to:
  /// **'Sign Out'**
  String get signOutLabel;
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) =>
      <String>['en', 'hi'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'en':
      return AppLocalizationsEn();
    case 'hi':
      return AppLocalizationsHi();
  }

  throw FlutterError(
      'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
      'an issue with the localizations generation tool. Please file an issue '
      'on GitHub with a reproducible sample app and the gen-l10n configuration '
      'that was used.');
}
