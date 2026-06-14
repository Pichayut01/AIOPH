คู่มือการพัฒนาระบบความจำอัจฉริยะสำหรับ AI Chatbot (Dynamic Long-Term Memory Implementation Guide)



เอกสารนี้อธิบายสถาปัตยกรรม วิธีการออกแบบฐานข้อมูล และตัวอย่างโค้ด (Implementation) ในการสร้างระบบความจำระยะยาวให้กับ AI Chatbot เพื่อให้สามารถจดจำตัวตน บริบท และความชอบของผู้ใช้ได้อย่างมีประสิทธิภาพสูงสุดโดยไม่ทำให้แชทโหลดช้า (Latency ต่ำ)



1\. โครงสร้างฐานข้อมูล (Database Schema)



เพื่อความยืดหยุ่นและการทำงานที่รวดเร็ว เราจะแยกการจัดเก็บความจำออกเป็น 2 ส่วนหลัก โดยใช้ PostgreSQL (ซึ่งรองรับทั้ง JSONB สำหรับ Structured Data และ pgvector สำหรับ Semantic Memory)



\-- 1. ตารางเก็บข้อมูลโปรไฟล์ผู้ใช้แบบระบุโครงสร้างชัดเจน (Explicit Structured Profile)

CREATE TABLE user\_profiles (

&#x20;   user\_id VARCHAR(255) PRIMARY KEY,

&#x20;   attributes JSONB DEFAULT '{}'::jsonb, -- เก็บเช่น { "name": "...", "job": "..." }

&#x20;   updated\_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT\_TIMESTAMP

);



\-- 2. ตารางเก็บความจำระยะยาวเชิงความหมาย (Semantic Long-Term Memory)

\-- ต้องเปิดใช้งาน extension pgvector ก่อน: CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE user\_memories (

&#x20;   id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),

&#x20;   user\_id VARCHAR(255) NOT NULL,

&#x20;   memory\_text TEXT NOT NULL,                -- ข้อความที่ AI สกัดออกมาและบันทึกไว้

&#x20;   embedding VECTOR(1536) NOT NULL,          -- Vector representation (เช่นจาก text-embedding-3-small)

&#x20;   category VARCHAR(50),                     -- หมวดหมู่ เช่น tech\_stack, preference, project

&#x20;   created\_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT\_TIMESTAMP,

&#x20;   updated\_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT\_TIMESTAMP

);



\-- สร้าง Index เพื่อให้ค้นหาด้วย Vector ได้เร็วขึ้น (Cosine Similarity)

CREATE INDEX ON user\_memories USING hnsw (embedding vector\_cosine\_ops);





2\. ขั้นตอนการเขียนข้อมูล (Write Path) - Background Memory Extraction



เพื่อป้องกันปัญหาระบบตอบช้า (High Latency) เราจะทำงานสกัดความจำแบบ Asynchronous (ทำงานเบื้องหลังผ่าน Queue)



Flow Diagram:



\[User Message] ──> (Main Chat Loop -> ตอบทันที)

&#x20;     │

&#x20;     └──> \[Push to Event Queue (เช่น Redis BullMQ)]

&#x20;                │

&#x20;                ▼

&#x20;         \[Worker Process] ──> \[LLM Extractor] ──> \[Update Database (PostgreSQL \& Vector)]





ตัวอย่างโค้ดระบบหลังบ้าน (Python Example with OpenAI \& pgvector)



import os

import json

from openai import OpenAI

from pgvector.psycopg2 import register\_vector

import psycopg2



openai\_client = OpenAI(api\_key=os.getenv("OPENAI\_API\_KEY"))



\# เชื่อมต่อ Database

conn = psycopg2.connect(os.getenv("DATABASE\_URL"))

register\_vector(conn)



def background\_memory\_extractor\_worker(user\_id: str, last\_user\_message: str):

&#x20;   """

&#x20;   ฟังก์ชันสำหรับดึงข้อมูลสำคัญจากข้อความล่าสุดของผู้ใช้ และนำไปบันทึก/อัปเดตในฐานข้อมูล

&#x20;   """

&#x20;   # 1. ส่งให้ LLM ขนาดเล็กวิเคราะห์เพื่อสกัดข้อมูลความรู้ (Fact Extraction)

&#x20;   extraction\_prompt = f"""

&#x20;   วิเคราะห์ข้อความด้านล่างนี้ และดึงข้อมูลประเภท "ข้อมูลส่วนตัวระยะยาว" "ความสนใจ" "เครื่องมือที่ใช้" หรือ "เป้าหมาย" ของผู้ใช้

