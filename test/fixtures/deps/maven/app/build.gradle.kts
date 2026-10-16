plugins {
    `java-library`
    kotlin("jvm") version "1.9.22"
}

val ktorVersion = "2.3.7"

dependencies {
    implementation(platform("io.ktor:ktor-bom:2.3.7"))
    implementation("io.ktor:ktor-server-core:$ktorVersion")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.7.3")
    implementation(group = "org.slf4j", name = "slf4j-api", version = "2.0.9")
    implementation(libs.exposed.core)
    implementation(kotlin("stdlib"))
    kapt("com.google.dagger:dagger-compiler:2.50")
    runtimeOnly("ch.qos.logback:logback-classic:1.4.14")
    testImplementation("io.kotest:kotest-runner-junit5:5.8.0")
    testFixturesImplementation("org.assertj:assertj-core:3.25.1")
    androidTestImplementation("androidx.test.ext:junit:1.1.5")
    implementation("org.example:ranged:[1.0,2.0)")
}
