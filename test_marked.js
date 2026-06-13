const { Marked } = require('marked'); 
const m = new Marked({ 
  renderer: { 
    code({text, lang}) { return 'CUSTOM_RENDERER'; } 
  } 
}); 
console.log(m.parse('```js\ntest\n```'));
