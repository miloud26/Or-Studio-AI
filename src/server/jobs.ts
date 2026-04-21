import { JobStatus, ClipMetadata } from '../types.ts';

const jobs = new Map<string, JobStatus>();
const clips = new Map<string, ClipMetadata[]>();

export function createJob(id: string): JobStatus {
  const job: JobStatus = { id, status: 'uploading', progress: 0 };
  jobs.set(id, job);
  return job;
}

export function updateJob(id: string, updates: Partial<JobStatus>) {
  const job = jobs.get(id);
  if (job) {
    Object.assign(job, updates);
  }
}

export function getJob(id: string): JobStatus | undefined {
  return jobs.get(id);
}

export function setJobClips(jobId: string, metadata: ClipMetadata[]) {
  clips.set(jobId, metadata);
}

export function getJobClips(jobId: string): ClipMetadata[] | undefined {
  return clips.get(jobId);
}
