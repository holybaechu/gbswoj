'use client';

import { useEffect, useRef, useState } from 'react';
import {
  submissionsClient,
  type SubmissionResultEvent,
} from '@/lib/api';

export default function Home() {
  const [code, setCode] = useState('');
  const [status, setStatus] = useState('');
  const [output, setOutput] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  function closeSubmissionStream() {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
  }

  function handleSubmissionEvent(payload: SubmissionResultEvent) {
    if (payload.status === 'completed') {
      setStatus('Completed!');
      setOutput(payload.output);
      closeSubmissionStream();
      return;
    }

    if (payload.status === 'timeout') {
      setStatus('Execution timed out.');
      closeSubmissionStream();
      return;
    }

    setStatus('Executing...');
  }

  async function pollResult(submissionId: string) {
    closeSubmissionStream();
    setStatus('Executing...');

    try {
      eventSourceRef.current = submissionsClient.subscribe(submissionId, {
        onMessage: handleSubmissionEvent,
        onError: (error: Error) => {
          closeSubmissionStream();
          setStatus(`Error: ${error.message}`);
        },
      });
    } catch (e: unknown) {
      console.error('Polling error', e);
      setStatus('Error: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function submitCode() {
    closeSubmissionStream();
    setStatus('Submitting...');
    setOutput(null);

    try {
      const data = await submissionsClient.create({ code });
      await pollResult(data.submissionId);
    } catch (e: unknown) {
      setStatus('Error: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  return (
    <main>
      <h1>Python Code Runner</h1>
      <textarea
        value={code}
        onChange={(e) => setCode(e.target.value)}
        rows={10}
        placeholder="Enter Python code here..."
      />
      <br />
      <button 
        onClick={submitCode}
      >
        Run Code
      </button>

      <h3>Status: {status}</h3>

      {output !== null && (
        <div>
          <h3>Output:</h3>
          <pre>
            {output}
          </pre>
        </div>
      )}
    </main>
  );
}
