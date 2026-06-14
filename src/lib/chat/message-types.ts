export type ChatRole = "system" | "user" | "assistant";

export interface ContentPart {
  type: "text" | "image_url" | "file" | "link";
  text?: string;
  image_url?: {
    url: string;
  };
  file?: {
    name: string;
    size: number;
    content: string;
  };
  link?: {
    url: string;
    title: string;
    content: string;
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
