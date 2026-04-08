use fred::prelude::*;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::os::unix::io::FromRawFd;
use std::process::{Command, Stdio};
use tokio::task;

const MAX_OUTPUT_BYTES: usize = 64 * 1024;
const EXECUTION_TIMEOUT_SECS: &str = "5";
const RESULT_TTL_SECONDS: i64 = 3600;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let redis_url =
        std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://localhost:6379".to_string());
    println!("Connecting to Redis at {}...", redis_url);
    let config = Config::from_url(&redis_url)?;

    let listener_client = loop {
        let client = Builder::from_config(config.clone()).build()?;
        if let Err(e) = client.init().await {
            println!("Listener client failed to connect to Redis: {}. Retrying in 2 seconds...", e);
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        } else {
            break client;
        }
    };

    let worker_client = loop {
        let client = Builder::from_config(config.clone()).build()?;
        if let Err(e) = client.init().await {
            println!("Worker client failed to connect to Redis: {}. Retrying in 2 seconds...", e);
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        } else {
            break client;
        }
    };

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
            output.clone(),
            Some(Expiration::EX(RESULT_TTL_SECONDS)),
            None,
            false,
        )
        .await
        .unwrap_or_else(|e| println!("Redis Error: {}", e));

    let _: () = client
        .publish(format!("result_pub:{}", id), output)
        .await
        .unwrap_or_else(|e| println!("Redis Error: {}", e));
}

fn run_in_nsjail(code: String) -> String {
    println!("Running in NSJail...");

    let mut log_fds: [libc::c_int; 2] = [0; 2];
    unsafe {
        if libc::pipe(log_fds.as_mut_ptr()) != 0 {
            return "Internal Error: Failed to create log pipe".to_string();
        }
    }
    
    let log_read_fd_raw = log_fds[0];
    let log_write_fd_raw = log_fds[1];
    let log_write_fd_str = log_write_fd_raw.to_string();

    let mut child = Command::new("nsjail")
        .args([
            "-Mo",
            "-R", "/bin",
            "-R", "/lib",
            "-R", "/usr",
            "-R", "/etc",
            "-R", "/dev/urandom",
            "-R", "/dev/null",
            "-R", "/dev/zero",
            "-T", "/tmp",
            "--user", "65534",
            "--group", "65534",
            "--hostname", "gbswoj",
            "--log_fd", &log_write_fd_str,
            "--time_limit", EXECUTION_TIMEOUT_SECS,
            "--rlimit_cpu", EXECUTION_TIMEOUT_SECS,
            "--rlimit_fsize", "5",
            "--max_cpus", "1",
            "--rlimit_as", "256",
            "--rlimit_nproc", "64",
            "--disable_proc",
            "--pass_fd", &log_write_fd_str,
            "--", "/usr/bin/python3", "-u", "-",
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("Failed to spawn nsjail process");

    // Close the write end in the parent process
    unsafe { libc::close(log_write_fd_raw) };

    if let Some(mut stdin) = child.stdin.take() {
        std::thread::spawn(move || {
            let _ = stdin.write_all(code.as_bytes());
        });
    }

    let nsjail_log = unsafe { std::fs::File::from_raw_fd(log_read_fd_raw) };
    let nsjail_log_thread = std::thread::spawn(move || {
        let mut out = String::new();
        let log_ref = nsjail_log;
        let _ = log_ref.take(MAX_OUTPUT_BYTES as u64).read_to_string(&mut out);
        out
    });

    let stdout = child.stdout.take().expect("Failed to open stdout");
    let stderr = child.stderr.take().expect("Failed to open stderr");

    let stdout_thread = std::thread::spawn(move || {
        let mut out = String::new();
        let _ = stdout.take(MAX_OUTPUT_BYTES as u64).read_to_string(&mut out);
        out
    });

    let mut result_err = String::new();
    let _ = stderr.take(MAX_OUTPUT_BYTES as u64).read_to_string(&mut result_err);

    let result_out = stdout_thread.join().unwrap_or_default();
    let nsjail_log_out = nsjail_log_thread.join().unwrap_or_default();
    
    let output_status = child.wait().expect("Failed to wait on nsjail");

    if !nsjail_log_out.is_empty() {
        println!("Nsjail internal log: {}", nsjail_log_out);
    }

    let mut result = result_out;
    result.push_str(&result_err);

    if result.len() > MAX_OUTPUT_BYTES {
        result.truncate(MAX_OUTPUT_BYTES);
        result.push_str("\n[Output truncated]");
    }

    if result.is_empty() && output_status.code() != Some(0) {
        return "Runtime Error (No Output)".to_string();
    }

    result
}