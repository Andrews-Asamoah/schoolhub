use super::*;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
};

async fn read_request(socket: &mut TcpStream) -> String {
    let mut bytes = Vec::new();
    loop {
        let mut chunk = [0; 4096];
        let count = socket.read(&mut chunk).await.unwrap();
        assert!(count > 0 && bytes.len() + count <= 65536);
        bytes.extend_from_slice(&chunk[..count]);
        if let Some(end) = bytes.windows(4).position(|w| w == b"\r\n\r\n") {
            let head = String::from_utf8_lossy(&bytes[..end]);
            let length = head
                .lines()
                .find_map(|line| {
                    let (name, value) = line.split_once(':')?;
                    name.eq_ignore_ascii_case("content-length")
                        .then(|| value.trim().parse::<usize>().unwrap())
                })
                .unwrap_or(0);
            if bytes.len() >= end + 4 + length {
                return String::from_utf8_lossy(&bytes).into_owned();
            }
        }
    }
}

fn request(path: &str) -> HttpRequest {
    HttpRequest {
        path: path.into(),
        method: "POST".into(),
        headers: BTreeMap::new(),
        body: b"{}".to_vec(),
    }
}

#[test]
fn origin_path_and_header_boundaries() {
    for origin in [
        "http://api.example",
        "https://api.example/path",
        "https://user:pass@api.example",
        "https://api.example?key=secret",
    ] {
        assert!(DesktopHttp::new(origin, false).is_err());
    }
    let origin = Url::parse("https://api.example").unwrap();
    for path in [
        "https://evil.example/api/users",
        "//evil.example/api/users",
        "/api/../super-admin",
        "/api/%2e%2e/super-admin",
        "/api/super-admin/users",
        "/api/auth/admin/list-users",
        "/api/\\evil",
        "/api/users#fragment",
    ] {
        assert!(endpoint(&origin, path).is_err(), "{path}");
    }
    assert!(endpoint(&origin, "/api/students?search=A%20B").is_ok());
    for header in [
        "authorization",
        "cookie",
        "origin",
        "host",
        "x-schoolhub-client",
    ] {
        assert!(!allowed_header(header));
    }
    assert!(allowed_header("idempotency-key"));
}

#[tokio::test]
async fn native_challenge_cookie_bearer_custody_and_logout() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let origin = format!("http://{}", listener.local_addr().unwrap());
    let task = tokio::spawn(async move {
        let fixtures = [
            (
                "/api/auth/sign-in/email",
                "",
                "Set-Cookie: challenge=synthetic; HttpOnly; Path=/\r\n",
                r#"{"twoFactorRedirect":true}"#,
            ),
            (
                "/api/auth/two-factor/verify-totp",
                "challenge=synthetic",
                "set-auth-token: synthetic-bearer\r\n",
                r#"{"token":"synthetic-bearer","user":{"role":"teacher"}}"#,
            ),
            (
                "/api/auth/get-session",
                "authorization: Bearer synthetic-bearer",
                "",
                r#"{"session":{"token":"synthetic-bearer"},"user":{"role":"teacher"}}"#,
            ),
            (
                "/api/attendance",
                "authorization: Bearer synthetic-bearer",
                "",
                r#"{"success":true}"#,
            ),
            (
                "/api/auth/sign-out",
                "authorization: Bearer synthetic-bearer",
                "",
                r#"{"success":true}"#,
            ),
            ("/api/auth/get-session", "", "", "null"),
        ];
        for (path, required, headers, body) in fixtures {
            let (mut socket, _) = listener.accept().await.unwrap();
            let received = read_request(&mut socket).await;
            assert!(received.contains(path), "{received}");
            assert!(received.contains(required), "{received}");
            assert!(!received.to_ascii_lowercase().contains("origin:"));
            if path == "/api/auth/get-session" && body == "null" {
                assert!(!received.contains("synthetic-bearer"));
                assert!(!received.contains("challenge=synthetic"));
            }
            let response = format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n{headers}Content-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len());
            socket.write_all(response.as_bytes()).await.unwrap();
        }
    });
    let http = DesktopHttp::new(&origin, true).unwrap();
    http.request(request("/api/auth/sign-in/email"))
        .await
        .unwrap();
    let response = http
        .request(request("/api/auth/two-factor/verify-totp"))
        .await
        .unwrap();
    assert!(!String::from_utf8(response.body)
        .unwrap()
        .contains("synthetic-bearer"));
    assert!(!response.headers.contains_key("set-auth-token"));
    http.request(request("/api/attendance")).await.unwrap();
    http.request(request("/api/auth/sign-out")).await.unwrap();
    http.request(request("/api/auth/get-session"))
        .await
        .unwrap();
    task.await.unwrap();
}

