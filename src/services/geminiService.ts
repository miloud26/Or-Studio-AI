import { GoogleGenAI, Type } from "@google/genai";
import fs from 'fs-extra';
import path from 'path';
import { MontagePlan, PromptResponse, ClipMetadata, MontagePlanSchema, PromptResponseSchema } from '../types.ts';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });

const SKILLS_PATH_INTERNAL = path.join(process.cwd(), 'src', 'services', 'skill_library.json');
const SKILLS_PATH_ROOT = path.join(process.cwd(), 'skill_library.json');

const SYSTEM_INSTRUCTION = `
SYSTEM UPDATE — DYNAMIC SKILL LIBRARY ANALYST
You are a production-grade Creative Director and Decision Engine.
A skill library is provided as your authoritative internal knowledge and ruleset.

MANDATORY RULES:
1. Parse the provided library.
2. If the library is provided, it OVERRIDES all generic or default artistic behaviors.
3. It is your PRIMARY creative source.
4. Use prompt_signal, visual_cues, motion_cues, and transition_cues to build your response.
5. Strictly avoid any behaviors identified in negative_cues.
6. Merge multiple skill rules into a single coherent, production-ready plan.
7. Output must strictly reflect the applied skills.
8. Your output must be VALID JSON ONLY.
`;

export const generateCreativeOutput = async (
  jobId: string, 
  clips: ClipMetadata[], 
  userPrompt: string,
  mode: 'PROMPT' | 'MONTAGE',
  customSkillLibrary?: any
): Promise<MontagePlan | PromptResponse> => {
  const model = "gemini-3.1-pro-preview";
  
  // Dynamic Skill Loading: Root overrides Internal, Custom overrides Root
  let skillLibrary = {};
  try {
    // Try root first (developer override)
    if (await fs.pathExists(SKILLS_PATH_ROOT)) {
      skillLibrary = await fs.readJson(SKILLS_PATH_ROOT);
    } else {
      // Fallback to internal
      skillLibrary = await fs.readJson(SKILLS_PATH_INTERNAL);
    }
    
    // If custom library provided at runtime (e.g. from request), it has final authority
    if (customSkillLibrary) {
      skillLibrary = { ...skillLibrary, ...customSkillLibrary };
    }
  } catch (err) {
    console.error('Skill library loading failed, continuing with partial/empty dataset', err);
  }

  const clipSummary = clips.map((c, i) => `clip_${i+1}: ${c.duration}s, ${c.width}x${c.height}, ${c.fps}fps`).join('\n');
  
  const prompt = `
    AUTHORITATIVE SKILL LIBRARY:
    ${JSON.stringify(skillLibrary, null, 2)}

    TASK: ${mode === 'PROMPT' ? 'PROMPT_MODE' : 'MONTAGE_MODE'}
    User Intent: ${userPrompt}
    
    Media Assets:
    ${clipSummary}
    
    REQUIRED ACTION:
    Identify relevant skills from the library and apply them to this ${mode === 'PROMPT' ? 'prompt generation' : 'montage plan'}. 
    Ensure the output structure reflects the "applied_skills" used.
  `;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: mode === 'PROMPT' ? {
        type: Type.OBJECT,
        required: ["mode", "applied_skills", "visual_summary", "creative_direction", "prompt", "negative_prompt", "confidence"],
        properties: {
          mode: { type: Type.STRING },
          applied_skills: { type: Type.ARRAY, items: { type: Type.STRING } },
          visual_summary: {
            type: Type.OBJECT,
            properties: {
              subject: { type: Type.STRING },
              scene: { type: Type.STRING },
              camera: { type: Type.STRING },
              motion: { type: Type.STRING },
              lighting: { type: Type.STRING },
              composition: { type: Type.STRING },
              color_palette: { type: Type.STRING },
              mood: { type: Type.STRING },
              style: { type: Type.STRING },
            }
          },
          creative_direction: {
            type: Type.OBJECT,
            properties: {
              keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
              camera_language: { type: Type.ARRAY, items: { type: Type.STRING } },
              motion_language: { type: Type.ARRAY, items: { type: Type.STRING } },
              lighting_language: { type: Type.ARRAY, items: { type: Type.STRING } },
              composition_rules: { type: Type.ARRAY, items: { type: Type.STRING } },
            }
          },
          prompt: { type: Type.STRING },
          negative_prompt: { type: Type.STRING },
          confidence: { type: Type.NUMBER },
        }
      } : {
        type: Type.OBJECT,
        required: ["mode", "applied_skills", "clip_analysis", "timeline", "render", "editing_notes", "fallback_strategy", "confidence"],
        properties: {
          mode: { type: Type.STRING },
          applied_skills: { type: Type.ARRAY, items: { type: Type.STRING } },
          clip_analysis: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                clip_id: { type: Type.STRING },
                hook_value: { type: Type.NUMBER },
                motion_energy: { type: Type.NUMBER },
                product_focus: { type: Type.NUMBER },
                face_presence: { type: Type.NUMBER },
                composition_score: { type: Type.NUMBER },
                transition_fit: { type: Type.STRING },
                color_mood: { type: Type.STRING },
                ad_usefulness: { type: Type.NUMBER },
                recommended_role: { type: Type.STRING },
              }
            }
          },
          timeline: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                order: { type: Type.NUMBER },
                clip_id: { type: Type.STRING },
                start_seconds: { type: Type.NUMBER },
                end_seconds: { type: Type.NUMBER },
                duration_seconds: { type: Type.NUMBER },
                role: { type: Type.STRING },
                transition: {
                  type: Type.OBJECT,
                  properties: {
                    type: { type: Type.STRING },
                    duration: { type: Type.NUMBER }
                  }
                },
                effects: {
                  type: Type.OBJECT,
                  properties: {
                    motion: {
                      type: Type.OBJECT,
                      properties: {
                        zoom: { type: Type.STRING },
                        strength: { type: Type.NUMBER }
                      }
                    },
                    color: {
                      type: Type.OBJECT,
                      properties: {
                        brightness: { type: Type.NUMBER },
                        contrast: { type: Type.NUMBER },
                        saturation: { type: Type.NUMBER }
                      }
                    },
                    overlay: {
                      type: Type.OBJECT,
                      properties: {
                        text: { type: Type.STRING },
                        safe_area: { type: Type.STRING }
                      }
                    }
                  }
                }
              }
            }
          },
          render: {
            type: Type.OBJECT,
            properties: {
              width: { type: Type.NUMBER },
              height: { type: Type.NUMBER },
              fps: { type: Type.NUMBER },
              total_duration: { type: Type.NUMBER },
              video_codec: { type: Type.STRING },
              audio_codec: { type: Type.STRING },
              pix_fmt: { type: Type.STRING },
            }
          },
          editing_notes: { type: Type.ARRAY, items: { type: Type.STRING } },
          fallback_strategy: { type: Type.OBJECT },
          confidence: { type: Type.NUMBER }
        }
      }
    }
  });

  const rawJson = response.text;
  const result = JSON.parse(rawJson);
  
  if (mode === 'PROMPT') {
    return PromptResponseSchema.parse(result);
  } else {
    return MontagePlanSchema.parse(result);
  }
};
