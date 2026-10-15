function formatDateISO(d) {
  return d.toISOString().split('T')[0];
}
const date = new Date();
date.setHours(0, 0, 0, 0);
console.log("Local Midnight:", date.toString());
console.log("ISO Date:", formatDateISO(date));