#[tokio::test]
async fn redirects_are_not_followed() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let origin = format!("http://{}", listener.local_addr().unwrap());
    let task = tokio::spawn(async move {
        let (mut socket, _) = listener.accept().await.unwrap();
        let _ = read_request(&mut socket).await;
        socket.write_all(b"HTTP/1.1 302 Found\r\nLocation: https://evil.example\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").await.unwrap();
    });
    let http = DesktopHttp::new(&origin, true).unwrap();
    assert_eq!(
        http.request(request("/api/students")).await.unwrap().status,
        302
    );
    task.await.unwrap();
}

#[tokio::test]
async fn superadmin_token_is_revoked_and_never_reaches_javascript() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let origin = format!("http://{}", listener.local_addr().unwrap());
    let task = tokio::spawn(async move {
        for (path, extra, body) in [
            (
                "/api/auth/sign-in/email",
                "set-auth-token: platform-token\r\n",
                "{}",
            ),
            (
                "/api/auth/get-session",
                "",
                r#"{"user":{"role":"superAdmin"}}"#,
            ),
            ("/api/auth/sign-out", "", "{}"),
        ] {
            let (mut socket, _) = listener.accept().await.unwrap();
            assert!(read_request(&mut socket).await.contains(path));
            socket.write_all(format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n{extra}Content-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()).as_bytes()).await.unwrap();
        }
    });
    let http = DesktopHttp::new(&origin, true).unwrap();
    let response = http
        .request(request("/api/auth/sign-in/email"))
        .await
        .unwrap();
    assert_eq!(response.status, 403);
    assert!(!String::from_utf8(response.body)
        .unwrap()
        .contains("platform-token"));
    assert!(http.session.lock().await.bearer.is_none());
    task.await.unwrap();
}

