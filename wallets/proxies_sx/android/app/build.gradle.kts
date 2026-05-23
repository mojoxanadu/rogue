plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "sx.proxies.peer.android"
    compileSdk = 34

    defaultConfig {
        applicationId = "sx.proxies.peer.android"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "0.1.0"
    }

    // Pin the debug signing key to a committed keystore so every CI build
    // signs with the same certificate. Without this, the runner generates
    // a fresh ~/.android/debug.keystore each invocation and Android refuses
    // to install one build over another (different sig = anti-malware
    // protection). Debug keystores carry no security claim — committing
    // them is the standard pattern.
    signingConfigs {
        getByName("debug") {
            storeFile = rootProject.file("keystore/debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation(project(":protocol"))
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("org.json:json:20240303")
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
}
