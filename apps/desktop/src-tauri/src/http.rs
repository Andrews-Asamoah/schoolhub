//! Native, origin-pinned HTTP. No caller-supplied URL, cookie or bearer token.
use reqwest::{redirect::Policy, Client, Method, Url};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{collections::BTreeMap, time::Duration};
use tokio::sync::Mutex;

const MAX_BYTES: usize = 32 * 1024 * 1024;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HttpRequest {
    pub path: String,
    pub method: String,
    pub headers: BTreeMap<String, String>,
    pub body: Vec<u8>,
}

#[derive(Serialize)]
pub struct HttpResponse {
    pub status: u16,
    pub headers: BTreeMap<String, String>,
    pub body: Vec<u8>,
}

struct Session {
    client: Client,
    bearer: Option<String>,
}

pub struct DesktopHttp {
    origin: Url,
    session: Mutex<Session>,
}

fn client() -> Result<Client, String> {
    Client::builder()
        .cookie_store(true)
        .redirect(Policy::none())
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(90))
        .build()
        .map_err(|_| "Could not initialize the SchoolHub connection.".into())
}

fn endpoint(origin: &Url, path: &str) -> Result<Url, String> {
    let pathname = path.split('?').next().unwrap_or_default();
    if !pathname.starts_with("/api/")
        || path.contains(['\\', '#', '\r', '\n'])
        || pathname.contains('%')
        || pathname.contains("//")
        || pathname.split('/').any(|part| part == "." || part == "..")
        || ["/api/super-admin", "/api/auth/admin"]
            .iter()
            .any(|prefix| pathname == *prefix || pathname.starts_with(&format!("{prefix}/")))
    {
        return Err("This endpoint is not available in the desktop app.".into());
    }
    let url = origin.join(path).map_err(|_| "Invalid API path.")?;
    if url.origin() != origin.origin() {
        return Err("Invalid API origin.".into());
    }
    Ok(url)
}

fn allowed_header(name: &str) -> bool {
    matches!(
        name,
        "accept"
            | "content-type"
            | "x-school-subdomain"
            | "x-school-role"
            | "x-academic-year-id"
            | "x-academic-term-id"
            | "idempotency-key"
            | "if-none-match"
            | "if-match"
    )
}

async fn read_limited(mut response: reqwest::Response) -> Result<HttpResponse, String> {
    if response
        .content_length()
        .is_some_and(|length| length > MAX_BYTES as u64)
    {
        return Err("The API response is too large for this operation.".into());
    }
    let status = response.status().as_u16();
    let mut headers = BTreeMap::new();
    for name in ["content-type", "content-disposition", "etag", "retry-after"] {
        if let Some(value) = response.headers().get(name).and_then(|v| v.to_str().ok()) {
            headers.insert(name.to_string(), value.to_string());
        }
    }
    let mut body = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "The connection was interrupted. Please retry.")?
    {
        if body.len() + chunk.len() > MAX_BYTES {
            return Err("The API response is too large for this operation.".into());
        }
        body.extend_from_slice(&chunk);
    }
    Ok(HttpResponse {
        status,
        headers,
        body,
    })
}

fn scrub_tokens(value: &mut Value) {
    match value {
        Value::Object(object) => {
            for key in ["token", "accessToken", "refreshToken", "idToken"] {
                object.remove(key);
            }
            for child in object.values_mut() {
                scrub_tokens(child);
            }
        }
        Value::Array(array) => {
            for child in array {
                scrub_tokens(child);
            }
        }
        _ => {}
    }
}