&#x20;   ห้ามเก็บอารมณ์ชั่วคราว ข้อความทักทาย หรือการคุยทั่วไป

&#x20;   

&#x20;   ตอบกลับในรูปแบบ JSON Array ของ Object ที่มีคีย์ดังนี้:

&#x20;   - category: หมวดหมู่ข้อมูล (เช่น preference, job, project, stack)

&#x20;   - value: ข้อความสรุปสั้นๆ ที่เป็นใจความสำคัญ

&#x20;   

&#x20;   ข้อความผู้ใช้: "{last\_user\_message}"

&#x20;   

&#x20;   ตอบในรูปแบบ JSON เท่านั้น ตัวอย่าง: \[{"category": "stack", "value": "ใช้งาน Next.js"}]

&#x20;   หากไม่มีข้อมูลสำคัญ ให้ตอบกลับเป็น \[]

&#x20;   """

&#x20;   

&#x20;   response = openai\_client.chat.completions.create(

&#x20;       model="gpt-4o-mini", # ใช้รุ่นราคาประหยัดและรวดเร็วสำหรับการสกัดข้อมูล

&#x20;       messages=\[{"role": "user", "content": extraction\_prompt}],

&#x20;       response\_format={"type": "json\_object"}

&#x20;   )

&#x20;   

&#x20;   extracted\_facts = json.loads(response.choices\[0].message.content).get("facts", \[])

&#x20;   

&#x20;   if not extracted\_facts:

&#x20;       return "No new memory extracted."

&#x20;       

&#x20;   for fact in extracted\_facts:

&#x20;       category = fact.get("category")

&#x20;       value = fact.get("value")

&#x20;       

&#x20;       # 2. ทำข้อความเป็น Embedding Vector เพื่อนำไปเก็บใน Vector Database

&#x20;       embedding\_res = openai\_client.embeddings.create(

&#x20;           input=value,

&#x20;           model="text-embedding-3-small"

&#x20;       )

&#x20;       embedding\_vector = embedding\_res.data\[0].embedding

&#x20;       

&#x20;       # 3. บันทึกข้อมูลลงฐานข้อมูล (Upsert / Insert)

&#x20;       with conn.cursor() as cur:

&#x20;           # เช็คว่ามีความจำที่คล้ายกันอยู่แล้วหรือไม่เพื่อป้องกันการบันทึกซ้ำซ้อน (Deduplication)

&#x20;           # ในทางปฏิบัติอาจใช้ Cosine Similarity เช็ค หากคะแนนใกล้กันมากให้ Update แทน Insert

&#x20;           cur.execute(

&#x20;               """

&#x20;               INSERT INTO user\_memories (user\_id, memory\_text, embedding, category)

&#x20;               VALUES (%s, %s, %s, %s)

&#x20;               """,

&#x20;               (user\_id, value, embedding\_vector, category)

&#x20;           )

&#x20;   conn.commit()

&#x20;   return f"Successfully extracted and saved {len(extracted\_facts)} facts."





3\. ขั้นตอนการอ่านข้อมูล (Read Path) - Context Injection



เมื่อผู้ใช้พิมพ์ถามคำถามเข้ามา ระบบจะแปลงคำถามนั้นเป็น Vector แล้วไปค้นหา "ความจำที่ใกล้เคียงที่สุด" พร้อมกับดึงข้อมูล Profile ของผู้ใช้ออกมาประกอบเป็น System Prompt ส่งให้ LLM ตัวหลักตอบ



ตัวอย่างโค้ดดึงความจำมาสอดแทรกในคำถาม (Context Retriever \& Generator)



def generate\_smart\_response(user\_id: str, user\_question: str) -> str:

&#x20;   # 1. ดึง Structured Profile

&#x20;   structured\_profile = {}

&#x20;   with conn.cursor() as cur:

&#x20;       cur.execute("SELECT attributes FROM user\_profiles WHERE user\_id = %s", (user\_id,))

&#x20;       row = cur.fetchone()

&#x20;       if row:

&#x20;           structured\_profile = row\[0]



&#x20;   # 2. แปลงคำถามล่าสุดเป็น Vector เพื่อไปหา Semantic Memory ที่เกี่ยวข้อง

&#x20;   question\_embedding\_res = openai\_client.embeddings.create(

&#x20;       input=user\_question,

&#x20;       model="text-embedding-3-small"

&#x20;   )

&#x20;   question\_vector = question\_embedding\_res.data\[0].embedding



