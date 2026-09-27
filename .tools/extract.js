const fs=require('fs');
const lines=fs.readFileSync(process.argv[2],'utf8').split('\n');
const cdn=lines.findIndex(l=>l.includes('three.min.js'));
const open=lines.findIndex((l,i)=>i>cdn && l.trim()==='<script>');
const close=lines.findIndex((l,i)=>i>open && l.includes('</script>'));
fs.writeFileSync(process.argv[3]||__dirname+'/ward7.js',
  lines.slice(0,open+1).map(()=>'').concat(lines.slice(open+1,close)).join('\n'));
