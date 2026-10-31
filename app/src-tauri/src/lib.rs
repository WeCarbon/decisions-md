use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Mutex;
use std::time::Instant;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

const NPM_PACKAGE: &str = "@wecarbon/decisions-md";

struct AppState {
    started: Instant,
    env: Mutex<Option<ShellEnv>>,
    monitor: Mutex<Option<u32>>,
}

/// What a login shell would find. A GUI app starts with launchd's bare PATH,
/// so `node` and `decs` are looked up the way the owner's terminal does.
#[derive(Clone, Serialize, Deserialize)]
struct ShellEnv {
    path: String,
    node: Option<String>,
    node_version: Option<String>,
    npm: Option<String>,
    decs: Option<String>,
    decs_version: Option<String>,
}

#[derive(Serialize)]
struct RunOutput {
    code: i32,
    stdout: String,
    stderr: String,
}

fn data_dir(app: &AppHandle) -> PathBuf {
    let dir = app.path().app_data_dir().unwrap_or_else(|_| std::env::temp_dir().join("decs-app"));
    let _ = std::fs::create_dir_all(&dir);
    dir
}

fn login_path() -> String {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    let out = std::process::Command::new(shell)
        .args(["-ilc", "printf '\\n__DECS_PATH__%s\\n' \"$PATH\""])
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .output();
    let found = out.ok().and_then(|o| {
        String::from_utf8_lossy(&o.stdout)
            .lines()
            .find_map(|l| l.strip_prefix("__DECS_PATH__").map(str::to_string))
    });
    let base = std::env::var("PATH").unwrap_or_default();
    let extra = "/opt/homebrew/bin:/usr/local/bin";
    match found {
        Some(p) if !p.is_empty() => format!("{p}:{extra}:{base}"),
        _ => format!("{extra}:{base}"),
    }
}

fn which(name: &str, path: &str) -> Option<String> {
    std::env::split_paths(path)
        .map(|d| d.join(name))
        .find(|p| p.is_file())
        .map(|p| p.to_string_lossy().into_owned())
}

fn first_line(cmd: &str, args: &[&str], path: &str) -> Option<String> {
    let out = std::process::Command::new(cmd).args(args).env("PATH", path).stdin(Stdio::null()).output().ok()?;
    if !out.status.success() {
        return None;
    }
    String::from_utf8_lossy(&out.stdout).lines().next().map(|s| s.trim().to_string())
}

fn probe() -> ShellEnv {
    let path = login_path();
    let decs = std::env::var("DECS_BIN").ok().filter(|p| !p.is_empty()).or_else(|| which("decs", &path));
    let node = which("node", &path);
    ShellEnv {
        node_version: node.as_ref().and_then(|n| first_line(n, &["--version"], &path)),
        decs_version: decs.as_ref().and_then(|d| first_line(d, &["--version"], &path)),
        npm: which("npm", &path),
        node,
        decs,
        path,
    }
}

fn env_file(app: &AppHandle) -> PathBuf {
    data_dir(app).join("env.json")
}

fn cached_env(app: &AppHandle, state: &AppState) -> Option<ShellEnv> {
    if let Some(e) = state.env.lock().unwrap().clone() {
        return Some(e);
    }
    let text = std::fs::read_to_string(env_file(app)).ok()?;
    let env: ShellEnv = serde_json::from_str(&text).ok()?;
    let still_there = env.decs.as_ref().map(|d| PathBuf::from(d).is_file()).unwrap_or(false);
    if !still_there {
        return None;
    }
    *state.env.lock().unwrap() = Some(env.clone());
    Some(env)
}

fn refresh_env(app: &AppHandle, state: &AppState) -> ShellEnv {
    let env = probe();
    if let Ok(text) = serde_json::to_string(&env) {
        let _ = std::fs::write(env_file(app), text);
    }
    *state.env.lock().unwrap() = Some(env.clone());
    env
}

#[tauri::command]
async fn shell_env(app: AppHandle, state: State<'_, AppState>, refresh: bool) -> Result<ShellEnv, String> {
    if !refresh {
        if let Some(e) = cached_env(&app, &state) {
            return Ok(e);
        }
    }
    Ok(refresh_env(&app, &state))
}

fn decs_command(env: &ShellEnv, args: &[String], cwd: Option<&str>) -> Result<Command, String> {
    let bin = env.decs.clone().ok_or("decs is not installed")?;
    let mut cmd = Command::new(bin);
    cmd.args(args)
        .env("PATH", &env.path)
        .env("NO_COLOR", "1")
        .env_remove("CLAUDECODE")
        .env_remove("DECS_ROLE")
        .stdin(Stdio::null());
    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }
    Ok(cmd)
}

