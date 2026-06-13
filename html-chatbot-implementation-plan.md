# Implementation Plan: AI Chatbot with HTML Output

> **Goal:** สร้าง AI chatbot ที่ตอบกลับด้วย HTML แทน Markdown เพื่อประสบการณ์ที่สวยงาม อ่านง่าย และ interactive

---

## Overview

แทนที่จะให้ AI ตอบเป็น Markdown แล้วค่อย render เป็น HTML ฝั่ง frontend — เราจะให้ AI **สร้าง HTML โดยตรง** แล้ว inject เข้า DOM เลย วิธีนี้ช่วยให้ response มี layout, color, interactive element, และ data visualization ได้อย่างอิสระ

---

## Architecture

```
User Input
    │
    ▼
Frontend (React / Vanilla JS)
    │  ─ ส่ง message + conversation history
    ▼
API Layer (Node.js / Next.js / FastAPI)
    │  ─ เติม system prompt + HTML design system
    ▼
Anthropic Claude API (claude-sonnet-4-20250514)
    │  ─ stream HTML response
    ▼
Frontend Renderer
    │  ─ inject HTML ลงใน sandboxed iframe / shadow DOM
    ▼
User sees rendered HTML
```

---

## Phase 1: Foundation Setup

### 1.1 Project Initialization

```bash
# Next.js (แนะนำ)
npx create-next-app@latest html-chatbot --typescript --tailwind --app
cd html-chatbot
npm install @anthropic-ai/sdk

# หรือ Vanilla + Vite
npm create vite@latest html-chatbot -- --template vanilla-ts
cd html-chatbot
npm install @anthropic-ai/sdk
```

### 1.2 Environment Variables

```env
# .env.local
ANTHROPIC_API_KEY=sk-ant-...
```

---

## Phase 2: System Prompt Design

นี่คือหัวใจของระบบ — system prompt ต้องบอก Claude ให้ตอบเป็น HTML เสมอ และกำหนด design system ที่สอดคล้องกัน

### 2.1 System Prompt Structure

```
system_prompt = [
  ROLE_DEFINITION,
  OUTPUT_FORMAT_RULES,
  DESIGN_SYSTEM_TOKENS,
  COMPONENT_LIBRARY,
  EXAMPLES
]
```

### 2.2 ตัวอย่าง System Prompt (เต็ม)

