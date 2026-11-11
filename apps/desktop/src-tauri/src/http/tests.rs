use super::*;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
};

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
            let mut data = vec![0; 8192];
            let n = socket.read(&mut data).await.unwrap();
            let received = String::from_utf8_lossy(&data[..n]);
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
        let mut buffer = [0; 8192];
        socket.read(&mut buffer).await.unwrap();
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
            let mut data = [0; 8192];
            let n = socket.read(&mut data).await.unwrap();
            assert!(String::from_utf8_lossy(&data[..n]).contains(path));
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
