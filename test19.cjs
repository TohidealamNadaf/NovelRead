const fs = require('fs');
const html = fs.readFileSync('mangafire_title.html', 'utf8');

console.log('Short vrf found?', html.includes('8sK3xtqdFdus51h8lQ'));
console.log('Long vrf found?', html.includes('8sK3xtqdFdus51h8lRud6HKgmNeducC3cXf3M6aNrl37GsFk0UeStLtjxL_0j7VxNduE5gwu_vQ0ICoReXe-SZNFRR_7c6VgUw'));
