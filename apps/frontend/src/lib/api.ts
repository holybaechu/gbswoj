export interface CreateSubmissionRequest {
  code: string;
}

export interface CreateSubmissionResponse {
  status: 'ok';
  submissionId: string;
}

export interface SubmissionResultEvent {
  status: 'pending' | 'completed' | 'timeout';
  output: string | null;
}

const apiBasePath = '/api';

async function getErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as {
      message?: string | string[];
    };

    if (Array.isArray(payload.message)) {
      return payload.message.join(', ');
    }

    if (payload.message) {
      return payload.message;
    }
  } catch {
    return response.statusText || 'Request failed';
  }

  return response.statusText || 'Request failed';
}

export const submissionsClient = {
  async create(
    body: CreateSubmissionRequest,
  ): Promise<CreateSubmissionResponse> {
    const response = await fetch(`${apiBasePath}/submissions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response));
    }

    return (await response.json()) as CreateSubmissionResponse;
  },

  subscribe(
    submissionId: string,
    handlers: {
      onMessage: (event: SubmissionResultEvent) => void;
      onError: (error: Error) => void;
    },
  ): EventSource {
    const eventSource = new EventSource(
      `${apiBasePath}/submissions/${submissionId}/events`,
    );

    eventSource.onmessage = (event) => {
      try {
        handlers.onMessage(JSON.parse(event.data) as SubmissionResultEvent);
      } catch {
        handlers.onError(new Error('Invalid server event payload.'));
      }
    };

    eventSource.onerror = () => {
      handlers.onError(new Error('Failed to receive submission updates.'));
    };

    return eventSource;
  },
};
