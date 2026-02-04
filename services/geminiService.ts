
import { GoogleGenAI } from "@google/genai";
import { Language, UserLocation } from "../types";
import { UI_STRINGS } from "../constants";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const LANGUAGE_MAP: Record<Language, string> = {
  en: "English",
  hi: "Hindi",
  mr: "Marathi",
  bn: "Bengali",
  te: "Telugu"
};

const SYSTEM_PROMPT = `You are JeevanSathi, a friendly health worker for rural communities. 
Respond ONLY in {LANGUAGE_NAME} script. 
Rules: No diagnosis, no prescription. Use very simple words. 
Always end with: "Consult a doctor for health issues."`;

/**
 * Enhanced Local Knowledge Base to provide answers without API
 */
const getLocalKnowledgeResponse = (userPrompt: string, lang: Language) => {
  const strings = UI_STRINGS[lang] || UI_STRINGS.en;
  const promptLower = userPrompt.toLowerCase().trim();

  // Keyword mapping for common topics
  const keywords: Record<string, string[]> = {
    vaccine: ['vaccine', 'tika', 'suwa', 'injection', 'immunization', 'dose', 'td', 'bcg', 'opv'],
    dengue: ['dengue', 'mosquito', 'machar', 'fever', 'platelet'],
    malaria: ['malaria', 'thandi', 'bukhaar'],
    heat: ['heat', 'garmi', 'loo', 'sun', 'water', 'dehydration'],
    pregnancy: ['pregnant', 'pregnancy', 'maternal', 'baby', 'bacha', 'delivery'],
    hygiene: ['clean', 'wash', 'hands', 'soap', 'safai'],
  };

  // Check Vaccines Data
  for (const v of strings.vaccineScheduleData) {
    if (promptLower.includes(v.vaccines.toLowerCase()) || promptLower.includes(v.age.toLowerCase())) {
      return `[Offline Info] ${v.vaccines} (${v.age}): ${v.info}\n\n${strings.disclaimer}`;
    }
  }

  // Check Alerts Data
  for (const a of strings.alertsData) {
    if (promptLower.includes(a.title.toLowerCase()) || (keywords.dengue.some(k => promptLower.includes(k)) && a.title.includes('Dengue'))) {
      return `[Offline Alert] ${a.title}: ${a.desc}\n\nPrecautions:\n${a.precautions.map(p => `• ${p}`).join('\n')}\n\n${strings.disclaimer}`;
    }
  }

  return null;
};

/**
 * Wrapper with Timeout and Retry
 */
const withTimeoutAndRetry = async <T>(fn: () => Promise<T>, timeoutMs = 12000): Promise<T> => {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Request timed out")), timeoutMs)
  );

  return Promise.race([fn(), timeoutPromise]);
};

export const getHealthAdvice = async (
  userPrompt: string, 
  language: Language, 
  location?: UserLocation | null,
  image?: { data: string; mimeType: string } | null
) => {
  // 1. Try Local Knowledge First
  const local = getLocalKnowledgeResponse(userPrompt, language);
  if (local && !image) {
    return { text: local, groundingLinks: [], isError: false };
  }

  const modelName = location ? 'gemini-2.5-flash' : 'gemini-3-flash-preview';
  const languageName = LANGUAGE_MAP[language];
  
  const tools: any[] = [];
  let toolConfig: any = undefined;

  if (location) {
    tools.push({ googleMaps: {} });
    toolConfig = { retrievalConfig: { latLng: { latitude: location.latitude, longitude: location.longitude } } };
  }

  const parts: any[] = [{ text: userPrompt }];
  if (image) {
    parts.push({ inlineData: { data: image.data, mimeType: image.mimeType } });
  }

  try {
    const result = await withTimeoutAndRetry(async () => {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: { parts },
        config: {
          systemInstruction: SYSTEM_PROMPT.replace(/{LANGUAGE_NAME}/g, languageName),
          temperature: 0.1,
          tools: tools.length > 0 ? tools : undefined,
          toolConfig: toolConfig,
        },
      });

      const text = response.text || "I am processing your request...";
      const groundingLinks: { title: string; uri: string }[] = [];
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      
      if (chunks) {
        chunks.forEach((chunk: any) => {
          if (chunk.maps) groundingLinks.push({ title: chunk.maps.title || "Health Center", uri: chunk.maps.uri });
        });
      }

      return { text, groundingLinks, isError: false };
    });

    return result;
  } catch (error: any) {
    const msg = error.message || JSON.stringify(error);
    if (msg.includes('429') || msg.includes('Quota') || msg.includes('RESOURCE_EXHAUSTED')) {
      return { 
        text: "Daily limit reached. Use the 'Vaccines' or 'Alerts' tabs for offline info. In emergency, call 108.",
        groundingLinks: [],
        isError: true
      };
    }
    return { 
      text: "Connection is slow. Please try again or check the provided info tabs.",
      groundingLinks: [],
      isError: true
    };
  }
};

export const translateInput = async (text: string, targetLanguage: Language) => {
  if (!text || text.trim().length < 2 || targetLanguage === 'en') return text;
  
  // Basic check to see if text already contains characters from target script (roughly)
  // If target is Hindi/Marathi and text has Devanagari, maybe don't translate? 
  // For now, always translate to be safe.

  const languageName = LANGUAGE_MAP[targetLanguage];

  try {
    const response = await withTimeoutAndRetry(async () => {
      return await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Script convert/translate this to ${languageName} script: "${text}". Output only the ${languageName} script.`,
        config: { temperature: 0.1 },
      });
    }, 8000);
    return response.text?.trim() || text;
  } catch (err) {
    console.warn("Translation failed", err);
    return text;
  }
};
