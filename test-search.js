const { execSync } = require("child_process");

async function testSearchAndLLM() {
  const req = {
    messages: [{ role: "user", content: "วันนี้มีข่าวอะไรน่าสนใจ" }],
    model: "google/gemma-4-e4b",
    searchMode: "auto"
  };

  const res = await fetch("http://127.0.0.1:3000/api/chat", {
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

testSearchAndLLM().catch(console.error);
