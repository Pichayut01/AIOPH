export type ChatRole = "system" | "user" | "assistant";

export interface ContentPart {
  type: "text" | "image_url";
  text?: string;
  image_url?: {
    url: string;
  };
}

export interface ChatMessage {
  role: ChatRole;
  content: string | ContentPart[];
}

export type SearchMode = "auto" | "on" | "off";

export interface ChatRequestBody {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  searchMode?: SearchMode;
}
