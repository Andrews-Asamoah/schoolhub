fn main() {
    println!("cargo:rerun-if-env-changed=SCHOOLHUB_API_ORIGIN");
    #[cfg(feature = "shell")]
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(&["desktop_request"])),
    )
    .expect("desktop build configuration failed");
}