```
You are a helpful AI assistant. You ALWAYS respond in valid HTML — never plain text, never Markdown.

## Output Rules

1. Every response must be a valid HTML fragment (no <html>, <head>, or <body> tags)
2. Use semantic HTML elements: <p>, <h2>, <h3>, <ul>, <ol>, <table>, <code>, <pre>
3. All styling must use CSS variables from the design system below
4. Never use inline hex colors — always use CSS variables
5. Responses must be readable in both light and dark mode
6. No JavaScript unless the user explicitly asks for an interactive element
7. Keep HTML clean and minimal — no unnecessary wrapper divs

## Design System (CSS Variables Available)

These variables are pre-loaded in the host environment:

### Colors
- --color-text-primary      : main body text
- --color-text-secondary    : muted/supporting text
- --color-text-tertiary     : hints and labels
- --color-background-primary   : white surface
- --color-background-secondary : slightly off-white surface
- --color-background-tertiary  : page background
- --color-border-tertiary   : subtle 0.15 alpha border
- --color-border-secondary  : 0.3 alpha border

### Semantic Colors (for meaning)
- --color-background-info / --color-text-info       : blue informational
- --color-background-success / --color-text-success : green success
- --color-background-warning / --color-text-warning : amber warning
- --color-background-danger / --color-text-danger   : red danger

### Typography
- --font-sans  : default sans-serif
- --font-mono  : monospace for code
- --font-serif : editorial serif (use sparingly)

### Spacing & Radius
- --border-radius-md : 8px
- --border-radius-lg : 12px

## HTML Component Patterns

### Simple answer
<p style="color: var(--color-text-primary); font-size: 15px; line-height: 1.7;">
  Your answer here.
</p>

### Section with heading
<h2 style="font-size: 18px; font-weight: 500; margin: 0 0 12px;">Section Title</h2>
<p style="color: var(--color-text-secondary); font-size: 15px; line-height: 1.7;">Content...</p>

### Info card
<div style="background: var(--color-background-info); border-radius: var(--border-radius-lg); padding: 1rem 1.25rem; margin: 1rem 0;">
  <p style="color: var(--color-text-info); font-size: 14px; margin: 0;">Info message here</p>
</div>

### Code block
<pre style="background: var(--color-background-secondary); border: 0.5px solid var(--color-border-tertiary); border-radius: var(--border-radius-md); padding: 1rem; overflow-x: auto;">
<code style="font-family: var(--font-mono); font-size: 13px; color: var(--color-text-primary);">
code here
</code>
</pre>

### Metric cards grid
<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin: 1rem 0;">
  <div style="background: var(--color-background-secondary); border-radius: var(--border-radius-md); padding: 1rem;">
    <p style="font-size: 13px; color: var(--color-text-secondary); margin: 0 0 4px;">Label</p>
    <p style="font-size: 22px; font-weight: 500; margin: 0;">Value</p>
  </div>
</div>

### Table
<table style="width: 100%; border-collapse: collapse; font-size: 14px;">
  <thead>
    <tr style="border-bottom: 0.5px solid var(--color-border-secondary);">
      <th style="text-align: left; padding: 8px 12px; font-weight: 500; color: var(--color-text-secondary);">Column</th>
    </tr>
  </thead>
  <tbody>
    <tr style="border-bottom: 0.5px solid var(--color-border-tertiary);">
      <td style="padding: 8px 12px; color: var(--color-text-primary);">Cell</td>
    </tr>
  </tbody>
</table>

## Decision Guide

- Short factual answer → single <p>
- Comparison / options → card grid
- Step-by-step → <ol> with styled items
- Data / numbers → metric cards or table
- Code → <pre><code> block
- Warning / tip → semantic color card
- Long explanation → heading + paragraphs with good spacing
```

---

## Phase 3: API Route

### 3.1 Next.js App Router API Route

```typescript
// app/api/chat/route.ts
import Anthropic from '@anthropic-ai/sdk'
import { SYSTEM_PROMPT } from '@/lib/systemPrompt'

const client = new Anthropic()

export async function POST(req: Request) {
  const { messages } = await req.json()

  const stream = await client.messages.stream({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages,
  })

  // Stream response back to client
  const encoder = new TextEncoder()
  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        if (
          chunk.type === 'content_block_delta' &&
          chunk.delta.type === 'text_delta'
        ) {
          controller.enqueue(encoder.encode(chunk.delta.text))
        }
      }
      controller.close()
    },
  })

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
    },
  })
}
```

### 3.2 System Prompt File

```typescript
// lib/systemPrompt.ts
export const SYSTEM_PROMPT = `
You are a helpful AI assistant. You ALWAYS respond in valid HTML...
(ใส่ system prompt เต็มจาก Phase 2 ที่นี่)
`
```

---

## Phase 4: Frontend Renderer

นี่คือส่วนที่ซับซ้อนที่สุด — เราต้อง render HTML จาก AI อย่างปลอดภัย

### 4.1 Design System CSS Variables

โหลด CSS variables ในระดับ global เพื่อให้ HTML ที่ AI สร้างขึ้นใช้ได้ทันที

