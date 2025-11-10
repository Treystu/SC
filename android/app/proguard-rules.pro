# Add project specific ProGuard rules here.
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Keep crypto classes
-keep class com.sovereign.communications.data.** { *; }
-keep class com.goterl.lazysodium.** { *; }

# Keep WebRTC classes
-keep class org.webrtc.** { *; }

# Room
-keep class * extends androidx.room.RoomDatabase
-keep @androidx.room.Entity class *
-dontwarn androidx.room.paging.**
