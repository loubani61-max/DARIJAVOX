import { GoogleGenAI, Modality, Type, ThinkingLevel } from "@google/genai";

function getAi(): GoogleGenAI {
  const savedKey = typeof window !== 'undefined' ? localStorage.getItem('darijavox_gemini_api_key') : null;
  // Fallback to process.env
  const envKey = (typeof process !== 'undefined' && process.env ? process.env.GEMINI_API_KEY : undefined) || '';
  const apiKey = savedKey || envKey;
  
  if (!apiKey) {
    throw new Error("API_KEY_MISSING");
  }
  
  return new GoogleGenAI({ 
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
}

export function hasApiKey(): boolean {
  const savedKey = typeof window !== 'undefined' ? localStorage.getItem('darijavox_gemini_api_key') : null;
  const envKey = (typeof process !== 'undefined' && process.env ? process.env.GEMINI_API_KEY : undefined) || '';
  return !!(savedKey || envKey);
}

export function hasDefaultApiKey(): boolean {
  const envKey = (typeof process !== 'undefined' && process.env ? process.env.GEMINI_API_KEY : undefined) || '';
  return !!envKey;
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  retries = 3,
  delay = 1000
): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      const errorStr = String(error).toLowerCase();
      const code = error?.code || error?.status;
      const isRateLimitOrUnavailable =
        code === 503 ||
        code === 429 ||
        code === 'UNAVAILABLE' ||
        code === 'RESOURCE_EXHAUSTED' ||
        errorStr.includes('503') ||
        errorStr.includes('429') ||
        errorStr.includes('unavailable') ||
        errorStr.includes('high demand') ||
        errorStr.includes('resource exhausted') ||
        errorStr.includes('rate limit');
        
      if (isRateLimitOrUnavailable && attempt < retries) {
        const backoffDelay = delay * Math.pow(2, attempt - 1) + Math.random() * 500;
        console.warn(`Attempt ${attempt} failed with rate limit or high demand. Retrying in ${Math.round(backoffDelay)}ms...`, error);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
        continue;
      }
      throw error;
    }
  }
  throw new Error("Retry failed");
}

export interface DarijaScript {
  arabicScript: string;
  phoneticScript: string;
  voNotes: string;
}

export async function generateDarijaScript(sourceText: string): Promise<DarijaScript> {
  const ai = getAi();
  
  const generateWithModel = async (model: string) => {
    return await retryWithBackoff(async () => {
      const response = await ai.models.generateContent({
        model: model,
        contents: `Acting as a professional Moroccan Darija Voice-Over artist and expert translator from Casablanca, convert the following text (which can be in any language, including Standard Arabic, French, English, Spanish, German, etc.) into a natural, authentic, and "Clean Casablanca" Darija script. Translate and adapt the meaning and tone fully to local Moroccan Darija.
        
        Source Text: "${sourceText}"`,
        config: {
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.LOW,
          },
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              arabicScript: {
                type: Type.STRING,
                description: "The text in Arabic characters suited for a voice actor.",
              },
              phoneticScript: {
                type: Type.STRING,
                description: "The phonetic transcription in Latin characters (using common Darija conventions like 3 for 'ain, 7 for 'ha', etc.).",
              },
              voNotes: {
                type: Type.STRING,
                description: "Specific notes for the voice actor regarding emotion, tone, pacing, and Casablanca-specific linguistic nuances.",
              },
            },
            required: ["arabicScript", "phoneticScript", "voNotes"],
          },
        },
      });

      if (!response.text) {
        throw new Error("No response text from Gemini");
      }

      return JSON.parse(response.text) as DarijaScript;
    });
  };

  try {
    console.log("Generating Darija script with gemini-3.5-flash...");
    return await generateWithModel("gemini-3.5-flash");
  } catch (primaryError: any) {
    console.warn("Primary script generation model failed or overloaded, falling back to gemini-3.1-flash-lite...", primaryError);
    try {
      return await generateWithModel("gemini-3.1-flash-lite");
    } catch (fallbackError: any) {
      console.error("All script generation attempts failed including fallback model:", fallbackError);
      throw primaryError;
    }
  }
}

export interface AudioSettings {
  voiceName: string;
  speakingRate: number;
  pitch: number;
  tone?: string;
}

