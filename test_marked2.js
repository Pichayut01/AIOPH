const { Marked } = require('marked'); 
const m = new Marked({ 
  renderer: { 
    code({text, lang}) { return '<div>CUSTOM: ' + text + '</div>'; } 
  } 
}); 
console.log(m.parse('```bash\ntest\n```'));
