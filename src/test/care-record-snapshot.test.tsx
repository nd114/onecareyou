import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * "Save record" asks the server; the browser never writes the record.
 *
 * The old hook built the HTML here, uploaded it to the patient's own folder and
 * inserted the row as the patient — which made the "permanent" record the
 * patient's own upload, deletable and editable by them, and silently absent if
 * the tab closed first. These cases pin the replacement: one RPC that queues
 * the job, one call to the worker, and nothing written from the client.
 */

const rpc = vi.fn();
const invoke = vi.fn();
const from = vi.fn();
const upload = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    functions: { invoke: (...args: unknown[]) => invoke(...args) },
    from: (...args: unknown[]) => from(...args),
    storage: { from: () => ({ upload }) },
  },
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), info: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

import { useCareRecordSnapshot, fileQueuedCareRecords } from '@/hooks/useCareRecordSnapshot';

const JOB = '11111111-2222-4333-8444-555555555555';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  rpc.mockReset();
  invoke.mockReset();
  from.mockReset();
  upload.mockReset();
  toast.success.mockReset();
  toast.info.mockReset();
  toast.error.mockReset();
});

describe('useCareRecordSnapshot', () => {
  it('queues the record on the server and asks the worker to file that job', async () => {
    rpc.mockResolvedValue({ data: JOB, error: null });
    invoke.mockResolvedValue({ data: { results: [{ job_id: JOB, status: 'filed' }] }, error: null });

    const { result } = renderHook(() => useCareRecordSnapshot(), { wrapper });
    result.current.generate.mutate({ shareId: 'share-1' });

    await waitFor(() => expect(result.current.generate.isSuccess).toBe(true));
    expect(rpc).toHaveBeenCalledWith('request_care_record_snapshot', { _share_id: 'share-1' });
    expect(invoke).toHaveBeenCalledWith('care-record-snapshots', { body: { job_id: JOB } });
    expect(result.current.generate.data).toBe('filed');
    expect(toast.success).toHaveBeenCalledWith('Care record saved to your Health Vault');
  });

  it('never writes the record from the browser', async () => {
    rpc.mockResolvedValue({ data: JOB, error: null });
    invoke.mockResolvedValue({ data: { results: [{ job_id: JOB, status: 'filed' }] }, error: null });

    const { result } = renderHook(() => useCareRecordSnapshot(), { wrapper });
    result.current.generate.mutate({ shareId: 'share-1' });
    await waitFor(() => expect(result.current.generate.isSuccess).toBe(true));

    expect(from).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it('says "being prepared", not "saved", when the worker is unreachable', async () => {
    rpc.mockResolvedValue({ data: JOB, error: null });
    invoke.mockResolvedValue({ data: null, error: { message: 'FunctionsFetchError' } });

    const { result } = renderHook(() => useCareRecordSnapshot(), { wrapper });
    result.current.generate.mutate({ shareId: 'share-1' });

    await waitFor(() => expect(result.current.generate.isSuccess).toBe(true));
    expect(result.current.generate.data).toBe('queued');
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalledWith(expect.stringMatching(/being prepared/));
  });

  it('reports a job another worker is still filing as queued, not saved', async () => {
    rpc.mockResolvedValue({ data: JOB, error: null });
    invoke.mockResolvedValue({ data: { results: [{ job_id: JOB, status: 'processing' }] }, error: null });

    const { result } = renderHook(() => useCareRecordSnapshot(), { wrapper });
    result.current.generate.mutate({ shareId: 'share-1' });
    await waitFor(() => expect(result.current.generate.isSuccess).toBe(true));
    expect(result.current.generate.data).toBe('queued');
  });

  it('explains an invitation nobody ever held instead of showing an error', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'P0002', message: 'no record between you' } });

    const { result } = renderHook(() => useCareRecordSnapshot(), { wrapper });
    result.current.generate.mutate({ shareId: 'share-1' });

    await waitFor(() => expect(result.current.generate.isError).toBe(true));
    expect(invoke).not.toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalledWith(expect.stringMatching(/not joined yet/));
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('shows the server refusal when the request is refused', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'Only the patient can file a care record for this connection' },
    });

    const { result } = renderHook(() => useCareRecordSnapshot(), { wrapper });
    result.current.generate.mutate({ shareId: 'share-1' });

    await waitFor(() => expect(result.current.generate.isError).toBe(true));
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/Only the patient/));
  });
});

describe('fileQueuedCareRecords', () => {
  it('asks the worker for the patient\'s queued records after a share ends', async () => {
    invoke.mockResolvedValue({ data: { results: [] }, error: null });
    await expect(fileQueuedCareRecords()).resolves.toBe('queued');
    expect(invoke).toHaveBeenCalledWith('care-record-snapshots', { body: {} });
  });

  it('never throws, because ending a share must not fail on it', async () => {
    invoke.mockRejectedValue(new Error('offline'));
    await expect(fileQueuedCareRecords()).resolves.toBe('queued');
  });
});
