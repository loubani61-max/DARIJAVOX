import { GoogleGenAI, Modality, Type, ThinkingLevel } from "@google/genai";

const ai = new GoogleGenAI({ 
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

export interface DarijaScript {
  arabicScript: string;
  phoneticScript: string;
  voNotes: string;
}

export async function generateDarijaScript(sourceText: string): Promise<DarijaScript> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
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

    return JSON.parse(response.text);
  } catch (e) {
    console.error("Failed to generate or parse script", e);
    throw e; // Let the caller handle it
  }
}

export interface AudioSettings {
  voiceName: string;
  speakingRate: number;
  pitch: number;
}

export async function generateDarijaAudio(script: string, settings: AudioSettings): Promise<string | null> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-tts-preview",
      contents: [{ parts: [{ text: `Speak this Moroccan Darija script naturally: ${script}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: settings.voiceName },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      return base64Audio;
    }
    return null;
  } catch (e) {
    console.error("Audio generation failed", e);
    throw e;
  }
}