```css
/* app/globals.css */
:root {
  --color-text-primary: #1a1a1a;
  --color-text-secondary: #6b7280;
  --color-text-tertiary: #9ca3af;
  --color-text-info: #1d4ed8;
  --color-text-success: #15803d;
  --color-text-warning: #b45309;
  --color-text-danger: #b91c1c;

  --color-background-primary: #ffffff;
  --color-background-secondary: #f9fafb;
  --color-background-tertiary: #f3f4f6;
  --color-background-info: #eff6ff;
  --color-background-success: #f0fdf4;
  --color-background-warning: #fffbeb;
  --color-background-danger: #fef2f2;

  --color-border-tertiary: rgba(0, 0, 0, 0.12);
  --color-border-secondary: rgba(0, 0, 0, 0.25);
  --color-border-primary: rgba(0, 0, 0, 0.35);

  --font-sans: system-ui, -apple-system, sans-serif;
  --font-mono: 'Fira Code', 'Cascadia Code', monospace;
  --font-serif: Georgia, serif;

  --border-radius-md: 8px;
  --border-radius-lg: 12px;
  --border-radius-xl: 16px;
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-text-primary: #f9fafb;
    --color-text-secondary: #9ca3af;
    --color-text-tertiary: #6b7280;
    --color-text-info: #93c5fd;
    --color-text-success: #86efac;
    --color-text-warning: #fcd34d;
    --color-text-danger: #fca5a5;

    --color-background-primary: #111827;
    --color-background-secondary: #1f2937;
    --color-background-tertiary: #0f172a;
    --color-background-info: #1e3a5f;
    --color-background-success: #14532d;
    --color-background-warning: #451a03;
    --color-background-danger: #450a0a;

    --color-border-tertiary: rgba(255, 255, 255, 0.12);
    --color-border-secondary: rgba(255, 255, 255, 0.25);
  }
}
```

### 4.2 HTML Message Renderer Component

```tsx
// components/HtmlMessage.tsx
'use client'
import { useEffect, useRef } from 'react'

interface HtmlMessageProps {
  html: string
  isStreaming?: boolean
}

export function HtmlMessage({ html, isStreaming }: HtmlMessageProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Inject CSS variables into shadow DOM so AI HTML can use them
  useEffect(() => {
    if (!containerRef.current) return
    const container = containerRef.current

    // Sanitize: ถ้าต้องการ security สูง ใช้ DOMPurify
    // import DOMPurify from 'dompurify'
    // container.innerHTML = DOMPurify.sanitize(html)
    
    container.innerHTML = html
  }, [html])

  return (
    <div
      ref={containerRef}
      className="html-message"
      style={{
        opacity: isStreaming ? 0.85 : 1,
        transition: 'opacity 0.2s',
      }}
    />
  )
}
```

### 4.3 Chat Interface

```tsx
// components/Chat.tsx
'use client'
import { useState, useRef, useEffect } from 'react'
import { HtmlMessage } from './HtmlMessage'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export function Chat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [streamingHtml, setStreamingHtml] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingHtml])

  async function sendMessage() {
    if (!input.trim() || isLoading) return

    const userMessage: Message = { role: 'user', content: input }
    const newMessages = [...messages, userMessage]
    setMessages(newMessages)
    setInput('')
    setIsLoading(true)
    setStreamingHtml('')

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      })

      if (!res.body) throw new Error('No stream')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value, { stream: true })
        setStreamingHtml(accumulated)
      }

      // Streaming done — commit to messages
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: accumulated },
      ])
      setStreamingHtml('')
    } catch (err) {
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Message list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
        {messages.map((msg, i) =>
          msg.role === 'user' ? (
            <div key={i} style={{ textAlign: 'right', marginBottom: '1.5rem' }}>
              <span style={{
                display: 'inline-block',
                background: 'var(--color-background-secondary)',
                border: '0.5px solid var(--color-border-tertiary)',
                borderRadius: 'var(--border-radius-lg)',
                padding: '0.75rem 1rem',
                fontSize: '15px',
                maxWidth: '70%',
              }}>
                {msg.content}
              </span>
            </div>
          ) : (
            <div key={i} style={{ marginBottom: '1.5rem' }}>
              <HtmlMessage html={msg.content} />
            </div>
          )
        )}

        {/* Streaming preview */}
        {streamingHtml && (
          <div style={{ marginBottom: '1.5rem' }}>
            <HtmlMessage html={streamingHtml} isStreaming />
          </div>
        )}

        {/* Loading indicator */}
        {isLoading && !streamingHtml && (
          <div style={{ color: 'var(--color-text-tertiary)', fontSize: '14px' }}>
            กำลังคิด...
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div style={{
        borderTop: '0.5px solid var(--color-border-tertiary)',
        padding: '1rem 1.5rem',
        display: 'flex',
        gap: '12px',
      }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
          placeholder="พิมพ์ข้อความ..."
          disabled={isLoading}
          style={{
            flex: 1,
            background: 'var(--color-background-secondary)',
            border: '0.5px solid var(--color-border-tertiary)',
            borderRadius: 'var(--border-radius-md)',
            padding: '0.75rem 1rem',
            fontSize: '15px',
            color: 'var(--color-text-primary)',
            outline: 'none',
          }}
        />
        <button
          onClick={sendMessage}
          disabled={isLoading || !input.trim()}
          style={{
            padding: '0.75rem 1.25rem',
            background: 'var(--color-background-primary)',
            border: '0.5px solid var(--color-border-secondary)',
            borderRadius: 'var(--border-radius-md)',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          ส่ง
        </button>
      </div>
    </div>
  )
}
```

