use fred::prelude::*;
use std::collections::HashMap;
use std::io::Write;
use std::process::{Command, Stdio};
use tokio::task;

const MAX_OUTPUT_BYTES: usize = 64 * 1024;
const EXECUTION_TIMEOUT_SECS: &str = "5";
const RESULT_TTL_SECONDS: i64 = 3600;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let redis_url = std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://localhost:6379".to_string());
    println!("Connecting to Redis at {}...", redis_url);
    let config = Config::from_url(&redis_url)?;
    
    let listener_client = Builder::from_config(config.clone()).build()?;
    listener_client.init().await?;

    let worker_client = Builder::from_config(config).build()?;
    worker_client.init().await?;

    let mut last_id = "$".to_string();
    println!("NSJail Judger ready. Listening for submissions...");

    loop {
        let reply: Option<Vec<(String, Vec<(String, HashMap<String, String>)>)>> = listener_client
            .xread(Some(1), Some(0), "code_submissions", &last_id)
            .await?;

        if let Some(streams) = reply {
            for stream in streams {
                for (id, data) in stream.1 {
                    last_id = id.clone();

                    let code = data.get("code").cloned().unwrap_or_default();
                    let sub_id = data.get("id").cloned().unwrap_or_default();

                    if code.is_empty() || sub_id.is_empty() {
                        continue;
                    }

                    let client_clone = worker_client.clone();
                    task::spawn(async move {
                        handle_submission(client_clone, sub_id, code).await;
                    });
                }
            }
        }
    }
}

async fn handle_submission(client: Client, id: String, code: String) {
    let result_key = format!("result:{}", id);
    println!("Executing submission: {}", id);

    let claimed: Option<String> = client
        .set::<Option<String>, _, _>(
            &result_key,
            "PROCESSING",
            Some(Expiration::EX(RESULT_TTL_SECONDS)),
            Some(SetOptions::NX),
            false,
        )
        .await
        .unwrap_or(None);

    if claimed.is_none() {
        return;
    }

    let output = task::spawn_blocking(move || run_in_nsjail(code))
        .await
        .unwrap_or_else(|_| "Internal Worker Error".to_string());

    let _: () = client
        .set(
            &result_key,
            output,
            Some(Expiration::EX(RESULT_TTL_SECONDS)),
            None,
            false,
        )
        .await
        .unwrap_or_else(|e| println!("Redis Error: {}", e));
}
 
fn run_in_nsjail(code: String) -> String {
    println!("Running in NSJail...");

    let mut child = Command::new("nsjail")
        .args([
            "-Mo", 
            "--chroot",
            "/", 
            "--user",
            "99999", 
            "--group",
            "99999", 
            "--time_limit",
            EXECUTION_TIMEOUT_SECS,
            "--max_cpus",
            "1",
            "--rlimit_as",
            "256",            
            "--disable_proc", 
            "--",             
            "/usr/bin/python3",
            "-u",
            "-", 
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("Failed to spawn nsjail process");

    if let Some(mut stdin) = child.stdin.take() {
        std::thread::spawn(move || {
            let _ = stdin.write_all(code.as_bytes());
        });
    }

    let output = child
        .wait_with_output()
        .expect("Failed to read nsjail output");

    let mut result = String::from_utf8_lossy(&output.stdout).to_string();
    result.push_str(&String::from_utf8_lossy(&output.stderr));

    if result.len() > MAX_OUTPUT_BYTES {
        result.truncate(MAX_OUTPUT_BYTES);
        result.push_str("\n[Output truncated]");
    }

    if result.is_empty() && output.status.code() != Some(0) {
        return "Runtime Error (No Output)".to_string();
    }

    result
}