async fn fixture(
    responses: Vec<(&'static str, u16, &'static str)>,
) -> (String, tokio::task::JoinHandle<()>) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let origin = format!("http://{}", listener.local_addr().unwrap());
    let task = tokio::spawn(async move {
        for (path, status, body) in responses {
            let (mut socket, _) = listener.accept().await.unwrap();
            let text = read_request(&mut socket).await;
            assert!(text.contains(path));
            assert!(text.contains("x-school-subdomain: wesley"));
            assert!(!text.contains("x-school-subdomain: another-school"));
            assert!(text.contains("authorization: Bearer synthetic-bearer"));
            socket.write_all(format!("HTTP/1.1 {status} Result\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()).as_bytes()).await.unwrap();
        }
    });
    (origin, task)
}

#[tokio::test]
async fn saved_session_is_revalidated_scoped_and_forgotten_on_logout() {
    use crate::credentials::tests::{saved, MemoryStore};
    let body = r#"{"session":{"token":"never-expose","clientPlatform":"desktop"},"user":{"id":"synthetic-user","email":"teacher@example.test","role":"user"}}"#;
    let (origin, task) = fixture(vec![
        ("/api/auth/get-session", 200, body),
        ("/api/schools/current", 200, "{}"),
        ("/api/auth/sign-out", 200, "{}"),
    ])
    .await;
    let store = Arc::new(MemoryStore::default());
    let vault = CredentialVault::new(store.clone());
    let mut record = saved();
    record.origin = origin.clone();
    let key = vault.save(record).unwrap();
    let http = DesktopHttp::with_store(&origin, true, store.clone()).unwrap();
    let result = http
        .resume_session("wesley".into(), "teacher@example.test".into())
        .await
        .unwrap();
    assert_eq!(result.status, 200);
    let text = String::from_utf8(result.body).unwrap();
    assert!(!text.contains("synthetic-bearer") && !text.contains("never-expose"));
    assert!(http.select_school("another".into()).await.is_err());
    let mut logout = request("/api/auth/sign-out");
    logout
        .headers
        .insert("x-school-subdomain".into(), "another-school".into());
    http.request(logout).await.unwrap();
    assert!(store.0.lock().unwrap().get(&key).is_none());
    assert!(http.session.lock().await.bearer.is_none());
    task.await.unwrap();
}

#[tokio::test]
async fn expired_and_wrong_identity_saved_sessions_are_removed_before_activation() {
    use crate::credentials::tests::{saved, MemoryStore};
    for body in [
        "null",
        r#"{"session":{"clientPlatform":"desktop"},"user":{"id":"another-user","email":"teacher@example.test","role":"teacher"}}"#,
    ] {
        let (origin, task) = fixture(vec![("/api/auth/get-session", 200, body)]).await;
        let store = Arc::new(MemoryStore::default());
        let mut record = saved();
        record.origin = origin.clone();
        CredentialVault::new(store.clone()).save(record).unwrap();
        let http = DesktopHttp::with_store(&origin, true, store.clone()).unwrap();
        assert_eq!(
            http.resume_session("wesley".into(), "teacher@example.test".into())
                .await
                .unwrap()
                .status,
            401
        );
        assert!(http.session.lock().await.bearer.is_none());
        assert!(store.0.lock().unwrap().is_empty());
        task.await.unwrap();
    }
}

#[tokio::test]
async fn revoked_desktop_entitlement_prevents_saved_session_activation() {
    use crate::credentials::tests::{saved, MemoryStore};
    let body = r#"{"session":{"clientPlatform":"desktop"},"user":{"id":"synthetic-user","email":"teacher@example.test","role":"teacher"}}"#;
    let (origin, task) = fixture(vec![
        ("/api/auth/get-session", 200, body),
        (
            "/api/schools/current",
            403,
            r#"{"error":"DESKTOP_ACCESS_DISABLED","message":"Disabled"}"#,
        ),
    ])
    .await;
    let store = Arc::new(MemoryStore::default());
    let mut record = saved();
    record.origin = origin.clone();
    CredentialVault::new(store.clone()).save(record).unwrap();
    let http = DesktopHttp::with_store(&origin, true, store.clone()).unwrap();
    assert_eq!(
        http.resume_session("wesley".into(), "teacher@example.test".into())
            .await
            .unwrap()
            .status,
        403
    );
    assert!(http.session.lock().await.bearer.is_none());
    assert!(store.0.lock().unwrap().is_empty());
    task.await.unwrap();
}

#[tokio::test]
async fn forgetting_one_account_preserves_other_school_credentials() {
    use crate::credentials::tests::{saved, MemoryStore};
    let store = Arc::new(MemoryStore::default());
    let vault = CredentialVault::new(store.clone());
    vault.save(saved()).unwrap();
    let mut other = saved();
    other.school = "other-school".into();
    vault.save(other).unwrap();
    let http = DesktopHttp::with_store("https://api.example", false, store.clone()).unwrap();
    http.forget_session("wesley".into(), "teacher@example.test".into())
        .await
        .unwrap();
    assert_eq!(store.0.lock().unwrap().len(), 1);
    assert!(vault
        .load(
            "https://api.example",
            "other-school",
            "teacher@example.test"
        )
        .unwrap()
        .is_some());
}

#[tokio::test]
async fn remembering_is_explicit_and_requires_a_current_desktop_identity_and_license() {
    use crate::credentials::tests::MemoryStore;
    let body = r#"{"session":{"clientPlatform":"desktop"},"user":{"id":"synthetic-user","email":"teacher@example.test","role":"teacher"}}"#;
    let (origin, task) = fixture(vec![
        ("/api/auth/get-session", 200, body),
        ("/api/schools/current", 200, "{}"),
    ])
    .await;
    let store = Arc::new(MemoryStore::default());
    let http = DesktopHttp::with_store(&origin, true, store.clone()).unwrap();
    http.select_school("wesley".into()).await.unwrap();
    assert!(http.remember_session().await.is_err()); // no session, including pending 2FA
    http.session.lock().await.bearer = Some("synthetic-bearer".into());
    assert!(store.0.lock().unwrap().is_empty());
    http.remember_session().await.unwrap();
    assert_eq!(store.0.lock().unwrap().len(), 1);
    task.await.unwrap();
}

#[tokio::test]
async fn network_failure_keeps_saved_credential_but_never_activates_it() {
    use crate::credentials::tests::{saved, MemoryStore};
    let origin = "http://127.0.0.1:1";
    let store = Arc::new(MemoryStore::default());
    let mut record = saved();
    record.origin = origin.into();
    CredentialVault::new(store.clone()).save(record).unwrap();
    let http = DesktopHttp::with_store(origin, true, store.clone()).unwrap();
    assert!(http
        .resume_session("wesley".into(), "teacher@example.test".into())
        .await
        .is_err());
    assert!(http.session.lock().await.bearer.is_none());
    assert_eq!(store.0.lock().unwrap().len(), 1);
}

#[tokio::test]
async fn logout_storage_failure_is_not_reported_as_success() {
    struct FailingDelete;
    impl CredentialStore for FailingDelete {
        fn read(&self, _: &str) -> Result<Option<String>, String> {
            Ok(None)
        }
        fn write(&self, _: &str, _: &str) -> Result<(), String> {
            Ok(())
        }
        fn remove(&self, _: &str) -> Result<(), String> {
            Err("Could not forget the saved sign-in.".into())
        }
    }
    let http =
        DesktopHttp::with_store("https://api.example", false, Arc::new(FailingDelete)).unwrap();
    {
        let mut session = http.session.lock().await;
        session.bearer = Some("synthetic-bearer".into());
        session.saved_key = Some("synthetic-key".into());
    }
    assert!(http.request(request("/api/auth/sign-out")).await.is_err());
}

#[tokio::test]
async fn offline_logout_removes_saved_credential_and_allows_ui_cache_cleanup() {
    use crate::credentials::tests::{saved, MemoryStore};
    let origin = "http://127.0.0.1:1";
    let store = Arc::new(MemoryStore::default());
    let mut record = saved();
    record.origin = origin.into();
    let key = CredentialVault::new(store.clone()).save(record).unwrap();
    let http = DesktopHttp::with_store(origin, true, store.clone()).unwrap();
    {
        let mut session = http.session.lock().await;
        session.bearer = Some("synthetic-bearer".into());
        session.saved_key = Some(key);
    }
    let response = http.request(request("/api/auth/sign-out")).await.unwrap();
    assert_eq!(response.status, 200);
    assert_eq!(
        response
            .headers
            .get("x-schoolhub-local-logout")
            .map(String::as_str),
        Some("true")
    );
    assert!(http.session.lock().await.bearer.is_none());
    assert!(store.0.lock().unwrap().is_empty());
}

#[tokio::test]
async fn a_wrong_totp_attempt_does_not_discard_the_challenge_cookie() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let origin = format!("http://{}", listener.local_addr().unwrap());
    let task = tokio::spawn(async move {
        for (path, status, header, body) in [
            (
                "/api/auth/sign-in/email",
                200,
                "Set-Cookie: challenge=retry; HttpOnly; Path=/\r\n",
                r#"{"twoFactorRedirect":true}"#,
            ),
            (
                "/api/auth/two-factor/verify-totp",
                401,
                "",
                r#"{"message":"Wrong code"}"#,
            ),
            (
                "/api/auth/two-factor/verify-totp",
                200,
                "set-auth-token: synthetic-bearer\r\n",
                r#"{"user":{"role":"teacher"}}"#,
            ),
            (
                "/api/auth/get-session",
                200,
                "",
                r#"{"session":{"clientPlatform":"desktop"},"user":{"role":"teacher"}}"#,
            ),
        ] {
            let (mut socket, _) = listener.accept().await.unwrap();
            let request = read_request(&mut socket).await;
            assert!(request.contains(path));
            if path.ends_with("verify-totp") {
                assert!(request.contains("challenge=retry"));
            }
            socket.write_all(format!("HTTP/1.1 {status} Result\r\nContent-Type: application/json\r\n{header}Content-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len()).as_bytes()).await.unwrap();
        }
    });
    let http = DesktopHttp::new(&origin, true).unwrap();
    http.request(request("/api/auth/sign-in/email"))
        .await
        .unwrap();
    assert_eq!(
        http.request(request("/api/auth/two-factor/verify-totp"))
            .await
            .unwrap()
            .status,
        401
    );
    assert_eq!(
        http.request(request("/api/auth/two-factor/verify-totp"))
            .await
            .unwrap()
            .status,
        200
    );
    assert!(http.session.lock().await.bearer.is_some());
    task.await.unwrap();
}

#[tokio::test]
async fn null_server_session_clears_an_active_remembered_session() {
    use crate::credentials::tests::{saved, MemoryStore};
    let (origin, task) = fixture(vec![("/api/auth/get-session", 200, "null")]).await;
    let store = Arc::new(MemoryStore::default());
    let mut record = saved();
    record.origin = origin.clone();
    let key = CredentialVault::new(store.clone()).save(record).unwrap();
    let http = DesktopHttp::with_store(&origin, true, store.clone()).unwrap();
    {
        let mut session = http.session.lock().await;
        session.bearer = Some("synthetic-bearer".into());
        session.saved_key = Some(key);
        session.school = Some("wesley".into());
    }
    let mut query = request("/api/auth/get-session");
    query.method = "GET".into();
    query.body.clear();
    assert_eq!(http.request(query).await.unwrap().status, 200);
    assert!(http.session.lock().await.bearer.is_none());
    assert!(store.0.lock().unwrap().is_empty());
    task.await.unwrap();
}

#[tokio::test]
async fn registration_uses_native_identity_and_retains_installation_across_retries() {
    use crate::credentials::tests::MemoryStore;
    let body = r#"{"session":{"clientPlatform":"desktop"},"user":{"id":"synthetic-user","email":"teacher@example.test","role":"teacher"}}"#;
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let origin = format!("http://{}", listener.local_addr().unwrap());
    let task = tokio::spawn(async move {
        let mut installation = None;
        for _ in 0..2 {
            for path in ["/api/auth/get-session", "/api/sync/devices"] {
                let (mut socket, _) = listener.accept().await.unwrap();
                let text = read_request(&mut socket).await;
                assert!(text.contains(path));
                assert!(text.contains("authorization: Bearer synthetic-bearer"));
                assert!(text.contains("x-school-subdomain: wesley"));
                assert!(text.contains("x-schoolhub-client: desktop"));
                let response = if path.ends_with("devices") {
                    let payload: Value =
                        serde_json::from_str(text.split("\r\n\r\n").nth(1).unwrap()).unwrap();
                    assert_eq!(payload["name"], "Synthetic PC");
                    assert_eq!(payload.as_object().unwrap().len(), 3);
                    let id = payload["installationId"].as_str().unwrap().to_owned();
                    assert_eq!(uuid::Uuid::parse_str(&id).unwrap().get_version_num(), 4);
                    if let Some(previous) = &installation {
                        assert_eq!(previous, &id);
                    }
                    installation = Some(id);
                    r#"{"id":"synthetic-device"}"#
                } else {
                    body
                };
                socket.write_all(format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{response}", response.len()).as_bytes()).await.unwrap();
            }
        }
    });
    let dir = tempfile::tempdir().unwrap();
    let http = DesktopHttp::with_store(&origin, true, Arc::new(MemoryStore::default()))
        .unwrap()
        .with_installation_root(dir.path().to_path_buf());
    http.select_school("wesley".into()).await.unwrap();
    assert!(http.register_device("Synthetic PC".into()).await.is_err());
    assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 0);
    http.session.lock().await.bearer = Some("synthetic-bearer".into());
    for _ in 0..2 {
        assert_eq!(
            http.register_device("Synthetic PC".into())
                .await
                .unwrap()
                .status,
            200
        );
    }
    assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 1);
    task.await.unwrap();
}