export async function generateDarijaAudio(
  arabicScript: string,
  phoneticScript: string,
  settings: AudioSettings
): Promise<string | null> {
  const ai = getAi();

  // 1. First Attempt: Live Casablanca Darija using Arabic script
  try {
    let cleanedArabic = arabicScript.replace(/\([^)]*\)/g, "");
    cleanedArabic = cleanedArabic.replace(/\[[^\]]*\]/g, "");
    cleanedArabic = cleanedArabic.replace(/\s+/g, " ").trim();

    if (!cleanedArabic) {
      cleanedArabic = arabicScript;
    }

    let tonePrefix = "Speak this Moroccan Darija script naturally: ";
    if (settings.tone) {
      if (settings.tone === "Excité") {
        tonePrefix = "Speak this Moroccan Arabic Darija script with high energy, extreme excitement, enthusiasm, and a joyful tone: ";
      } else if (settings.tone === "Calme") {
        tonePrefix = "Speak this Moroccan Arabic Darija script with a soft, calm, gentle, warm, and peaceful whisper-like voice: ";
      } else if (settings.tone === "Rauque") {
        tonePrefix = "Speak this Moroccan Arabic Darija script in a husky, rough, slightly raspy, and hoarse voice: ";
      } else if (settings.tone === "Grave") {
        tonePrefix = "Speak this Moroccan Arabic Darija script in a deep, low-pitched, solid, authoritative, and grave voice: ";
      }
    }

    console.log("Attempting TTS generation using Arabic script...", cleanedArabic);
    const response = await retryWithBackoff(async () => {
      return await ai.models.generateContent({
        model: "gemini-3.1-flash-tts-preview",
        contents: [{ parts: [{ text: `${tonePrefix}${cleanedArabic}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: settings.voiceName },
            },
          },
        },
      });
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      console.log("TTS voice generated successfully using Arabic script!");
      return base64Audio;
    }
    throw new Error("No inline audio data returned from API for Arabic script.");
  } catch (arabicError: any) {
    console.warn("Arabic script voice generation failed (likely 500, 503, or CORS), trying automatic fallback with phonetic script...", arabicError);

    // 2. Second Attempt (Automatic Fallback): Phonetic script using Latin characters
    // This is 100% stable on Gemini tts-preview and won't crash with 500 Internal error
    try {
      let cleanedPhonetic = phoneticScript.replace(/\([^)]*\)/g, "");
      cleanedPhonetic = cleanedPhonetic.replace(/\[[^\]]*\]/g, "");
      cleanedPhonetic = cleanedPhonetic.replace(/\s+/g, " ").trim();

      if (!cleanedPhonetic) {
        cleanedPhonetic = phoneticScript;
      }

      // Format tone instructions optimized for Latin transcription phonetic reading
      let tonePrefix = "Speak this Moroccan Darija transcription script naturally: ";
      if (settings.tone) {
        if (settings.tone === "Excité") {
          tonePrefix = "Speak this Moroccan Darija transcription with high energy, extreme excitement, enthusiasm, and a joyful tone: ";
        } else if (settings.tone === "Calme") {
          tonePrefix = "Speak this Moroccan Darija transcription with a soft, calm, gentle, warm, and peaceful whisper-like voice: ";
        } else if (settings.tone === "Rauque") {
          tonePrefix = "Speak this Moroccan Darija transcription in a husky, rough, slightly raspy, and hoarse voice: ";
        } else if (settings.tone === "Grave") {
          tonePrefix = "Speak this Moroccan Darija transcription in a deep, low-pitched, solid, authoritative, and grave voice: ";
        }
      }

      console.log("Attempting TTS generation with phonetic Latin script fallback...", cleanedPhonetic);
      const response = await retryWithBackoff(async () => {
        return await ai.models.generateContent({
          model: "gemini-3.1-flash-tts-preview",
          contents: [{ parts: [{ text: `${tonePrefix}${cleanedPhonetic}` }] }],
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: settings.voiceName },
              },
            },
          },
        });
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        console.log("TTS voice generated successfully using Phonetic fallback!");
        return base64Audio;
      }
      throw new Error("No inline audio data returned from phonetic fallback.");
    } catch (phoneticError: any) {
      console.error("All voice generation attempts failed:", phoneticError);
      throw phoneticError;
    }
  }
}
