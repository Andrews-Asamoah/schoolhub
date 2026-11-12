use super::*;

fn message(status: u16, text: &str) -> HttpResponse {
    HttpResponse {
        status,
        headers: BTreeMap::from([("content-type".into(), "application/json".into())]),
        body: serde_json::to_vec(&serde_json::json!({"message": text})).unwrap(),
    }
}
fn identity_fields(value: &Value) -> Option<(&str, &str)> {
    let user = value.get("user")?;
    if user.get("role")?.as_str()? == "superAdmin"
        || user.get("banned").and_then(Value::as_bool) == Some(true)
        || user.get("mustChangePassword").and_then(Value::as_bool) == Some(true)
        || value.pointer("/session/clientPlatform")?.as_str()? != "desktop"
    {
        return None;
    }
    Some((user.get("id")?.as_str()?, user.get("email")?.as_str()?))
}

impl DesktopHttp {
    /// The webview supplies a display name only. Scope and installation ID are
    /// derived from the server identity and the native application data path.
    pub async fn register_device(&self, name: String) -> Result<HttpResponse, String> {
        if name.trim().is_empty() || name.chars().count() > 80 || name.chars().any(char::is_control)
        {
            return Err("Use a device name of up to 80 characters.".into());
        }
        let root = self
            .installation_root
            .as_ref()
            .ok_or("Installation storage is unavailable.")?;
        let mut session = self.session.lock().await;
        let school = session.school.clone().ok_or("Choose a school first.")?;
        let bearer = session
            .bearer
            .clone()
            .ok_or("Sign in before registering this installation.")?;
        let checked = self
            .inspect(&session.client, &bearer, &school, "/api/auth/get-session")
            .await?;
        let identity: Value = serde_json::from_slice(&checked.body)
            .map_err(|_| "Could not confirm the current sign-in.")?;
        if checked.status != 200 {
            return Ok(message(
                checked.status,
                "Could not confirm the current sign-in.",
            ));
        }
        if identity.get("user").is_none_or(Value::is_null) {
            session.client = client()?;
            session.bearer = None;
            if let Some(key) = &session.saved_key {
                self.vault.remove(key)?;
            }
            session.saved_key = None;
            return Ok(message(
                401,
                "Sign in again before registering this installation.",
            ));
        }
        let (user_id, _) = identity_fields(&identity)
            .ok_or("Finish signing in before registering this installation.")?;
        let installation_id = crate::installation::identity(
            root,
            &self.origin.origin().ascii_serialization(),
            &school,
            user_id,
        )?;
        let platform = match std::env::consts::OS {
            "windows" => "windows",
            "macos" => "macos",
            "linux" => "linux",
            _ => return Err("Unsupported desktop platform.".into()),
        };
        let response = session.client.post(endpoint(&self.origin, "/api/sync/devices")?)
            .header("x-schoolhub-client", "desktop")
            .header("x-schoolhub-client-version", env!("CARGO_PKG_VERSION"))
            .header("x-school-subdomain", &school).bearer_auth(&bearer)
            .json(&serde_json::json!({ "installationId": installation_id, "name": name, "platform": platform }))
            .send().await.map_err(|_| "Connect to SchoolHub to register this installation.")?;
        let output = read_limited(response).await?;
        if output.status == 401 {
            session.client = client()?;
            session.bearer = None;
            if let Some(key) = &session.saved_key {
                self.vault.remove(key)?;
            }
            session.saved_key = None;
        }
        Ok(output)
    }
    pub async fn select_school(&self, school: String) -> Result<(), String> {
        let code = school_code(&school)?;
        let mut session = self.session.lock().await;
        if session.school.as_deref() == Some(&code) {
            return Ok(());
        }
        if session.bearer.is_some() {
            return Err("Sign out before changing schools.".into());
        }
        session.client = client()?;
        session.saved_key = None;
        session.school = Some(code);
        Ok(())
    }
    async fn inspect(
        &self,
        client: &Client,
        token: &str,
        school: &str,
        path: &str,
    ) -> Result<HttpResponse, String> {
        let response = client
            .get(endpoint(&self.origin, path)?)
            .header("x-schoolhub-client", "desktop")
            .header("x-schoolhub-client-version", env!("CARGO_PKG_VERSION"))
            .header("x-school-subdomain", school)
            .bearer_auth(token)
            .send()
            .await
            .map_err(|_| "Connect to SchoolHub to check the saved sign-in.")?;
        read_limited(response).await
    }
    pub async fn remember_session(&self) -> Result<(), String> {
        let mut session = self.session.lock().await;
        let school = session
            .school
            .as_deref()
            .ok_or("Choose a school before saving this sign-in.")?
            .to_owned();
        let token = session
            .bearer
            .as_deref()
            .ok_or("Sign in before saving this sign-in.")?
            .to_owned();
        let checked = self
            .inspect(&session.client, &token, &school, "/api/auth/get-session")
            .await?;
        if checked.status != 200 {
            return Err("The sign-in could not be confirmed. Sign in again.".into());
        }
        let identity: Value = serde_json::from_slice(&checked.body)
            .map_err(|_| "The sign-in could not be confirmed.")?;
        let (user_id, address) =
            identity_fields(&identity).ok_or("Finish signing in before saving this sign-in.")?;
        let access = self
            .inspect(&session.client, &token, &school, "/api/schools/current")
            .await?;
        if access.status != 200 {
            return Err("This sign-in cannot be saved until school access is available.".into());
        }
        let key = self.vault.save(SavedCredential {
            version: 1,
            origin: self.origin.origin().ascii_serialization(),
            school,
            email: address.to_owned(),
            user_id: user_id.to_owned(),
            bearer: token,
        })?;
        session.saved_key = Some(key);
        Ok(())
    }
    pub async fn resume_session(
        &self,
        school: String,
        address: String,
    ) -> Result<HttpResponse, String> {
        let school = school_code(&school)?;
        let origin = self.origin.origin().ascii_serialization();
        let key = credential_key(&origin, &school, &address)?;
        let mut session = self.session.lock().await;
        if session.bearer.is_some() {
            return Err("Sign out before using another saved sign-in.".into());
        }
        let Some(saved) = self.vault.load(&origin, &school, &address)? else {
            return Ok(message(
                401,
                "No saved sign-in was found. Sign in with your password.",
            ));
        };
        // A fresh jar ensures an earlier account's cookies cannot influence validation.
        let fresh = client()?;
        let mut checked = self
            .inspect(&fresh, &saved.bearer, &school, "/api/auth/get-session")
            .await?;
        if checked.status != 200 {
            if [401, 403].contains(&checked.status) {
                self.vault.remove(&key)?;
            }
            return Ok(checked);
        }
        let mut identity: Value = serde_json::from_slice(&checked.body)
            .map_err(|_| "The sign-in could not be confirmed.")?;
        let matches = identity_fields(&identity).is_some_and(|(id, email)| {
            id == saved.user_id && email.trim().to_lowercase() == saved.email
        });
        if !matches {
            self.vault.remove(&key)?;
            return Ok(message(
                401,
                "The saved sign-in has expired or changed. Sign in with your password.",
            ));
        }
        let access = self
            .inspect(&fresh, &saved.bearer, &school, "/api/schools/current")
            .await?;
        if access.status != 200 {
            if [401, 403].contains(&access.status) {
                self.vault.remove(&key)?;
            }
            return Ok(access);
        }
        session.client = fresh;
        session.school = Some(school);
        session.bearer = Some(saved.bearer);
        session.saved_key = Some(key);
        scrub_tokens(&mut identity);
        checked.body = serde_json::to_vec(&identity).map_err(|_| "Invalid sign-in response.")?;
        Ok(checked)
    }
    pub async fn forget_session(&self, school: String, address: String) -> Result<(), String> {
        let key = credential_key(
            &self.origin.origin().ascii_serialization(),
            &school,
            &address,
        )?;
        let mut session = self.session.lock().await;
        self.vault.remove(&key)?;
        if session.saved_key.as_deref() == Some(&key) {
            session.client = client()?;
            session.bearer = None;
            session.saved_key = None;
        }
        Ok(())
    }
}
