-keep class com.stride.tracker.lite.MainActivity { *; }
-keep class com.stride.tracker.lite.ui.ActivityDetailActivity { *; }
-keep class com.stride.tracker.lite.ui.SegmentDetailActivity { *; }
-keep class com.stride.tracker.lite.service.LiteTrackingService { *; }
-keep class com.stride.tracker.lite.databinding.** { *; }
-keepclassmembers class * extends android.view.View {
    public <init>(android.content.Context);
    public <init>(android.content.Context, android.util.AttributeSet);
    public <init>(android.content.Context, android.util.AttributeSet, int);
}
-keepclassmembers class * extends androidx.fragment.app.Fragment {
    public <init>();
}
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn javax.annotation.**
-dontwarn org.codehaus.mojo.animal_sniffer.IgnoreJRERequirement
-dontwarn java.lang.invoke.StringConcatFactory
