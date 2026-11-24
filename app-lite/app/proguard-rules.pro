-keep class com.stride.tracker.lite.MainActivity { *; }
-keep class com.stride.tracker.lite.service.LiteTrackingService { *; }
-keepclassmembers class * extends android.view.View {
    public <init>(android.content.Context);
    public <init>(android.content.Context, android.util.AttributeSet);
}
-dontwarn java.lang.invoke.StringConcatFactory
