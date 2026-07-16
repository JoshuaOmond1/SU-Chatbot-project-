const firebaseConfig = Object.freeze({
  apiKey: "###################",
  projectId: "su-bot-5tr4th",
});

const sessionKey = "su-assistant:firebase-session:v1";
const profilePrefix = "su-assistant:profile:v1:";

const readJson = (key) => {
  try { return JSON.parse(localStorage.getItem(key) ?? "null"); } catch { return null; }
};

let session = readJson(sessionKey);
let profile = session?.uid ? readJson(`${profilePrefix}${session.uid}`) : null;

const authRequest = async (method, body) => {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${method}?key=${firebaseConfig.apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, returnSecureToken: true }),
  });
  const result = await response.json();
  if (!response.ok) {
    const code = result?.error?.message ?? "AUTHENTICATION_FAILED";
    const messages = {
      EMAIL_EXISTS: "An account already exists for this email.",
      INVALID_LOGIN_CREDENTIALS: "The email or password is incorrect.",
      OPERATION_NOT_ALLOWED: "Email/password accounts must be enabled in Firebase Authentication first.",
      TOO_MANY_ATTEMPTS_TRY_LATER: "Too many attempts. Please wait and try again.",
      WEAK_PASSWORD: "Choose a password with at least six characters.",
    };
    throw new Error(messages[code] ?? code.replaceAll("_", " ").toLowerCase());
  }
  return result;
};

const saveIdentity = (result, nextProfile) => {
  session = {
    uid: result.localId,
    email: result.email,
    idToken: result.idToken,
    refreshToken: result.refreshToken,
    expiresAt: Date.now() + (Number(result.expiresIn) - 60) * 1000,
  };
  profile = nextProfile;
  localStorage.setItem(sessionKey, JSON.stringify(session));
  localStorage.setItem(`${profilePrefix}${session.uid}`, JSON.stringify(profile));
};

const signOut = () => {
  session = null;
  profile = null;
  localStorage.removeItem(sessionKey);
};

const refreshToken = async () => {
  if (!session?.refreshToken) return null;
  if (session.expiresAt > Date.now()) return session.idToken;
  const response = await fetch(`https://securetoken.googleapis.com/v1/token?key=${firebaseConfig.apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: session.refreshToken }),
  });
  const result = await response.json();
  if (!response.ok) { signOut(); return null; }
  session = { ...session, uid: result.user_id, idToken: result.id_token, refreshToken: result.refresh_token, expiresAt: Date.now() + (Number(result.expires_in) - 60) * 1000 };
  localStorage.setItem(sessionKey, JSON.stringify(session));
  return session.idToken;
};

const register = async ({ email, password, profile: nextProfile }) => {
  const result = await authRequest("signUp", { email, password });
  await authRequest("update", { idToken: result.idToken, displayName: nextProfile.fullName });
  saveIdentity(result, { ...nextProfile, email, uid: result.localId, createdAt: new Date().toISOString() });
};

const signIn = async ({ email, password }) => {
  const result = await authRequest("signInWithPassword", { email, password });
  const savedProfile = readJson(`${profilePrefix}${result.localId}`);
  saveIdentity(result, savedProfile ?? {
    uid: result.localId, email: result.email, fullName: result.displayName || result.email.split("@")[0], role: "student", programme: "", yearOfStudy: "", department: "",
  });
};

window.SU_AUTH = Object.freeze({
  getSession: () => session,
  getProfile: () => profile,
  getToken: refreshToken,
  register,
  signIn,
  signOut,
});

const dialog = document.querySelector("#auth-dialog");
const form = document.querySelector("#auth-form");
const loginTab = document.querySelector("#login-tab");
const registerTab = document.querySelector("#register-tab");
const registrationFields = document.querySelector("#registration-fields");
const studentFields = document.querySelector("#student-fields");
const staffFields = document.querySelector("#staff-fields");
const error = document.querySelector("#auth-error");
let mode = "login";

const setMode = (nextMode) => {
  mode = nextMode;
  const registering = mode === "register";
  loginTab.classList.toggle("active", !registering);
  registerTab.classList.toggle("active", registering);
  loginTab.setAttribute("aria-selected", String(!registering));
  registerTab.setAttribute("aria-selected", String(registering));
  registrationFields.classList.toggle("hidden", !registering);
  document.querySelector("#auth-title").textContent = registering ? "Create your account" : "Sign in";
  document.querySelector("#auth-subtitle").textContent = registering ? "Choose Student or Staff to personalise the assistant." : "Sign in to continue your personalised conversation.";
  document.querySelector("#auth-submit").textContent = registering ? "Create account" : "Sign in";
  document.querySelector("#full-name").required = registering;
  document.querySelector("#auth-password").autocomplete = registering ? "new-password" : "current-password";
  error.classList.add("hidden");
};

const updateRoleFields = () => {
  const role = form.elements.role.value;
  studentFields.classList.toggle("hidden", role !== "student");
  staffFields.classList.toggle("hidden", role !== "staff");
};

const renderAccount = () => {
  const signedIn = Boolean(session && profile);
  document.querySelector("#login-button").classList.toggle("hidden", signedIn);
  document.querySelector("#signup-button").classList.toggle("hidden", signedIn);
  document.querySelector("#sign-out-button").classList.toggle("hidden", !signedIn);
  const summary = document.querySelector("#account-summary");
  summary.classList.toggle("hidden", !signedIn);
  if (signedIn) summary.textContent = `${profile.fullName} · ${profile.role === "staff" ? "Staff" : "Student"}`;
};

document.querySelector("#login-button").addEventListener("click", () => { setMode("login"); dialog.showModal(); });
document.querySelector("#signup-button").addEventListener("click", () => { setMode("register"); dialog.showModal(); });
document.querySelector("#auth-close").addEventListener("click", () => dialog.close());
loginTab.addEventListener("click", () => setMode("login"));
registerTab.addEventListener("click", () => setMode("register"));
form.querySelectorAll('input[name="role"]').forEach((input) => input.addEventListener("change", updateRoleFields));
document.querySelector("#sign-out-button").addEventListener("click", () => { signOut(); location.reload(); });

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  error.classList.add("hidden");
  form.classList.add("busy");
  const data = new FormData(form);
  try {
    if (mode === "register") {
      const role = data.get("role");
      await register({
        email: String(data.get("email")).trim().toLowerCase(),
        password: String(data.get("password")),
        profile: {
          fullName: String(data.get("fullName")).trim(), role,
          programme: role === "student" ? String(data.get("programme")).trim() : "",
          yearOfStudy: role === "student" ? String(data.get("yearOfStudy")) : "",
          department: role === "staff" ? String(data.get("department")).trim() : "",
        },
      });
    } else {
      await signIn({ email: String(data.get("email")).trim().toLowerCase(), password: String(data.get("password")) });
    }
    location.reload();
  } catch (caught) {
    error.textContent = caught instanceof Error ? caught.message : "Unable to continue.";
    error.classList.remove("hidden");
  } finally { form.classList.remove("busy"); }
});

setMode("login");
updateRoleFields();
renderAccount();
