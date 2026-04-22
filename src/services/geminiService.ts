import { GoogleGenAI, Type } from "@google/genai";
import { MontagePlan, PromptResponse, ClipMetadata, MontagePlanSchema, PromptResponseSchema } from '../types.ts';
import internalSkillLibrary from './skill_library.json';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });

const SYSTEM_INSTRUCTION = `
ROLE
You are a production-grade AI Montage Engine.
You analyze mixed media (images + short videos) and generate a deterministic video editing plan.

You DO NOT generate prompts.
You DO NOT generate explanations.
You ONLY produce valid structured JSON for montage execution.

---

MODE
MONTAGE ONLY

Ignore all prompt generation tasks.
Always return montage planning output.

---

INPUT TYPES
You may receive:
* images (jpg, png, webp)
* videos (mp4, mov, etc.)
* mixed assets (up to 10)

Images must be treated as 3-second video clips.

---

SKILL LIBRARY (DYNAMIC)
If a skill library JSON is provided:
* Treat it as authoritative
* Use it for decision making
* Apply: prompt_signal, visual_cues, motion_cues, transition_cues, negative_cues, use_cases

If not provided:
* Use internal cinematic editing rules

---

CORE EDITING RULES
* Always place strongest hook first
* Clip duration: 1–3 seconds
* Total video: 12–20 seconds
* Prefer: motion, faces, product closeups
* Avoid: static frames, empty shots
* Final clip must act as CTA
* Optimize for vertical 1080x1920

---

STRICT TYPE RULES (CRITICAL)
ALL numeric fields MUST be numbers (never strings)
REQUIRED NUMBERS: motion_energy, face_presence, composition_score, ad_usefulness, start_seconds, end_seconds, duration_seconds, transition.duration
REQUIRED STRINGS: clip_id, role, color_mood
REQUIRED ARRAYS: clip_analysis, timeline, self_review.fixes_applied

DEFAULTS (if missing):
* number → 0.0
* string → "neutral"
* array → []

---

SELF-REVIEW (MANDATORY)
Before returning output:
1. Fix all type errors
2. Convert string numbers → numbers
3. Ensure schema validity
4. Ensure: hook first, no empty clips, proper durations
5. If any issue: auto-correct silently

---

OUTPUT FORMAT (ONLY THIS)
JSON ONLY. No prose.
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

    TASK: MONTAGE_ONLY
    User Intent: ${userPrompt}
    
    Media Assets: Provided multimodal parts.
    
    REQUIRED ACTION:
    Identify relevant skills from the library and apply them.
    Analyze all assets. Treat images as 3s video.
    Generate a deterministic video montage plan.
    Perform a MANDATORY SELF-REVIEW and AUTO-CORRECTION before finalizing the JSON.
    Ensure output matches the specified schema EXACTLY.
  `;

  const response = await ai.models.generateContent({
    model,
    contents: { parts: [...mediaParts, { text: promptText }] },
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        required: ["mode", "applied_skills", "clip_analysis", "timeline", "render", "fallback_strategy", "self_review"],
        properties: {
          mode: { type: Type.STRING },
          applied_skills: { type: Type.ARRAY, items: { type: Type.STRING } },
          clip_analysis: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                clip_id: { type: Type.STRING },
                motion_energy: { type: Type.NUMBER },
                face_presence: { type: Type.NUMBER },
                composition_score: { type: Type.NUMBER },
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
          fallback_strategy: {
             type: Type.OBJECT,
             properties: {
                if_transition_fails: { type: Type.STRING },
                if_invalid_data: { type: Type.STRING }
             }
          },
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
  
  return MontagePlanSchema.parse(result);
};
