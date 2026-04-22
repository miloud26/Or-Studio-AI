import { z } from 'zod';

// --- Common types for self-review ---
export const SelfReviewSchema = z.object({
  issues_found: z.array(z.string()),
  fixes_applied: z.array(z.string()),
});

// --- Prompt Mode Types ---
export const PromptResponseSchema = z.object({
  mode: z.literal('prompt_generation'),
  applied_skills: z.array(z.string()),
  visual_summary: z.object({
    subject: z.string(),
    scene: z.string(),
    camera: z.string(),
    motion: z.string(),
    lighting: z.string(),
    composition: z.string(),
    color_palette: z.string(),
    mood: z.string(),
    style: z.string(),
  }),
  creative_direction: z.object({
    prompt: z.string(),
    negative_prompt: z.string(),
    keywords: z.array(z.string()),
    camera_language: z.array(z.string()),
    motion_language: z.array(z.string()),
    lighting_language: z.array(z.string()),
    composition_rules: z.array(z.string()),
  }),
  confidence: z.number(),
  self_review: SelfReviewSchema,
});

export type PromptResponse = z.infer<typeof PromptResponseSchema>;

// --- Montage Mode Types ---
export const ClipAnalysisSchema = z.object({
  clip_id: z.string(),
  hook_value: z.number(),
  motion_energy: z.number(),
  product_focus: z.number(),
  face_presence: z.number(),
  composition_score: z.number(),
  transition_fit: z.string(), // "cut|fade|xfade"
  color_mood: z.string(),
  ad_usefulness: z.number(),
  recommended_role: z.string(), // "hook|support|proof|cta"
});

export const TimelineEffectSchema = z.object({
  motion: z.object({
    zoom: z.enum(['none', 'in', 'out']),
    strength: z.number(),
  }),
  color: z.object({
    brightness: z.number(),
    contrast: z.number(),
    saturation: z.number(),
  }),
  overlay: z.object({
    text: z.string(),
    safe_area: z.enum(['center', 'upper_third', 'lower_third', 'none']),
  }),
});

export const TimelineItemSchema = z.object({
  order: z.number(),
  clip_id: z.string(),
  start_seconds: z.number(),
  end_seconds: z.number(),
  duration_seconds: z.number(),
  role: z.string(),
  transition: z.object({
    type: z.string(),
    duration: z.number(),
  }),
  effects: TimelineEffectSchema.optional(),
});

export const RenderConfigSchema = z.object({
  width: z.number().default(1080),
  height: z.number().default(1920),
  fps: z.number().default(30),
  total_duration: z.number(),
  video_codec: z.string().default('libx264'),
  audio_codec: z.string().default('aac'),
  pix_fmt: z.string().default('yuv420p'),
});

export const MontagePlanSchema = z.object({
  mode: z.literal('montage_planning'),
  project_type: z.string().default('ugc_ad'),
  style: z.string().default('fast_cut_premium_ad'),
  applied_skills: z.array(z.string()),
  clip_analysis: z.array(ClipAnalysisSchema),
  timeline: z.array(TimelineItemSchema),
  render: RenderConfigSchema,
  editing_notes: z.array(z.string()),
  fallback_strategy: z.record(z.string(), z.string()),
  confidence: z.number(),
  self_review: SelfReviewSchema,
});

export type MontagePlan = z.infer<typeof MontagePlanSchema>;

// --- Common Types ---
export interface ClipMetadata {
  id: string;
  filename: string;
  originalName: string;
  path: string;
  duration: number;
  width: number;
  height: number;
  fps: number;
  size: number;
}

export interface JobStatus {
  id: string;
  status: 'uploading' | 'analyzing' | 'rendering' | 'completed' | 'failed';
  progress: number;
  mode?: 'PROMPT' | 'MONTAGE';
  error?: string;
  outputUrl?: string; // For MP4 content
  montagePlan?: MontagePlan;
  promptResponse?: PromptResponse;
}
