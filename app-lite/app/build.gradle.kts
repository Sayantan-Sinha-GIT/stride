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
        versionCode = 2
        versionName = "2.0.0-lite"

        val apiUrl = (project.findProperty("STRIDE_API_URL") as String?)
            ?: System.getenv("STRIDE_API_URL")
            ?: "https://stride-api.srimantasutapa123.workers.dev"
        buildConfigField("String", "DEFAULT_API_URL", "\"$apiUrl\"")
        testInstrumentationRunner = "android.test.InstrumentationTestRunner"
    }

    androidResources {
        localeFilters += listOf("en", "hi")
    }

    buildFeatures {
        buildConfig = true
        viewBinding = true
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

    packaging {
        resources {
            excludes += listOf(
                "META-INF/*.kotlin_module",
                "META-INF/AL2.0",
                "META-INF/LGPL2.1",
                "kotlin/**",
                "DebugProbesKt.bin"
            )
        }
    }

    testOptions {
        unitTests.isIncludeAndroidResources = false
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.recyclerview:recyclerview:1.4.0")
    implementation("androidx.swiperefreshlayout:swiperefreshlayout:1.1.0")
    implementation("androidx.constraintlayout:constraintlayout:2.2.0")
    implementation("androidx.fragment:fragment-ktx:1.8.5")
    implementation("androidx.browser:browser:1.8.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
}