&#x20;   # 3. ค้นหาความทรงจำที่เกี่ยวข้องจาก Vector DB (ดึง Top 5 ที่เกี่ยวข้องมากที่สุด โดยมี Cosine Distance น้อยกว่า 0.4)

&#x20;   relevant\_memories = \[]

&#x20;   with conn.cursor() as cur:

&#x20;       cur.execute(

&#x20;           """

&#x20;           SELECT memory\_text 

&#x20;           FROM user\_memories 

&#x20;           WHERE user\_id = %s AND (embedding <=> %s) < 0.4

&#x20;           ORDER BY embedding <=> %s 

&#x20;           LIMIT 5

&#x20;           """,

&#x20;           (user\_id, question\_vector, question\_vector)

&#x20;       )

&#x20;       rows = cur.fetchall()

&#x20;       relevant\_memories = \[r\[0] for r in rows]



&#x20;   # 4. ประกอบร่าง System Prompt อัจฉริยะ (Dynamic System Prompt)

&#x20;   system\_instruction = f"""

&#x20;   คุณคือ AI Chatbot อัจฉริยะส่วนตัวของผู้ใช้งาน คุณจะตอบคำถามอย่างเป็นธรรมชาติ 

&#x20;   จงประยุกต์ใช้ข้อมูลโปรไฟล์และข้อมูลความทรงจำเหล่านี้เพื่อตอบให้ตรงกับบริบทชีวิตของเขามากที่สุด 

&#x20;   (แต่ห้ามพูดประโยคแนว 'ฉันบันทึกไว้ว่าคุณชอบ...' ให้ตอบเชื่อมโยงเข้าเนื้อหาเนียนๆ ไปเลย)



&#x20;   \[ข้อมูลผู้ใช้พื้นฐาน]

&#x20;   {json.dumps(structured\_profile, ensure\_ascii=False)}



&#x20;   \[ความรู้และบริบทที่เกี่ยวข้องกับหัวข้อที่กำลังคุย]

&#x20;   {chr(10).join(\[f"- {m}" for m in relevant\_memories])}

&#x20;   """



&#x20;   # 5. ส่งให้ Main LLM เจนคำตอบตอบกลับหาผู้ใช้

&#x20;   chat\_response = openai\_client.chat.completions.create(

&#x20;       model="gpt-4o", # ใช้โมเดลขนาดใหญ่สำหรับคุยและประมวลผลตรรกะระดับสูง

&#x20;       messages=\[

&#x20;           {"role": "system", "content": system\_instruction},

&#x20;           {"role": "user", "content": user\_question}

&#x20;       ]

&#x20;   )



&#x20;   return chat\_response.choices\[0].message.content





4\. กลไกการลดความซ้ำซ้อนและการลบข้อมูล (Maintenance \& Privacy)



ในการทำสถาปัตยกรรมระดับแนวหน้า คุณต้องมีฟีเจอร์ที่ผู้ใช้สามารถควบคุมความเป็นส่วนตัวได้ดีด้วย:



Semantic Overwriting (การอัปเดตข้อมูลเดิม): เมื่อสกัดข้อเท็จจริงใหม่ได้ ให้คำนวณหาระยะห่าง (Vector Distance) กับข้อเท็จจริงเดิมในตารางก่อน เช่น หากระบบเคยบันทึกว่า "ผู้ใช้ทำโปรเจกต์ EChair ด้วย React" และต่อมาผู้ใช้บอกว่า "ตอนนี้เปลี่ยนมาใช้ Next.js บน EChair แล้ว" ระบบควรสแกนเจอระยะห่างที่ใกล้กัน และอัปเดตทับข้อมูลเดิมแทนการบันทึกเพิ่มขึ้นมาเป็นอีกข้อความหนึ่ง



Explicit Forget Command: หากผู้ใช้สั่งว่า "ลืมเรื่องธีสิสของฉันไปเลยนะ"



ให้ระบบแปลงคำว่า "ธีสิส" เป็น Vector



นำไปค้นหา user\_memories ที่เกี่ยวข้อง แล้วทำคำสั่ง DELETE ข้อมูลเหล่านั้นออกไปทันที



Memory Management Interface: ควรมีหน้า UI เล็กๆ ที่แสดงรายการที่บันทึกไว้ในรูปของ "เมมโมรี่การ์ด" เพื่อให้ผู้ใช้สามารถตรวจสอบความถูกต้องและกด "ลบถังขยะ" ความทรงจำบางส่วนได้ตามกฎหมายคุ้มครองข้อมูลส่วนบุคคล (เช่น GDPR หรือ PDPA)

