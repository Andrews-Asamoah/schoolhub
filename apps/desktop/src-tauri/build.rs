fn main() {
    println!("cargo:rerun-if-env-changed=SCHOOLHUB_API_ORIGIN");
    #[cfg(feature = "shell")]
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "desktop_request",
            "desktop_select_school",
            "desktop_remember_session",
            "desktop_resume_session",
            "desktop_forget_session",
        ]),
    ))
    .expect("desktop build configuration failed");
}
