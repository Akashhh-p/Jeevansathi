
export type Role = 'user' | 'model' | 'system';

export interface Message {
  id: string;
  role: Role;
  content: string;
  timestamp: Date;
  isEmergency?: boolean;
  isError?: boolean;
  retryPrompt?: string;
  feedback?: 'positive' | 'negative' | null;
  groundingLinks?: { title: string; uri: string }[];
  image?: string; // Base64 for rendering in history
}

export type Language = 'en' | 'hi' | 'mr' | 'bn' | 'te';
export type View = 'chat' | 'vaccines' | 'alerts' | 'help';

export interface LanguageConfig {
  code: Language;
  name: string;
  nativeName: string;
}

export interface UserLocation {
  latitude: number;
  longitude: number;
}

export interface LanguageHistory {
  [key: string]: Message[];
}

export interface AppState {
  language: Language;
  hasStarted: boolean;
  messages: Message[];
  isTyping: boolean;
  currentView: View;
  location: UserLocation | null;
  allHistory: LanguageHistory;
}