---

## Phase 5: Security

HTML ที่ AI สร้างต้องผ่าน sanitization ก่อน inject เข้า DOM เสมอ

### 5.1 DOMPurify (Client-side)

```bash
npm install dompurify
npm install -D @types/dompurify
```

```typescript
// lib/sanitize.ts
import DOMPurify from 'dompurify'

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li', 'strong', 'em', 'code', 'pre',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'div', 'span', 'a', 'br', 'hr', 'blockquote',
      'svg', 'path', 'circle', 'rect', 'line', 'text',
      'canvas', 'button', 'input', 'select', 'option',
    ],
    ALLOWED_ATTR: [
      'style', 'class', 'href', 'id',
      'viewBox', 'xmlns', 'fill', 'stroke', 'd',
      'cx', 'cy', 'r', 'x', 'y', 'width', 'height',
      'type', 'value', 'placeholder', 'disabled',
    ],
    // อนุญาต CSS variables แต่บล็อก JavaScript ใน style
    FORCE_BODY: false,
  })
}
```

### 5.2 Iframe Sandbox (ความปลอดภัยสูงสุด)

สำหรับ use case ที่ต้องการ isolate HTML อย่างสมบูรณ์

```tsx
// components/SandboxedHtmlMessage.tsx
export function SandboxedHtmlMessage({ html }: { html: string }) {
  const cssVars = `
    <style>
      :root {
        --color-text-primary: #1a1a1a;
        /* ... ใส่ CSS variables ทั้งหมด ... */
      }
      body { margin: 0; font-family: system-ui, sans-serif; }
    </style>
  `
  const fullHtml = `<!DOCTYPE html><html><head>${cssVars}</head><body>${html}</body></html>`
  const blob = new Blob([fullHtml], { type: 'text/html' })
  const url = URL.createObjectURL(blob)

  return (
    <iframe
      src={url}
      sandbox="allow-scripts"  // เพิ่ม allow-same-origin ถ้าต้องการ JS
      style={{
        width: '100%',
        border: 'none',
        minHeight: '100px',
      }}
      onLoad={(e) => {
        // Auto-resize iframe ตาม content
        const iframe = e.target as HTMLIFrameElement
        const height = iframe.contentDocument?.body?.scrollHeight
        if (height) iframe.style.height = height + 'px'
      }}
    />
  )
}
```

---

## Phase 6: Streaming HTML Handling

HTML ที่ stream มาอาจถูก "ตัดกลาง" ได้ เช่น `<div style="col` ยังไม่ครบ

### 6.1 Buffer Partial Tags

```typescript
// lib/htmlStreamBuffer.ts

export class HtmlStreamBuffer {
  private buffer = ''

  /**
   * รับ chunk ใหม่ คืน HTML ที่ safe สำหรับ render
   * โดยซ่อน tag ที่ยังไม่ครบไว้ก่อน
   */
  push(chunk: string): string {
    this.buffer += chunk
    return this.getSafeHtml()
  }

  private getSafeHtml(): string {
    const lastOpen = this.buffer.lastIndexOf('<')
    const lastClose = this.buffer.lastIndexOf('>')

    // ถ้า < อยู่หลัง > แสดงว่ามี tag ที่ยังไม่ปิด
    if (lastOpen > lastClose) {
      return this.buffer.substring(0, lastOpen)
    }
    return this.buffer
  }

  flush(): string {
    const final = this.buffer
    this.buffer = ''
    return final
  }
}
```

