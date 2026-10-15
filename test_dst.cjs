const d = new Date('2024-10-21T00:00:00'); // Europe transition is Oct 27
console.log(d.toString());
d.setDate(d.getDate() + 7);
console.log(d.toString());
console.log(d.getHours());
