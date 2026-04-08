<script lang="ts">
  import { api } from "$lib/api";

  let code = $state("");
  let status = $state("");
  let output = $state<string | null>(null);

  async function pollResult(submissionId: string) {
    status = "Executing...";

    try {
      const { data, error } = await api.api.result({ id: submissionId }).get();

      if (error) throw error;
      
      if (!data) return;

      for await (const chunk of data) {
        if (!chunk.data) continue;
        
        const payload = chunk.data as { status: string, output: string | null };
        if (payload.status === "completed") {
          status = "Completed!";
          output = payload.output;
          return;
        } else if (payload.status === "timeout") {
          status = "Execution timed out.";
          return;
        } else {
          status = `${payload.status}...`;
        }
      }
    } catch (e: unknown) {
      console.error("Polling error", e);
      status = "Error: " + (e instanceof Error ? e.message : String(e));
    }
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
    } catch (e: unknown) {
      status = "Error: " + (e instanceof Error ? e.message : String(e));
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
