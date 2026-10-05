function csvCell(value){
 const text=String(value??'')
 // Text cells cannot become spreadsheet formulas, including after leading whitespace.
 const safe=typeof value!=='number'&&/^[\s]*[=+@-]/.test(text)?`'${text}`:text
 return `"${safe.replace(/"/g,'""')}"`
}
function csvRows(headers,rows){return '\uFEFF'+[headers,...rows].map(row=>row.map(csvCell).join(',')).join('\r\n')}
module.exports={csvCell,csvRows}
