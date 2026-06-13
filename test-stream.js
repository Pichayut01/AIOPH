const fs = require("fs");

function testStreamLogic(rawInput) {
  let eventBuffer = "";
  let isClosed = false;
  let output = "";

  function enqueueText(text) {
    if (!isClosed && text.length > 0) {
      output += text;
    }
  }

  function closeStream() {
    if (!isClosed) {
      isClosed = true;
    }
  }

  function extractContentFromServerSentEvent(dataLine) {
    if (dataLine === "[DONE]") return "";
    try {
      const payload = JSON.parse(dataLine);
      return payload.choices?.[0]?.delta?.content ?? payload.choices?.[0]?.message?.content ?? "";
    } catch {
      return "";
    }
  }

  function processServerSentEvent(rawEvent) {
    const dataLines = rawEvent
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.replace(/^data:\s*/, ""));

    for (const dataLine of dataLines) {
      if (dataLine === "[DONE]") {
        closeStream();
        return;
      }
      enqueueText(extractContentFromServerSentEvent(dataLine));
    }
  }

  // Simulate streaming
  // We feed it the whole input at once for the simulation
  eventBuffer += rawInput;
  const events = eventBuffer.split("\n\n");
  eventBuffer = events.pop() ?? "";
  events.forEach(processServerSentEvent);

  if (eventBuffer.trim().length > 0) {
    processServerSentEvent(eventBuffer);
  }

  console.log("FINAL OUTPUT:", output);
}

const input1 = "data: {\"choices\":[{\"delta\":{\"content\":\"Hello\"}}]}\r\n\r\ndata: {\"choices\":[{\"delta\":{\"content\":\" World\"}}]}\r\n\r\ndata: [DONE]\r\n\r\n";
const input2 = "data: {\"choices\":[{\"delta\":{\"content\":\"Hello\"}}]}\n\ndata: {\"choices\":[{\"delta\":{\"content\":\" World\"}}]}\n\ndata: [DONE]\n\n";

console.log("TEST 1 (Windows endings):");
testStreamLogic(input1);
console.log("TEST 2 (Unix endings):");
testStreamLogic(input2);
