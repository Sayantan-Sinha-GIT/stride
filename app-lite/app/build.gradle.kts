plugins {
    id("com.android.application")
}

android {
    namespace = "com.stride.tracker.lite"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.stride.tracker.lite"
        minSdk = 24
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0-lite"

        val apiUrl = (project.findProperty("STRIDE_API_URL") as String?)
            ?: System.getenv("STRIDE_API_URL")
            ?: "https://stride-api.srimantasutapa123.workers.dev"
        buildConfigField("String", "DEFAULT_API_URL", "\"$apiUrl\"")
        testInstrumentationRunner = "android.test.InstrumentationTestRunner"
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    testOptions {
        unitTests.isIncludeAndroidResources = false
    }
}

dependencies {
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
}
