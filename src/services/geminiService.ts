import { GoogleGenAI, Type } from "@google/genai";
import { MontagePlan, PromptResponse, ClipMetadata, MontagePlanSchema, PromptResponseSchema } from '../types.ts';
import internalSkillLibrary from './skill_library.json';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });

const SYSTEM_INSTRUCTION = `
ROLE
You are a production-grade Creative Director, Visual Analyst, Editor, and Code Reviewer.

CAPABILITIES
- Accept multimodal inputs: images and short videos (represented via base64 in parts).
- Accept an optional Skill Library file (JSON) provided at runtime.
- Produce either: (A) prompt_generation (B) montage_planning.
- Perform SELF-REVIEW and AUTO-CORRECTION before final output.

HARD RULES
- Output must be VALID JSON only.
- No markdown, no prose outside JSON.
- Do not hallucinate visual details.
- Use MM:SS timestamps when referencing video moments.
- Optimize for vertical 1080x1920 unless user requests otherwise.

ANALYSIS PIPELINE
1) Detect mode.
2) Per-media analysis: subject, scene, camera, lighting, motion, composition, hook value.
3) Skill retrieval (from authoritative library if present).
4) Build plan.
5) SELF-REVIEW: Validate schema, check consistency (duration = end - start, no duplicate order), check visual logic.
6) AUTO-CORRECT: Fix any issues silently.
7) Return valid JSON.
`;

const fileToPart = async (file: File) => {
  return new Promise<any>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve({
        inlineData: {
          data: (reader.result as string).split(',')[1],
          mimeType: file.type,
        },
      });
    };
    reader.readAsDataURL(file);
  });
};

export const generateCreativeOutput = async (
  files: File[], 
  userPrompt: string,
  mode: 'PROMPT' | 'MONTAGE' | 'AUTO',
  customSkillLibrary?: any
): Promise<MontagePlan | PromptResponse> => {
  const model = "gemini-3-flash-preview";
  
  // Dynamic Skill Loading
  let skillLibrary = { ...internalSkillLibrary };
  if (customSkillLibrary) {
    skillLibrary = { ...skillLibrary, ...customSkillLibrary };
  }

  const mediaParts = await Promise.all(files.slice(0, 10).map(fileToPart));

  const promptText = `
    AUTHORITATIVE SKILL LIBRARY:
    ${JSON.stringify(skillLibrary, null, 2)}

    TASK: ${mode}_MODE
    User Intent: ${userPrompt}
    
    Media Assets: Provided multimodal parts.
    
    REQUIRED ACTION:
    Identify relevant skills from the library and apply them to this analysis.
    If mode is AUTO, decide if the user wants a cinematic prompt generation or an FFmpeg montage plan. 
    Perform a MANDATORY SELF-REVIEW and AUTO-CORRECTION before finalizing the JSON.
    Ensure output matches the specified schema.
  `;

  const response = await ai.models.generateContent({
    model,
    contents: { parts: [...mediaParts, { text: promptText }] },
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: mode === 'PROMPT' ? {
        type: Type.OBJECT,
        required: ["mode", "applied_skills", "visual_summary", "creative_direction", "confidence", "self_review"],
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
              prompt: { type: Type.STRING },
              negative_prompt: { type: Type.STRING },
              keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
              camera_language: { type: Type.ARRAY, items: { type: Type.STRING } },
              motion_language: { type: Type.ARRAY, items: { type: Type.STRING } },
              lighting_language: { type: Type.ARRAY, items: { type: Type.STRING } },
              composition_rules: { type: Type.ARRAY, items: { type: Type.STRING } },
            }
          },
          confidence: { type: Type.NUMBER },
          self_review: {
             type: Type.OBJECT,
             properties: {
               issues_found: { type: Type.ARRAY, items: { type: Type.STRING } },
               fixes_applied: { type: Type.ARRAY, items: { type: Type.STRING } }
             }
          }
        }
      } : {
        type: Type.OBJECT,
        required: ["mode", "project_type", "style", "applied_skills", "clip_analysis", "timeline", "render", "editing_notes", "fallback_strategy", "confidence", "self_review"],
        properties: {
          mode: { type: Type.STRING },
          project_type: { type: Type.STRING },
          style: { type: Type.STRING },
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
          confidence: { type: Type.NUMBER },
          self_review: {
             type: Type.OBJECT,
             properties: {
               issues_found: { type: Type.ARRAY, items: { type: Type.STRING } },
               fixes_applied: { type: Type.ARRAY, items: { type: Type.STRING } }
             }
          }
        }
      }
    }
  });

  const rawJson = response.text;
  const result = JSON.parse(rawJson);
  
  if (result.mode === 'prompt_generation' || mode === 'PROMPT') {
    return PromptResponseSchema.parse(result);
  } else {
    return MontagePlanSchema.parse(result);
  }
};
