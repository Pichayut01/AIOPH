const jsdom = require('jsdom');
const { JSDOM } = jsdom;
const dom = new JSDOM();
const document = dom.window.document;
const tempDiv = document.createElement('div');
tempDiv.innerHTML = '<pre><code class="language-bash">pip install</code></pre>';
tempDiv.querySelectorAll('pre:not(.hljs)').forEach(pre => {
  pre.outerHTML = '<div class="aioph-code">' + pre.textContent + '</div>';
});
console.log(tempDiv.innerHTML);
