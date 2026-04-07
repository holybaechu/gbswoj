<script lang="ts">
  import { api } from "$lib/api";

  let code = $state("");
  let status = $state("");
  let output = $state<string | null>(null);

  async function pollResult(submissionId: string) {
    status = "Executing...";

    for (let i = 0; i < 10; i++) {
      await new Promise((resolve) => setTimeout(resolve, 1000));

      try {
        const { data, error } = await api.api.result({ id: submissionId }).get();

        if (data && data.status === "completed") {
          status = "Completed!";
          output = data.output;
          return;
        }
      } catch (e) {
        console.error("Polling error", e);
      }
    }
    status = "Execution timed out.";
  }

  async function submitCode() {
    status = "Submitting...";
    output = null;
    try {
      const { data, error } = await api.api.submit.post({ code });

      if (data) {
        pollResult(data.submission_id);
      } else {
        status = `Failed to submit: ${error?.value || 'Unknown error'}`;
      }
    } catch (e: any) {
      status = "Error: " + e.message;
    }
  }
</script>

<h1>Python Code Runner</h1>
<textarea bind:value={code} rows="10" cols="50" placeholder="Enter Python code here..."></textarea>
<br />
<button onclick={submitCode}>Run Code</button>

<h3>Status: {status}</h3>

{#if output !== null}
  <h3>Output:</h3>
  <pre style="background: #eee; padding: 10px; border-radius: 4px;">{output}</pre>
{/if}
