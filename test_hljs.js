const hljs = require('highlight.js');
try {
  let text = "// test code";
  let language = "javascript";
  let highlightedCode = text;
  if (language !== "plaintext" && hljs.getLanguage(language)) {
    highlightedCode = hljs.highlight(text, { language, ignoreIllegals: true }).value;
  }
  console.log("Success", highlightedCode);
} catch(e) {
  console.error("Error", e);
}