#[tauri::command]
async fn decs(app: AppHandle, state: State<'_, AppState>, args: Vec<String>, cwd: Option<String>) -> Result<RunOutput, String> {
    let env = cached_env(&app, &state).unwrap_or_else(|| refresh_env(&app, &state));
    let out = decs_command(&env, &args, cwd.as_deref())?.output().await.map_err(|e| e.to_string())?;
    Ok(RunOutput {
        code: out.status.code().unwrap_or(-1),
        stdout: String::from_utf8_lossy(&out.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&out.stderr).into_owned(),
    })
}

/// `decs monitor --updates --json`, one `decs-event` per line, restarted whenever it exits.
#[tauri::command]
async fn monitor_start(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    if state.monitor.lock().unwrap().is_some() {
        return Ok(());
    }
    let env = cached_env(&app, &state).unwrap_or_else(|| refresh_env(&app, &state));
    if env.decs.is_none() {
        return Err("decs is not installed".into());
    }
    *state.monitor.lock().unwrap() = Some(0);
    let args: Vec<String> = ["monitor", "--updates", "--json", "--idle-exit", "0", "--interval", "800", "--all"]
        .iter()
        .map(|s| s.to_string())
        .collect();
    tauri::async_runtime::spawn(async move {
        loop {
            let Ok(mut cmd) = decs_command(&env, &args, None) else { break };
            cmd.stdout(Stdio::piped()).stderr(Stdio::null()).kill_on_drop(true);
            if let Ok(mut child) = cmd.spawn() {
                if let Some(pid) = child.id() {
                    *app.state::<AppState>().monitor.lock().unwrap() = Some(pid);
                }
                if let Some(stdout) = child.stdout.take() {
                    let mut lines = BufReader::new(stdout).lines();
                    while let Ok(Some(line)) = lines.next_line().await {
                        let _ = app.emit("decs-event", line);
                    }
                }
                let _ = child.wait().await;
            }
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        }
    });
    Ok(())
}

#[tauri::command]
fn snapshot_load(app: AppHandle) -> Option<String> {
    std::fs::read_to_string(data_dir(&app).join("bench.json")).ok()
}

#[tauri::command]
fn snapshot_save(app: AppHandle, json: String) -> Result<(), String> {
    let dir = data_dir(&app);
    let tmp = dir.join("bench.json.tmp");
    std::fs::write(&tmp, json).map_err(|e| e.to_string())?;
    std::fs::rename(tmp, dir.join("bench.json")).map_err(|e| e.to_string())
}

#[tauri::command]
fn prefs_load(app: AppHandle) -> Option<String> {
    std::fs::read_to_string(data_dir(&app).join("prefs.json")).ok()
}

#[tauri::command]
fn prefs_save(app: AppHandle, json: String) -> Result<(), String> {
    std::fs::write(data_dir(&app).join("prefs.json"), json).map_err(|e| e.to_string())
}

/// The window stays hidden until the first frame is drawn, so it never flashes blank.
#[tauri::command]
fn ready(app: AppHandle, state: State<'_, AppState>, what: String) -> u128 {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    }
    let ms = state.started.elapsed().as_millis();
    if std::env::var("DECS_APP_TIMING").is_ok() {
        eprintln!("decs-app: {what} {ms} ms after launch");
    }
    ms
}

/// Errors the page hits, on the app's stderr: the window has no console in a release build.
#[tauri::command]
fn log(line: String) {
    eprintln!("decs-app: {line}");
}

#[tauri::command]
async fn install_decs(app: AppHandle, state: State<'_, AppState>) -> Result<RunOutput, String> {
    let env = refresh_env(&app, &state);
    let npm = env.npm.clone().ok_or("npm is not installed")?;
    let out = Command::new(npm)
        .args(["install", "-g", NPM_PACKAGE])
        .env("PATH", &env.path)
        .stdin(Stdio::null())
        .output()
        .await
        .map_err(|e| e.to_string())?;
    refresh_env(&app, &state);
    Ok(RunOutput {
        code: out.status.code().unwrap_or(-1),
        stdout: String::from_utf8_lossy(&out.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&out.stderr).into_owned(),
    })
}

pub fn run() {
    let started = Instant::now();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState { started, env: Mutex::new(None), monitor: Mutex::new(None) })
        .invoke_handler(tauri::generate_handler![
            shell_env,
            decs,
            monitor_start,
            snapshot_load,
            snapshot_save,
            prefs_load,
            prefs_save,
            ready,
            install_decs,
            log
        ])
        .setup(|app| {
            // Shown by `ready` once the first frame is drawn; this is only the fallback if the page never says so.
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_millis(1500)).await;
                if let Some(w) = handle.get_webview_window("main") {
                    if !w.is_visible().unwrap_or(true) {
                        let _ = w.show();
                    }                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running decs");
}
