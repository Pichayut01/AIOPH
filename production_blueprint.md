\# Master Specification: AI Agent Standards \& Local Web-RAG Architecture



เอกสารฉบับนี้จัดทำขึ้นเพื่อเป็นมาตรฐานกลาง (Master Blueprint) ในการควบคุมพฤติกรรมการเขียนโค้ดของ AI Agent และกำหนดโครงสร้างสถาปัตยกรรมระบบจัดเก็บและค้นหาข้อมูลเว็บ (Web Retrieval-Augmented Generation: Web-RAG) บนระบบปฏิบัติการแบบโลคอล (Local Infrastructure) อย่างเป็นระเบียบ ปลอดภัย และมีประสิทธิภาพสูงสุด



\---



\## PART 1: AI AGENT DEVELOPMENT \& CODING STANDARDS



\### 1. Strict Behavioral Rules

\* \*\*Zero Emojis:\*\* Do not use any emojis in your code, comments, documentation, or explanations under any circumstances.

\* \*\*English Comments Only:\*\* All inline comments, docstrings, and commit messages must be written in professional, clear English. No other languages are permitted for code annotations.

\* \*\*Exhaustive Thinking:\*\* Before writing any code, analyze the edge cases, potential failures, and system constraints. Never cut corners or provide placeholder code (e.g., `// TODO: implement this`).



\### 2. Professional Naming Conventions

You must follow clean code paradigms and professional naming standards suitable for each language/framework:

\* \*\*Intent-Revealing Names:\*\* Variable, function, and class names must clearly state why they exist, what they do, and how they are used (e.g., use `isUserAuthenticationTokenExpired` instead of `chkToken`).

\* \*\*Avoid Abbreviations:\*\* Do not use ambiguous abbreviations (e.g., use `configuration` instead of `cfg`, `database` instead of `db`).

\* \*\*Pronounceable \& Searchable:\*\* Names must be easy to read and search within a large codebase.

\* \*\*Consistency:\*\*

&#x20;   \* \*\*Classes/Types:\*\* PascalCase (e.g., `UserRepository`, `PaymentProcessor`).

&#x20;   \* \*\*Variables/Functions:\*\* camelCase or snake\_case depending on the language standard (e.g., TypeScript uses camelCase: `fetchUserData`; Python uses snake\_case: `fetch\_user\_data`).

&#x20;   \* \*\*Constants:\*\* UPPER\_SNAKE\_CASE (e.g., `MAX\_RETRY\_ATTEMPT\_LIMIT`).



\### 3. Unified Commenting \& Documentation Strategy

All code must be documented with a unified direction and style:

\* \*\*Unified Direction:\*\* Comments must explain the \*Why\* and \*Intent\* behind complex logic, not just describe what the code does line-by-line.

\* \*\*Standardized Format:\*\* Use standard documentation blocks for functions and classes (e.g., JSDoc for TypeScript/JavaScript, Docstrings for Python).

\* \*\*Concise Inline Comments:\*\* Keep inline comments short, meaningful, and strictly focused on architectural direction or non-obvious business logic.



\### 4. Comprehensive Error \& Exception Handling

You must never assume a happy path. Defensive programming is mandatory:

\* \*\*Explicit Exception Catching:\*\* Never use empty catch blocks. Always catch specific exceptions rather than generic errors where possible.

\* \*\*Validation First:\*\* Validate all inputs (null checks, type checks, bounds checks, business rule constraints) at the boundary of every function or API endpoint before executing business logic.

\* \*\*Graceful Degradation:\*\* Implement proper fallbacks and clean up resources (e.g., closing database connections, file descriptors) in `finally` blocks or using context managers.

\* \*\*Enterprise Logging:\*\* Log all exceptions with sufficient context (error messages, relevant identifiers) without leaking sensitive user data or credentials.



\### 5. Docker \& Containerization Standards

All applications must be production-ready and fully containerized:

\* \*\*Multi-Stage Builds:\*\* Always use multi-stage `Dockerfile` structures to separate the build environment from the final runtime image, keeping the production image minimal and secure.

\* \*\*Security Best Practices:\*\*

&#x20;   \* Never run containers as the `root` user. Explicitly create and switch to a non-root user.

&#x20;   \* Use specific, pinned versions for base images (e.g., `node:20.11.0-alpine` or `python:3.11-slim`), never use `latest`.

\* \*\*Optimization:\*\* Order instructions efficiently to maximize Docker layer caching (e.g., copy dependency files like `package.json` or `requirements.txt` before copying the rest of the source code).

\* \*\*Environment Variables:\*\* Do not hardcode secrets or configuration values. Use environment variables and provide a documented template file (e.g., `.env.example`).



\---



\## PART 2: LOCAL WEB-RAG ARCHITECTURE SPECIFICATION



\### 1. The Ultimate Local Web-RAG Stack

สถาปัตยกรรมนี้ถูกเลือกบนพื้นฐานของความเสถียร ประสิทธิภาพในการประมวลผลบนเครื่อง Local และการจัดสรรทรัพยากรที่คุ้มค่าที่สุด:

1\.  \*\*Orchestration \& Logic Layer:\*\* Python (Asyncio / FastAPI)

2\.  \*\*Search Engine Layer:\*\* SearxNG (Self-hosted via Docker)

3\.  \*\*Scraping \& Parsing Layer:\*\* Crawl4AI (Python Library)

4\.  \*\*Inference Layer (Local LLM):\*\* Ollama (Llama 3 / Mistral)



\### 2. Organized Project Structure \& Architecture

ระบบจะต้องมีการจัดเรียงโครงสร้างโฟลเดอร์และไฟล์อย่างเป็นระเบียบตามหลักการแยกส่วนหน้าที่ (Separation of Concerns: SoC) ดังนี้:

