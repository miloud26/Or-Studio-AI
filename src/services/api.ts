import axios from 'axios';
import { JobStatus, ClipMetadata, MontagePlan, PromptResponse } from '../types.ts';

export const uploadClips = async (files: File[]): Promise<{ jobId: string, clips: ClipMetadata[] }> => {
  const formData = new FormData();
  files.forEach(file => formData.append('clips', file));
  const response = await axios.post('/api/upload', formData);
  return response.data;
};

export const analyzeJob = async (jobId: string, prompt: string, mode: string): Promise<MontagePlan | PromptResponse> => {
  const response = await axios.post('/api/analyze', { jobId, prompt, mode });
  return response.data;
};

export const startRender = async (jobId: string, montagePlan: MontagePlan): Promise<void> => {
  await axios.post('/api/render', { jobId, montagePlan });
};

export const getJobStatus = async (jobId: string): Promise<JobStatus> => {
  const response = await axios.get(`/api/status/${jobId}`);
  return response.data;
};
