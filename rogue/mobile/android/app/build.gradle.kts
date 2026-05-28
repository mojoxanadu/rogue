plugins {
  id("com.android.application")
  id("org.jetbrains.kotlin.android")
}

android {
  namespace = "com.rogue.app"
  compileSdk = 35

  defaultConfig {
    applicationId = "com.rogue.app"
    minSdk = 24
    targetSdk = 35
    versionCode = 1
    versionName = "1.0-dev"
  }

  buildTypes {
    release {
      isMinifyEnabled = false
      proguardFiles(
        getDefaultProguardFile("proguard-android-optimize.txt"),
        "proguard-rules.pro"
      )
    }
  }

  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }

  kotlinOptions {
    jvmTarget = "17"
  }
}

// Copy dev_build.html from repo root into assets as index.html
tasks.register<Copy>("copyDevBuild") {
  from("${rootProject.projectDir}/../../dev_build.html")
  into("${projectDir}/src/main/assets/")
  rename("dev_build.html", "index.html")
}

tasks.named("preBuild") {
  dependsOn("copyDevBuild")
}

dependencies {
  implementation("androidx.core:core-ktx:1.12.0")
  implementation("androidx.appcompat:appcompat:1.6.1")
}