---

## Phase 7: Advanced Features (Optional)

### 7.1 Interactive HTML with Callbacks

ให้ AI สร้าง button ที่ส่ง prompt กลับมาได้

```typescript
// เพิ่มใน system prompt:
`
## Interactive Elements

When it makes sense, you may add buttons that send follow-up prompts.
Use this pattern exactly:
<button onclick="window.parent.postMessage({type:'sendPrompt', text:'...'}, '*')">
  Button Label
</button>
`

// เพิ่มใน React component:
useEffect(() => {
  function handleMessage(e: MessageEvent) {
    if (e.data?.type === 'sendPrompt') {
      setInput(e.data.text)
      // หรือ auto-send
      sendMessageWithText(e.data.text)
    }
  }
  window.addEventListener('message', handleMessage)
  return () => window.removeEventListener('message', handleMessage)
}, [])
```

### 7.2 Model Selector

```tsx
const MODELS = [
  { id: 'claude-sonnet-4-20250514', label: 'Sonnet 4 (แนะนำ)' },
  { id: 'claude-opus-4-20250514', label: 'Opus 4 (ฉลาดสุด)' },
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku (เร็วสุด)' },
]
```

### 7.3 Conversation Export

```typescript
function exportAsHtml(messages: Message[]) {
  const body = messages
    .map(msg =>
      msg.role === 'user'
        ? `<div class="user-msg">${msg.content}</div>`
        : `<div class="ai-msg">${msg.content}</div>`
    )
    .join('\n')

  const html = `<!DOCTYPE html><html>
<head><meta charset="utf-8"><title>Chat Export</title>
<style>/* ใส่ CSS variables และ style ที่นี่ */</style>
</head><body>${body}</body></html>`

  const blob = new Blob([html], { type: 'text/html' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'chat-export.html'
  a.click()
}
```

---

## Phase 8: Prompt Tuning Tips

| ปัญหา | วิธีแก้ |
|---|---|
| AI ตอบ Markdown บ้าง | เพิ่มใน system prompt: "If you are about to use **, #, or -, STOP and use HTML instead" |
| HTML ยาวเกินไป | เพิ่ม: "Keep HTML minimal — no unnecessary wrapper divs" |
| ไม่ใช้ CSS variables | เพิ่ม examples ที่ชัดเจนใน system prompt |
| ตอบช้าเพราะ HTML ยาว | ใช้ haiku สำหรับ short answers, sonnet สำหรับ complex |
| CSS ขัดกัน กับ host | ใช้ iframe sandbox หรือ shadow DOM |
| Dark mode ไม่ทำงาน | ตรวจสอบ CSS variables ใน dark mode media query |

---

## File Structure

```
html-chatbot/
├── app/
│   ├── api/
│   │   └── chat/
│   │       └── route.ts          # API endpoint + streaming
│   ├── globals.css               # CSS variables (light + dark)
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── Chat.tsx                  # Main chat interface
│   ├── HtmlMessage.tsx           # HTML renderer
│   └── SandboxedHtmlMessage.tsx  # Iframe-based renderer (optional)
├── lib/
│   ├── systemPrompt.ts           # System prompt definition
│   ├── sanitize.ts               # DOMPurify wrapper
│   └── htmlStreamBuffer.ts       # Partial tag buffer
└── .env.local                    # ANTHROPIC_API_KEY
```

---

## Quick Start Summary

```bash
# 1. สร้างโปรเจกต์
npx create-next-app@latest html-chatbot --typescript --app

# 2. ติดตั้ง dependencies
npm install @anthropic-ai/sdk dompurify
npm install -D @types/dompurify

# 3. ใส่ API key
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env.local

# 4. สร้างไฟล์ตาม File Structure ด้านบน

# 5. รัน
npm run dev
```

---

*Plan version 1.0 — HTML-first AI Chatbot*
