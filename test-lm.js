const { searchWebForEvidence } = require("./.next/server/app/api/chat/route"); // We can't require Next.js code directly easily.

// Let's just make a POST request with a really large array to LM Studio.
async function testLMStudio() {
  const req = {
    messages: [{ role: "user", content: "A".repeat(30000) }],
    model: "google/gemma-4-e4b",
    stream: true
  };

  const res = await fetch("http://127.0.0.1:1234/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req)
  });

  console.log("Status:", res.status);
  
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    console.log("CHUNK:", decoder.decode(value, { stream: true }));
  }
}

testLMStudio().catch(console.error);
