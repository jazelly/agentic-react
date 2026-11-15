export interface Contact { id: number; name: string; email: string; company: string }

const first = ['Ava', 'Ben', 'Chloe', 'Dan', 'Ella', 'Finn', 'Grace', 'Hugo', 'Isla', 'Jack', 'Kira', 'Liam', 'Mia', 'Noah', 'Olive', 'Pete', 'Quinn', 'Ruby', 'Sam', 'Tara']
const last = ['Smith', 'Jones', 'Brown', 'Taylor', 'Wilson', 'Davies', 'Evans', 'Thomas', 'Roberts', 'Walker']
const companies = ['Acme', 'Globex', 'Initech', 'Umbrella', 'Hooli']

export const contacts: Contact[] = Array.from({ length: 200 }, (_, i) => {
  const name = `${first[i % first.length]} ${last[Math.floor(i / first.length) % last.length]}`
  return { id: i + 1, name, email: `${name.toLowerCase().replace(' ', '.')}${i}@example.com`, company: companies[i % companies.length] }
})
