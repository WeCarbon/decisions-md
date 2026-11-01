//! `decs` → Noddit: every `DECS_*` environment variable this app reads keeps
//! working under its `NODDIT_*` name. Reads check `NODDIT_<suffix>` first,
//! then fall back to `DECS_<suffix>` — the owner's machine, scripts and
//! `app/e2e/run.sh` may still set either one.

use std::env;
use std::ffi::OsString;

/// `NODDIT_<suffix>` if set (even to an empty string), else `DECS_<suffix>`, else `None`.
pub fn var(suffix: &str) -> Option<String> {
    var_os(suffix).map(|v| v.to_string_lossy().into_owned())
}

/// Same precedence as `var`, without requiring valid UTF-8.
pub fn var_os(suffix: &str) -> Option<OsString> {
    env::var_os(format!("NODDIT_{suffix}")).or_else(|| env::var_os(format!("DECS_{suffix}")))
}

/// True if `NODDIT_<suffix>` or `DECS_<suffix>` is set at all, for a flag read by presence rather than value.
pub fn is_set(suffix: &str) -> bool {
    var_os(suffix).is_some()
}

/// Removes both `NODDIT_<suffix>` and `DECS_<suffix>` from `cmd`'s env, so neither reaches the child.
pub fn remove<'a>(cmd: &'a mut tokio::process::Command, suffix: &str) -> &'a mut tokio::process::Command {
    cmd.env_remove(format!("NODDIT_{suffix}")).env_remove(format!("DECS_{suffix}"))
}