impl DesktopHttp {
    pub fn new(origin: &str, allow_loopback_http: bool) -> Result<Self, String> {
        let origin = Url::parse(origin).map_err(|_| "Configure a valid SchoolHub API origin.")?;
        let loopback = matches!(origin.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"));
        if !origin.username().is_empty()
            || origin.password().is_some()
            || origin.query().is_some()
            || origin.fragment().is_some()
            || origin.path() != "/"
            || origin.host_str().is_none()
            || (origin.scheme() != "https"
                && !(allow_loopback_http && loopback && origin.scheme() == "http"))
        {
            return Err(
                "The API origin must be bare HTTPS (loopback HTTP is development-only).".into(),
            );
        }
        Ok(Self {
            origin,
            session: Mutex::new(Session {
                client: client()?,
                bearer: None,
            }),
        })
    }

    pub async fn request(&self, input: HttpRequest) -> Result<HttpResponse, String> {
        let url = endpoint(&self.origin, &input.path)?;
        let method =
            Method::from_bytes(input.method.as_bytes()).map_err(|_| "Invalid HTTP method.")?;
        if ![
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::PATCH,
            Method::DELETE,
            Method::HEAD,
        ]
        .contains(&method)
            || input.body.len() > MAX_BYTES
        {
            return Err("Unsupported desktop request.".into());
        }
        // One request at a time also prevents an old response resurrecting a
        // token after sign-out. Challenge cookies never enter JS or disk.
        let mut session = self.session.lock().await;
        let pathname = url.path();
        if pathname == "/api/auth/sign-in/email" {
            session.client = client()?;
            session.bearer = None;
        }
        let signing_out = pathname == "/api/auth/sign-out";
        let mut request = session
            .client
            .request(method, url.clone())
            .header("x-schoolhub-client", "desktop")
            .header("x-schoolhub-client-version", env!("CARGO_PKG_VERSION"));
        for (name, value) in input.headers {
            let name = name.to_ascii_lowercase();
            if allowed_header(&name) {
                request = request.header(name, value);
            }
        }
        if let Some(token) = &session.bearer {
            request = request.bearer_auth(token);
        }
        let sent = request.body(input.body).send().await;
        // Local logout clears the cookie jar even if the network is unavailable.
        if signing_out {
            session.client = client()?;
            session.bearer = None;
        }
        let response =
            sent.map_err(|_| "Could not reach SchoolHub. Check the connection and retry.")?;
        let token = response
            .headers()
            .get("set-auth-token")
            .and_then(|v| v.to_str().ok())
            .map(str::to_owned);
        let mut output = read_limited(response).await?;
        if output.status == 401 {
            session.client = client()?;
            session.bearer = None;
        }
        if !signing_out && (200..300).contains(&output.status) {
            if let Some(token) = token {
                // Authenticate the issued token and refuse platform accounts
                // before making it available to subsequent school API calls.
                let check = session
                    .client
                    .get(self.origin.join("/api/auth/get-session").unwrap())
                    .bearer_auth(&token)
                    .send()
                    .await;
                let checked = match check {
                    Ok(response) => read_limited(response).await,
                    Err(_) => Err("Could not confirm the sign-in. Please retry.".into()),
                };
                let identity = checked
                    .ok()
                    .filter(|response| response.status == 200)
                    .and_then(|response| serde_json::from_slice::<Value>(&response.body).ok());
                let role = identity
                    .as_ref()
                    .and_then(|value| value.pointer("/user/role"))
                    .and_then(Value::as_str);
                if role.is_none() || role == Some("superAdmin") {
                    // Best-effort server revocation. The bearer is never retained.
                    let _ = session
                        .client
                        .post(self.origin.join("/api/auth/sign-out").unwrap())
                        .bearer_auth(&token)
                        .header("content-type", "application/json")
                        .body("{}")
                        .send()
                        .await;
                    session.client = client()?;
                    session.bearer = None;
                    let forbidden = role == Some("superAdmin");
                    let message = if forbidden {
                        "Platform administrators must use the web portal."
                    } else {
                        "Could not confirm the sign-in. Please retry."
                    };
                    return Ok(HttpResponse {
                        status: if forbidden { 403 } else { 503 },
                        headers: BTreeMap::from([(
                            "content-type".into(),
                            "application/json".into(),
                        )]),
                        body: serde_json::to_vec(&serde_json::json!({ "message": message }))
                            .unwrap(),
                    });
                }
                session.bearer = Some(token);
            }
        }
        if pathname.starts_with("/api/auth/") {
            if let Ok(mut value) = serde_json::from_slice::<Value>(&output.body) {
                scrub_tokens(&mut value);
                output.body =
                    serde_json::to_vec(&value).map_err(|_| "Invalid authentication response.")?;
            }
        }
        Ok(output)
    }
}

#[cfg(test)]
mod tests;
